import fs from "node:fs";
import path from "node:path";
import {
  ASOIAF_EXTERNAL_ATLAS_MANIFEST,
  ASOIAF_EXTERNAL_ATLAS_SOURCES,
  asoiafExternalCreditRequired,
  getAsoiafExternalSource,
  type AsoiafExternalRightsMode,
} from "../../src/external/index.js";
import {
  appendNdjson,
  collectorContentId,
  collectorEstatePaths,
  currentCandidates,
  initializeCollectorEstate,
  loadSourceLedger,
  readCacheIndex,
  readJson,
  readNdjson,
  sha256,
  writeJsonAtomic,
  type CollectorAttemptRecord,
  type CollectorCacheIndexEntry,
  type CollectorCandidateRecord,
  type CollectorGapRecord,
  type CollectorObservationRecord,
  type CollectorSourceLedgerRow,
  type CollectorTerminalStatus,
} from "./asoiaf-external-estate.js";

export const ASOIAF_EXTERNAL_SOURCE_HEALTH_OBSERVATION_FORMAT =
  "axm-asoiaf-external-source-health-observation/1" as const;
export const ASOIAF_EXTERNAL_SOURCE_HEALTH_SNAPSHOT_FORMAT =
  "axm-asoiaf-external-source-health-snapshot/1" as const;
export const ASOIAF_EXTERNAL_SOURCE_HEALTH_PLAN_FORMAT =
  "axm-asoiaf-external-source-health-plan/1" as const;
export const ASOIAF_EXTERNAL_SOURCE_HEALTH_RECEIPT_FORMAT =
  "axm-asoiaf-external-source-health-receipt/1" as const;

export type SourceHealthStatus =
  | "never-attempted"
  | "fresh"
  | "due"
  | "blocked"
  | "rights-review"
  | "unavailable"
  | "retired"
  | "integrity-error";

export type SourceRouteHealthStatus =
  | "available"
  | "unavailable"
  | "redirected"
  | "robots-allow"
  | "robots-deny"
  | "terms-review"
  | "retired";

export type SourceHealthTaskType =
  | "collect"
  | "request-local-custody"
  | "refresh-route"
  | "review-rights"
  | "review-block"
  | "inspect-drift"
  | "repair-cache"
  | "repair-credit"
  | "repair-ledger";

export interface SourceHealthPaths {
  root: string;
  observations: string;
  snapshotJson: string;
  snapshotMarkdown: string;
  refreshPlan: string;
}

export interface SourceHealthObservation {
  format: typeof ASOIAF_EXTERNAL_SOURCE_HEALTH_OBSERVATION_FORMAT;
  observationId: string;
  sourceId: string;
  checkedAt: string;
  targetUri: string;
  status: SourceRouteHealthStatus;
  httpStatus: number | null;
  routeDigest: `sha256:${string}` | null;
  robotsDigest: `sha256:${string}` | null;
  termsDigest: `sha256:${string}` | null;
  notes: string;
  graphEffect: "none";
  canonEffect: "none";
}

export interface SourceHealthObservationInput {
  sourceId: string;
  checkedAt: string;
  targetUri: string;
  status: SourceRouteHealthStatus;
  httpStatus?: number | null;
  routeDigest?: `sha256:${string}` | null;
  robotsDigest?: `sha256:${string}` | null;
  termsDigest?: `sha256:${string}` | null;
  notes?: string;
}

export interface SourceHealthFinding {
  code: string;
  severity: "error" | "warning" | "notice";
  subjectId: string;
  sourceId: string | null;
  detail: string;
  repairTask: SourceHealthTaskType | null;
}

export interface SourceHealthRecord {
  sourceId: string;
  sourceLabel: string;
  status: SourceHealthStatus;
  terminalStatus: CollectorTerminalStatus;
  rightsMode: AsoiafExternalRightsMode;
  harvestMode: CollectorSourceLedgerRow["harvestMode"];
  rightsReviewRequired: boolean;
  localCustodyRequired: boolean;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  dueAt: string | null;
  cadenceDays: number | null;
  routeStatus: SourceRouteHealthStatus | null;
  routeCheckedAt: string | null;
  routeDrift: boolean;
  observationCount: number;
  candidateCount: number;
  gapCount: number;
  attemptCount: number;
  cacheEntryCount: number;
  creditRecordCount: number;
  integrityErrorCount: number;
  warningCount: number;
  reasons: string[];
}

export interface SourceHealthSnapshot {
  format: typeof ASOIAF_EXTERNAL_SOURCE_HEALTH_SNAPSHOT_FORMAT;
  atlasFingerprint: string;
  generatedAt: string;
  sourceCount: number;
  countsByStatus: Record<SourceHealthStatus, number>;
  countsByTerminalStatus: Record<CollectorTerminalStatus, number>;
  rightsReviewCount: number;
  routeDriftCount: number;
  errorCount: number;
  warningCount: number;
  noticeCount: number;
  records: SourceHealthRecord[];
  findings: SourceHealthFinding[];
  snapshotFingerprint: `sha256:${string}`;
}

export interface SourceHealthTask {
  taskId: string;
  sourceId: string;
  taskType: SourceHealthTaskType;
  priority: number;
  dueAt: string | null;
  reasons: string[];
  graphEffect: "none";
  canonEffect: "none";
}

export interface SourceHealthPlan {
  format: typeof ASOIAF_EXTERNAL_SOURCE_HEALTH_PLAN_FORMAT;
  atlasFingerprint: string;
  generatedAt: string;
  sourceHealthFingerprint: `sha256:${string}`;
  totalTaskCount: number;
  returnedTaskCount: number;
  tasks: SourceHealthTask[];
  planFingerprint: `sha256:${string}`;
}

export interface SourceHealthReceipt {
  format: typeof ASOIAF_EXTERNAL_SOURCE_HEALTH_RECEIPT_FORMAT;
  atlasFingerprint: string;
  generatedAt: string;
  snapshotFingerprint: `sha256:${string}`;
  planFingerprint: `sha256:${string}`;
  errorCount: number;
  warningCount: number;
  sourceCount: number;
  passed: boolean;
  receiptFingerprint: `sha256:${string}`;
}

interface CreditsFile {
  format?: string;
  atlasFingerprint?: string;
  recordCount?: number;
  records?: Array<{
    observationId: string;
    sourceId: string;
    sourceLabel?: string;
    title?: string;
    author?: string;
    license?: string;
    sourceUri?: string;
  }>;
}

function healthPaths(root: string): SourceHealthPaths {
  const absolute = path.resolve(root);
  return {
    root: absolute,
    observations: path.join(absolute, "source-health-observations.ndjson"),
    snapshotJson: path.join(absolute, "SOURCE-HEALTH.json"),
    snapshotMarkdown: path.join(absolute, "SOURCE-HEALTH.md"),
    refreshPlan: path.join(absolute, "refresh-plan.json"),
  };
}

export function initializeSourceHealth(
  root: string,
  now = new Date().toISOString(),
): SourceHealthPaths {
  initializeCollectorEstate(root, now);
  const paths = healthPaths(root);
  if (!fs.existsSync(paths.observations)) {
    fs.writeFileSync(paths.observations, "", "utf8");
  }
  return paths;
}

function validDigest(value: string | null): boolean {
  return value === null || /^sha256:[a-f0-9]{64}$/.test(value);
}

export function recordSourceHealthObservation(
  root: string,
  input: SourceHealthObservationInput,
): SourceHealthObservation {
  const paths = initializeSourceHealth(root, input.checkedAt);
  if (!getAsoiafExternalSource(input.sourceId)) {
    throw new Error(`unknown atlas source ${input.sourceId}`);
  }
  if (!input.targetUri.trim()) throw new Error("source-health target URI is empty");
  for (const digest of [
    input.routeDigest ?? null,
    input.robotsDigest ?? null,
    input.termsDigest ?? null,
  ]) {
    if (!validDigest(digest)) {
      throw new Error("source-health digests must be lowercase SHA-256 values");
    }
  }
  if (
    input.httpStatus !== undefined
    && input.httpStatus !== null
    && (!Number.isSafeInteger(input.httpStatus)
      || input.httpStatus < 100
      || input.httpStatus > 599)
  ) {
    throw new Error("source-health HTTP status is invalid");
  }
  const core = {
    sourceId: input.sourceId,
    checkedAt: input.checkedAt,
    targetUri: input.targetUri,
    status: input.status,
    httpStatus: input.httpStatus ?? null,
    routeDigest: input.routeDigest ?? null,
    robotsDigest: input.robotsDigest ?? null,
    termsDigest: input.termsDigest ?? null,
    notes: input.notes ?? "",
  };
  const observation: SourceHealthObservation = {
    format: ASOIAF_EXTERNAL_SOURCE_HEALTH_OBSERVATION_FORMAT,
    observationId: collectorContentId("asoiaf-external-source-health", core),
    ...core,
    graphEffect: "none",
    canonEffect: "none",
  };
  const existing = readNdjson<SourceHealthObservation>(paths.observations);
  if (!existing.some((entry) => entry.observationId === observation.observationId)) {
    appendNdjson(paths.observations, observation);
  }
  return observation;
}

function latestRouteObservations(
  observations: readonly SourceHealthObservation[],
): Map<string, SourceHealthObservation[]> {
  const bySource = new Map<string, SourceHealthObservation[]>();
  for (const observation of observations) {
    const entries = bySource.get(observation.sourceId) ?? [];
    entries.push(observation);
    bySource.set(observation.sourceId, entries);
  }
  for (const entries of bySource.values()) {
    entries.sort(
      (left, right) =>
        left.checkedAt.localeCompare(right.checkedAt)
        || left.observationId.localeCompare(right.observationId),
    );
  }
  return bySource;
}

function routeDrift(
  entries: readonly SourceHealthObservation[],
): boolean {
  if (entries.length < 2) return false;
  const previous = entries[entries.length - 2]!;
  const latest = entries[entries.length - 1]!;
  return (
    previous.targetUri !== latest.targetUri
    || previous.status !== latest.status
    || previous.routeDigest !== latest.routeDigest
    || previous.robotsDigest !== latest.robotsDigest
    || previous.termsDigest !== latest.termsDigest
  );
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

function cadenceDays(
  row: CollectorSourceLedgerRow,
): number | null {
  const source = getAsoiafExternalSource(row.sourceId);
  if (!source) return null;
  if (source.harvestPolicy.mode === "local-private-only") return null;
  switch (row.status) {
    case "never-attempted":
      return 0;
    case "observed":
      return source.harvestPolicy.refreshDays;
    case "route-only":
      return 180;
    case "unavailable":
      return 30;
    case "blocked-robots":
      return 90;
    case "blocked-rights":
    case "blocked-credential":
    case "retired":
      return null;
    case "rejected-private-contact":
      return 180;
    case "rejected-oversize":
      return 30;
    case "error":
      return 7;
  }
}

function calculatedDueAt(
  row: CollectorSourceLedgerRow,
  now: string,
): string | null {
  const days = cadenceDays(row);
  if (days === null) return null;
  if (row.status === "never-attempted") return now;
  const anchor = row.lastSuccessfulAt ?? row.lastAttemptAt;
  return anchor ? addDays(anchor, days) : now;
}

function emptyHealthCounts(): Record<SourceHealthStatus, number> {
  return {
    "never-attempted": 0,
    fresh: 0,
    due: 0,
    blocked: 0,
    "rights-review": 0,
    unavailable: 0,
    retired: 0,
    "integrity-error": 0,
  };
}

function emptyTerminalCounts(): Record<CollectorTerminalStatus, number> {
  return {
    "never-attempted": 0,
    observed: 0,
    "route-only": 0,
    unavailable: 0,
    "blocked-robots": 0,
    "blocked-rights": 0,
    "blocked-credential": 0,
    "rejected-private-contact": 0,
    "rejected-oversize": 0,
    error: 0,
    retired: 0,
  };
}

function finding(
  code: string,
  severity: SourceHealthFinding["severity"],
  subjectId: string,
  sourceId: string | null,
  detail: string,
  repairTask: SourceHealthTaskType | null,
): SourceHealthFinding {
  return { code, severity, subjectId, sourceId, detail, repairTask };
}

function safeEstatePath(root: string, relative: string): string | null {
  if (!relative.trim() || path.isAbsolute(relative)) return null;
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, relative);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    return null;
  }
  return absolute;
}

function listFilesRecursively(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.push(target);
    }
  };
  visit(directory);
  return files.sort();
}

function rightsPermitBody(rightsMode: AsoiafExternalRightsMode): boolean {
  return ["public-domain", "cc0", "cc-by", "cc-by-sa"].includes(rightsMode);
}

function sortedFindings(
  values: readonly SourceHealthFinding[],
): SourceHealthFinding[] {
  const severityOrder = { error: 0, warning: 1, notice: 2 } as const;
  return [...values].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity]
      || (left.sourceId ?? "").localeCompare(right.sourceId ?? "")
      || left.code.localeCompare(right.code)
      || left.subjectId.localeCompare(right.subjectId),
  );
}

function auditEstate(root: string): {
  findings: SourceHealthFinding[];
  observations: CollectorObservationRecord[];
  candidates: Map<string, CollectorCandidateRecord>;
  gaps: CollectorGapRecord[];
  attempts: CollectorAttemptRecord[];
  cacheEntries: CollectorCacheIndexEntry[];
  credits: CreditsFile;
} {
  const paths = collectorEstatePaths(root);
  const findings: SourceHealthFinding[] = [];
  const ledger = loadSourceLedger(root);
  const observations = readNdjson<CollectorObservationRecord>(paths.observations);
  const candidateSnapshots = readNdjson<CollectorCandidateRecord>(paths.candidates);
  const candidates = currentCandidates(candidateSnapshots);
  const gaps = readNdjson<CollectorGapRecord>(paths.gaps);
  const attempts = readNdjson<CollectorAttemptRecord>(paths.attempts);
  const cacheIndex = readCacheIndex(root);
  const credits = readJson<CreditsFile>(paths.creditsJson, { records: [] });
  const atlasIds = new Set(ASOIAF_EXTERNAL_ATLAS_SOURCES.map((source) => source.id));

  if (ledger.length !== ASOIAF_EXTERNAL_ATLAS_SOURCES.length) {
    findings.push(
      finding(
        "source-ledger-count",
        "error",
        "SOURCE-LEDGER.json",
        null,
        `ledger has ${ledger.length} rows; expected ${ASOIAF_EXTERNAL_ATLAS_SOURCES.length}`,
        "repair-ledger",
      ),
    );
  }
  const ledgerIds = new Set<string>();
  for (const row of ledger) {
    if (ledgerIds.has(row.sourceId)) {
      findings.push(
        finding(
          "duplicate-source-ledger-row",
          "error",
          row.sourceId,
          row.sourceId,
          "source ledger contains a duplicate row",
          "repair-ledger",
        ),
      );
    }
    ledgerIds.add(row.sourceId);
    if (!atlasIds.has(row.sourceId)) {
      findings.push(
        finding(
          "unknown-source-ledger-row",
          "error",
          row.sourceId,
          row.sourceId,
          "source ledger references a source outside the qualified atlas",
          "repair-ledger",
        ),
      );
    }
    if (row.graphEffect !== "none" || row.canonEffect !== "none") {
      findings.push(
        finding(
          "source-ledger-authority-leak",
          "error",
          row.sourceId,
          row.sourceId,
          "source ledger acquired graph or canon effect",
          "repair-ledger",
        ),
      );
    }
  }
  for (const sourceId of atlasIds) {
    if (!ledgerIds.has(sourceId)) {
      findings.push(
        finding(
          "missing-source-ledger-row",
          "error",
          sourceId,
          sourceId,
          "qualified atlas source is absent from the source ledger",
          "repair-ledger",
        ),
      );
    }
  }

  const observationsById = new Map(
    observations.map((observation) => [observation.observationId, observation]),
  );
  for (const observation of observations) {
    const source = getAsoiafExternalSource(observation.sourceId);
    if (!source) {
      findings.push(
        finding(
          "observation-unknown-source",
          "error",
          observation.observationId,
          observation.sourceId,
          "observation references a source outside the atlas",
          "repair-ledger",
        ),
      );
      continue;
    }
    if (
      observation.retention === "licensed-structured-body"
      && !rightsPermitBody(source.rightsMode)
    ) {
      findings.push(
        finding(
          "body-retention-rights-mismatch",
          "error",
          observation.observationId,
          source.id,
          `${source.rightsMode} does not permit retained structured bodies`,
          "review-rights",
        ),
      );
    }
    if (asoiafExternalCreditRequired(source) && !observation.credit) {
      findings.push(
        finding(
          "missing-observation-credit",
          "error",
          observation.observationId,
          source.id,
          "retained CC BY or CC BY-SA observation lacks attribution metadata",
          "repair-credit",
        ),
      );
    }
    if (!asoiafExternalCreditRequired(source) && observation.credit) {
      findings.push(
        finding(
          "unnecessary-observation-credit",
          "warning",
          observation.observationId,
          source.id,
          "observation carries public credit metadata although the source does not require it",
          "repair-credit",
        ),
      );
    }
    const receipt = safeEstatePath(root, observation.receiptUri);
    if (!receipt || !fs.existsSync(receipt)) {
      findings.push(
        finding(
          "missing-observation-receipt",
          "error",
          observation.observationId,
          source.id,
          "observation receipt is missing or unsafe",
          "repair-ledger",
        ),
      );
    }
  }

  for (const candidate of candidates.values()) {
    if (candidate.graphEffect !== "none" || candidate.canonEffect !== "none") {
      findings.push(
        finding(
          "candidate-authority-leak",
          "error",
          candidate.candidateId,
          candidate.sourceId,
          "collector candidate acquired graph or canon effect",
          "repair-ledger",
        ),
      );
    }
    if (candidate.promotionStatus !== "intake-only") {
      findings.push(
        finding(
          "collector-promotion-leak",
          "error",
          candidate.candidateId,
          candidate.sourceId,
          "collector candidate crossed the review boundary",
          "repair-ledger",
        ),
      );
    }
    for (const observationId of candidate.observationIds) {
      if (!observationsById.has(observationId)) {
        findings.push(
          finding(
            "candidate-missing-observation",
            "error",
            candidate.candidateId,
            candidate.sourceId,
            `candidate references missing observation ${observationId}`,
            "repair-ledger",
          ),
        );
      }
    }
  }

  const indexedCacheFiles = new Set<string>();
  for (const entry of cacheIndex.entries) {
    const observation = observationsById.get(entry.observationId);
    if (!observation) {
      findings.push(
        finding(
          "cache-missing-observation",
          "error",
          entry.cacheKey,
          entry.sourceId,
          `cache entry references missing observation ${entry.observationId}`,
          "repair-cache",
        ),
      );
    } else {
      if (observation.sourceId !== entry.sourceId) {
        findings.push(
          finding(
            "cache-source-mismatch",
            "error",
            entry.cacheKey,
            entry.sourceId,
            "cache entry and observation have different source identities",
            "repair-cache",
          ),
        );
      }
      if (observation.contentDigest !== entry.contentDigest) {
        findings.push(
          finding(
            "cache-digest-mismatch",
            "error",
            entry.cacheKey,
            entry.sourceId,
            "cache entry and observation have different content digests",
            "repair-cache",
          ),
        );
      }
    }
    if (entry.cacheUri) {
      const absolute = safeEstatePath(root, entry.cacheUri);
      if (!absolute) {
        findings.push(
          finding(
            "unsafe-cache-path",
            "error",
            entry.cacheKey,
            entry.sourceId,
            `cache path ${entry.cacheUri} escapes the estate`,
            "repair-cache",
          ),
        );
      } else {
        indexedCacheFiles.add(absolute);
        if (!fs.existsSync(absolute)) {
          findings.push(
            finding(
              "missing-cache-file",
              "error",
              entry.cacheKey,
              entry.sourceId,
              `cache file ${entry.cacheUri} is missing`,
              "repair-cache",
            ),
          );
        }
      }
    }
  }
  for (const file of listFilesRecursively(paths.cache)) {
    if (file === paths.cacheIndex) continue;
    if (!indexedCacheFiles.has(path.resolve(file))) {
      findings.push(
        finding(
          "orphan-cache-file",
          "warning",
          path.relative(root, file),
          null,
          "cache file is not represented by the cache index",
          "repair-cache",
        ),
      );
    }
  }

  const creditRecords = credits.records ?? [];
  const creditObservationIds = new Set<string>();
  for (const record of creditRecords) {
    if (creditObservationIds.has(record.observationId)) {
      findings.push(
        finding(
          "duplicate-public-credit",
          "error",
          record.observationId,
          record.sourceId,
          "public credits contain a duplicate observation",
          "repair-credit",
        ),
      );
    }
    creditObservationIds.add(record.observationId);
    const observation = observationsById.get(record.observationId);
    const source = getAsoiafExternalSource(record.sourceId);
    if (!observation) {
      findings.push(
        finding(
          "credit-missing-observation",
          "error",
          record.observationId,
          record.sourceId,
          "public credit references a missing observation",
          "repair-credit",
        ),
      );
    }
    if (!source || !asoiafExternalCreditRequired(source)) {
      findings.push(
        finding(
          "public-credit-overreach",
          "error",
          record.observationId,
          record.sourceId,
          "public credit includes a source outside the CC BY or CC BY-SA credit surface",
          "repair-credit",
        ),
      );
    }
    if (observation && observation.sourceId !== record.sourceId) {
      findings.push(
        finding(
          "credit-source-mismatch",
          "error",
          record.observationId,
          record.sourceId,
          "public credit source differs from observation source",
          "repair-credit",
        ),
      );
    }
  }
  for (const observation of observations) {
    const source = getAsoiafExternalSource(observation.sourceId);
    if (
      source
      && asoiafExternalCreditRequired(source)
      && !creditObservationIds.has(observation.observationId)
    ) {
      findings.push(
        finding(
          "missing-public-credit",
          "error",
          observation.observationId,
          source.id,
          "required attribution is absent from the public credit projection",
          "repair-credit",
        ),
      );
    }
  }

  for (const attempt of attempts) {
    if (attempt.receiptUri) {
      const receipt = safeEstatePath(root, attempt.receiptUri);
      if (!receipt || !fs.existsSync(receipt)) {
        findings.push(
          finding(
            "missing-attempt-receipt",
            "error",
            attempt.attemptId,
            attempt.sourceId,
            "attempt receipt is missing or unsafe",
            "repair-ledger",
          ),
        );
      }
    }
  }

  const actualBySource = new Map<
    string,
    {
      observations: number;
      candidates: number;
      gaps: number;
      attempts: number;
      credits: number;
      cache: number;
    }
  >();
  const countsFor = (sourceId: string) => {
    const existing = actualBySource.get(sourceId) ?? {
      observations: 0,
      candidates: 0,
      gaps: 0,
      attempts: 0,
      credits: 0,
      cache: 0,
    };
    actualBySource.set(sourceId, existing);
    return existing;
  };
  for (const observation of observations) countsFor(observation.sourceId).observations += 1;
  for (const candidate of candidates.values()) countsFor(candidate.sourceId).candidates += 1;
  for (const gap of gaps) countsFor(gap.sourceId).gaps += 1;
  for (const attempt of attempts) countsFor(attempt.sourceId).attempts += 1;
  for (const record of creditRecords) countsFor(record.sourceId).credits += 1;
  for (const entry of cacheIndex.entries) countsFor(entry.sourceId).cache += 1;
  for (const row of ledger) {
    const actual = countsFor(row.sourceId);
    const comparisons: Array<[string, number, number]> = [
      ["observation", row.observationCount, actual.observations],
      ["candidate", row.candidateCount, actual.candidates],
      ["gap", row.gapCount, actual.gaps],
      ["attempt", row.attemptCount, actual.attempts],
      ["credit", row.creditRecordCount, actual.credits],
    ];
    for (const [kind, projected, counted] of comparisons) {
      if (projected !== counted) {
        findings.push(
          finding(
            `${kind}-count-drift`,
            "error",
            row.sourceId,
            row.sourceId,
            `${kind} projection is ${projected}; append-only ledgers contain ${counted}`,
            kind === "credit" ? "repair-credit" : "repair-ledger",
          ),
        );
      }
    }
  }

  return {
    findings: sortedFindings(findings),
    observations,
    candidates,
    gaps,
    attempts,
    cacheEntries: cacheIndex.entries,
    credits,
  };
}

function sourceStatus(input: {
  row: CollectorSourceLedgerRow;
  sourceFindingErrors: number;
  sourceWarnings: number;
  now: string;
  dueAt: string | null;
  routeLatest: SourceHealthObservation | null;
  drift: boolean;
}): { status: SourceHealthStatus; reasons: string[] } {
  const source = getAsoiafExternalSource(input.row.sourceId);
  const reasons: string[] = [];
  if (input.sourceFindingErrors > 0) {
    reasons.push("estate integrity findings require repair");
    return { status: "integrity-error", reasons };
  }
  if (input.row.status === "retired" || input.routeLatest?.status === "retired") {
    reasons.push("source is explicitly retired");
    return { status: "retired", reasons };
  }
  if (
    input.row.status === "blocked-rights"
    || (
      source?.rightsMode === "unknown-review-required"
      && input.row.status === "never-attempted"
    )
    || input.routeLatest?.status === "terms-review"
  ) {
    reasons.push("source requires a named rights or terms review");
    return { status: "rights-review", reasons };
  }
  if (input.row.status === "never-attempted") {
    reasons.push("source has never entered a collector transaction");
    return { status: "never-attempted", reasons };
  }
  if (input.row.status === "unavailable" || input.routeLatest?.status === "unavailable") {
    reasons.push("latest source or route observation is unavailable");
    return { status: "unavailable", reasons };
  }
  if (
    [
      "blocked-robots",
      "blocked-credential",
      "rejected-private-contact",
      "rejected-oversize",
      "error",
    ].includes(input.row.status)
    || input.routeLatest?.status === "robots-deny"
  ) {
    reasons.push(`latest terminal status is ${input.row.status}`);
    return { status: "blocked", reasons };
  }
  if (input.drift) reasons.push("route, robots, terms, or availability state changed");
  if (input.dueAt && input.dueAt <= input.now) {
    reasons.push(`source refresh is due at ${input.dueAt}`);
    return { status: "due", reasons };
  }
  reasons.push(
    input.dueAt
      ? `source remains fresh until ${input.dueAt}`
      : "source requires explicit refresh rather than automatic scheduling",
  );
  if (input.sourceWarnings > 0) reasons.push("source has nonblocking health warnings");
  return { status: "fresh", reasons };
}

export function buildSourceHealthSnapshot(
  root: string,
  now = new Date().toISOString(),
): SourceHealthSnapshot {
  const paths = initializeSourceHealth(root, now);
  const ledger = loadSourceLedger(root);
  const audit = auditEstate(root);
  const routeObservations = readNdjson<SourceHealthObservation>(paths.observations);
  const routesBySource = latestRouteObservations(routeObservations);
  const findings = [...audit.findings];

  for (const observation of routeObservations) {
    if (!getAsoiafExternalSource(observation.sourceId)) {
      findings.push(
        finding(
          "health-observation-unknown-source",
          "error",
          observation.observationId,
          observation.sourceId,
          "source-health observation references an unknown source",
          "repair-ledger",
        ),
      );
    }
    if (
      observation.graphEffect !== "none"
      || observation.canonEffect !== "none"
    ) {
      findings.push(
        finding(
          "health-observation-authority-leak",
          "error",
          observation.observationId,
          observation.sourceId,
          "source-health observation acquired graph or canon effect",
          "repair-ledger",
        ),
      );
    }
    for (const digest of [
      observation.routeDigest,
      observation.robotsDigest,
      observation.termsDigest,
    ]) {
      if (!validDigest(digest)) {
        findings.push(
          finding(
            "health-observation-digest",
            "error",
            observation.observationId,
            observation.sourceId,
            "source-health observation contains a malformed digest",
            "repair-ledger",
          ),
        );
      }
    }
  }

  for (const [sourceId, entries] of routesBySource) {
    if (routeDrift(entries)) {
      findings.push(
        finding(
          "source-route-drift",
          "warning",
          entries[entries.length - 1]!.observationId,
          sourceId,
          "source route, availability, robots, or terms identity changed since the previous check",
          "inspect-drift",
        ),
      );
    }
  }

  const finalFindings = sortedFindings(findings);
  const findingCounts = new Map<string, { errors: number; warnings: number }>();
  for (const entry of finalFindings) {
    if (!entry.sourceId) continue;
    const counts = findingCounts.get(entry.sourceId) ?? { errors: 0, warnings: 0 };
    if (entry.severity === "error") counts.errors += 1;
    if (entry.severity === "warning") counts.warnings += 1;
    findingCounts.set(entry.sourceId, counts);
  }

  const observationsBySource = new Map<string, number>();
  const candidatesBySource = new Map<string, number>();
  const gapsBySource = new Map<string, number>();
  const attemptsBySource = new Map<string, number>();
  const cacheBySource = new Map<string, number>();
  const creditsBySource = new Map<string, number>();
  for (const observation of audit.observations) {
    observationsBySource.set(
      observation.sourceId,
      (observationsBySource.get(observation.sourceId) ?? 0) + 1,
    );
  }
  for (const candidate of audit.candidates.values()) {
    candidatesBySource.set(
      candidate.sourceId,
      (candidatesBySource.get(candidate.sourceId) ?? 0) + 1,
    );
  }
  for (const gap of audit.gaps) {
    gapsBySource.set(gap.sourceId, (gapsBySource.get(gap.sourceId) ?? 0) + 1);
  }
  for (const attempt of audit.attempts) {
    attemptsBySource.set(
      attempt.sourceId,
      (attemptsBySource.get(attempt.sourceId) ?? 0) + 1,
    );
  }
  for (const entry of audit.cacheEntries) {
    cacheBySource.set(entry.sourceId, (cacheBySource.get(entry.sourceId) ?? 0) + 1);
  }
  for (const record of audit.credits.records ?? []) {
    creditsBySource.set(record.sourceId, (creditsBySource.get(record.sourceId) ?? 0) + 1);
  }

  const records = [...ledger]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map((row): SourceHealthRecord => {
      const source = getAsoiafExternalSource(row.sourceId);
      const routeEntries = routesBySource.get(row.sourceId) ?? [];
      const latestRoute = routeEntries[routeEntries.length - 1] ?? null;
      const drift = routeDrift(routeEntries);
      const dueAt = calculatedDueAt(row, now);
      const counts = findingCounts.get(row.sourceId) ?? { errors: 0, warnings: 0 };
      const classified = sourceStatus({
        row,
        sourceFindingErrors: counts.errors,
        sourceWarnings: counts.warnings,
        now,
        dueAt,
        routeLatest: latestRoute,
        drift,
      });
      return {
        sourceId: row.sourceId,
        sourceLabel: row.sourceLabel,
        status: classified.status,
        terminalStatus: row.status,
        rightsMode: row.rightsMode,
        harvestMode: row.harvestMode,
        rightsReviewRequired:
          row.status === "blocked-rights"
          || source?.rightsMode === "unknown-review-required"
          || latestRoute?.status === "terms-review",
        localCustodyRequired:
          source?.harvestPolicy.mode === "local-private-only",
        firstAttemptAt: row.firstAttemptAt,
        lastAttemptAt: row.lastAttemptAt,
        lastSuccessfulAt: row.lastSuccessfulAt,
        dueAt,
        cadenceDays: cadenceDays(row),
        routeStatus: latestRoute?.status ?? null,
        routeCheckedAt: latestRoute?.checkedAt ?? null,
        routeDrift: drift,
        observationCount: observationsBySource.get(row.sourceId) ?? 0,
        candidateCount: candidatesBySource.get(row.sourceId) ?? 0,
        gapCount: gapsBySource.get(row.sourceId) ?? 0,
        attemptCount: attemptsBySource.get(row.sourceId) ?? 0,
        cacheEntryCount: cacheBySource.get(row.sourceId) ?? 0,
        creditRecordCount: creditsBySource.get(row.sourceId) ?? 0,
        integrityErrorCount: counts.errors,
        warningCount: counts.warnings,
        reasons: classified.reasons,
      };
    });

  const countsByStatus = emptyHealthCounts();
  const countsByTerminalStatus = emptyTerminalCounts();
  for (const record of records) {
    countsByStatus[record.status] += 1;
    countsByTerminalStatus[record.terminalStatus] += 1;
  }
  const core = {
    format: ASOIAF_EXTERNAL_SOURCE_HEALTH_SNAPSHOT_FORMAT,
    atlasFingerprint: ASOIAF_EXTERNAL_ATLAS_MANIFEST.atlasFingerprint,
    generatedAt: now,
    sourceCount: records.length,
    countsByStatus,
    countsByTerminalStatus,
    rightsReviewCount: records.filter((record) => record.rightsReviewRequired).length,
    routeDriftCount: records.filter((record) => record.routeDrift).length,
    errorCount: finalFindings.filter((entry) => entry.severity === "error").length,
    warningCount: finalFindings.filter((entry) => entry.severity === "warning").length,
    noticeCount: finalFindings.filter((entry) => entry.severity === "notice").length,
    records,
    findings: finalFindings,
  };
  return {
    ...core,
    snapshotFingerprint: sha256(core),
  };
}

function task(
  sourceId: string,
  taskType: SourceHealthTaskType,
  priority: number,
  dueAt: string | null,
  reasons: string[],
): SourceHealthTask {
  const core = {
    sourceId,
    taskType,
    priority,
    dueAt,
    reasons: [...new Set(reasons)].sort(),
  };
  return {
    taskId: collectorContentId("asoiaf-external-health-task", core),
    ...core,
    graphEffect: "none",
    canonEffect: "none",
  };
}

export function buildSourceHealthPlan(
  root: string,
  now = new Date().toISOString(),
  limit = 40,
): SourceHealthPlan {
  const snapshot = buildSourceHealthSnapshot(root, now);
  const tasks: SourceHealthTask[] = [];
  const repairBySource = new Map<string, Map<SourceHealthTaskType, string[]>>();
  for (const entry of snapshot.findings) {
    if (!entry.sourceId || !entry.repairTask) continue;
    const sourceTasks = repairBySource.get(entry.sourceId) ?? new Map();
    const reasons = sourceTasks.get(entry.repairTask) ?? [];
    reasons.push(`${entry.code}: ${entry.detail}`);
    sourceTasks.set(entry.repairTask, reasons);
    repairBySource.set(entry.sourceId, sourceTasks);
  }
  for (const [sourceId, repairs] of repairBySource) {
    for (const [taskType, reasons] of repairs) {
      const priority = taskType === "repair-ledger"
        ? 100
        : taskType === "repair-cache"
          ? 98
          : taskType === "repair-credit"
            ? 96
            : 90;
      tasks.push(task(sourceId, taskType, priority, now, reasons));
    }
  }

  for (const record of snapshot.records) {
    if (record.integrityErrorCount > 0 || record.status === "retired") continue;
    if (record.rightsReviewRequired) {
      tasks.push(
        task(
          record.sourceId,
          "review-rights",
          90,
          record.dueAt,
          record.reasons,
        ),
      );
    }
    if (record.routeDrift) {
      tasks.push(
        task(
          record.sourceId,
          "inspect-drift",
          85,
          record.routeCheckedAt,
          record.reasons,
        ),
      );
    }
    switch (record.status) {
      case "never-attempted":
        tasks.push(
          task(
            record.sourceId,
            record.localCustodyRequired ? "request-local-custody" : "collect",
            record.localCustodyRequired ? 55 : 70,
            record.dueAt,
            record.reasons,
          ),
        );
        break;
      case "due":
        tasks.push(
          task(record.sourceId, "collect", 65, record.dueAt, record.reasons),
        );
        break;
      case "unavailable":
        tasks.push(
          task(
            record.sourceId,
            "refresh-route",
            68,
            record.dueAt,
            record.reasons,
          ),
        );
        break;
      case "blocked":
        tasks.push(
          task(
            record.sourceId,
            "review-block",
            60,
            record.dueAt,
            record.reasons,
          ),
        );
        break;
      case "rights-review":
      case "fresh":
      case "integrity-error":
        break;
    }
  }

  const unique = new Map(tasks.map((entry) => [entry.taskId, entry]));
  const allTasks = [...unique.values()].sort(
    (left, right) =>
      right.priority - left.priority
      || (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999")
      || left.sourceId.localeCompare(right.sourceId)
      || left.taskType.localeCompare(right.taskType),
  );
  const returned = allTasks.slice(0, Math.max(0, limit));
  const core = {
    format: ASOIAF_EXTERNAL_SOURCE_HEALTH_PLAN_FORMAT,
    atlasFingerprint: snapshot.atlasFingerprint,
    generatedAt: now,
    sourceHealthFingerprint: snapshot.snapshotFingerprint,
    totalTaskCount: allTasks.length,
    returnedTaskCount: returned.length,
    tasks: returned,
  };
  return {
    ...core,
    planFingerprint: sha256(core),
  };
}

function markdownSnapshot(snapshot: SourceHealthSnapshot): string {
  const lines = [
    "# ASOIAF external-source health",
    "",
    `Generated: ${snapshot.generatedAt}`,
    `Atlas: \`${snapshot.atlasFingerprint}\``,
    `Snapshot: \`${snapshot.snapshotFingerprint}\``,
    "",
    "## Estate summary",
    "",
    `- Sources: **${snapshot.sourceCount}**`,
    `- Errors: **${snapshot.errorCount}**`,
    `- Warnings: **${snapshot.warningCount}**`,
    `- Rights reviews: **${snapshot.rightsReviewCount}**`,
    `- Route drifts: **${snapshot.routeDriftCount}**`,
    "",
    "## Status counts",
    "",
    ...Object.entries(snapshot.countsByStatus).map(
      ([status, count]) => `- ${status}: **${count}**`,
    ),
    "",
    "## Findings",
    "",
    ...(
      snapshot.findings.length
        ? snapshot.findings.map(
            (entry) =>
              `- **${entry.severity}** \`${entry.code}\` ${entry.sourceId ? `(${entry.sourceId}) ` : ""}${entry.detail}`,
          )
        : ["_No source-health findings._"]
    ),
    "",
  ];
  return lines.join("\n");
}

export function writeSourceHealthReports(
  root: string,
  now = new Date().toISOString(),
  limit = 40,
): { snapshot: SourceHealthSnapshot; plan: SourceHealthPlan; paths: SourceHealthPaths } {
  const paths = initializeSourceHealth(root, now);
  const snapshot = buildSourceHealthSnapshot(root, now);
  const plan = buildSourceHealthPlan(root, now, limit);
  writeJsonAtomic(paths.snapshotJson, snapshot);
  fs.writeFileSync(paths.snapshotMarkdown, markdownSnapshot(snapshot), "utf8");
  writeJsonAtomic(paths.refreshPlan, plan);
  return { snapshot, plan, paths };
}

export function verifySourceHealth(
  root: string,
  now = new Date().toISOString(),
): SourceHealthFinding[] {
  return buildSourceHealthSnapshot(root, now).findings.filter(
    (entry) => entry.severity === "error",
  );
}

export function writeSourceHealthReceipt(
  root: string,
  outputPath: string,
  now = new Date().toISOString(),
): SourceHealthReceipt {
  const { snapshot, plan } = writeSourceHealthReports(root, now);
  const core = {
    format: ASOIAF_EXTERNAL_SOURCE_HEALTH_RECEIPT_FORMAT,
    atlasFingerprint: snapshot.atlasFingerprint,
    generatedAt: now,
    snapshotFingerprint: snapshot.snapshotFingerprint,
    planFingerprint: plan.planFingerprint,
    errorCount: snapshot.errorCount,
    warningCount: snapshot.warningCount,
    sourceCount: snapshot.sourceCount,
    passed: snapshot.errorCount === 0,
  };
  const receipt: SourceHealthReceipt = {
    ...core,
    receiptFingerprint: sha256(core),
  };
  writeJsonAtomic(outputPath, receipt);
  return receipt;
}
