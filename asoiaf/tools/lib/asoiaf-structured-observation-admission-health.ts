import fs from "node:fs";
import path from "node:path";
import {
  collectorContentId,
  collectorEstatePaths,
  currentCandidates,
  readNdjson,
  sha256,
  type CollectorCandidateRecord,
  type CollectorObservationRecord,
} from "./asoiaf-external-estate.js";
import {
  ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
  type AsoiafStructuredAcquisitionReceipt,
} from "./asoiaf-structured-acquisition-source-health.js";

export const ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT =
  "axm-asoiaf-structured-observation-admission/1" as const;
export const ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_STATE_FORMAT =
  "axm-asoiaf-structured-observation-admission-state/1" as const;

export type AsoiafStructuredObservationAdmissionOutcome =
  | "admit-to-review"
  | "reject-off-topic"
  | "defer-insufficient-identity";

export type AsoiafStructuredObservationAdmissionReason =
  | "exact-identity-and-question-match"
  | "bounded-relevant-metadata"
  | "off-topic-query-collision"
  | "continuity-mismatch"
  | "unsupported-question-lane"
  | "insufficient-work-identity"
  | "insufficient-question-relevance";

export type AsoiafStructuredObservationEvidenceField =
  | "doi"
  | "isbn"
  | "title"
  | "creator"
  | "container"
  | "publisher"
  | "subject"
  | "canonical-uri"
  | "upstream-record"
  | "revision-id"
  | "edition"
  | "continuity"
  | "other";

export type AsoiafStructuredObservationEvidenceEffect =
  | "supports-admission"
  | "supports-rejection"
  | "unresolved";

export interface AsoiafStructuredObservationAdmissionEvidence {
  field: AsoiafStructuredObservationEvidenceField;
  value: string;
  effect: AsoiafStructuredObservationEvidenceEffect;
  note: string;
}

export interface AsoiafStructuredObservationAdmission {
  format: typeof ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT;
  admissionId: string;
  admissionFingerprint: `sha256:${string}`;
  sourceId: string;
  adapterId: string;
  requestId: string;
  planFingerprint: `sha256:${string}`;
  acquisitionReceiptId: string;
  acquisitionReceiptFingerprint: `sha256:${string}`;
  adapterReceiptFingerprint: `sha256:${string}`;
  observationId: string;
  candidateId: string;
  normalizedContentDigest: `sha256:${string}`;
  questionLaneIds: string[];
  evidence: AsoiafStructuredObservationAdmissionEvidence[];
  outcome: AsoiafStructuredObservationAdmissionOutcome;
  reason: AsoiafStructuredObservationAdmissionReason;
  rationale: string;
  reviewedBy: string;
  reviewedAt: string;
  authorityRole: "admission-only";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafStructuredObservationAdmissionStateEntry {
  observationId: string;
  candidateId: string;
  admissionId: string;
  admissionUri: string;
  reviewedAt: string;
  outcome: AsoiafStructuredObservationAdmissionOutcome;
}

export interface AsoiafStructuredObservationAdmissionState {
  format: typeof ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_STATE_FORMAT;
  entries: AsoiafStructuredObservationAdmissionStateEntry[];
  stateFingerprint: `sha256:${string}`;
}

export type StructuredObservationAdmissionHealthRepairTask =
  | "repair-ledger"
  | "inspect-disposition"
  | "review-identity"
  | null;

export interface StructuredObservationAdmissionHealthFinding {
  code: string;
  severity: "error" | "warning" | "notice";
  subjectId: string;
  sourceId: string | null;
  detail: string;
  repairTask: StructuredObservationAdmissionHealthRepairTask;
}

export interface StructuredObservationAdmissionHealthAudit {
  statePresent: boolean;
  stateEntryCount: number;
  admissionCount: number;
  currentAdmissionCount: number;
  admittedCount: number;
  rejectedCount: number;
  deferredCount: number;
  dispositionChangeCount: number;
  findings: StructuredObservationAdmissionHealthFinding[];
}

const REASONS_BY_OUTCOME: Record<
  AsoiafStructuredObservationAdmissionOutcome,
  ReadonlySet<AsoiafStructuredObservationAdmissionReason>
> = {
  "admit-to-review": new Set([
    "exact-identity-and-question-match",
    "bounded-relevant-metadata",
  ]),
  "reject-off-topic": new Set([
    "off-topic-query-collision",
    "continuity-mismatch",
    "unsupported-question-lane",
  ]),
  "defer-insufficient-identity": new Set([
    "insufficient-work-identity",
    "insufficient-question-relevance",
  ]),
};

const REQUIRED_EFFECT_BY_OUTCOME: Record<
  AsoiafStructuredObservationAdmissionOutcome,
  AsoiafStructuredObservationEvidenceEffect
> = {
  "admit-to-review": "supports-admission",
  "reject-off-topic": "supports-rejection",
  "defer-insufficient-identity": "unresolved",
};

const EVIDENCE_FIELDS = new Set<AsoiafStructuredObservationEvidenceField>([
  "doi",
  "isbn",
  "title",
  "creator",
  "container",
  "publisher",
  "subject",
  "canonical-uri",
  "upstream-record",
  "revision-id",
  "edition",
  "continuity",
  "other",
]);
const EVIDENCE_EFFECTS = new Set<AsoiafStructuredObservationEvidenceEffect>([
  "supports-admission",
  "supports-rejection",
  "unresolved",
]);

function finding(
  code: string,
  severity: StructuredObservationAdmissionHealthFinding["severity"],
  subjectId: string,
  sourceId: string | null,
  detail: string,
  repairTask: StructuredObservationAdmissionHealthRepairTask,
): StructuredObservationAdmissionHealthFinding {
  return { code, severity, subjectId, sourceId, detail, repairTask };
}

function validDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function listJsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function admissionDirectory(root: string): string {
  return path.join(path.resolve(root), "structured-observation-admissions");
}

function admissionStatePath(root: string): string {
  return path.join(
    path.resolve(root),
    "structured-observation-admission-state.json",
  );
}

function acquisitionReceiptDirectory(root: string): string {
  return path.join(path.resolve(root), "structured-acquisition-receipts");
}

function relativeEstateUri(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target)).split(path.sep).join("/");
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

function portableAdmissionFilename(
  admission: AsoiafStructuredObservationAdmission,
): string {
  const digest = validDigest(admission.admissionFingerprint)
    ? admission.admissionFingerprint.slice("sha256:".length)
    : "invalid";
  return `admission-${digest}.json`;
}

function evidenceIdentity(
  evidence: AsoiafStructuredObservationAdmissionEvidence,
): string {
  return [
    String(evidence.field ?? ""),
    String(evidence.value ?? "").trim(),
    String(evidence.effect ?? ""),
  ].join("\u0000");
}

function admissionCore(
  admission: AsoiafStructuredObservationAdmission,
): Omit<
  AsoiafStructuredObservationAdmission,
  "admissionId" | "admissionFingerprint"
> {
  const {
    admissionId: _admissionId,
    admissionFingerprint: _admissionFingerprint,
    ...core
  } = admission;
  return core;
}

function stateCore(
  state: AsoiafStructuredObservationAdmissionState,
): Omit<AsoiafStructuredObservationAdmissionState, "stateFingerprint"> {
  const { stateFingerprint: _fingerprint, ...core } = state;
  return core;
}

function acquisitionReceiptCore(
  receipt: AsoiafStructuredAcquisitionReceipt,
): Omit<AsoiafStructuredAcquisitionReceipt, "receiptId" | "receiptFingerprint"> {
  const {
    receiptId: _receiptId,
    receiptFingerprint: _fingerprint,
    ...core
  } = receipt;
  return core;
}

function sortedFindings(
  values: readonly StructuredObservationAdmissionHealthFinding[],
): StructuredObservationAdmissionHealthFinding[] {
  const severityOrder = { error: 0, warning: 1, notice: 2 } as const;
  return [...values].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity]
      || (left.sourceId ?? "").localeCompare(right.sourceId ?? "")
      || left.code.localeCompare(right.code)
      || left.subjectId.localeCompare(right.subjectId),
  );
}

function canonicalStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function admissionSort(
  left: AsoiafStructuredObservationAdmission,
  right: AsoiafStructuredObservationAdmission,
): number {
  return (
    String(left.reviewedAt).localeCompare(String(right.reviewedAt))
    || String(left.admissionId).localeCompare(String(right.admissionId))
  );
}

export function auditAsoiafStructuredObservationAdmissionHealth(
  root: string,
): StructuredObservationAdmissionHealthAudit {
  const findings: StructuredObservationAdmissionHealthFinding[] = [];
  const stateTarget = admissionStatePath(root);
  const admissionFiles = listJsonFiles(admissionDirectory(root));
  const statePresent = fs.existsSync(stateTarget);

  if (!statePresent && admissionFiles.length === 0) {
    return {
      statePresent: false,
      stateEntryCount: 0,
      admissionCount: 0,
      currentAdmissionCount: 0,
      admittedCount: 0,
      rejectedCount: 0,
      deferredCount: 0,
      dispositionChangeCount: 0,
      findings: [],
    };
  }

  const collectorPaths = collectorEstatePaths(root);
  const observations = readNdjson<CollectorObservationRecord>(
    collectorPaths.observations,
  );
  const observationsById = new Map(
    observations.map((observation) => [observation.observationId, observation]),
  );
  const candidates = currentCandidates(
    readNdjson<CollectorCandidateRecord>(collectorPaths.candidates),
  );

  const acquisitionReceipts = new Map<string, AsoiafStructuredAcquisitionReceipt>();
  for (const target of listJsonFiles(acquisitionReceiptDirectory(root))) {
    const decoded = readJsonFile<AsoiafStructuredAcquisitionReceipt>(target);
    if (!decoded.value) continue;
    acquisitionReceipts.set(decoded.value.receiptId, decoded.value);
  }

  const admissionsById = new Map<string, AsoiafStructuredObservationAdmission>();
  const admissionsByUri = new Map<string, AsoiafStructuredObservationAdmission>();
  const admissionsByObservation = new Map<
    string,
    AsoiafStructuredObservationAdmission[]
  >();
  let admissionCount = 0;

  for (const target of admissionFiles) {
    const uri = relativeEstateUri(root, target);
    const decoded = readJsonFile<AsoiafStructuredObservationAdmission>(target);
    if (!decoded.value) {
      findings.push(
        finding(
          "structured-admission-invalid-json",
          "error",
          uri,
          null,
          decoded.error ?? "structured observation admission is unreadable",
          "repair-ledger",
        ),
      );
      continue;
    }

    admissionCount += 1;
    const admission = decoded.value;
    const subject = admission.admissionId || uri;
    const sourceId = nonempty(admission.sourceId) ? admission.sourceId : null;
    admissionsByUri.set(uri, admission);

    if (admission.format !== ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT) {
      findings.push(finding("structured-admission-format", "error", subject, sourceId, "admission format is invalid", "repair-ledger"));
    }
    const expectedFingerprint = sha256(admissionCore(admission));
    if (admission.admissionFingerprint !== expectedFingerprint) {
      findings.push(finding("structured-admission-fingerprint", "error", subject, sourceId, "admission fingerprint is stale", "repair-ledger"));
    }
    const expectedId = collectorContentId(
      "asoiaf-structured-observation-admission",
      {
        observationId: admission.observationId,
        candidateId: admission.candidateId,
        admissionFingerprint: expectedFingerprint,
      },
    );
    if (admission.admissionId !== expectedId) {
      findings.push(finding("structured-admission-identity", "error", subject, sourceId, "admission identity is not content addressed", "repair-ledger"));
    }
    if (path.basename(target) !== portableAdmissionFilename(admission)) {
      findings.push(finding("structured-admission-portable-filename", "error", subject, sourceId, "admission filename must use the portable fingerprint form", "repair-ledger"));
    }
    if (admissionsById.has(admission.admissionId)) {
      findings.push(finding("structured-admission-duplicate", "error", subject, sourceId, "admission identity is duplicated", "repair-ledger"));
    }
    admissionsById.set(admission.admissionId, admission);

    const history = admissionsByObservation.get(admission.observationId) ?? [];
    history.push(admission);
    admissionsByObservation.set(admission.observationId, history);

    const requiredIdentities = [
      admission.sourceId,
      admission.adapterId,
      admission.requestId,
      admission.acquisitionReceiptId,
      admission.observationId,
      admission.candidateId,
      admission.reviewedBy,
    ];
    if (!requiredIdentities.every(nonempty)) {
      findings.push(finding("structured-admission-required-identity", "error", subject, sourceId, "admission is missing a required source, adapter, request, receipt, observation, candidate, or reviewer identity", "review-identity"));
    }
    if (
      !validDigest(admission.planFingerprint)
      || !validDigest(admission.acquisitionReceiptFingerprint)
      || !validDigest(admission.adapterReceiptFingerprint)
      || !validDigest(admission.normalizedContentDigest)
    ) {
      findings.push(finding("structured-admission-digest", "error", subject, sourceId, "admission contains a malformed plan, receipt, adapter, or normalized-content digest", "repair-ledger"));
    }

    const lanes = canonicalStringArray(admission.questionLaneIds);
    if (
      lanes.length === 0
      || lanes.length !== new Set(lanes).size
      || JSON.stringify(lanes) !== JSON.stringify(admission.questionLaneIds)
    ) {
      findings.push(finding("structured-admission-question-lanes", "error", subject, sourceId, "question lanes must be nonempty, unique, and canonically sorted", "review-identity"));
    }

    const evidence = Array.isArray(admission.evidence) ? admission.evidence : [];
    const evidenceIds = evidence.map(evidenceIdentity);
    if (evidence.length === 0) {
      findings.push(finding("structured-admission-evidence-empty", "error", subject, sourceId, "admission lacks retained work-identity and relevance evidence", "review-identity"));
    }
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      findings.push(finding("structured-admission-evidence-duplicate", "error", subject, sourceId, "admission evidence contains duplicate rows", "repair-ledger"));
    }
    if (JSON.stringify([...evidenceIds].sort()) !== JSON.stringify(evidenceIds)) {
      findings.push(finding("structured-admission-evidence-order", "error", subject, sourceId, "admission evidence is not canonically sorted", "repair-ledger"));
    }
    for (const [index, row] of evidence.entries()) {
      if (
        !EVIDENCE_FIELDS.has(row.field)
        || !EVIDENCE_EFFECTS.has(row.effect)
        || !nonempty(row.value)
        || !nonempty(row.note)
      ) {
        findings.push(finding("structured-admission-evidence-row", "error", `${subject}:${index}`, sourceId, "admission evidence row has an invalid field, effect, value, or reviewer note", "review-identity"));
      }
    }

    const allowedReasons = REASONS_BY_OUTCOME[admission.outcome];
    if (!allowedReasons || !allowedReasons.has(admission.reason)) {
      findings.push(finding("structured-admission-reason", "error", subject, sourceId, `reason ${String(admission.reason)} is incompatible with outcome ${String(admission.outcome)}`, "review-identity"));
    }
    const requiredEffect = REQUIRED_EFFECT_BY_OUTCOME[admission.outcome];
    if (!requiredEffect || !evidence.some((row) => row.effect === requiredEffect)) {
      findings.push(finding("structured-admission-evidence-effect", "error", subject, sourceId, `outcome ${String(admission.outcome)} lacks its required evidence effect`, "review-identity"));
    }
    if (!nonempty(admission.rationale) || admission.rationale.trim().length < 32) {
      findings.push(finding("structured-admission-rationale", "error", subject, sourceId, "admission rationale does not explain work identity and question relevance", "review-identity"));
    }
    if (!Number.isFinite(Date.parse(admission.reviewedAt))) {
      findings.push(finding("structured-admission-review-time", "error", subject, sourceId, "admission review time is invalid", "repair-ledger"));
    }
    if (
      admission.authorityRole !== "admission-only"
      || admission.graphEffect !== "none"
      || admission.canonEffect !== "none"
    ) {
      findings.push(finding("structured-admission-authority", "error", subject, sourceId, "admission crossed its admission-only authority boundary", "repair-ledger"));
    }

    const receipt = acquisitionReceipts.get(admission.acquisitionReceiptId);
    if (!receipt) {
      findings.push(finding("structured-admission-acquisition-missing", "error", subject, sourceId, "admission references a missing acquisition receipt", "repair-ledger"));
    } else {
      const expectedReceiptFingerprint = sha256(acquisitionReceiptCore(receipt));
      const expectedReceiptId = collectorContentId(
        "asoiaf-structured-acquisition-receipt",
        {
          requestId: receipt.requestId,
          planFingerprint: receipt.planFingerprint,
          receiptFingerprint: expectedReceiptFingerprint,
        },
      );
      if (
        receipt.format !== ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT
        || receipt.receiptFingerprint !== expectedReceiptFingerprint
        || receipt.receiptId !== expectedReceiptId
      ) {
        findings.push(finding("structured-admission-acquisition-integrity", "error", subject, sourceId, "bound acquisition receipt has invalid format, fingerprint, or identity", "repair-ledger"));
      }
      if (
        admission.sourceId !== receipt.sourceId
        || admission.adapterId !== receipt.adapterId
        || admission.requestId !== receipt.requestId
        || admission.planFingerprint !== receipt.planFingerprint
        || admission.acquisitionReceiptFingerprint !== receipt.receiptFingerprint
        || admission.adapterReceiptFingerprint !== receipt.adapterReceiptFingerprint
        || !receipt.observationIds.includes(admission.observationId)
        || !receipt.candidateIds.includes(admission.candidateId)
      ) {
        findings.push(finding("structured-admission-acquisition-parity", "error", subject, sourceId, "admission differs from its acquisition plan, receipts, observation, or candidate custody", "repair-ledger"));
      }
      if (
        Number.isFinite(Date.parse(admission.reviewedAt))
        && Date.parse(admission.reviewedAt) < Date.parse(receipt.completedAt)
      ) {
        findings.push(finding("structured-admission-before-acquisition", "error", subject, sourceId, "admission predates completion of its acquisition receipt", "repair-ledger"));
      }
    }

    const observation = observationsById.get(admission.observationId);
    if (!observation) {
      findings.push(finding("structured-admission-observation-missing", "error", subject, sourceId, "admission references a missing collector observation", "repair-ledger"));
    } else {
      if (
        observation.sourceId !== admission.sourceId
        || observation.candidateId !== admission.candidateId
        || observation.contentDigest !== admission.normalizedContentDigest
      ) {
        findings.push(finding("structured-admission-observation-parity", "error", subject, sourceId, "admission differs from its collector source, candidate, or normalized digest", "repair-ledger"));
      }
      if (
        Number.isFinite(Date.parse(admission.reviewedAt))
        && Date.parse(admission.reviewedAt) < Date.parse(observation.retrievedAt)
      ) {
        findings.push(finding("structured-admission-before-observation", "error", subject, sourceId, "admission predates its normalized collector observation", "repair-ledger"));
      }
    }

    const candidate = candidates.get(admission.candidateId);
    if (!candidate) {
      findings.push(finding("structured-admission-candidate-missing", "error", subject, sourceId, "admission references a missing collector candidate", "repair-ledger"));
    } else if (!candidate.observationIds.includes(admission.observationId)) {
      findings.push(finding("structured-admission-candidate-parity", "error", subject, sourceId, "collector candidate omits the admitted observation", "repair-ledger"));
    }
  }

  let state: AsoiafStructuredObservationAdmissionState | null = null;
  if (!statePresent) {
    findings.push(finding("structured-admission-state-missing", "error", "structured-observation-admission-state.json", null, "admission records exist without a fingerprinted current-state projection", "repair-ledger"));
  } else {
    const decoded = readJsonFile<AsoiafStructuredObservationAdmissionState>(stateTarget);
    if (!decoded.value) {
      findings.push(finding("structured-admission-state-invalid-json", "error", "structured-observation-admission-state.json", null, decoded.error ?? "admission state is unreadable", "repair-ledger"));
    } else {
      state = decoded.value;
      const entries = Array.isArray(state.entries) ? state.entries : [];
      if (state.format !== ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_STATE_FORMAT) {
        findings.push(finding("structured-admission-state-format", "error", "structured-observation-admission-state.json", null, "admission state format is invalid", "repair-ledger"));
      }
      if (state.stateFingerprint !== sha256(stateCore(state))) {
        findings.push(finding("structured-admission-state-fingerprint", "error", "structured-observation-admission-state.json", null, "admission state fingerprint is stale", "repair-ledger"));
      }
      const observationIds = new Set<string>();
      for (const entry of entries) {
        if (observationIds.has(entry.observationId)) {
          findings.push(finding("structured-admission-state-duplicate-observation", "error", entry.observationId, null, "admission state contains duplicate observation identity", "repair-ledger"));
        }
        observationIds.add(entry.observationId);
        const absolute = safeEstatePath(root, entry.admissionUri);
        const admission = admissionsByUri.get(entry.admissionUri);
        if (!absolute || !admission) {
          findings.push(finding("structured-admission-state-uri", "error", entry.observationId || "state-entry", null, "state entry references an unsafe or missing admission URI", "repair-ledger"));
          continue;
        }
        if (
          entry.observationId !== admission.observationId
          || entry.candidateId !== admission.candidateId
          || entry.admissionId !== admission.admissionId
          || entry.reviewedAt !== admission.reviewedAt
          || entry.outcome !== admission.outcome
        ) {
          findings.push(finding("structured-admission-state-parity", "error", entry.observationId, admission.sourceId, "state entry differs from its admission record", "repair-ledger"));
        }
      }
      const sortedEntries = [...entries].sort((left, right) =>
        left.observationId.localeCompare(right.observationId),
      );
      if (JSON.stringify(sortedEntries) !== JSON.stringify(entries)) {
        findings.push(finding("structured-admission-state-order", "error", "structured-observation-admission-state.json", null, "admission state entries are not canonically sorted", "repair-ledger"));
      }
    }
  }

  let dispositionChangeCount = 0;
  const currentAdmissions: AsoiafStructuredObservationAdmission[] = [];
  const stateByObservation = new Map(
    (state?.entries ?? []).map((entry) => [entry.observationId, entry]),
  );

  for (const [observationId, history] of admissionsByObservation) {
    history.sort(admissionSort);
    const latest = history.at(-1)!;
    currentAdmissions.push(latest);
    const latestEntry = stateByObservation.get(observationId);
    if (!latestEntry || latestEntry.admissionId !== latest.admissionId) {
      findings.push(finding("structured-admission-state-latest", "error", observationId, latest.sourceId, "admission state does not identify the latest reviewed disposition", "repair-ledger"));
    }

    const sameTimeLatest = history.filter(
      (entry) => entry.reviewedAt === latest.reviewedAt,
    );
    if (sameTimeLatest.length > 1) {
      findings.push(finding("structured-admission-latest-ambiguous", "error", observationId, latest.sourceId, "multiple admission dispositions share the latest review time", "review-identity"));
    }

    for (let index = 1; index < history.length; index += 1) {
      const previous = history[index - 1]!;
      const current = history[index]!;
      if (previous.outcome !== current.outcome || previous.reason !== current.reason) {
        dispositionChangeCount += 1;
        findings.push(finding("structured-admission-disposition-drift", "warning", current.admissionId, current.sourceId, `disposition changed from ${previous.outcome}/${previous.reason} to ${current.outcome}/${current.reason}`, "inspect-disposition"));
      }
      if (previous.reviewedBy !== current.reviewedBy) {
        findings.push(finding("structured-admission-reviewer-change", "notice", current.admissionId, current.sourceId, `admission reviewer changed from ${previous.reviewedBy} to ${current.reviewedBy}`, "review-identity"));
      }
    }
  }

  for (const entry of state?.entries ?? []) {
    if (!admissionsByObservation.has(entry.observationId)) {
      findings.push(finding("structured-admission-state-orphan", "error", entry.observationId, null, "admission state references an observation with no admission history", "repair-ledger"));
    }
  }

  const admittedCount = currentAdmissions.filter(
    (entry) => entry.outcome === "admit-to-review",
  ).length;
  const rejectedCount = currentAdmissions.filter(
    (entry) => entry.outcome === "reject-off-topic",
  ).length;
  const deferredCount = currentAdmissions.filter(
    (entry) => entry.outcome === "defer-insufficient-identity",
  ).length;

  return {
    statePresent,
    stateEntryCount: (state?.entries ?? []).length,
    admissionCount,
    currentAdmissionCount: currentAdmissions.length,
    admittedCount,
    rejectedCount,
    deferredCount,
    dispositionChangeCount,
    findings: sortedFindings(findings),
  };
}
