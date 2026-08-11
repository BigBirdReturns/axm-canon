import fs from "node:fs";
import path from "node:path";
import {
  getAsoiafExternalSource,
} from "../../src/external/index.js";
import {
  collectorContentId,
  collectorEstatePaths,
  currentCandidates,
  readJson,
  readNdjson,
  sha256,
  type CollectorAttemptRecord,
  type CollectorCandidateRecord,
  type CollectorGapRecord,
  type CollectorObservationRecord,
} from "./asoiaf-external-estate.js";

export const ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT =
  "axm-asoiaf-structured-acquisition-receipt/1" as const;
export const ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT =
  "axm-asoiaf-structured-acquisition-state/1" as const;
export const ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT =
  "axm-asoiaf-structured-adapter-receipt/1" as const;

export type AsoiafStructuredAdapterId =
  | "wikidata-sparql"
  | "openlibrary-catalog"
  | "crossref-works"
  | "awoiaf-mediawiki";

export type AsoiafStructuredAdapterSourceId =
  | "structured-wikidata"
  | "structured-openlibrary-api"
  | "structured-crossref-api"
  | "structured-awoiaf-api"
  | "structured-awoiaf-category-api"
  | "structured-awoiaf-search-api";

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
  adapterId: AsoiafStructuredAdapterId;
  sourceId: AsoiafStructuredAdapterSourceId;
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

export interface AsoiafStructuredAdapterReceipt {
  format: typeof ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT;
  adapterId: AsoiafStructuredAdapterId;
  sourceId: AsoiafStructuredAdapterSourceId;
  requestId: string;
  sourceUri: string;
  retrievedAt: string;
  sourceResponseDigest: `sha256:${string}`;
  sourceResponseBytes: number;
  inputRecordCount: number;
  committedRecordCount: number;
  observationIds: string[];
  candidateIds: string[];
  normalizedRecordIds: string[];
  rejected: Array<{ index: number; code: string; detail: string }>;
  outcome: "observed" | "partial" | "refused";
  graphEffect: "none";
  canonEffect: "none";
  receiptFingerprint: `sha256:${string}`;
}

export type StructuredAcquisitionHealthRepairTask =
  | "repair-ledger"
  | "repair-cache"
  | "inspect-drift"
  | "refresh-route"
  | null;

export interface StructuredAcquisitionHealthFinding {
  code: string;
  severity: "error" | "warning" | "notice";
  subjectId: string;
  sourceId: string | null;
  detail: string;
  repairTask: StructuredAcquisitionHealthRepairTask;
}

export interface StructuredAcquisitionHealthAudit {
  statePresent: boolean;
  stateEntryCount: number;
  receiptCount: number;
  successfulReceiptCount: number;
  replayReceiptCount: number;
  adapterReceiptCount: number;
  findings: StructuredAcquisitionHealthFinding[];
}

const REGISTERED_ENDPOINTS: Record<
  AsoiafStructuredAdapterId,
  { host: string; path: RegExp; sourceIds: ReadonlySet<AsoiafStructuredAdapterSourceId> }
> = {
  "wikidata-sparql": {
    host: "query.wikidata.org",
    path: /^\/sparql$/,
    sourceIds: new Set(["structured-wikidata"]),
  },
  "openlibrary-catalog": {
    host: "openlibrary.org",
    path: /^(?:\/search\.json|\/(?:works|books)\/[^/]+\.json)$/,
    sourceIds: new Set(["structured-openlibrary-api"]),
  },
  "crossref-works": {
    host: "api.crossref.org",
    path: /^\/works(?:\/[^/]+)?$/,
    sourceIds: new Set(["structured-crossref-api"]),
  },
  "awoiaf-mediawiki": {
    host: "awoiaf.westeros.org",
    path: /^\/api\.php$/,
    sourceIds: new Set([
      "structured-awoiaf-api",
      "structured-awoiaf-category-api",
      "structured-awoiaf-search-api",
    ]),
  },
};

function finding(
  code: string,
  severity: StructuredAcquisitionHealthFinding["severity"],
  subjectId: string,
  sourceId: string | null,
  detail: string,
  repairTask: StructuredAcquisitionHealthRepairTask,
): StructuredAcquisitionHealthFinding {
  return { code, severity, subjectId, sourceId, detail, repairTask };
}

function validDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function safeEstatePath(root: string, relativeUri: string): string | null {
  if (
    !relativeUri.trim()
    || path.isAbsolute(relativeUri)
    || relativeUri.includes("\\")
    || /^[a-z][a-z0-9+.-]*:/i.test(relativeUri)
  ) {
    return null;
  }
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativeUri);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${path.sep}`)) {
    return null;
  }
  return target;
}

function relativeEstateUri(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target)).split(path.sep).join("/");
}

function endpointAllowed(adapterId: AsoiafStructuredAdapterId, value: string): boolean {
  try {
    const url = new URL(value);
    const registered = REGISTERED_ENDPOINTS[adapterId];
    return (
      url.protocol === "https:"
      && url.hostname === registered.host
      && registered.path.test(url.pathname)
      && !url.username
      && !url.password
      && !url.hash
    );
  } catch {
    return false;
  }
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function receiptCore(
  receipt: AsoiafStructuredAcquisitionReceipt,
): Omit<AsoiafStructuredAcquisitionReceipt, "receiptId" | "receiptFingerprint"> {
  const {
    receiptId: _receiptId,
    receiptFingerprint: _fingerprint,
    ...core
  } = receipt;
  return core;
}

function stateCore(
  state: AsoiafStructuredAcquisitionState,
): Omit<AsoiafStructuredAcquisitionState, "stateFingerprint"> {
  const { stateFingerprint: _fingerprint, ...core } = state;
  return core;
}

function adapterReceiptCore(
  receipt: AsoiafStructuredAdapterReceipt,
): Omit<AsoiafStructuredAdapterReceipt, "receiptFingerprint"> {
  const { receiptFingerprint: _fingerprint, ...core } = receipt;
  return core;
}

function readJsonFile<T>(
  target: string,
): { value: T | null; error: string | null } {
  try {
    return {
      value: JSON.parse(fs.readFileSync(target, "utf8")) as T,
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function acquisitionStatePath(root: string): string {
  return path.join(path.resolve(root), "structured-acquisition-state.json");
}

function acquisitionReceiptDirectory(root: string): string {
  return path.join(path.resolve(root), "structured-acquisition-receipts");
}

function adapterReceiptDirectory(root: string): string {
  return path.join(path.resolve(root), "structured-adapter-receipts");
}

function adapterReceiptPath(root: string, requestId: string): string {
  const id = collectorContentId("asoiaf-structured-adapter-receipt", requestId);
  return path.join(adapterReceiptDirectory(root), `${id}.json`);
}

function listJsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function successfulOutcome(
  outcome: AsoiafStructuredAcquisitionOutcome,
): outcome is "observed" | "partial" | "cache-hit" {
  return outcome === "observed" || outcome === "partial" || outcome === "cache-hit";
}

function sortedFindings(
  values: readonly StructuredAcquisitionHealthFinding[],
): StructuredAcquisitionHealthFinding[] {
  const severityOrder = { error: 0, warning: 1, notice: 2 } as const;
  return [...values].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity]
      || (left.sourceId ?? "").localeCompare(right.sourceId ?? "")
      || left.code.localeCompare(right.code)
      || left.subjectId.localeCompare(right.subjectId),
  );
}

function acquisitionDriftKey(receipt: AsoiafStructuredAcquisitionReceipt): string {
  return JSON.stringify({
    requestedUrl: receipt.requestedUrl,
    finalUrl: receipt.finalUrl,
    robotsStatus: receipt.robotsStatus,
    robotsDigest: receipt.robotsDigest,
    responseMediaType: receipt.responseMediaType,
    sourceResponseDigest: receipt.sourceResponseDigest,
    adapterReceiptFingerprint: receipt.adapterReceiptFingerprint,
    observationIds: sorted(receipt.observationIds),
    candidateIds: sorted(receipt.candidateIds),
  });
}

export function auditAsoiafStructuredAcquisitionHealth(
  root: string,
): StructuredAcquisitionHealthAudit {
  const findings: StructuredAcquisitionHealthFinding[] = [];
  const stateTarget = acquisitionStatePath(root);
  const receiptFiles = listJsonFiles(acquisitionReceiptDirectory(root));
  const adapterFiles = listJsonFiles(adapterReceiptDirectory(root));
  const statePresent = fs.existsSync(stateTarget);
  if (!statePresent && receiptFiles.length === 0 && adapterFiles.length === 0) {
    return {
      statePresent: false,
      stateEntryCount: 0,
      receiptCount: 0,
      successfulReceiptCount: 0,
      replayReceiptCount: 0,
      adapterReceiptCount: 0,
      findings: [],
    };
  }

  const collectorPaths = collectorEstatePaths(root);
  const observations = readNdjson<CollectorObservationRecord>(collectorPaths.observations);
  const observationsById = new Map(
    observations.map((observation) => [observation.observationId, observation]),
  );
  const candidates = currentCandidates(
    readNdjson<CollectorCandidateRecord>(collectorPaths.candidates),
  );
  const attempts = readNdjson<CollectorAttemptRecord>(collectorPaths.attempts);
  const gaps = new Map(
    readNdjson<CollectorGapRecord>(collectorPaths.gaps)
      .map((gap) => [gap.gapId, gap]),
  );

  let state: AsoiafStructuredAcquisitionState | null = null;
  if (!statePresent) {
    findings.push(
      finding(
        "structured-acquisition-state-missing",
        "error",
        "structured-acquisition-state.json",
        null,
        "structured acquisition receipts exist without a fingerprinted state projection",
        "repair-ledger",
      ),
    );
  } else {
    const decoded = readJsonFile<AsoiafStructuredAcquisitionState>(stateTarget);
    if (!decoded.value) {
      findings.push(
        finding(
          "structured-acquisition-state-invalid-json",
          "error",
          "structured-acquisition-state.json",
          null,
          decoded.error ?? "structured acquisition state is unreadable",
          "repair-ledger",
        ),
      );
    } else {
      state = decoded.value;
      if (state.format !== ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT) {
        findings.push(
          finding(
            "structured-acquisition-state-format",
            "error",
            "structured-acquisition-state.json",
            null,
            "structured acquisition state format is invalid",
            "repair-ledger",
          ),
        );
      }
      if (state.stateFingerprint !== sha256(stateCore(state))) {
        findings.push(
          finding(
            "structured-acquisition-state-fingerprint",
            "error",
            "structured-acquisition-state.json",
            null,
            "structured acquisition state fingerprint is stale",
            "repair-ledger",
          ),
        );
      }
      const requestIds = new Set<string>();
      for (const entry of state.entries) {
        if (requestIds.has(entry.requestId)) {
          findings.push(
            finding(
              "structured-acquisition-state-duplicate-request",
              "error",
              entry.requestId,
              null,
              "structured acquisition state contains duplicate request identity",
              "repair-ledger",
            ),
          );
        }
        requestIds.add(entry.requestId);
        if (
          !entry.requestId.trim()
          || !validDigest(entry.planFingerprint)
          || (entry.outcome !== "observed" && entry.outcome !== "partial")
          || !Number.isFinite(Date.parse(entry.completedAt))
        ) {
          findings.push(
            finding(
              "structured-acquisition-state-entry",
              "error",
              entry.requestId || "state-entry",
              null,
              "structured acquisition state entry has invalid identity, outcome, digest, or time",
              "repair-ledger",
            ),
          );
        }
        if (!safeEstatePath(root, entry.receiptUri)) {
          findings.push(
            finding(
              "structured-acquisition-state-uri",
              "error",
              entry.requestId || "state-entry",
              null,
              "structured acquisition state receipt URI escapes the estate",
              "repair-ledger",
            ),
          );
        }
      }
    }
  }

  const receiptsByUri = new Map<string, AsoiafStructuredAcquisitionReceipt>();
  const receiptsByRequest = new Map<string, AsoiafStructuredAcquisitionReceipt[]>();
  const receiptIds = new Set<string>();
  const referencedAdapterFingerprints = new Set<string>();
  let successfulReceiptCount = 0;
  let replayReceiptCount = 0;

  for (const target of receiptFiles) {
    const uri = relativeEstateUri(root, target);
    const decoded = readJsonFile<AsoiafStructuredAcquisitionReceipt>(target);
    if (!decoded.value) {
      findings.push(
        finding(
          "structured-acquisition-receipt-invalid-json",
          "error",
          uri,
          null,
          decoded.error ?? "acquisition receipt is unreadable",
          "repair-ledger",
        ),
      );
      continue;
    }
    const receipt = decoded.value;
    const subject = receipt.receiptId || uri;
    const source = getAsoiafExternalSource(receipt.sourceId);
    const registered = REGISTERED_ENDPOINTS[receipt.adapterId];
    receiptsByUri.set(uri, receipt);
    const requestReceipts = receiptsByRequest.get(receipt.requestId) ?? [];
    requestReceipts.push(receipt);
    receiptsByRequest.set(receipt.requestId, requestReceipts);

    if (receipt.format !== ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT) {
      findings.push(finding("structured-acquisition-receipt-format", "error", subject, receipt.sourceId, "acquisition receipt format is invalid", "repair-ledger"));
    }
    const expectedFingerprint = sha256(receiptCore(receipt));
    if (receipt.receiptFingerprint !== expectedFingerprint) {
      findings.push(finding("structured-acquisition-receipt-fingerprint", "error", subject, receipt.sourceId, "acquisition receipt fingerprint is stale", "repair-ledger"));
    }
    const expectedId = collectorContentId("asoiaf-structured-acquisition-receipt", {
      requestId: receipt.requestId,
      planFingerprint: receipt.planFingerprint,
      receiptFingerprint: expectedFingerprint,
    });
    if (receipt.receiptId !== expectedId) {
      findings.push(finding("structured-acquisition-receipt-identity", "error", subject, receipt.sourceId, "acquisition receipt identity is not content addressed", "repair-ledger"));
    }
    if (path.basename(target) !== `${receipt.receiptId}.json`) {
      findings.push(finding("structured-acquisition-receipt-filename", "error", subject, receipt.sourceId, "acquisition receipt filename does not match its identity", "repair-ledger"));
    }
    if (receiptIds.has(receipt.receiptId)) {
      findings.push(finding("structured-acquisition-receipt-duplicate", "error", subject, receipt.sourceId, "acquisition receipt identity is duplicated", "repair-ledger"));
    }
    receiptIds.add(receipt.receiptId);
    if (!validDigest(receipt.planFingerprint)) {
      findings.push(finding("structured-acquisition-plan-fingerprint", "error", subject, receipt.sourceId, "acquisition receipt contains a malformed plan fingerprint", "repair-ledger"));
    }
    if (!source || source.harvestPolicy.mode !== "structured-cache-with-attribution") {
      findings.push(finding("structured-acquisition-source-contract", "error", subject, receipt.sourceId, "acquisition receipt source is unknown or lacks structured acquisition authority", "repair-ledger"));
    }
    if (!registered || !registered.sourceIds.has(receipt.sourceId)) {
      findings.push(finding("structured-acquisition-adapter-source", "error", subject, receipt.sourceId, "acquisition adapter and atlas source are not registered together", "repair-ledger"));
    }
    if (!endpointAllowed(receipt.adapterId, receipt.requestedUrl)) {
      findings.push(finding("structured-acquisition-requested-endpoint", "error", subject, receipt.sourceId, "requested URL escaped its registered endpoint", "refresh-route"));
    }
    if (receipt.finalUrl !== null && !endpointAllowed(receipt.adapterId, receipt.finalUrl)) {
      findings.push(finding("structured-acquisition-final-endpoint", "error", subject, receipt.sourceId, "final URL escaped its registered endpoint", "refresh-route"));
    }
    try {
      const requested = new URL(receipt.requestedUrl);
      if (receipt.robotsUrl !== `${requested.origin}/robots.txt`) {
        findings.push(finding("structured-acquisition-robots-route", "error", subject, receipt.sourceId, "robots URL differs from the requested origin", "refresh-route"));
      }
    } catch {
      findings.push(finding("structured-acquisition-requested-url", "error", subject, receipt.sourceId, "requested URL is invalid", "refresh-route"));
    }
    if (receipt.robotsDigest !== null && !validDigest(receipt.robotsDigest)) {
      findings.push(finding("structured-acquisition-robots-digest", "error", subject, receipt.sourceId, "robots digest is malformed", "repair-ledger"));
    }
    if (receipt.rawResponseRetained !== false) {
      findings.push(finding("structured-acquisition-raw-retention", "error", subject, receipt.sourceId, "acquisition receipt claims raw response retention", "repair-cache"));
    }
    if (receipt.graphEffect !== "none" || receipt.canonEffect !== "none") {
      findings.push(finding("structured-acquisition-authority-leak", "error", subject, receipt.sourceId, "acquisition receipt acquired graph or canon effect", "repair-ledger"));
    }
    if (
      !Number.isSafeInteger(receipt.requestCount)
      || receipt.requestCount < 0
      || !Number.isSafeInteger(receipt.waitedMilliseconds)
      || receipt.waitedMilliseconds < 0
      || !Number.isSafeInteger(receipt.redirectCount)
      || receipt.redirectCount < 0
      || !Number.isSafeInteger(receipt.committedRecordCount)
      || receipt.committedRecordCount < 0
    ) {
      findings.push(finding("structured-acquisition-counts", "error", subject, receipt.sourceId, "acquisition receipt contains an invalid request, wait, redirect, or record count", "repair-ledger"));
    }
    if (
      receipt.committedRecordCount !== receipt.observationIds.length
      || receipt.committedRecordCount !== receipt.candidateIds.length
      || hasDuplicates(receipt.observationIds)
      || hasDuplicates(receipt.candidateIds)
    ) {
      findings.push(finding("structured-acquisition-identity-parity", "error", subject, receipt.sourceId, "committed count, observation identities, and candidate identities disagree", "repair-ledger"));
    }

    if (successfulOutcome(receipt.outcome)) {
      successfulReceiptCount += 1;
      if (receipt.outcome === "cache-hit") replayReceiptCount += 1;
      if (
        !receipt.finalUrl
        || (receipt.robotsStatus !== "allowed" && receipt.robotsStatus !== "absent")
        || receipt.httpStatus === null
        || receipt.httpStatus < 200
        || receipt.httpStatus > 299
        || receipt.responseMediaType === null
        || !/^application\/(?:json|sparql-results\+json)(?:\s*;|$)/i.test(receipt.responseMediaType)
        || receipt.responseBytes <= 0
        || !validDigest(receipt.sourceResponseDigest)
        || !validDigest(receipt.adapterReceiptFingerprint)
      ) {
        findings.push(finding("structured-acquisition-success-custody", "error", subject, receipt.sourceId, "successful acquisition lacks robots, HTTP, response, digest, or adapter custody", "repair-ledger"));
      }
      if (receipt.gapId !== null) {
        findings.push(finding("structured-acquisition-success-gap", "error", subject, receipt.sourceId, "successful acquisition retains a terminal gap identity", "repair-ledger"));
      }
      if (receipt.outcome === "cache-hit") {
        if (receipt.requestCount !== 0 || receipt.waitedMilliseconds !== 0 || receipt.redirectCount !== 0) {
          findings.push(finding("structured-acquisition-replay-network", "error", subject, receipt.sourceId, "cache replay recorded network, wait, or redirect activity", "repair-ledger"));
        }
      } else if (receipt.requestCount <= 0) {
        findings.push(finding("structured-acquisition-network-count", "error", subject, receipt.sourceId, "network-backed success has no request count", "repair-ledger"));
      }
    }

    if (receipt.gapId && !gaps.has(receipt.gapId)) {
      findings.push(finding("structured-acquisition-gap-missing", "error", subject, receipt.sourceId, "acquisition receipt references a missing collector gap", "repair-ledger"));
    }

    for (let index = 0; index < receipt.observationIds.length; index += 1) {
      const observationId = receipt.observationIds[index]!;
      const candidateId = receipt.candidateIds[index]!;
      const observation = observationsById.get(observationId);
      const candidate = candidates.get(candidateId);
      if (!observation) {
        findings.push(finding("structured-acquisition-observation-missing", "error", observationId, receipt.sourceId, "acquisition receipt references a missing collector observation", "repair-ledger"));
      } else if (observation.sourceId !== receipt.sourceId || observation.candidateId !== candidateId) {
        findings.push(finding("structured-acquisition-observation-parity", "error", observationId, receipt.sourceId, "collector observation differs from acquisition source or candidate identity", "repair-ledger"));
      }
      if (!candidate) {
        findings.push(finding("structured-acquisition-candidate-missing", "error", candidateId, receipt.sourceId, "acquisition receipt references a missing collector candidate", "repair-ledger"));
      } else if (!candidate.observationIds.includes(observationId)) {
        findings.push(finding("structured-acquisition-candidate-parity", "error", candidateId, receipt.sourceId, "collector candidate omits the acquisition observation", "repair-ledger"));
      }
    }

    if (validDigest(receipt.adapterReceiptFingerprint)) {
      referencedAdapterFingerprints.add(receipt.adapterReceiptFingerprint);
      const adapterTarget = adapterReceiptPath(root, receipt.requestId);
      if (!fs.existsSync(adapterTarget)) {
        findings.push(finding("structured-acquisition-adapter-receipt-missing", "error", subject, receipt.sourceId, "acquisition receipt references an absent adapter receipt", "repair-ledger"));
      } else {
        const adapterDecoded = readJsonFile<AsoiafStructuredAdapterReceipt>(adapterTarget);
        if (!adapterDecoded.value) {
          findings.push(finding("structured-acquisition-adapter-receipt-json", "error", subject, receipt.sourceId, adapterDecoded.error ?? "adapter receipt is unreadable", "repair-ledger"));
        } else {
          const adapter = adapterDecoded.value;
          if (adapter.format !== ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT) {
            findings.push(finding("structured-acquisition-adapter-receipt-format", "error", subject, receipt.sourceId, "adapter receipt format is invalid", "repair-ledger"));
          }
          if (adapter.receiptFingerprint !== sha256(adapterReceiptCore(adapter))) {
            findings.push(finding("structured-acquisition-adapter-receipt-fingerprint", "error", subject, receipt.sourceId, "adapter receipt fingerprint is stale", "repair-ledger"));
          }
          if (
            adapter.receiptFingerprint !== receipt.adapterReceiptFingerprint
            || adapter.adapterId !== receipt.adapterId
            || adapter.sourceId !== receipt.sourceId
            || adapter.requestId !== receipt.requestId
            || adapter.sourceResponseDigest !== receipt.sourceResponseDigest
            || adapter.sourceResponseBytes !== receipt.responseBytes
            || adapter.committedRecordCount !== receipt.committedRecordCount
            || !arraysEqual(adapter.observationIds, receipt.observationIds)
            || !arraysEqual(adapter.candidateIds, receipt.candidateIds)
          ) {
            findings.push(finding("structured-acquisition-adapter-parity", "error", subject, receipt.sourceId, "adapter and acquisition receipts do not describe the same retained transaction", "repair-ledger"));
          }
        }
      }
    }

    if (successfulOutcome(receipt.outcome)) {
      const matchingAttempts = attempts.filter((attempt) => attempt.receiptUri === uri);
      if (matchingAttempts.length !== 1) {
        findings.push(finding("structured-acquisition-attempt-count", "error", subject, receipt.sourceId, `successful acquisition has ${matchingAttempts.length} matching collector attempts; expected 1`, "repair-ledger"));
      } else {
        const attempt = matchingAttempts[0]!;
        const expectedOutcome = receipt.outcome === "cache-hit" ? "cache-replay" : "observed";
        if (
          attempt.sourceId !== receipt.sourceId
          || attempt.sourceRecordId !== receipt.requestId
          || attempt.outcome !== expectedOutcome
          || attempt.requestCount !== receipt.requestCount
          || attempt.cacheHit !== (receipt.outcome === "cache-hit")
          || attempt.gapId !== null
        ) {
          findings.push(finding("structured-acquisition-attempt-parity", "error", subject, receipt.sourceId, "collector attempt differs from the successful acquisition receipt", "repair-ledger"));
        }
      }
    }
  }

  for (const receipts of receiptsByRequest.values()) {
    receipts.sort(
      (left, right) =>
        left.completedAt.localeCompare(right.completedAt)
        || left.receiptId.localeCompare(right.receiptId),
    );
    const networkSuccesses = receipts.filter(
      (receipt) => receipt.outcome === "observed" || receipt.outcome === "partial",
    );
    for (let index = 1; index < networkSuccesses.length; index += 1) {
      const previous = networkSuccesses[index - 1]!;
      const current = networkSuccesses[index]!;
      if (acquisitionDriftKey(previous) !== acquisitionDriftKey(current)) {
        findings.push(
          finding(
            "structured-acquisition-drift",
            "warning",
            current.receiptId,
            current.sourceId,
            "request route, robots identity, response identity, adapter receipt, or normalized record set changed across successful acquisitions",
            "inspect-drift",
          ),
        );
      }
    }
    for (const replay of receipts.filter((receipt) => receipt.outcome === "cache-hit")) {
      const prior = networkSuccesses.find((receipt) =>
        receipt.completedAt <= replay.completedAt
        && receipt.planFingerprint === replay.planFingerprint
        && receipt.sourceResponseDigest === replay.sourceResponseDigest
        && receipt.adapterReceiptFingerprint === replay.adapterReceiptFingerprint
        && arraysEqual(receipt.observationIds, replay.observationIds)
        && arraysEqual(receipt.candidateIds, replay.candidateIds),
      );
      if (!prior) {
        findings.push(
          finding(
            "structured-acquisition-replay-origin",
            "error",
            replay.receiptId,
            replay.sourceId,
            "cache replay has no prior successful acquisition with matching plan and custody",
            "repair-ledger",
          ),
        );
      }
    }
  }

  if (state) {
    const stateUris = new Set<string>();
    for (const entry of state.entries) {
      stateUris.add(entry.receiptUri);
      const receipt = receiptsByUri.get(entry.receiptUri);
      if (!receipt) {
        findings.push(finding("structured-acquisition-state-receipt-missing", "error", entry.requestId, null, "state entry references a missing acquisition receipt", "repair-ledger"));
        continue;
      }
      if (
        receipt.requestId !== entry.requestId
        || receipt.planFingerprint !== entry.planFingerprint
        || receipt.completedAt !== entry.completedAt
        || receipt.outcome !== entry.outcome
      ) {
        findings.push(finding("structured-acquisition-state-receipt-parity", "error", entry.requestId, receipt.sourceId, "state entry disagrees with its acquisition receipt", "repair-ledger"));
      }
    }
    for (const [requestId, receipts] of receiptsByRequest) {
      const latest = receipts
        .filter((receipt) => receipt.outcome === "observed" || receipt.outcome === "partial")
        .sort(
          (left, right) =>
            right.completedAt.localeCompare(left.completedAt)
            || right.receiptId.localeCompare(left.receiptId),
        )[0];
      if (!latest) continue;
      const latestUri = [...receiptsByUri.entries()]
        .find(([, receipt]) => receipt.receiptId === latest.receiptId)?.[0];
      if (latestUri && !stateUris.has(latestUri)) {
        findings.push(
          finding(
            "structured-acquisition-state-latest-success",
            "error",
            requestId,
            latest.sourceId,
            "state projection does not point to the latest successful acquisition",
            "repair-ledger",
          ),
        );
      }
    }
  }

  for (const target of adapterFiles) {
    const decoded = readJsonFile<AsoiafStructuredAdapterReceipt>(target);
    const subject = relativeEstateUri(root, target);
    if (!decoded.value) {
      findings.push(finding("structured-adapter-receipt-invalid-json", "error", subject, null, decoded.error ?? "adapter receipt is unreadable", "repair-ledger"));
      continue;
    }
    const adapter = decoded.value;
    if (!referencedAdapterFingerprints.has(adapter.receiptFingerprint)) {
      findings.push(
        finding(
          "structured-adapter-receipt-unbound",
          "notice",
          adapter.requestId || subject,
          adapter.sourceId,
          "adapter receipt is not referenced by any acquisition receipt and remains normalization-only custody",
          null,
        ),
      );
    }
  }

  return {
    statePresent,
    stateEntryCount: state?.entries.length ?? 0,
    receiptCount: receiptFiles.length,
    successfulReceiptCount,
    replayReceiptCount,
    adapterReceiptCount: adapterFiles.length,
    findings: sortedFindings(findings),
  };
}