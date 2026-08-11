import {
  collectorContentId,
  sha256,
} from "./asoiaf-external-estate.js";

export const ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT =
  "axm-asoiaf-structured-observation-admission/1" as const;

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

export interface AsoiafStructuredObservationAdmissionInput {
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

export interface AsoiafStructuredObservationAdmission
  extends AsoiafStructuredObservationAdmissionInput {
  format: typeof ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT;
  admissionId: string;
  admissionFingerprint: `sha256:${string}`;
}

export interface AsoiafStructuredObservationAdmissionFinding {
  code: string;
  subjectId: string;
  detail: string;
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

function finding(
  code: string,
  subjectId: string,
  detail: string,
): AsoiafStructuredObservationAdmissionFinding {
  return { code, subjectId, detail };
}

function validDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function uniqueNonempty(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim());
  return (
    normalized.length > 0
    && normalized.every(Boolean)
    && new Set(normalized).size === normalized.length
  );
}

function evidenceIdentity(
  evidence: AsoiafStructuredObservationAdmissionEvidence,
): string {
  return `${evidence.field}\u0000${evidence.value.trim()}\u0000${evidence.effect}`;
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

export function validateAsoiafStructuredObservationAdmission(
  admission: AsoiafStructuredObservationAdmission,
): AsoiafStructuredObservationAdmissionFinding[] {
  const findings: AsoiafStructuredObservationAdmissionFinding[] = [];
  const subject = admission.admissionId || admission.observationId || "admission";

  if (admission.format !== ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT) {
    findings.push(finding("admission-format", subject, "admission format is invalid"));
  }
  if (
    !admission.sourceId.trim()
    || !admission.adapterId.trim()
    || !admission.requestId.trim()
    || !admission.acquisitionReceiptId.trim()
    || !admission.observationId.trim()
    || !admission.candidateId.trim()
  ) {
    findings.push(
      finding(
        "admission-identity",
        subject,
        "source, adapter, request, receipt, observation, and candidate identities are required",
      ),
    );
  }
  if (
    !validDigest(admission.planFingerprint)
    || !validDigest(admission.acquisitionReceiptFingerprint)
    || !validDigest(admission.adapterReceiptFingerprint)
    || !validDigest(admission.normalizedContentDigest)
  ) {
    findings.push(
      finding(
        "admission-digest",
        subject,
        "admission contains a malformed plan, receipt, adapter, or normalized-content digest",
      ),
    );
  }
  if (!uniqueNonempty(admission.questionLaneIds)) {
    findings.push(
      finding(
        "admission-question-lanes",
        subject,
        "admission must name at least one unique nonempty question lane",
      ),
    );
  }
  if (admission.evidence.length === 0) {
    findings.push(
      finding(
        "admission-evidence-empty",
        subject,
        "admission must retain the exact identity and relevance evidence used by the reviewer",
      ),
    );
  }
  const evidenceIds = admission.evidence.map(evidenceIdentity);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    findings.push(
      finding(
        "admission-evidence-duplicate",
        subject,
        "admission evidence contains duplicate field, value, and effect rows",
      ),
    );
  }
  for (const [index, evidence] of admission.evidence.entries()) {
    if (!evidence.value.trim() || !evidence.note.trim()) {
      findings.push(
        finding(
          "admission-evidence-row",
          `${subject}:${index}`,
          "every admission evidence row requires a value and reviewer note",
        ),
      );
    }
  }
  if (!REASONS_BY_OUTCOME[admission.outcome]?.has(admission.reason)) {
    findings.push(
      finding(
        "admission-reason",
        subject,
        `reason ${admission.reason} is incompatible with outcome ${admission.outcome}`,
      ),
    );
  }
  const requiredEffect = REQUIRED_EFFECT_BY_OUTCOME[admission.outcome];
  if (!admission.evidence.some((entry) => entry.effect === requiredEffect)) {
    findings.push(
      finding(
        "admission-evidence-effect",
        subject,
        `outcome ${admission.outcome} requires at least one ${requiredEffect} evidence row`,
      ),
    );
  }
  if (admission.rationale.trim().length < 32) {
    findings.push(
      finding(
        "admission-rationale",
        subject,
        "admission rationale must explain the work identity and question relevance decision",
      ),
    );
  }
  if (!admission.reviewedBy.trim() || !Number.isFinite(Date.parse(admission.reviewedAt))) {
    findings.push(
      finding(
        "admission-reviewer",
        subject,
        "admission requires a named reviewer and valid review time",
      ),
    );
  }
  if (
    admission.authorityRole !== "admission-only"
    || admission.graphEffect !== "none"
    || admission.canonEffect !== "none"
  ) {
    findings.push(
      finding(
        "admission-authority",
        subject,
        "admission disposition crossed its admission-only authority boundary",
      ),
    );
  }

  const expectedFingerprint = sha256(admissionCore(admission));
  if (admission.admissionFingerprint !== expectedFingerprint) {
    findings.push(
      finding(
        "admission-fingerprint",
        subject,
        "admission fingerprint is stale",
      ),
    );
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
    findings.push(
      finding(
        "admission-id",
        subject,
        "admission identity is not content addressed",
      ),
    );
  }

  return findings.sort(
    (left, right) =>
      left.code.localeCompare(right.code)
      || left.subjectId.localeCompare(right.subjectId),
  );
}

export function buildAsoiafStructuredObservationAdmission(
  input: AsoiafStructuredObservationAdmissionInput,
): AsoiafStructuredObservationAdmission {
  const core = {
    format: ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT,
    ...input,
    questionLaneIds: [...input.questionLaneIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    evidence: [...input.evidence].sort((left, right) =>
      evidenceIdentity(left).localeCompare(evidenceIdentity(right)),
    ),
  };
  const admissionFingerprint = sha256(core);
  const admission = {
    ...core,
    admissionId: collectorContentId(
      "asoiaf-structured-observation-admission",
      {
        observationId: input.observationId,
        candidateId: input.candidateId,
        admissionFingerprint,
      },
    ),
    admissionFingerprint,
  };
  const findings = validateAsoiafStructuredObservationAdmission(admission);
  if (findings.length > 0) {
    throw new Error(
      `invalid structured observation admission: ${findings
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  return admission;
}

export function assertAsoiafStructuredObservationAdmitted(
  admission: AsoiafStructuredObservationAdmission,
): void {
  const findings = validateAsoiafStructuredObservationAdmission(admission);
  if (findings.length > 0) {
    throw new Error(
      `invalid structured observation admission: ${findings
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  if (admission.outcome !== "admit-to-review") {
    throw new Error(
      `structured observation ${admission.observationId} is ${admission.outcome} and cannot enter review packet construction`,
    );
  }
}