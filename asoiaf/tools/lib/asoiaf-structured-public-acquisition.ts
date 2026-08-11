import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getAsoiafExternalSource,
} from "../../src/external/index.js";
import {
  ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT,
} from "./asoiaf-external-collector.js";
import {
  commitAsoiafStructuredPayload,
  type AsoiafStructuredAdapterReceipt,
  type AsoiafStructuredAdapterResult,
  type AsoiafStructuredRequestPlan,
} from "./asoiaf-structured-public-adapters.js";
import {
  collectorContentId,
  collectorEstatePaths,
  initializeCollectorEstate,
  readJson,
  readNdjson,
  recordAttempt,
  recordGap,
  sha256,
  updateSourceLedgerRow,
  verifyCollectorEstate,
  writeJsonAtomic,
  type CollectorAttemptRecord,
  type CollectorGapRecord,
} from "./asoiaf-external-estate.js";

export const ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT =
  "axm-asoiaf-structured-acquisition-receipt/1" as const;
export const ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT =
  "axm-asoiaf-structured-acquisition-state/1" as const;

export type AsoiafStructuredAcquisitionOutcome =
  | "observed"
  | "partial"
  | "refused"
  | "cache-hit"
  | "blocked-robots"
  | "blocked-credential"
  | "unavailable"
  | "rejected-oversize"
  | "invalid-response"
  | "error";

export interface AsoiafStructuredAcquisitionReceipt {
  format: typeof ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT;
  receiptId: string;
  planFingerprint: `sha256:${string}`;
  adapterId: AsoiafStructuredRequestPlan["adapterId"];
  sourceId: AsoiafStructuredRequestPlan["sourceId"];
  requestId: string;
  requestedUrl: string;
  finalUrl: string | null;
  retrievedAt: string;
  completedAt: string;
  requestCount: number;
  waitedMilliseconds: number;
  redirectCount: number;
  robotsUrl: string;
  robotsStatus: "allowed" | "denied" | "absent" | "unavailable";
  robotsDigest: `sha256:${string}` | null;
  httpStatus: number | null;
  responseMediaType: string | null;
  responseBytes: number;
  sourceResponseDigest: `sha256:${string}` | null;
  adapterReceiptFingerprint: `sha256:${string}` | null;
  committedRecordCount: number;
  observationIds: string[];
  candidateIds: string[];
  gapId: string | null;
  outcome: AsoiafStructuredAcquisitionOutcome;
  rawResponseRetained: false;
  graphEffect: "none";
  canonEffect: "none";
  receiptFingerprint: `sha256:${string}`;
}

export interface AsoiafStructuredAcquisitionStateEntry {
  requestId: string;
  planFingerprint: `sha256:${string}`;
  receiptUri: string;
  completedAt: string;
  outcome: "observed" | "partial";
}

export interface AsoiafStructuredAcquisitionState {
  format: typeof ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT;
  entries: AsoiafStructuredAcquisitionStateEntry[];
  stateFingerprint: `sha256:${string}`;
}

export interface AsoiafStructuredAcquisitionRuntime {
  fetch(url: string, init: RequestInit): Promise<Response>;
  sleep(milliseconds: number): Promise<void>;
  nowMilliseconds(): number;
}

export interface ExecuteAsoiafStructuredAcquisitionOptions {
  root: string;
  plan: AsoiafStructuredRequestPlan;
  runtime?: AsoiafStructuredAcquisitionRuntime;
  retrievedAt?: string;
  refresh?: boolean;
  includeText?: boolean;
  maxTextCharacters?: number;
  maxRedirects?: number;
}

export interface AsoiafStructuredAcquisitionResult {
  receipt: AsoiafStructuredAcquisitionReceipt;
  cacheHit: boolean;
  adapterResult: AsoiafStructuredAdapterResult | null;
  attempt: CollectorAttemptRecord;
  gap: CollectorGapRecord | null;
}

interface FetchTrace {
  response: Response | null;
  finalUrl: string;
  requestCount: number;
  waitedMilliseconds: number;
  redirectCount: number;
  error: string | null;
}

interface BoundedJsonResponse {
  payload: unknown;
  bytes: number;
  mediaType: string;
  digest: `sha256:${string}`;
}

interface RobotsEvaluation {
  status: "allowed" | "denied" | "absent" | "unavailable";
  digest: `sha256:${string}` | null;
  crawlDelayMilliseconds: number;
  requestCount: number;
  waitedMilliseconds: number;
  error: string | null;
}

interface RobotsRule {
  kind: "allow" | "disallow";
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelayMilliseconds: number;
}

const ALLOWED_ENDPOINTS: Record<
  AsoiafStructuredRequestPlan["adapterId"],
  { host: string; path: RegExp }
> = {
  "wikidata-sparql": {
    host: "query.wikidata.org",
    path: /^\/sparql$/,
  },
  "openlibrary-catalog": {
    host: "openlibrary.org",
    path: /^(?:\/search\.json|\/(?:works|books)\/[^/]+\.json)$/,
  },
  "crossref-works": {
    host: "api.crossref.org",
    path: /^\/works(?:\/[^/]+)?$/,
  },
  "awoiaf-mediawiki": {
    host: "awoiaf.westeros.org",
    path: /^\/api\.php$/,
  },
};

const SOURCES_BY_ADAPTER: Record<
  AsoiafStructuredRequestPlan["adapterId"],
  ReadonlySet<AsoiafStructuredRequestPlan["sourceId"]>
> = {
  "wikidata-sparql": new Set<AsoiafStructuredRequestPlan["sourceId"]>([
    "structured-wikidata",
  ]),
  "openlibrary-catalog": new Set<AsoiafStructuredRequestPlan["sourceId"]>([
    "structured-openlibrary-api",
  ]),
  "crossref-works": new Set<AsoiafStructuredRequestPlan["sourceId"]>([
    "structured-crossref-api",
  ]),
  "awoiaf-mediawiki": new Set<AsoiafStructuredRequestPlan["sourceId"]>([
    "structured-awoiaf-api",
    "structured-awoiaf-category-api",
    "structured-awoiaf-search-api",
  ]),
};

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
]);

const ROBOTS_AGENT_TOKEN = "axm-canon";

function digestBytes(value: Uint8Array | string): `sha256:${string}` {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function registeredEndpoint(
  adapterId: AsoiafStructuredRequestPlan["adapterId"],
  url: URL,
): boolean {
  const allowed = ALLOWED_ENDPOINTS[adapterId];
  return (
    url.protocol === "https:"
    && url.hostname === allowed.host
    && allowed.path.test(url.pathname)
    && !url.username
    && !url.password
    && !url.hash
  );
}

class DefaultStructuredAcquisitionRuntime
implements AsoiafStructuredAcquisitionRuntime {
  fetch(url: string, init: RequestInit): Promise<Response> {
    return globalThis.fetch(url, init);
  }

  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  nowMilliseconds(): number {
    return Date.now();
  }
}

class HostPacer {
  private readonly lastStartedByOrigin = new Map<string, number>();

  constructor(private readonly runtime: AsoiafStructuredAcquisitionRuntime) {}

  async wait(url: string, delayMilliseconds: number): Promise<number> {
    const origin = new URL(url).origin;
    const now = this.runtime.nowMilliseconds();
    const previous = this.lastStartedByOrigin.get(origin);
    const remaining = previous === undefined
      ? 0
      : Math.max(0, delayMilliseconds - (now - previous));
    if (remaining > 0) await this.runtime.sleep(remaining);
    this.lastStartedByOrigin.set(origin, this.runtime.nowMilliseconds());
    return remaining;
  }
}

const DEFAULT_STRUCTURED_ACQUISITION_RUNTIME =
  new DefaultStructuredAcquisitionRuntime();
const PACERS_BY_RUNTIME = new WeakMap<
  AsoiafStructuredAcquisitionRuntime,
  HostPacer
>();

function pacerFor(
  runtime: AsoiafStructuredAcquisitionRuntime,
): HostPacer {
  const existing = PACERS_BY_RUNTIME.get(runtime);
  if (existing) return existing;
  const pacer = new HostPacer(runtime);
  PACERS_BY_RUNTIME.set(runtime, pacer);
  return pacer;
}

function statePath(root: string): string {
  return path.join(path.resolve(root), "structured-acquisition-state.json");
}

function receiptDirectory(root: string): string {
  return path.join(path.resolve(root), "structured-acquisition-receipts");
}

function relativeEstateUri(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target)).split(path.sep).join("/");
}

function safeEstatePath(root: string, relativeUri: string): string | null {
  if (!relativeUri.trim() || path.isAbsolute(relativeUri)) return null;
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativeUri);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${path.sep}`)) {
    return null;
  }
  return target;
}

function emptyState(): AsoiafStructuredAcquisitionState {
  const core = {
    format: ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT,
    entries: [] as AsoiafStructuredAcquisitionStateEntry[],
  };
  return { ...core, stateFingerprint: sha256(core) };
}

function stateCore(
  state: AsoiafStructuredAcquisitionState,
): Omit<AsoiafStructuredAcquisitionState, "stateFingerprint"> {
  const { stateFingerprint: _fingerprint, ...core } = state;
  return core;
}

function readState(root: string): AsoiafStructuredAcquisitionState {
  const state = readJson<AsoiafStructuredAcquisitionState>(statePath(root), emptyState());
  if (
    state.format !== ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT
    || state.stateFingerprint !== sha256(stateCore(state))
  ) {
    throw new Error("structured acquisition state failed fingerprint custody");
  }
  return state;
}

function writeState(
  root: string,
  entries: readonly AsoiafStructuredAcquisitionStateEntry[],
): AsoiafStructuredAcquisitionState {
  const ordered = [...entries].sort(
    (left, right) =>
      left.requestId.localeCompare(right.requestId)
      || left.planFingerprint.localeCompare(right.planFingerprint),
  );
  const core = {
    format: ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT,
    entries: ordered,
  };
  const state = { ...core, stateFingerprint: sha256(core) };
  writeJsonAtomic(statePath(root), state);
  return state;
}

function upsertStateEntry(
  root: string,
  entry: AsoiafStructuredAcquisitionStateEntry,
): void {
  const state = readState(root);
  const entries = state.entries.filter(
    (current) => current.requestId !== entry.requestId,
  );
  entries.push(entry);
  writeState(root, entries);
}

function planCore(
  plan: AsoiafStructuredRequestPlan,
): Omit<AsoiafStructuredRequestPlan, "planFingerprint"> {
  const { planFingerprint: _fingerprint, ...core } = plan;
  return core;
}

export function validateAsoiafStructuredRequestPlan(
  plan: AsoiafStructuredRequestPlan,
): string[] {
  const errors: string[] = [];
  if (plan.planFingerprint !== sha256(planCore(plan))) {
    errors.push("request plan fingerprint mismatch");
  }
  if (plan.method !== "GET") errors.push("structured acquisition requires GET");
  if (plan.graphEffect !== "none" || plan.canonEffect !== "none") {
    errors.push("request plan acquired graph or canon effect");
  }
  if (!Number.isSafeInteger(plan.recordLimit) || plan.recordLimit < 1 || plan.recordLimit > 500) {
    errors.push("request plan record limit is outside 1 through 500");
  }
  const source = getAsoiafExternalSource(plan.sourceId);
  if (!source) {
    errors.push(`unknown atlas source ${plan.sourceId}`);
  } else if (source.harvestPolicy.mode !== "structured-cache-with-attribution") {
    errors.push(`${plan.sourceId} does not authorize structured acquisition`);
  }
  if (!SOURCES_BY_ADAPTER[plan.adapterId].has(plan.sourceId)) {
    errors.push(`${plan.sourceId} is not registered for adapter ${plan.adapterId}`);
  }
  const headersByName = new Map(
    Object.entries(plan.headers).map(([name, headerValue]) => [
      name.toLowerCase(),
      headerValue,
    ] as const),
  );
  if (
    [...headersByName.keys()].some((name) => SENSITIVE_HEADER_NAMES.has(name))
  ) {
    errors.push("request plan contains a credential-bearing header");
  }
  if (
    [...headersByName.values()].some((headerValue) => /[\r\n]/.test(headerValue))
  ) {
    errors.push("request plan contains a multiline header value");
  }
  if (
    headersByName.get("user-agent") !== ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT
  ) {
    errors.push("request plan user agent does not match qualified collector identity");
  }
  try {
    const url = new URL(plan.url);
    const allowed = ALLOWED_ENDPOINTS[plan.adapterId];
    if (url.protocol !== "https:") errors.push("request plan is not HTTPS");
    if (!registeredEndpoint(plan.adapterId, url)) {
      errors.push(`request plan escaped the registered ${plan.adapterId} endpoint`);
    }
    if (url.username || url.password || url.hash) {
      errors.push("request plan contains credentials or a fragment");
    }
  } catch {
    errors.push("request plan URL is invalid");
  }
  if (!/^application\/(?:json|sparql-results\+json)$/i.test(plan.responseMediaType)) {
    errors.push("request plan declares an unsupported response media type");
  }
  return [...new Set(errors)].sort();
}

function retryAfterMilliseconds(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(300_000, Math.ceil(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(300_000, Math.max(0, date - now));
}

async function fetchWithPolicy(input: {
  runtime: AsoiafStructuredAcquisitionRuntime;
  pacer: HostPacer;
  url: string;
  headers: Record<string, string>;
  hostDelayMilliseconds: number;
  retryCount: number;
  maxRedirects: number;
  redirectAllowed?: (url: URL) => boolean;
}): Promise<FetchTrace> {
  let currentUrl = input.url;
  let requestCount = 0;
  let waitedMilliseconds = 0;
  let redirectCount = 0;
  let transientAttempt = 0;

  while (true) {
    waitedMilliseconds += await input.pacer.wait(
      currentUrl,
      input.hostDelayMilliseconds,
    );
    requestCount += 1;
    let response: Response;
    try {
      response = await input.runtime.fetch(currentUrl, {
        method: "GET",
        headers: input.headers,
        redirect: "manual",
      });
    } catch (error) {
      if (transientAttempt >= input.retryCount) {
        return {
          response: null,
          finalUrl: currentUrl,
          requestCount,
          waitedMilliseconds,
          redirectCount,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      const delay = Math.min(30_000, 1_000 * 2 ** transientAttempt);
      await input.runtime.sleep(delay);
      waitedMilliseconds += delay;
      transientAttempt += 1;
      continue;
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          response,
          finalUrl: currentUrl,
          requestCount,
          waitedMilliseconds,
          redirectCount,
          error: "redirect response omitted Location",
        };
      }
      if (redirectCount >= input.maxRedirects) {
        return {
          response,
          finalUrl: currentUrl,
          requestCount,
          waitedMilliseconds,
          redirectCount,
          error: "redirect ceiling exceeded",
        };
      }
      const redirected = new URL(location, currentUrl);
      const current = new URL(currentUrl);
      if (redirected.protocol !== "https:" || redirected.origin !== current.origin) {
        await response.body?.cancel();
        return {
          response,
          finalUrl: redirected.toString(),
          requestCount,
          waitedMilliseconds,
          redirectCount,
          error: "cross-origin or non-HTTPS redirect refused",
        };
      }
      if (input.redirectAllowed && !input.redirectAllowed(redirected)) {
        await response.body?.cancel();
        return {
          response,
          finalUrl: redirected.toString(),
          requestCount,
          waitedMilliseconds,
          redirectCount,
          error: "redirect escaped the registered endpoint",
        };
      }
      await response.body?.cancel();
      currentUrl = redirected.toString();
      redirectCount += 1;
      transientAttempt = 0;
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      if (transientAttempt >= input.retryCount) {
        return {
          response,
          finalUrl: currentUrl,
          requestCount,
          waitedMilliseconds,
          redirectCount,
          error: null,
        };
      }
      const retryAfter = retryAfterMilliseconds(
        response.headers.get("retry-after"),
        input.runtime.nowMilliseconds(),
      );
      const delay = retryAfter
        ?? Math.min(30_000, 1_000 * 2 ** transientAttempt);
      await response.body?.cancel();
      await input.runtime.sleep(delay);
      waitedMilliseconds += delay;
      transientAttempt += 1;
      continue;
    }

    return {
      response,
      finalUrl: currentUrl,
      requestCount,
      waitedMilliseconds,
      redirectCount,
      error: null,
    };
  }
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];
  let crawlDelayMilliseconds = 0;

  const flush = () => {
    if (agents.length > 0) {
      groups.push({
        agents: [...agents],
        rules: [...rules],
        crawlDelayMilliseconds,
      });
    }
    agents = [];
    rules = [];
    crawlDelayMilliseconds = 0;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (rules.length > 0 || crawlDelayMilliseconds > 0) flush();
      agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (agents.length > 0) {
        rules.push({ kind: key, path: value });
      }
    } else if (key === "crawl-delay" && agents.length > 0) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        crawlDelayMilliseconds = Math.min(300_000, Math.ceil(seconds * 1_000));
      }
    }
  }
  flush();
  return groups;
}

function robotsAllowed(input: {
  groups: readonly RobotsGroup[];
  url: string;
  agentToken: string;
}): { allowed: boolean; crawlDelayMilliseconds: number } {
  const normalizedAgent = input.agentToken.toLowerCase();
  const matching = input.groups.flatMap((group) => {
    const specificity = Math.max(
      ...group.agents.map((agent) =>
        agent === "*"
          ? 0
          : normalizedAgent.includes(agent)
            ? agent.length
            : -1,
      ),
    );
    return specificity >= 0 ? [{ group, specificity }] : [];
  });
  if (matching.length === 0) return { allowed: true, crawlDelayMilliseconds: 0 };
  const maximum = Math.max(...matching.map((entry) => entry.specificity));
  const selected = matching
    .filter((entry) => entry.specificity === maximum)
    .map((entry) => entry.group);
  const target = `${new URL(input.url).pathname}${new URL(input.url).search}`;
  const matchingRules = selected
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path && target.startsWith(rule.path))
    .sort(
      (left, right) =>
        right.path.length - left.path.length
        || (left.kind === "allow" ? -1 : 1),
    );
  return {
    allowed: matchingRules[0]?.kind !== "disallow",
    crawlDelayMilliseconds: Math.max(
      0,
      ...selected.map((group) => group.crawlDelayMilliseconds),
    ),
  };
}

async function evaluateRobots(input: {
  runtime: AsoiafStructuredAcquisitionRuntime;
  pacer: HostPacer;
  targetUrl: string;
  headers: Record<string, string>;
  hostDelayMilliseconds: number;
  retryCount: number;
  maxRedirects: number;
}): Promise<RobotsEvaluation> {
  const target = new URL(input.targetUrl);
  const robotsUrl = `${target.origin}/robots.txt`;
  const trace = await fetchWithPolicy({
    runtime: input.runtime,
    pacer: input.pacer,
    url: robotsUrl,
    headers: {
      "User-Agent": input.headers["User-Agent"] ?? ROBOTS_AGENT_TOKEN,
      Accept: "text/plain",
    },
    hostDelayMilliseconds: input.hostDelayMilliseconds,
    retryCount: input.retryCount,
    maxRedirects: input.maxRedirects,
    redirectAllowed: (redirected) =>
      redirected.origin === target.origin
      && redirected.pathname === "/robots.txt",
  });
  if (!trace.response) {
    return {
      status: "unavailable",
      digest: null,
      crawlDelayMilliseconds: 0,
      requestCount: trace.requestCount,
      waitedMilliseconds: trace.waitedMilliseconds,
      error: trace.error ?? "robots request failed",
    };
  }
  if (trace.response.status === 404 || trace.response.status === 410) {
    return {
      status: "absent",
      digest: null,
      crawlDelayMilliseconds: 0,
      requestCount: trace.requestCount,
      waitedMilliseconds: trace.waitedMilliseconds,
      error: null,
    };
  }
  if (!trace.response.ok) {
    return {
      status: "unavailable",
      digest: null,
      crawlDelayMilliseconds: 0,
      requestCount: trace.requestCount,
      waitedMilliseconds: trace.waitedMilliseconds,
      error: `robots returned HTTP ${trace.response.status}`,
    };
  }
  const text = await trace.response.text();
  const digest = digestBytes(text);
  const evaluated = robotsAllowed({
    groups: parseRobots(text),
    url: input.targetUrl,
    agentToken: ROBOTS_AGENT_TOKEN,
  });
  return {
    status: evaluated.allowed ? "allowed" : "denied",
    digest,
    crawlDelayMilliseconds: evaluated.crawlDelayMilliseconds,
    requestCount: trace.requestCount,
    waitedMilliseconds: trace.waitedMilliseconds,
    error: null,
  };
}

function responseMediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
): Promise<BoundedJsonResponse> {
  const mediaType = responseMediaType(response);
  if (!/^application\/(?:json|sparql-results\+json|[^;]+\+json)$/.test(mediaType)) {
    throw new Error(`response media type ${mediaType || "missing"} is not JSON`);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new RangeError(`response Content-Length ${declared} exceeds ${maximumBytes}`);
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new RangeError(`response body exceeds ${maximumBytes} bytes`);
      }
      chunks.push(next.value);
    }
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const text = buffer.toString("utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new SyntaxError("response body is not valid JSON");
  }
  return {
    payload,
    bytes,
    mediaType,
    digest: digestBytes(buffer),
  };
}

function receiptCore(
  receipt: AsoiafStructuredAcquisitionReceipt,
): Omit<AsoiafStructuredAcquisitionReceipt, "receiptFingerprint" | "receiptId"> {
  const {
    receiptFingerprint: _fingerprint,
    receiptId: _receiptId,
    ...core
  } = receipt;
  return core;
}

function writeReceipt(
  root: string,
  core: Omit<AsoiafStructuredAcquisitionReceipt, "receiptFingerprint" | "receiptId">,
): { receipt: AsoiafStructuredAcquisitionReceipt; receiptUri: string } {
  const receiptFingerprint = sha256(core);
  const receiptId = collectorContentId("asoiaf-structured-acquisition-receipt", {
    requestId: core.requestId,
    planFingerprint: core.planFingerprint,
    receiptFingerprint,
  });
  const receipt: AsoiafStructuredAcquisitionReceipt = {
    ...core,
    receiptId,
    receiptFingerprint,
  };
  const target = path.join(receiptDirectory(root), `${receiptId}.json`);
  if (!fs.existsSync(target)) writeJsonAtomic(target, receipt);
  return { receipt, receiptUri: relativeEstateUri(root, target) };
}

function recordAcquisitionAttempt(
  input: Parameters<typeof recordAttempt>[0],
): CollectorAttemptRecord {
  const attempt = recordAttempt(input);
  updateSourceLedgerRow(input.root, input.sourceId, (row) => ({
    ...row,
    firstAttemptAt: row.firstAttemptAt ?? input.startedAt,
    lastAttemptAt: input.completedAt,
    attemptCount: row.attemptCount + 1,
  }));
  return attempt;
}

function terminalResult(input: {
  root: string;
  plan: AsoiafStructuredRequestPlan;
  retrievedAt: string;
  completedAt: string;
  requestCount: number;
  waitedMilliseconds: number;
  redirectCount: number;
  robots: RobotsEvaluation;
  finalUrl: string | null;
  httpStatus: number | null;
  mediaType: string | null;
  responseBytes: number;
  responseDigest: `sha256:${string}` | null;
  outcome: Exclude<AsoiafStructuredAcquisitionOutcome, "observed" | "partial" | "cache-hit">;
  gapStatus: CollectorGapRecord["status"];
  reason: string;
}): AsoiafStructuredAcquisitionResult {
  const terminal = recordGap({
    root: input.root,
    sourceId: input.plan.sourceId,
    sourceRecordId: input.plan.requestId,
    attemptedAt: input.completedAt,
    status: input.gapStatus,
    reason: input.reason,
    requestCount: input.requestCount,
  });
  const written = writeReceipt(input.root, {
    format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
    planFingerprint: input.plan.planFingerprint,
    adapterId: input.plan.adapterId,
    sourceId: input.plan.sourceId,
    requestId: input.plan.requestId,
    requestedUrl: input.plan.url,
    finalUrl: input.finalUrl,
    retrievedAt: input.retrievedAt,
    completedAt: input.completedAt,
    requestCount: input.requestCount,
    waitedMilliseconds: input.waitedMilliseconds,
    redirectCount: input.redirectCount,
    robotsUrl: `${new URL(input.plan.url).origin}/robots.txt`,
    robotsStatus: input.robots.status,
    robotsDigest: input.robots.digest,
    httpStatus: input.httpStatus,
    responseMediaType: input.mediaType,
    responseBytes: input.responseBytes,
    sourceResponseDigest: input.responseDigest,
    adapterReceiptFingerprint: null,
    committedRecordCount: 0,
    observationIds: [],
    candidateIds: [],
    gapId: terminal.gap.gapId,
    outcome: input.outcome,
    rawResponseRetained: false,
    graphEffect: "none",
    canonEffect: "none",
  });
  return {
    receipt: written.receipt,
    cacheHit: false,
    adapterResult: null,
    attempt: terminal.attempt,
    gap: terminal.gap,
  };
}

function successfulStateEntry(
  root: string,
  receipt: AsoiafStructuredAcquisitionReceipt,
  receiptUri: string,
): void {
  if (receipt.outcome !== "observed" && receipt.outcome !== "partial") return;
  upsertStateEntry(root, {
    requestId: receipt.requestId,
    planFingerprint: receipt.planFingerprint,
    receiptUri,
    completedAt: receipt.completedAt,
    outcome: receipt.outcome,
  });
}

export async function executeAsoiafStructuredAcquisition(
  options: ExecuteAsoiafStructuredAcquisitionOptions,
): Promise<AsoiafStructuredAcquisitionResult> {
  const errors = validateAsoiafStructuredRequestPlan(options.plan);
  if (errors.length > 0) {
    throw new Error(`invalid structured request plan: ${errors.join("; ")}`);
  }
  const runtime = options.runtime ?? DEFAULT_STRUCTURED_ACQUISITION_RUNTIME;
  const retrievedAt = options.retrievedAt
    ?? new Date(runtime.nowMilliseconds()).toISOString();
  initializeCollectorEstate(options.root, retrievedAt);

  if (!options.refresh) {
    const state = readState(options.root);
    const completed = state.entries.find(
      (entry) =>
        entry.requestId === options.plan.requestId
        && entry.planFingerprint === options.plan.planFingerprint,
    );
    if (completed) {
      const target = safeEstatePath(options.root, completed.receiptUri);
      if (!target || !fs.existsSync(target)) {
        throw new Error("structured acquisition state references a missing receipt");
      }
      const prior = readJson<AsoiafStructuredAcquisitionReceipt>(target, null as never);
      if (
        prior.receiptFingerprint !== sha256(receiptCore(prior))
        || prior.planFingerprint !== options.plan.planFingerprint
        || (prior.outcome !== "observed" && prior.outcome !== "partial")
      ) {
        throw new Error("structured acquisition replay receipt failed custody");
      }
      const replay = writeReceipt(options.root, {
        format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
        planFingerprint: options.plan.planFingerprint,
        adapterId: options.plan.adapterId,
        sourceId: options.plan.sourceId,
        requestId: options.plan.requestId,
        requestedUrl: options.plan.url,
        finalUrl: prior.finalUrl,
        retrievedAt,
        completedAt: retrievedAt,
        requestCount: 0,
        waitedMilliseconds: 0,
        redirectCount: 0,
        robotsUrl: prior.robotsUrl,
        robotsStatus: prior.robotsStatus,
        robotsDigest: prior.robotsDigest,
        httpStatus: prior.httpStatus,
        responseMediaType: prior.responseMediaType,
        responseBytes: prior.responseBytes,
        sourceResponseDigest: prior.sourceResponseDigest,
        adapterReceiptFingerprint: prior.adapterReceiptFingerprint,
        committedRecordCount: prior.committedRecordCount,
        observationIds: [...prior.observationIds],
        candidateIds: [...prior.candidateIds],
        gapId: null,
        outcome: "cache-hit",
        rawResponseRetained: false,
        graphEffect: "none",
        canonEffect: "none",
      });
      const attempt = recordAcquisitionAttempt({
        root: options.root,
        sourceId: options.plan.sourceId,
        sourceRecordId: options.plan.requestId,
        startedAt: retrievedAt,
        completedAt: retrievedAt,
        outcome: "cache-replay",
        requestCount: 0,
        cacheHit: true,
        receiptUri: replay.receiptUri,
        observationId: prior.observationIds[0] ?? null,
        gapId: null,
      });
      return {
        receipt: replay.receipt,
        cacheHit: true,
        adapterResult: null,
        attempt,
        gap: null,
      };
    }
  }

  const source = getAsoiafExternalSource(options.plan.sourceId)!;
  const pacer = pacerFor(runtime);
  const robots = await evaluateRobots({
    runtime,
    pacer,
    targetUrl: options.plan.url,
    headers: options.plan.headers,
    hostDelayMilliseconds: source.harvestPolicy.hostDelayMs,
    retryCount: source.harvestPolicy.retryCount,
    maxRedirects: options.maxRedirects ?? 3,
  });
  if (robots.status === "denied") {
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt: new Date(runtime.nowMilliseconds()).toISOString(),
      requestCount: robots.requestCount,
      waitedMilliseconds: robots.waitedMilliseconds,
      redirectCount: 0,
      robots,
      finalUrl: null,
      httpStatus: null,
      mediaType: null,
      responseBytes: 0,
      responseDigest: null,
      outcome: "blocked-robots",
      gapStatus: "blocked-robots",
      reason: "robots policy denied the structured endpoint",
    });
  }
  if (robots.status === "unavailable") {
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt: new Date(runtime.nowMilliseconds()).toISOString(),
      requestCount: robots.requestCount,
      waitedMilliseconds: robots.waitedMilliseconds,
      redirectCount: 0,
      robots,
      finalUrl: null,
      httpStatus: null,
      mediaType: null,
      responseBytes: 0,
      responseDigest: null,
      outcome: "error",
      gapStatus: "error",
      reason: robots.error ?? "robots policy could not be established",
    });
  }

  const effectiveDelay = Math.max(
    source.harvestPolicy.hostDelayMs,
    robots.crawlDelayMilliseconds,
  );
  const trace = await fetchWithPolicy({
    runtime,
    pacer,
    url: options.plan.url,
    headers: options.plan.headers,
    hostDelayMilliseconds: effectiveDelay,
    retryCount: source.harvestPolicy.retryCount,
    maxRedirects: options.maxRedirects ?? 3,
    redirectAllowed: (redirected) =>
      registeredEndpoint(options.plan.adapterId, redirected),
  });
  const requestCount = robots.requestCount + trace.requestCount;
  const waitedMilliseconds = robots.waitedMilliseconds + trace.waitedMilliseconds;
  const completedAt = new Date(runtime.nowMilliseconds()).toISOString();
  if (!trace.response || trace.error) {
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt,
      requestCount,
      waitedMilliseconds,
      redirectCount: trace.redirectCount,
      robots,
      finalUrl: trace.finalUrl,
      httpStatus: trace.response?.status ?? null,
      mediaType: trace.response ? responseMediaType(trace.response) : null,
      responseBytes: 0,
      responseDigest: null,
      outcome: "error",
      gapStatus: "error",
      reason: trace.error ?? "structured endpoint request failed",
    });
  }
  if (trace.response.status === 401 || trace.response.status === 403) {
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt,
      requestCount,
      waitedMilliseconds,
      redirectCount: trace.redirectCount,
      robots,
      finalUrl: trace.finalUrl,
      httpStatus: trace.response.status,
      mediaType: responseMediaType(trace.response),
      responseBytes: 0,
      responseDigest: null,
      outcome: "blocked-credential",
      gapStatus: "blocked-credential",
      reason: `structured endpoint returned HTTP ${trace.response.status}`,
    });
  }
  if (trace.response.status === 404 || trace.response.status === 410) {
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt,
      requestCount,
      waitedMilliseconds,
      redirectCount: trace.redirectCount,
      robots,
      finalUrl: trace.finalUrl,
      httpStatus: trace.response.status,
      mediaType: responseMediaType(trace.response),
      responseBytes: 0,
      responseDigest: null,
      outcome: "unavailable",
      gapStatus: "unavailable",
      reason: `structured endpoint returned HTTP ${trace.response.status}`,
    });
  }
  if (!trace.response.ok) {
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt,
      requestCount,
      waitedMilliseconds,
      redirectCount: trace.redirectCount,
      robots,
      finalUrl: trace.finalUrl,
      httpStatus: trace.response.status,
      mediaType: responseMediaType(trace.response),
      responseBytes: 0,
      responseDigest: null,
      outcome: "error",
      gapStatus: "error",
      reason: `structured endpoint returned HTTP ${trace.response.status}`,
    });
  }

  let bounded: BoundedJsonResponse;
  try {
    bounded = await boundedJson(
      trace.response,
      source.harvestPolicy.maxResponseBytes,
    );
  } catch (error) {
    const oversize = error instanceof RangeError;
    return terminalResult({
      root: options.root,
      plan: options.plan,
      retrievedAt,
      completedAt,
      requestCount,
      waitedMilliseconds,
      redirectCount: trace.redirectCount,
      robots,
      finalUrl: trace.finalUrl,
      httpStatus: trace.response.status,
      mediaType: responseMediaType(trace.response),
      responseBytes: 0,
      responseDigest: null,
      outcome: oversize ? "rejected-oversize" : "invalid-response",
      gapStatus: oversize ? "rejected-oversize" : "error",
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const adapterResult = commitAsoiafStructuredPayload({
    root: options.root,
    adapterId: options.plan.adapterId,
    sourceId: options.plan.sourceId,
    requestId: options.plan.requestId,
    sourceUri: trace.finalUrl,
    payload: bounded.payload,
    sourceResponseDigest: bounded.digest,
    sourceResponseBytes: bounded.bytes,
    retrievedAt: completedAt,
    includeText: options.includeText,
    maxTextCharacters: options.maxTextCharacters,
    recordLimit: options.plan.recordLimit,
  });
  const outcome: AsoiafStructuredAcquisitionReceipt["outcome"] =
    adapterResult.receipt.outcome;
  const written = writeReceipt(options.root, {
    format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
    planFingerprint: options.plan.planFingerprint,
    adapterId: options.plan.adapterId,
    sourceId: options.plan.sourceId,
    requestId: options.plan.requestId,
    requestedUrl: options.plan.url,
    finalUrl: trace.finalUrl,
    retrievedAt,
    completedAt,
    requestCount,
    waitedMilliseconds,
    redirectCount: trace.redirectCount,
    robotsUrl: `${new URL(options.plan.url).origin}/robots.txt`,
    robotsStatus: robots.status,
    robotsDigest: robots.digest,
    httpStatus: trace.response.status,
    responseMediaType: bounded.mediaType,
    responseBytes: bounded.bytes,
    sourceResponseDigest: bounded.digest,
    adapterReceiptFingerprint: adapterResult.receipt.receiptFingerprint,
    committedRecordCount: adapterResult.receipt.committedRecordCount,
    observationIds: [...adapterResult.receipt.observationIds].sort(),
    candidateIds: [...adapterResult.receipt.candidateIds].sort(),
    gapId: adapterResult.gap?.gapId ?? null,
    outcome,
    rawResponseRetained: false,
    graphEffect: "none",
    canonEffect: "none",
  });
  const attempt = recordAcquisitionAttempt({
    root: options.root,
    sourceId: options.plan.sourceId,
    sourceRecordId: options.plan.requestId,
    startedAt: retrievedAt,
    completedAt,
    outcome: outcome === "observed" || outcome === "partial"
      ? "observed"
      : "error",
    requestCount,
    cacheHit: false,
    receiptUri: written.receiptUri,
    observationId: adapterResult.receipt.observationIds[0] ?? null,
    gapId: adapterResult.gap?.gapId ?? null,
  });
  successfulStateEntry(options.root, written.receipt, written.receiptUri);
  return {
    receipt: written.receipt,
    cacheHit: false,
    adapterResult,
    attempt,
    gap: adapterResult.gap,
  };
}

export async function runAsoiafStructuredAcquisitionBatch(input: {
  root: string;
  plans: readonly AsoiafStructuredRequestPlan[];
  runtime?: AsoiafStructuredAcquisitionRuntime;
  retrievedAt?: string;
  refresh?: boolean;
  includeText?: boolean;
  maxTextCharacters?: number;
  maxRedirects?: number;
}): Promise<AsoiafStructuredAcquisitionResult[]> {
  const results: AsoiafStructuredAcquisitionResult[] = [];
  for (const plan of input.plans) {
    results.push(
      await executeAsoiafStructuredAcquisition({
        root: input.root,
        plan,
        runtime: input.runtime,
        retrievedAt: input.retrievedAt,
        refresh: input.refresh,
        includeText: input.includeText,
        maxTextCharacters: input.maxTextCharacters,
        maxRedirects: input.maxRedirects,
      }),
    );
  }
  return results;
}


export function readAsoiafStructuredAcquisitionState(
  root: string,
): AsoiafStructuredAcquisitionState {
  return readState(root);
}

export function listAsoiafStructuredAcquisitionReceipts(
  root: string,
): AsoiafStructuredAcquisitionReceipt[] {
  const directory = receiptDirectory(root);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) =>
      readJson<AsoiafStructuredAcquisitionReceipt>(
        path.join(directory, entry.name),
        null as never,
      ),
    )
    .sort(
      (left, right) =>
        left.requestId.localeCompare(right.requestId)
        || left.completedAt.localeCompare(right.completedAt)
        || left.receiptId.localeCompare(right.receiptId),
    );
}

export function verifyAsoiafStructuredAcquisitionEstate(
  root: string,
): string[] {
  initializeCollectorEstate(root);
  const errors: string[] = [];
  let state: AsoiafStructuredAcquisitionState | null = null;
  try {
    state = readState(root);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const receiptsByUri = new Map<string, AsoiafStructuredAcquisitionReceipt>();
  const receiptIds = new Set<string>();
  const directory = receiptDirectory(root);
  if (fs.existsSync(directory)) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const target = path.join(directory, entry.name);
      try {
        const receipt = readJson<AsoiafStructuredAcquisitionReceipt>(
target,
null as never,
        );
        const subject = receipt.receiptId || entry.name;
        if (receipt.format !== ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT) {
errors.push(`${subject}: invalid acquisition receipt format`);
        }
        const expectedFingerprint = sha256(receiptCore(receipt));
        if (receipt.receiptFingerprint !== expectedFingerprint) {
errors.push(`${subject}: acquisition receipt fingerprint mismatch`);
        }
        const expectedId = collectorContentId(
"asoiaf-structured-acquisition-receipt",
{
  requestId: receipt.requestId,
  planFingerprint: receipt.planFingerprint,
  receiptFingerprint: receipt.receiptFingerprint,
},
        );
        if (receipt.receiptId !== expectedId) {
errors.push(`${subject}: acquisition receipt identity mismatch`);
        }
        if (receiptIds.has(receipt.receiptId)) {
errors.push(`${subject}: duplicate acquisition receipt identity`);
        }
        receiptIds.add(receipt.receiptId);
        if (receipt.rawResponseRetained !== false) {
errors.push(`${subject}: acquisition receipt claims raw response retention`);
        }
        if (receipt.graphEffect !== "none" || receipt.canonEffect !== "none") {
errors.push(`${subject}: acquisition receipt acquired graph or canon effect`);
        }
        if (!SOURCES_BY_ADAPTER[receipt.adapterId].has(receipt.sourceId)) {
errors.push(`${subject}: adapter and atlas source identity mismatch`);
        }
        try {
const requested = new URL(receipt.requestedUrl);
if (!registeredEndpoint(receipt.adapterId, requested)) {
  errors.push(`${subject}: requested URL escaped its registered endpoint`);
}
if (receipt.robotsUrl !== `${requested.origin}/robots.txt`) {
  errors.push(`${subject}: robots URL does not match requested origin`);
}
        } catch {
errors.push(`${subject}: requested URL is invalid`);
        }
        if (receipt.committedRecordCount !== receipt.observationIds.length) {
errors.push(`${subject}: committed-record and observation counts differ`);
        }
        if (receipt.committedRecordCount !== receipt.candidateIds.length) {
errors.push(`${subject}: committed-record and candidate counts differ`);
        }
        if (
["observed", "partial", "cache-hit"].includes(receipt.outcome)
&& (!receipt.sourceResponseDigest || !receipt.adapterReceiptFingerprint)
        ) {
errors.push(`${subject}: successful receipt lacks response or adapter custody`);
        }
        if (receipt.outcome === "cache-hit" && receipt.requestCount !== 0) {
errors.push(`${subject}: cache replay performed network requests`);
        }
        receiptsByUri.set(relativeEstateUri(root, target), receipt);
      } catch (error) {
        errors.push(
`${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (state) {
    const requestIds = new Set<string>();
    for (const entry of state.entries) {
      if (requestIds.has(entry.requestId)) {
        errors.push(`state duplicates request ${entry.requestId}`);
      }
      requestIds.add(entry.requestId);
      const target = safeEstatePath(root, entry.receiptUri);
      const receipt = target && fs.existsSync(target)
        ? receiptsByUri.get(entry.receiptUri)
?? readJson<AsoiafStructuredAcquisitionReceipt>(target, null as never)
        : null;
      if (!receipt) {
        errors.push(`state request ${entry.requestId} references a missing receipt`);
        continue;
      }
      if (
        receipt.requestId !== entry.requestId
        || receipt.planFingerprint !== entry.planFingerprint
        || receipt.completedAt !== entry.completedAt
        || receipt.outcome !== entry.outcome
      ) {
        errors.push(`state request ${entry.requestId} disagrees with its receipt`);
      }
      if (receipt.outcome !== "observed" && receipt.outcome !== "partial") {
        errors.push(`state request ${entry.requestId} is not a successful acquisition`);
      }
    }
  }

  const gaps = new Set(
    readNdjson<CollectorGapRecord>(collectorEstatePaths(root).gaps)
      .map((gap) => gap.gapId),
  );
  for (const receipt of receiptsByUri.values()) {
    if (receipt.gapId && !gaps.has(receipt.gapId)) {
      errors.push(`${receipt.receiptId}: acquisition gap is missing`);
    }
  }
  errors.push(
    ...verifyCollectorEstate(root).map((error) => `collector: ${error}`),
  );
  return [...new Set(errors)].sort();
}
