import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import {
  ASOIAF_EXTERNAL_PROVENANCE_LINEAGE,
  asoiafExternalCreditRequired,
  containsPrivateContact,
  getAsoiafExternalSource,
  type AsoiafExternalSource,
} from "../../src/external/index.js";
import {
  advanceCollectorCursor,
  cacheKey,
  collectorEstatePaths,
  collectorStatus,
  commitObservation,
  findCacheEntry,
  generateCollectorCredits,
  initializeCollectorEstate,
  loadSourceLedger,
  planCollectorWork,
  readNdjson,
  recordAttempt,
  recordGap,
  sha256,
  updateSourceLedgerRow,
  upsertCacheIndex,
  verifyCollectorEstate,
  writeJsonAtomic,
  type CollectorAttemptRecord,
  type CollectorGapRecord,
  type CollectorObservationRecord,
  type CollectorSourceLedgerRow,
} from "./asoiaf-external-estate.js";

export const ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT =
  "axm-canon/asoiaf-external-collector/1 (+https://github.com/BigBirdReturns/axm-canon; bigbirdreturns@proton.me)";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface CollectorClock {
  now(): Date;
  sleep(milliseconds: number): Promise<void>;
}

export interface CollectNetworkOptions {
  root: string;
  sourceId: string;
  sourceRecordId?: string;
  targetUri?: string;
  refresh?: boolean;
  fetchImpl?: FetchLike;
  clock?: CollectorClock;
  headers?: Record<string, string>;
  credentialValues?: Record<string, string>;
  skipRobotsFetch?: boolean;
}

export interface CollectLocalOptions {
  root: string;
  sourceId: string;
  sourceRecordId: string;
  filePath: string;
  retrievedAt?: string;
  refresh?: boolean;
}

export interface CollectorRunResult {
  sourceId: string;
  sourceRecordId: string | null;
  outcome: CollectorAttemptRecord["outcome"];
  requestCount: number;
  cacheHit: boolean;
  observation: CollectorObservationRecord | null;
  gap: CollectorGapRecord | null;
  attempt: CollectorAttemptRecord;
}

interface PoliteFetchResult {
  response: Response;
  requestCount: number;
}

interface HostThrottleState {
  lastRequestAt: Map<string, number>;
}

const throttleState: HostThrottleState = {
  lastRequestAt: new Map<string, number>(),
};

const systemClock: CollectorClock = {
  now: () => new Date(),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(
  value: string | null,
  now: Date,
): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) {
    return Math.min(60_000, Number(value.trim()) * 1_000);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(60_000, Math.max(0, parsed - now.getTime()));
}

async function waitForHost(
  target: URL,
  hostDelayMs: number,
  clock: CollectorClock,
): Promise<void> {
  const previous = throttleState.lastRequestAt.get(target.host) ?? 0;
  const elapsed = clock.now().getTime() - previous;
  if (elapsed < hostDelayMs) await clock.sleep(hostDelayMs - elapsed);
  throttleState.lastRequestAt.set(target.host, clock.now().getTime());
}

async function politeFetch(
  target: URL,
  source: AsoiafExternalSource,
  options: {
    fetchImpl: FetchLike;
    clock: CollectorClock;
    headers: Record<string, string>;
    maxBytes: number;
  },
): Promise<PoliteFetchResult> {
  let requestCount = 0;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= source.harvestPolicy.retryCount; attempt += 1) {
    await waitForHost(target, source.harvestPolicy.hostDelayMs, options.clock);
    requestCount += 1;
    try {
      const response = await options.fetchImpl(target, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT,
          Accept: "application/json,application/xml,text/html,text/plain,*/*;q=0.5",
          ...options.headers,
        },
      });
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (
        Number.isFinite(contentLength)
        && contentLength > options.maxBytes
      ) {
        throw new CollectorOversizeError(
          `response declared ${contentLength} bytes; maximum is ${options.maxBytes}`,
        );
      }
      if (!isTransientStatus(response.status) || attempt >= source.harvestPolicy.retryCount) {
        return { response, requestCount };
      }
      const retryAfter = retryAfterMilliseconds(
        response.headers.get("retry-after"),
        options.clock.now(),
      );
      await options.clock.sleep(
        retryAfter ?? Math.min(30_000, 1_000 * 2 ** attempt),
      );
    } catch (error) {
      if (error instanceof CollectorOversizeError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= source.harvestPolicy.retryCount) throw lastError;
      await options.clock.sleep(Math.min(30_000, 1_000 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error(`failed to fetch ${target}`);
}

class CollectorOversizeError extends Error {}

function robotsUri(target: URL): URL {
  return new URL("/robots.txt", target.origin);
}

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && key === "disallow") {
      if (value) current.disallow.push(value);
    } else if (current && key === "allow") {
      if (value) current.allow.push(value);
    }
  }
  return groups;
}

function robotsAllows(text: string, target: URL): boolean {
  const groups = parseRobots(text);
  const toolToken = "axm-canon";
  const applicable = groups.filter((group) =>
    group.agents.some(
      (agent) => agent === "*" || toolToken.includes(agent),
    ),
  );
  if (!applicable.length) return true;
  const pathAndQuery = `${target.pathname}${target.search}`;
  let best: { length: number; allowed: boolean } | null = null;
  for (const group of applicable) {
    for (const rule of group.disallow) {
      if (pathAndQuery.startsWith(rule)) {
        if (!best || rule.length > best.length) {
          best = { length: rule.length, allowed: false };
        }
      }
    }
    for (const rule of group.allow) {
      if (pathAndQuery.startsWith(rule)) {
        if (!best || rule.length >= best.length) {
          best = { length: rule.length, allowed: true };
        }
      }
    }
  }
  return best?.allowed ?? true;
}

async function checkRobots(input: {
  target: URL;
  source: AsoiafExternalSource;
  fetchImpl: FetchLike;
  clock: CollectorClock;
  headers: Record<string, string>;
  skipFetch: boolean;
}): Promise<{ allowed: boolean; requestCount: number; reason: string }> {
  if (input.skipFetch) {
    return { allowed: true, requestCount: 0, reason: "robots-check-injected-as-allow" };
  }
  const result = await politeFetch(robotsUri(input.target), input.source, {
    fetchImpl: input.fetchImpl,
    clock: input.clock,
    headers: input.headers,
    maxBytes: 512_000,
  });
  if (result.response.status === 404) {
    return { allowed: true, requestCount: result.requestCount, reason: "robots-not-found" };
  }
  if (!result.response.ok) {
    return {
      allowed: false,
      requestCount: result.requestCount,
      reason: `robots-unavailable-http-${result.response.status}`,
    };
  }
  const bytes = new Uint8Array(await result.response.arrayBuffer());
  if (bytes.byteLength > 512_000) {
    return {
      allowed: false,
      requestCount: result.requestCount,
      reason: "robots-response-oversize",
    };
  }
  const text = new TextDecoder().decode(bytes);
  return {
    allowed: robotsAllows(text, input.target),
    requestCount: result.requestCount,
    reason: robotsAllows(text, input.target) ? "robots-allow" : "robots-disallow",
  };
}

function networkAccessMethod(source: AsoiafExternalSource): AsoiafExternalSource["accessMethods"][number] | undefined {
  return source.accessMethods.find((method) => {
    try {
      return new URL(method.uri).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function normalizeTextBody(bytes: Uint8Array, mediaType: string): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (mediaType.includes("html")) {
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

function responseTitle(
  source: AsoiafExternalSource,
  response: Response,
): string {
  return response.headers.get("x-title")?.trim() || source.label;
}

function automaticCredit(
  source: AsoiafExternalSource,
  title: string,
  sourceUri: string,
) {
  if (!asoiafExternalCreditRequired(source)) return null;
  return {
    title,
    author: source.label,
    license: source.rightsMode,
    sourceUri,
  };
}

function relativeCacheUri(root: string, absolute: string): string {
  return path.relative(path.resolve(root), absolute).split(path.sep).join(path.posix.sep);
}

function writeLicensedCache(input: {
  root: string;
  source: AsoiafExternalSource;
  digest: `sha256:${string}`;
  mediaType: string;
  bytes: Uint8Array;
}): string {
  const paths = collectorEstatePaths(input.root);
  const extension = input.mediaType.includes("json")
    ? "json"
    : input.mediaType.includes("xml")
      ? "xml"
      : input.mediaType.includes("html")
        ? "html"
        : "bin";
  const digestValue = input.digest.slice("sha256:".length);
  const target = path.join(paths.cache, input.source.id, `${digestValue}.${extension}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.writeFileSync(target, input.bytes);
  return relativeCacheUri(input.root, target);
}

async function responseBytes(
  response: Response,
  maximum: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximum) {
    throw new CollectorOversizeError(
      `response contained ${bytes.byteLength} bytes; maximum is ${maximum}`,
    );
  }
  return bytes;
}

function contentDigest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function observationFromCache(
  root: string,
  observationId: string,
): CollectorObservationRecord | null {
  const paths = initializeCollectorEstate(root);
  return (
    readNdjson<CollectorObservationRecord>(paths.observations).find(
      (observation) => observation.observationId === observationId,
    ) ?? null
  );
}

function completedAttempt(input: {
  root: string;
  sourceId: string;
  sourceRecordId: string | null;
  startedAt: string;
  completedAt: string;
  outcome: CollectorAttemptRecord["outcome"];
  requestCount: number;
  cacheHit: boolean;
  receiptUri: string | null;
  observationId: string | null;
  gapId: string | null;
  incrementLedger?: boolean;
}): CollectorAttemptRecord {
  const attempt = recordAttempt(input);
  if (input.incrementLedger) {
    updateSourceLedgerRow(input.root, input.sourceId, (row) => ({
      ...row,
      firstAttemptAt: row.firstAttemptAt ?? input.startedAt,
      lastAttemptAt: input.completedAt,
      attemptCount: row.attemptCount + 1,
    }));
  }
  return attempt;
}

export async function collectNetworkSource(
  options: CollectNetworkOptions,
): Promise<CollectorRunResult> {
  const source = getAsoiafExternalSource(options.sourceId);
  if (!source) throw new Error(`unknown source ${options.sourceId}`);
  initializeCollectorEstate(options.root);
  const startedAt = (options.clock ?? systemClock).now().toISOString();

  if (source.harvestPolicy.mode === "local-private-only") {
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      attemptedAt: startedAt,
      status: "blocked-rights",
      reason: "local-private-only source requires collect-local",
    });
    return {
      sourceId: source.id,
      sourceRecordId: null,
      outcome: terminal.gap.status,
      requestCount: 0,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }

  if (source.harvestPolicy.mode === "route-only-no-mirror") {
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? source.canonicalUri,
      attemptedAt: startedAt,
      status: "route-only",
      reason: "source is registered for navigation and provenance only; network payload is not collected",
    });
    advanceCollectorCursor(options.root, 1, startedAt);
    return {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? source.canonicalUri,
      outcome: terminal.gap.status,
      requestCount: 0,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }

  const access = networkAccessMethod(source);
  const targetText = options.targetUri ?? access?.uri;
  if (!targetText) {
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? null,
      attemptedAt: startedAt,
      status: "unavailable",
      reason: "source requires a record-specific HTTPS locator",
    });
    return {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? null,
      outcome: terminal.gap.status,
      requestCount: 0,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }

  let target: URL;
  try {
    target = new URL(targetText);
  } catch {
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? null,
      attemptedAt: startedAt,
      status: "unavailable",
      reason: `invalid network locator ${targetText}`,
    });
    return {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? null,
      outcome: terminal.gap.status,
      requestCount: 0,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }
  if (target.protocol !== "https:") {
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? target.href,
      attemptedAt: startedAt,
      status: "blocked-rights",
      reason: "collector permits HTTPS network sources only",
    });
    return {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? target.href,
      outcome: terminal.gap.status,
      requestCount: 0,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }

  if (
    access
    && access.credential !== "none"
    && !options.credentialValues?.[access.credential]
  ) {
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? target.href,
      attemptedAt: startedAt,
      status: "blocked-credential",
      reason: `source requires ${access.credential} custody`,
    });
    return {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId ?? target.href,
      outcome: terminal.gap.status,
      requestCount: 0,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }

  const sourceRecordId = options.sourceRecordId ?? target.href;
  const cached = findCacheEntry(options.root, source.id, sourceRecordId);
  if (cached && !options.refresh) {
    const observation = observationFromCache(options.root, cached.observationId);
    const completedAt = (options.clock ?? systemClock).now().toISOString();
    const attempt = completedAttempt({
      root: options.root,
      sourceId: source.id,
      sourceRecordId,
      startedAt,
      completedAt,
      outcome: "cache-replay",
      requestCount: 0,
      cacheHit: true,
      receiptUri: observation?.receiptUri ?? null,
      observationId: observation?.observationId ?? null,
      gapId: null,
      incrementLedger: true,
    });
    advanceCollectorCursor(options.root, 1, completedAt);
    return {
      sourceId: source.id,
      sourceRecordId,
      outcome: "cache-replay",
      requestCount: 0,
      cacheHit: true,
      observation,
      gap: null,
      attempt,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? systemClock;
  const headers = options.headers ?? {};
  let requestCount = 0;
  try {
    const robots = await checkRobots({
      target,
      source,
      fetchImpl,
      clock,
      headers,
      skipFetch: options.skipRobotsFetch ?? false,
    });
    requestCount += robots.requestCount;
    if (!robots.allowed) {
      const completedAt = clock.now().toISOString();
      const terminal = recordGap({
        root: options.root,
        sourceId: source.id,
        sourceRecordId,
        attemptedAt: completedAt,
        status: "blocked-robots",
        reason: robots.reason,
        requestCount,
      });
      advanceCollectorCursor(options.root, 1, completedAt);
      return {
        sourceId: source.id,
        sourceRecordId,
        outcome: terminal.gap.status,
        requestCount,
        cacheHit: false,
        observation: null,
        gap: terminal.gap,
        attempt: terminal.attempt,
      };
    }

    const fetched = await politeFetch(target, source, {
      fetchImpl,
      clock,
      headers,
      maxBytes: source.harvestPolicy.maxResponseBytes,
    });
    requestCount += fetched.requestCount;
    const completedAt = clock.now().toISOString();
    if (!fetched.response.ok) {
      const terminal = recordGap({
        root: options.root,
        sourceId: source.id,
        sourceRecordId,
        attemptedAt: completedAt,
        status: "unavailable",
        reason: `HTTP ${fetched.response.status} ${fetched.response.statusText}`.trim(),
        requestCount,
      });
      advanceCollectorCursor(options.root, 1, completedAt);
      return {
        sourceId: source.id,
        sourceRecordId,
        outcome: terminal.gap.status,
        requestCount,
        cacheHit: false,
        observation: null,
        gap: terminal.gap,
        attempt: terminal.attempt,
      };
    }

    const bytes = await responseBytes(
      fetched.response,
      source.harvestPolicy.maxResponseBytes,
    );
    const digest = contentDigest(bytes);
    const mediaType = (
      fetched.response.headers.get("content-type") ?? "application/octet-stream"
    )
      .split(";", 1)[0]!
      .trim()
      .toLowerCase();
    const normalizedText = normalizeTextBody(bytes, mediaType);
    let retention: CollectorObservationRecord["retention"] = "metadata-only";
    let excerpt: string | null = null;
    let cacheUri: string | null = null;
    let retainedValue: unknown = undefined;

    if (source.harvestPolicy.retainRawBody) {
      if (
        !["cc0", "cc-by", "cc-by-sa", "public-domain"].includes(
          source.rightsMode,
        )
      ) {
        const terminal = recordGap({
          root: options.root,
          sourceId: source.id,
          sourceRecordId,
          attemptedAt: completedAt,
          status: "blocked-rights",
          reason: "raw body retention is not authorized by source rights mode",
          requestCount,
        });
        return {
          sourceId: source.id,
          sourceRecordId,
          outcome: terminal.gap.status,
          requestCount,
          cacheHit: false,
          observation: null,
          gap: terminal.gap,
          attempt: terminal.attempt,
        };
      }
      retainedValue = mediaType.includes("json")
        ? JSON.parse(new TextDecoder().decode(bytes))
        : normalizedText;
      if (containsPrivateContact(retainedValue)) {
        const terminal = recordGap({
          root: options.root,
          sourceId: source.id,
          sourceRecordId,
          attemptedAt: completedAt,
          status: "rejected-private-contact",
          reason: "licensed body contained private contact or address data",
          requestCount,
        });
        return {
          sourceId: source.id,
          sourceRecordId,
          outcome: terminal.gap.status,
          requestCount,
          cacheHit: false,
          observation: null,
          gap: terminal.gap,
          attempt: terminal.attempt,
        };
      }
      cacheUri = writeLicensedCache({
        root: options.root,
        source,
        digest,
        mediaType,
        bytes,
      });
      retention = "licensed-structured-body";
    } else if (source.harvestPolicy.excerptMaxChars > 0) {
      excerpt = normalizedText.slice(0, source.harvestPolicy.excerptMaxChars);
      retainedValue = { excerpt };
      if (containsPrivateContact(retainedValue)) {
        const terminal = recordGap({
          root: options.root,
          sourceId: source.id,
          sourceRecordId,
          attemptedAt: completedAt,
          status: "rejected-private-contact",
          reason: "bounded excerpt contained private contact or address data",
          requestCount,
        });
        return {
          sourceId: source.id,
          sourceRecordId,
          outcome: terminal.gap.status,
          requestCount,
          cacheHit: false,
          observation: null,
          gap: terminal.gap,
          attempt: terminal.attempt,
        };
      }
      retention = "bounded-excerpt";
    }

    const title = responseTitle(source, fetched.response);
    const committed = commitObservation({
      root: options.root,
      sourceId: source.id,
      sourceRecordId,
      retrievedAt: completedAt,
      contentDigest: digest,
      recordType: source.contentClasses[0] ?? "external-record",
      title,
      summary: excerpt ?? `Collected ${mediaType} metadata from ${source.label}.`,
      mediaType,
      responseBytes: bytes.byteLength,
      retainedFields: [
        "sourceId",
        "sourceRecordId",
        "contentDigest",
        "mediaType",
        "responseBytes",
        ...(excerpt ? ["excerpt"] : []),
        ...(cacheUri ? ["cacheUri"] : []),
      ],
      retention,
      excerpt,
      cacheUri,
      sourceUri: fetched.response.url || target.href,
      publishedAt: fetched.response.headers.get("last-modified"),
      updatedAt: fetched.response.headers.get("last-modified"),
      credit: automaticCredit(
        source,
        title,
        fetched.response.url || target.href,
      ),
      retainedValue,
      requestCount,
      cacheHit: false,
    });
    upsertCacheIndex(options.root, {
      cacheKey: cacheKey(source.id, sourceRecordId),
      sourceId: source.id,
      sourceRecordId,
      contentDigest: digest,
      observationId: committed.observation.observationId,
      cacheUri,
      storedAt: completedAt,
    });
    const attempt = completedAttempt({
      root: options.root,
      sourceId: source.id,
      sourceRecordId,
      startedAt,
      completedAt,
      outcome: "observed",
      requestCount,
      cacheHit: false,
      receiptUri: committed.observation.receiptUri,
      observationId: committed.observation.observationId,
      gapId: null,
    });
    generateCollectorCredits(options.root);
    advanceCollectorCursor(options.root, 1, completedAt);
    return {
      sourceId: source.id,
      sourceRecordId,
      outcome: "observed",
      requestCount,
      cacheHit: false,
      observation: committed.observation,
      gap: null,
      attempt,
    };
  } catch (error) {
    const completedAt = (options.clock ?? systemClock).now().toISOString();
    const oversize = error instanceof CollectorOversizeError;
    const terminal = recordGap({
      root: options.root,
      sourceId: source.id,
      sourceRecordId,
      attemptedAt: completedAt,
      status: oversize ? "rejected-oversize" : "error",
      reason: error instanceof Error ? error.message : String(error),
      requestCount,
    });
    advanceCollectorCursor(options.root, 1, completedAt);
    return {
      sourceId: source.id,
      sourceRecordId,
      outcome: terminal.gap.status,
      requestCount,
      cacheHit: false,
      observation: null,
      gap: terminal.gap,
      attempt: terminal.attempt,
    };
  }
}

async function streamFileDigest(
  filePath: string,
): Promise<{ digest: `sha256:${string}`; bytes: number }> {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength;
      hash.update(chunk);
      callback();
    },
  });
  await pipeline(fs.createReadStream(filePath), sink);
  return { digest: `sha256:${hash.digest("hex")}`, bytes };
}

export async function collectLocalSource(
  options: CollectLocalOptions,
): Promise<CollectorRunResult> {
  const source = getAsoiafExternalSource(options.sourceId);
  if (!source) throw new Error(`unknown source ${options.sourceId}`);
  if (source.harvestPolicy.mode !== "local-private-only") {
    throw new Error(`${options.sourceId} is not a local-private-only source`);
  }
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  initializeCollectorEstate(options.root, retrievedAt);
  const { digest, bytes } = await streamFileDigest(options.filePath);
  const existing = findCacheEntry(
    options.root,
    source.id,
    options.sourceRecordId,
  );
  if (
    existing
    && existing.contentDigest === digest
    && !options.refresh
  ) {
    const observation = observationFromCache(options.root, existing.observationId);
    const attempt = completedAttempt({
      root: options.root,
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId,
      startedAt: retrievedAt,
      completedAt: retrievedAt,
      outcome: "cache-replay",
      requestCount: 0,
      cacheHit: true,
      receiptUri: observation?.receiptUri ?? null,
      observationId: observation?.observationId ?? null,
      gapId: null,
      incrementLedger: true,
    });
    return {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId,
      outcome: "cache-replay",
      requestCount: 0,
      cacheHit: true,
      observation,
      gap: null,
      attempt,
    };
  }

  const committed = commitObservation({
    root: options.root,
    sourceId: source.id,
    sourceRecordId: options.sourceRecordId,
    retrievedAt,
    contentDigest: digest,
    recordType: "local-file-custody",
    title: source.label,
    summary: "Holder-controlled source was stream-hashed; no filename, local path, or source payload was retained.",
    mediaType: "application/octet-stream",
    responseBytes: bytes,
    retainedFields: [
      "sourceId",
      "sourceRecordId",
      "contentDigest",
      "responseBytes",
      "custodyClass",
    ],
    retention: "digest-and-locator",
    sourceUri: source.canonicalUri,
    retainedValue: {
      sourceId: source.id,
      sourceRecordId: options.sourceRecordId,
      contentDigest: digest,
      responseBytes: bytes,
      custodyClass: "user-controlled-private",
    },
  });
  upsertCacheIndex(options.root, {
    cacheKey: cacheKey(source.id, options.sourceRecordId),
    sourceId: source.id,
    sourceRecordId: options.sourceRecordId,
    contentDigest: digest,
    observationId: committed.observation.observationId,
    cacheUri: null,
    storedAt: retrievedAt,
  });
  const attempt = completedAttempt({
    root: options.root,
    sourceId: source.id,
    sourceRecordId: options.sourceRecordId,
    startedAt: retrievedAt,
    completedAt: retrievedAt,
    outcome: "observed",
    requestCount: 0,
    cacheHit: false,
    receiptUri: committed.observation.receiptUri,
    observationId: committed.observation.observationId,
    gapId: null,
  });
  advanceCollectorCursor(options.root, 1, retrievedAt);
  return {
    sourceId: source.id,
    sourceRecordId: options.sourceRecordId,
    outcome: "observed",
    requestCount: 0,
    cacheHit: false,
    observation: committed.observation,
    gap: null,
    attempt,
  };
}

export async function collectPlannedSources(input: {
  root: string;
  now?: string;
  limit?: number;
  sourceIds?: string[];
  refresh?: boolean;
  fetchImpl?: FetchLike;
  clock?: CollectorClock;
}): Promise<CollectorRunResult[]> {
  const planned = planCollectorWork({
    root: input.root,
    now: input.now,
    limit: input.limit,
    sourceIds: input.sourceIds,
    refresh: input.refresh,
  });
  const results: CollectorRunResult[] = [];
  for (const row of planned) {
    const source = getAsoiafExternalSource(row.sourceId)!;
    if (source.harvestPolicy.mode === "local-private-only") {
      const terminal = recordGap({
        root: input.root,
        sourceId: source.id,
        attemptedAt: input.now ?? new Date().toISOString(),
        status: "blocked-credential",
        reason: "local source requires an explicit holder-supplied file transaction",
      });
      results.push({
        sourceId: source.id,
        sourceRecordId: null,
        outcome: terminal.gap.status,
        requestCount: 0,
        cacheHit: false,
        observation: null,
        gap: terminal.gap,
        attempt: terminal.attempt,
      });
      continue;
    }
    results.push(
      await collectNetworkSource({
        root: input.root,
        sourceId: source.id,
        refresh: input.refresh,
        fetchImpl: input.fetchImpl,
        clock: input.clock,
      }),
    );
  }
  return results;
}

export function collectorPublicStatus(root: string) {
  return collectorStatus(root);
}

export function collectorVerify(root: string): string[] {
  return verifyCollectorEstate(root);
}

export function collectorInitialize(root: string, now?: string): void {
  initializeCollectorEstate(root, now);
  generateCollectorCredits(root);
}

export function collectorPlan(input: {
  root: string;
  now?: string;
  limit?: number;
  sourceIds?: string[];
  refresh?: boolean;
}): CollectorSourceLedgerRow[] {
  return planCollectorWork(input);
}

export function collectorCredits(root: string) {
  return generateCollectorCredits(root);
}

export function writeCollectorReceiptSummary(
  root: string,
  outputPath: string,
): void {
  const findings = verifyCollectorEstate(root);
  const status = collectorStatus(root);
  writeJsonAtomic(outputPath, {
    format: "axm-asoiaf-external-collector-qualification-receipt/1",
    atlasFingerprint: status.atlasFingerprint,
    policy: ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.defaultCollectionPolicy,
    status,
    findings,
    receiptFingerprint: sha256({ status, findings }),
  });
}
