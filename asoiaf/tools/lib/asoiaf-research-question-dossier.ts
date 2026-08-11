import {
  ASOIAF_EXTERNAL_ATLAS_LANES,
  ASOIAF_EXTERNAL_ATLAS_SOURCES,
  type AsoiafExternalContinuity,
  type AsoiafExternalQueryLane,
  type AsoiafExternalRole,
  type AsoiafExternalSource,
} from "../../src/external/index.js";
import {
  ASOIAF_RECALL_ESTATE_PACKETS,
} from "../../src/recall/index.js";
import type {
  CanonRecallCandidate,
  CanonRecallGenerator,
} from "../../../src/canon/recall/types.js";
import {
  collectorContentId,
  sha256,
} from "./asoiaf-external-estate.js";
import {
  ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
  type AsoiafStructuredAcquisitionReceipt,
} from "./asoiaf-structured-acquisition-source-health.js";
import {
  ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT,
  type AsoiafStructuredObservationAdmission,
} from "./asoiaf-structured-observation-admission-health.js";

export const ASOIAF_RESEARCH_QUESTION_FORMAT =
  "axm-asoiaf-research-question/1" as const;
export const ASOIAF_RESEARCH_ROUTE_FORMAT =
  "axm-asoiaf-research-route/1" as const;
export const ASOIAF_RESEARCH_DOSSIER_FORMAT =
  "axm-asoiaf-research-question-dossier/1" as const;

export type AsoiafResearchStanding =
  | "evidence-ready"
  | "navigation-only"
  | "supporting-only"
  | "provenance-only"
  | "constraint-only"
  | "rejected"
  | "deferred"
  | "unresolved";

export type AsoiafResearchNextAction =
  | "acquire-public-record"
  | "search-private-edition"
  | "resolve-edition"
  | "review-structured-observation"
  | "inspect-disposition"
  | "review-exact-locator"
  | "reconcile-candidate"
  | "split-continuity"
  | "close-gap";

export type AsoiafResearchGapKind =
  | "private-source-missing"
  | "public-record-missing"
  | "edition-unresolved"
  | "locator-review-required"
  | "structured-review-required"
  | "disposition-rejected"
  | "disposition-deferred"
  | "recall-unreconciled"
  | "continuity-conflict"
  | "source-conflict"
  | "question-unresolved";

export interface AsoiafResearchQuestion {
  format: typeof ASOIAF_RESEARCH_QUESTION_FORMAT;
  questionId: string;
  questionDigest: `sha256:${string}`;
  createdBy: string;
  createdAt: string;
  laneIds: AsoiafExternalRole[];
  continuityIds: AsoiafExternalContinuity[];
  crossContinuityReason: string | null;
  questionTextRetained: false;
  authority: "none";
  graphEffect: "none";
  canonEffect: "none";
  answerEffect: "none";
}

export interface AsoiafResearchRoute {
  format: typeof ASOIAF_RESEARCH_ROUTE_FORMAT;
  laneIds: AsoiafExternalRole[];
  sourceIds: string[];
  continuityPolicies: AsoiafExternalQueryLane["continuityPolicy"][];
  responsePolicies: AsoiafExternalQueryLane["responsePolicy"][];
  routeFingerprint: `sha256:${string}`;
}

export interface AsoiafPrivateResearchReferenceInput {
  sourceId: string;
  editionKey: string;
  continuityId: AsoiafExternalContinuity;
  unitId: string;
  paragraphId: string;
  locator: string;
  paragraphDigest: `sha256:${string}`;
  queryMode: "all" | "any" | "phrase";
  matchedTerms: string[];
  tokenPositions: number[];
  snippetDigest?: `sha256:${string}` | null;
  snippetCharacters?: number | null;
}

export interface AsoiafPrivateResearchReference
  extends AsoiafPrivateResearchReferenceInput {
  kind: "private-hit";
  referenceId: string;
  textRetained: false;
  standing: "navigation-only";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafStructuredResearchReferenceInput {
  continuityId: AsoiafExternalContinuity;
  acquisitionReceipt: AsoiafStructuredAcquisitionReceipt;
  admission: AsoiafStructuredObservationAdmission;
}

export interface AsoiafStructuredResearchReference
  extends AsoiafStructuredResearchReferenceInput {
  kind: "structured-observation";
  referenceId: string;
  sourceId: string;
  observationId: string;
  candidateId: string;
  standing:
    | "supporting-only"
    | "provenance-only"
    | "constraint-only"
    | "rejected"
    | "deferred";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafRecallResearchReferenceInput {
  candidateId: string;
  continuityId: AsoiafExternalContinuity;
}

export interface AsoiafRecallResearchReference
  extends AsoiafRecallResearchReferenceInput {
  kind: "recall-candidate";
  referenceId: string;
  generatedBy: CanonRecallGenerator;
  packetId: string;
  standing: "navigation-only";
  authority: "none";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafResearchGapInput {
  kind: AsoiafResearchGapKind;
  laneId: AsoiafExternalRole;
  continuityId: AsoiafExternalContinuity;
  detail: string;
  sourceId?: string | null;
  candidateId?: string | null;
  observationId?: string | null;
}

export interface AsoiafResearchGap extends AsoiafResearchGapInput {
  gapId: string;
  standing: "unresolved";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafResearchQuestionDossierInput {
  questionText: string;
  createdBy: string;
  createdAt: string;
  laneIds?: AsoiafExternalRole[];
  continuityIds: AsoiafExternalContinuity[];
  crossContinuityReason?: string | null;
  privateReferences?: AsoiafPrivateResearchReferenceInput[];
  structuredReferences?: AsoiafStructuredResearchReferenceInput[];
  recallReferences?: AsoiafRecallResearchReferenceInput[];
  gaps?: AsoiafResearchGapInput[];
}

export interface AsoiafResearchStandingCounts {
  evidenceReady: number;
  navigationOnly: number;
  supportingOnly: number;
  provenanceOnly: number;
  constraintOnly: number;
  rejected: number;
  deferred: number;
  unresolved: number;
}

export interface AsoiafResearchQuestionDossier {
  format: typeof ASOIAF_RESEARCH_DOSSIER_FORMAT;
  dossierId: string;
  question: AsoiafResearchQuestion;
  route: AsoiafResearchRoute;
  privateReferences: AsoiafPrivateResearchReference[];
  structuredReferences: AsoiafStructuredResearchReference[];
  recallReferences: AsoiafRecallResearchReference[];
  gaps: AsoiafResearchGap[];
  nextActions: AsoiafResearchNextAction[];
  standingCounts: AsoiafResearchStandingCounts;
  evidenceReady: false;
  answerReady: false;
  authority: "none";
  graphEffect: "none";
  canonEffect: "none";
  answerEffect: "none";
  dossierFingerprint: `sha256:${string}`;
}

export interface AsoiafResearchDossierFinding {
  code: string;
  severity: "error" | "warning" | "notice";
  subjectId: string;
  detail: string;
}

interface RecallEntry {
  packetId: string;
  generatedBy: CanonRecallGenerator;
  candidate: CanonRecallCandidate;
}

const LANES_BY_ID = new Map(
  ASOIAF_EXTERNAL_ATLAS_LANES.map((lane) => [lane.id, lane]),
);
const SOURCES_BY_ID = new Map(
  ASOIAF_EXTERNAL_ATLAS_SOURCES.map((source) => [source.id, source]),
);
const RECALL_BY_ID = new Map<string, RecallEntry>(
  ASOIAF_RECALL_ESTATE_PACKETS.flatMap((packet) =>
    packet.candidates.map((candidate) => [
      candidate.id,
      {
        packetId: packet.id,
        generatedBy: packet.generatedBy,
        candidate,
      },
    ] as const),
  ),
);

const ANALOGUE_CONTINUITIES = new Set<AsoiafExternalContinuity>([
  "analysis",
  "historical-analogue",
  "scientific-analogue",
]);

function finding(
  code: string,
  severity: AsoiafResearchDossierFinding["severity"],
  subjectId: string,
  detail: string,
): AsoiafResearchDossierFinding {
  return { code, severity, subjectId, detail };
}

function validDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function integerArray(values: readonly number[]): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isSafeInteger(value) && value >= 0)
    .sort((left, right) => left - right);
}

function normalizeQuestionText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizedSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function canonicalObjectKey(value: unknown): string {
  return JSON.stringify(value);
}

function routeCore(
  route: AsoiafResearchRoute,
): Omit<AsoiafResearchRoute, "routeFingerprint"> {
  const { routeFingerprint: _fingerprint, ...core } = route;
  return core;
}

function dossierCore(
  dossier: AsoiafResearchQuestionDossier,
): Omit<AsoiafResearchQuestionDossier, "dossierId" | "dossierFingerprint"> {
  const {
    dossierId: _dossierId,
    dossierFingerprint: _fingerprint,
    ...core
  } = dossier;
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

function admissionCore(
  admission: AsoiafStructuredObservationAdmission,
): Omit<
  AsoiafStructuredObservationAdmission,
  "admissionId" | "admissionFingerprint"
> {
  const {
    admissionId: _admissionId,
    admissionFingerprint: _fingerprint,
    ...core
  } = admission;
  return core;
}

function inferLaneIds(questionText: string): AsoiafExternalRole[] {
  const normalized = normalizedSearchText(questionText);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  const scored = ASOIAF_EXTERNAL_ATLAS_LANES.map((lane) => {
    const phrases = [lane.id, lane.label, ...lane.aliases]
      .map(normalizedSearchText)
      .filter(Boolean);
    let score = 0;
    for (const phrase of phrases) {
      if (normalized.includes(phrase)) score += 20 + phrase.split(" ").length;
      for (const token of phrase.split(" ")) {
        if (tokens.has(token)) score += 1;
      }
    }
    return { laneId: lane.id, score };
  })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.laneId.localeCompare(right.laneId),
    );
  if (scored.length === 0) return [];
  const threshold = Math.max(2, Math.floor(scored[0]!.score * 0.35));
  return scored
    .filter((entry) => entry.score >= threshold)
    .slice(0, 6)
    .map((entry) => entry.laneId)
    .sort((left, right) => left.localeCompare(right));
}

function routeSourceIds(
  laneIds: readonly AsoiafExternalRole[],
  continuityIds: readonly AsoiafExternalContinuity[],
): string[] {
  const sourceIds = new Set<string>();
  for (const laneId of laneIds) {
    const lane = LANES_BY_ID.get(laneId);
    if (!lane) continue;
    for (const sourceId of lane.preferredSourceIds) sourceIds.add(sourceId);
    for (const source of ASOIAF_EXTERNAL_ATLAS_SOURCES) {
      if (
        source.roles.includes(laneId)
        && source.continuityIds.some((continuityId) =>
          continuityIds.includes(continuityId),
        )
      ) {
        sourceIds.add(source.id);
      }
    }
  }
  return [...sourceIds].sort((left, right) => left.localeCompare(right));
}

function buildRoute(
  laneIds: AsoiafExternalRole[],
  continuityIds: AsoiafExternalContinuity[],
): AsoiafResearchRoute {
  const lanes = laneIds.map((laneId) => LANES_BY_ID.get(laneId)!).filter(Boolean);
  const core = {
    format: ASOIAF_RESEARCH_ROUTE_FORMAT,
    laneIds,
    sourceIds: routeSourceIds(laneIds, continuityIds),
    continuityPolicies: uniqueSorted(lanes.map((lane) => lane.continuityPolicy)),
    responsePolicies: [...lanes.map((lane) => lane.responsePolicy)]
      .sort((left, right) => canonicalObjectKey(left).localeCompare(canonicalObjectKey(right)))
      .filter(
        (policy, index, all) =>
          index === 0
          || canonicalObjectKey(policy) !== canonicalObjectKey(all[index - 1]),
      ),
  };
  return { ...core, routeFingerprint: sha256(core) };
}

function privateReference(
  input: AsoiafPrivateResearchReferenceInput,
): AsoiafPrivateResearchReference {
  const core = {
    kind: "private-hit" as const,
    sourceId: input.sourceId,
    editionKey: input.editionKey.trim(),
    continuityId: input.continuityId,
    unitId: input.unitId.trim(),
    paragraphId: input.paragraphId.trim(),
    locator: input.locator.trim(),
    paragraphDigest: input.paragraphDigest,
    queryMode: input.queryMode,
    matchedTerms: uniqueSorted(input.matchedTerms.map((value) => value.trim()).filter(Boolean)),
    tokenPositions: integerArray(input.tokenPositions),
    snippetDigest: input.snippetDigest ?? null,
    snippetCharacters: input.snippetCharacters ?? null,
    textRetained: false as const,
    standing: "navigation-only" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return {
    ...core,
    referenceId: collectorContentId("asoiaf-private-research-reference", core),
  };
}

function structuredStanding(
  admission: AsoiafStructuredObservationAdmission,
  source: AsoiafExternalSource | undefined,
): AsoiafStructuredResearchReference["standing"] {
  if (admission.outcome === "reject-off-topic") return "rejected";
  if (admission.outcome === "defer-insufficient-identity") return "deferred";
  if (source?.authorityClass === "discussion-provenance") return "provenance-only";
  if (source?.authorityClass === "scholarly-analogue") return "constraint-only";
  return "supporting-only";
}

function structuredReference(
  input: AsoiafStructuredResearchReferenceInput,
): AsoiafStructuredResearchReference {
  const sourceId = input.admission.sourceId;
  const source = SOURCES_BY_ID.get(sourceId);
  const core = {
    kind: "structured-observation" as const,
    sourceId,
    continuityId: input.continuityId,
    observationId: input.admission.observationId,
    candidateId: input.admission.candidateId,
    acquisitionReceipt: input.acquisitionReceipt,
    admission: input.admission,
    standing: structuredStanding(input.admission, source),
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return {
    ...core,
    referenceId: collectorContentId("asoiaf-structured-research-reference", {
      admissionId: input.admission.admissionId,
      acquisitionReceiptId: input.acquisitionReceipt.receiptId,
      continuityId: input.continuityId,
    }),
  };
}

function recallReference(
  input: AsoiafRecallResearchReferenceInput,
): AsoiafRecallResearchReference {
  const entry = RECALL_BY_ID.get(input.candidateId);
  const core = {
    kind: "recall-candidate" as const,
    candidateId: input.candidateId,
    continuityId: input.continuityId,
    generatedBy: entry?.generatedBy ?? "language-model-recall",
    packetId: entry?.packetId ?? "unknown",
    standing: "navigation-only" as const,
    authority: "none" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return {
    ...core,
    referenceId: collectorContentId("asoiaf-recall-research-reference", core),
  };
}

function researchGap(input: AsoiafResearchGapInput): AsoiafResearchGap {
  const core = {
    kind: input.kind,
    laneId: input.laneId,
    continuityId: input.continuityId,
    detail: input.detail.trim(),
    sourceId: input.sourceId ?? null,
    candidateId: input.candidateId ?? null,
    observationId: input.observationId ?? null,
    standing: "unresolved" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return {
    ...core,
    gapId: collectorContentId("asoiaf-research-gap", core),
  };
}

function standingCounts(input: {
  privateReferences: AsoiafPrivateResearchReference[];
  structuredReferences: AsoiafStructuredResearchReference[];
  recallReferences: AsoiafRecallResearchReference[];
  gaps: AsoiafResearchGap[];
}): AsoiafResearchStandingCounts {
  const allStandings: AsoiafResearchStanding[] = [
    ...input.privateReferences.map((entry) => entry.standing),
    ...input.structuredReferences.map((entry) => entry.standing),
    ...input.recallReferences.map((entry) => entry.standing),
    ...input.gaps.map((entry) => entry.standing),
  ];
  return {
    evidenceReady: allStandings.filter((standing) => standing === "evidence-ready").length,
    navigationOnly: allStandings.filter((standing) => standing === "navigation-only").length,
    supportingOnly: allStandings.filter((standing) => standing === "supporting-only").length,
    provenanceOnly: allStandings.filter((standing) => standing === "provenance-only").length,
    constraintOnly: allStandings.filter((standing) => standing === "constraint-only").length,
    rejected: allStandings.filter((standing) => standing === "rejected").length,
    deferred: allStandings.filter((standing) => standing === "deferred").length,
    unresolved: allStandings.filter((standing) => standing === "unresolved").length,
  };
}

function nextActions(input: {
  question: AsoiafResearchQuestion;
  privateReferences: AsoiafPrivateResearchReference[];
  structuredReferences: AsoiafStructuredResearchReference[];
  recallReferences: AsoiafRecallResearchReference[];
  gaps: AsoiafResearchGap[];
}): AsoiafResearchNextAction[] {
  const actions = new Set<AsoiafResearchNextAction>();
  if (input.question.continuityIds.length > 1) actions.add("split-continuity");
  if (input.privateReferences.length === 0) actions.add("search-private-edition");
  if (input.privateReferences.some((entry) => !entry.snippetDigest)) {
    actions.add("review-exact-locator");
  }
  if (input.structuredReferences.some((entry) => entry.standing === "rejected" || entry.standing === "deferred")) {
    actions.add("inspect-disposition");
  }
  if (input.structuredReferences.length === 0) actions.add("acquire-public-record");
  if (input.recallReferences.length > 0) actions.add("reconcile-candidate");
  for (const gap of input.gaps) {
    actions.add("close-gap");
    if (gap.kind === "private-source-missing") actions.add("search-private-edition");
    if (gap.kind === "public-record-missing") actions.add("acquire-public-record");
    if (gap.kind === "edition-unresolved") actions.add("resolve-edition");
    if (gap.kind === "locator-review-required") actions.add("review-exact-locator");
    if (gap.kind === "structured-review-required") actions.add("review-structured-observation");
    if (gap.kind === "disposition-rejected" || gap.kind === "disposition-deferred") {
      actions.add("inspect-disposition");
    }
    if (gap.kind === "recall-unreconciled") actions.add("reconcile-candidate");
    if (gap.kind === "continuity-conflict") actions.add("split-continuity");
  }
  return [...actions].sort((left, right) => left.localeCompare(right));
}

function sortByReferenceId<T extends { referenceId: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.referenceId.localeCompare(right.referenceId));
}

function sortGaps(values: AsoiafResearchGap[]): AsoiafResearchGap[] {
  return [...values].sort((left, right) => left.gapId.localeCompare(right.gapId));
}

export function buildAsoiafResearchQuestionDossier(
  input: AsoiafResearchQuestionDossierInput,
): AsoiafResearchQuestionDossier {
  const questionText = normalizeQuestionText(input.questionText);
  const laneIds = uniqueSorted(input.laneIds ?? inferLaneIds(questionText));
  const continuityIds = uniqueSorted(input.continuityIds);
  const questionDigest = sha256(questionText);
  const questionCore = {
    format: ASOIAF_RESEARCH_QUESTION_FORMAT,
    questionDigest,
    createdBy: input.createdBy.trim(),
    createdAt: input.createdAt,
    laneIds,
    continuityIds,
    crossContinuityReason: input.crossContinuityReason?.trim() || null,
    questionTextRetained: false as const,
    authority: "none" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
    answerEffect: "none" as const,
  };
  const question: AsoiafResearchQuestion = {
    ...questionCore,
    questionId: collectorContentId("asoiaf-research-question", questionCore),
  };
  const route = buildRoute(laneIds, continuityIds);
  const privateReferences = sortByReferenceId(
    (input.privateReferences ?? []).map(privateReference),
  );
  const structuredReferences = sortByReferenceId(
    (input.structuredReferences ?? []).map(structuredReference),
  );
  const recallReferences = sortByReferenceId(
    (input.recallReferences ?? []).map(recallReference),
  );
  const gaps = sortGaps((input.gaps ?? []).map(researchGap));
  const standing = standingCounts({
    privateReferences,
    structuredReferences,
    recallReferences,
    gaps,
  });
  const actions = nextActions({
    question,
    privateReferences,
    structuredReferences,
    recallReferences,
    gaps,
  });
  const core = {
    format: ASOIAF_RESEARCH_DOSSIER_FORMAT,
    question,
    route,
    privateReferences,
    structuredReferences,
    recallReferences,
    gaps,
    nextActions: actions,
    standingCounts: standing,
    evidenceReady: false as const,
    answerReady: false as const,
    authority: "none" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
    answerEffect: "none" as const,
  };
  const dossierFingerprint = sha256(core);
  const dossier: AsoiafResearchQuestionDossier = {
    ...core,
    dossierId: collectorContentId("asoiaf-research-question-dossier", {
      questionId: question.questionId,
      dossierFingerprint,
    }),
    dossierFingerprint,
  };
  const findings = validateAsoiafResearchQuestionDossier(dossier);
  const errors = findings.filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `invalid ASOIAF research dossier: ${errors
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  return dossier;
}

function sourceSupportsLane(source: AsoiafExternalSource, laneId: AsoiafExternalRole): boolean {
  const lane = LANES_BY_ID.get(laneId);
  return Boolean(
    source.roles.includes(laneId)
    || lane?.preferredSourceIds.includes(source.id)
    || lane?.preferredAuthorityClasses.includes(source.authorityClass)
    || lane?.supportingAuthorityClasses.includes(source.authorityClass),
  );
}

function referenceContinuityAllowed(
  continuityId: AsoiafExternalContinuity,
  question: AsoiafResearchQuestion,
): boolean {
  return question.continuityIds.includes(continuityId);
}

function validateQuestion(
  dossier: AsoiafResearchQuestionDossier,
  findings: AsoiafResearchDossierFinding[],
): void {
  const question = dossier.question;
  if (question.format !== ASOIAF_RESEARCH_QUESTION_FORMAT) {
    findings.push(finding("question-format", "error", question.questionId, "question format is invalid"));
  }
  if (!validDigest(question.questionDigest)) {
    findings.push(finding("question-digest", "error", question.questionId, "question digest is malformed"));
  }
  if (!nonempty(question.createdBy) || !Number.isFinite(Date.parse(question.createdAt))) {
    findings.push(finding("question-creator", "error", question.questionId, "question requires a creator and valid creation time"));
  }
  if (
    question.laneIds.length === 0
    || JSON.stringify(uniqueSorted(question.laneIds)) !== JSON.stringify(question.laneIds)
    || question.laneIds.some((laneId) => !LANES_BY_ID.has(laneId))
  ) {
    findings.push(finding("question-lanes", "error", question.questionId, "question lanes must be known, unique, sorted, and nonempty"));
  }
  if (
    question.continuityIds.length === 0
    || JSON.stringify(uniqueSorted(question.continuityIds)) !== JSON.stringify(question.continuityIds)
  ) {
    findings.push(finding("question-continuities", "error", question.questionId, "question continuities must be unique, sorted, and nonempty"));
  }
  const lanes = question.laneIds.map((laneId) => LANES_BY_ID.get(laneId)!).filter(Boolean);
  if (
    question.continuityIds.length > 1
    && lanes.some((lane) => lane.continuityPolicy === "same-continuity-required")
  ) {
    findings.push(finding("question-continuity-mix", "error", question.questionId, "a same-continuity lane cannot span multiple continuities"));
  }
  if (
    question.continuityIds.length > 1
    && !nonempty(question.crossContinuityReason)
  ) {
    findings.push(finding("question-cross-continuity-reason", "error", question.questionId, "multi-continuity research requires an explicit comparison reason"));
  }
  if (
    lanes.some((lane) => lane.continuityPolicy === "analogue-only")
    && question.continuityIds.some((continuityId) => !ANALOGUE_CONTINUITIES.has(continuityId))
  ) {
    findings.push(finding("question-analogue-continuity", "error", question.questionId, "analogue-only lanes require analysis or analogue continuity"));
  }
  if (
    question.questionTextRetained !== false
    || question.authority !== "none"
    || question.graphEffect !== "none"
    || question.canonEffect !== "none"
    || question.answerEffect !== "none"
  ) {
    findings.push(finding("question-authority", "error", question.questionId, "question crossed its text-retention or authority boundary"));
  }
}

function validateRoute(
  dossier: AsoiafResearchQuestionDossier,
  findings: AsoiafResearchDossierFinding[],
): void {
  const route = dossier.route;
  if (route.format !== ASOIAF_RESEARCH_ROUTE_FORMAT) {
    findings.push(finding("route-format", "error", dossier.question.questionId, "research route format is invalid"));
  }
  if (route.routeFingerprint !== sha256(routeCore(route))) {
    findings.push(finding("route-fingerprint", "error", dossier.question.questionId, "research route fingerprint is stale"));
  }
  if (JSON.stringify(route.laneIds) !== JSON.stringify(dossier.question.laneIds)) {
    findings.push(finding("route-lane-parity", "error", dossier.question.questionId, "route lanes differ from the question"));
  }
  const expectedSources = routeSourceIds(route.laneIds, dossier.question.continuityIds);
  if (JSON.stringify(expectedSources) !== JSON.stringify(route.sourceIds)) {
    findings.push(finding("route-source-parity", "error", dossier.question.questionId, "route sources differ from the qualified atlas"));
  }
}

function validatePrivateReferences(
  dossier: AsoiafResearchQuestionDossier,
  findings: AsoiafResearchDossierFinding[],
): void {
  for (const reference of dossier.privateReferences) {
    const source = SOURCES_BY_ID.get(reference.sourceId);
    if (!source || source.harvestPolicy.mode !== "local-private-only") {
      findings.push(finding("private-source", "error", reference.referenceId, "private hit source is absent or not holder-controlled"));
    }
    if (!referenceContinuityAllowed(reference.continuityId, dossier.question)) {
      findings.push(finding("private-continuity", "error", reference.referenceId, "private hit continuity is outside the question"));
    }
    if (source && !source.continuityIds.includes(reference.continuityId)) {
      findings.push(finding("private-source-continuity", "error", reference.referenceId, "private source does not support the selected continuity"));
    }
    if (
      !nonempty(reference.editionKey)
      || !nonempty(reference.unitId)
      || !nonempty(reference.paragraphId)
      || !nonempty(reference.locator)
      || reference.locator.includes("..")
      || reference.locator.includes("\\")
      || !validDigest(reference.paragraphDigest)
    ) {
      findings.push(finding("private-custody", "error", reference.referenceId, "private hit lacks safe edition, locator, paragraph, or digest custody"));
    }
    if (
      reference.snippetDigest !== null
      && !validDigest(reference.snippetDigest)
    ) {
      findings.push(finding("private-snippet-digest", "error", reference.referenceId, "private snippet digest is malformed"));
    }
    if (
      reference.snippetCharacters != null
      && (!Number.isSafeInteger(reference.snippetCharacters) || reference.snippetCharacters < 1 || reference.snippetCharacters > 2_000)
    ) {
      findings.push(finding("private-snippet-size", "error", reference.referenceId, "private snippet character count is outside the bounded range"));
    }
    if (
      reference.textRetained !== false
      || reference.standing !== "navigation-only"
      || reference.graphEffect !== "none"
      || reference.canonEffect !== "none"
    ) {
      findings.push(finding("private-authority", "error", reference.referenceId, "private search reference acquired text or authority"));
    }
    if (source && !dossier.question.laneIds.some((laneId) => sourceSupportsLane(source, laneId))) {
      findings.push(finding("private-lane", "warning", reference.referenceId, "private source is not routed for the selected question lanes"));
    }
  }
}

function validateStructuredReferences(
  dossier: AsoiafResearchQuestionDossier,
  findings: AsoiafResearchDossierFinding[],
): void {
  for (const reference of dossier.structuredReferences) {
    const { admission, acquisitionReceipt } = reference;
    const source = SOURCES_BY_ID.get(reference.sourceId);
    if (!source) {
      findings.push(finding("structured-source", "error", reference.referenceId, "structured reference source is absent from the atlas"));
    }
    if (!referenceContinuityAllowed(reference.continuityId, dossier.question)) {
      findings.push(finding("structured-continuity", "error", reference.referenceId, "structured reference continuity is outside the question"));
    }
    if (source && !source.continuityIds.includes(reference.continuityId)) {
      findings.push(finding("structured-source-continuity", "error", reference.referenceId, "structured source does not support the selected continuity"));
    }
    if (admission.format !== ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT) {
      findings.push(finding("structured-admission-format", "error", reference.referenceId, "structured admission format is invalid"));
    }
    if (admission.admissionFingerprint !== sha256(admissionCore(admission))) {
      findings.push(finding("structured-admission-fingerprint", "error", reference.referenceId, "structured admission fingerprint is stale"));
    }
    const expectedAdmissionId = collectorContentId(
      "asoiaf-structured-observation-admission",
      {
        observationId: admission.observationId,
        candidateId: admission.candidateId,
        admissionFingerprint: admission.admissionFingerprint,
      },
    );
    if (admission.admissionId !== expectedAdmissionId) {
      findings.push(finding("structured-admission-id", "error", reference.referenceId, "structured admission identity is not content addressed"));
    }
    if (acquisitionReceipt.format !== ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT) {
      findings.push(finding("structured-acquisition-format", "error", reference.referenceId, "acquisition receipt format is invalid"));
    }
    const expectedAcquisitionFingerprint = sha256(acquisitionReceiptCore(acquisitionReceipt));
    const expectedAcquisitionId = collectorContentId(
      "asoiaf-structured-acquisition-receipt",
      {
        requestId: acquisitionReceipt.requestId,
        planFingerprint: acquisitionReceipt.planFingerprint,
        receiptFingerprint: expectedAcquisitionFingerprint,
      },
    );
    if (
      acquisitionReceipt.receiptFingerprint !== expectedAcquisitionFingerprint
      || acquisitionReceipt.receiptId !== expectedAcquisitionId
    ) {
      findings.push(finding("structured-acquisition-integrity", "error", reference.referenceId, "acquisition receipt fingerprint or identity is stale"));
    }
    if (
      admission.sourceId !== acquisitionReceipt.sourceId
      || admission.adapterId !== acquisitionReceipt.adapterId
      || admission.requestId !== acquisitionReceipt.requestId
      || admission.planFingerprint !== acquisitionReceipt.planFingerprint
      || admission.acquisitionReceiptId !== acquisitionReceipt.receiptId
      || admission.acquisitionReceiptFingerprint !== acquisitionReceipt.receiptFingerprint
      || admission.adapterReceiptFingerprint !== acquisitionReceipt.adapterReceiptFingerprint
      || !acquisitionReceipt.observationIds.includes(admission.observationId)
      || !acquisitionReceipt.candidateIds.includes(admission.candidateId)
    ) {
      findings.push(finding("structured-custody-parity", "error", reference.referenceId, "admission and acquisition receipt do not describe one retained observation"));
    }
    if (
      admission.questionLaneIds.length === 0
      || !admission.questionLaneIds.every((laneId) => dossier.question.laneIds.includes(laneId as AsoiafExternalRole))
    ) {
      findings.push(finding("structured-lane-parity", "error", reference.referenceId, "admission question lanes are absent or outside the dossier"));
    }
    const expectedStanding = structuredStanding(admission, source);
    if (reference.standing !== expectedStanding) {
      findings.push(finding("structured-standing", "error", reference.referenceId, "structured standing differs from disposition and source authority"));
    }
    if (
      admission.outcome === "admit-to-review"
      && reference.standing === "rejected"
    ) {
      findings.push(finding("structured-admission-standing", "error", reference.referenceId, "admitted observation was classified as rejected"));
    }
    if (
      admission.authorityRole !== "admission-only"
      || admission.graphEffect !== "none"
      || admission.canonEffect !== "none"
      || acquisitionReceipt.rawResponseRetained !== false
      || acquisitionReceipt.graphEffect !== "none"
      || acquisitionReceipt.canonEffect !== "none"
      || reference.graphEffect !== "none"
      || reference.canonEffect !== "none"
    ) {
      findings.push(finding("structured-authority", "error", reference.referenceId, "structured reference crossed admission, retention, graph, or canon boundaries"));
    }
    if (source && !dossier.question.laneIds.some((laneId) => sourceSupportsLane(source, laneId))) {
      findings.push(finding("structured-route", "warning", reference.referenceId, "structured source is not routed for the selected question lanes"));
    }
  }
}

function validateRecallReferences(
  dossier: AsoiafResearchQuestionDossier,
  findings: AsoiafResearchDossierFinding[],
): void {
  for (const reference of dossier.recallReferences) {
    const entry = RECALL_BY_ID.get(reference.candidateId);
    if (!entry) {
      findings.push(finding("recall-candidate", "error", reference.referenceId, "recall candidate does not exist in the qualified estate"));
      continue;
    }
    if (
      reference.packetId !== entry.packetId
      || reference.generatedBy !== entry.generatedBy
    ) {
      findings.push(finding("recall-custody", "error", reference.referenceId, "recall reference differs from its qualified packet"));
    }
    if (!referenceContinuityAllowed(reference.continuityId, dossier.question)) {
      findings.push(finding("recall-continuity", "error", reference.referenceId, "recall continuity is outside the question"));
    }
    if (
      entry.candidate.continuityHints.length > 0
      && !entry.candidate.continuityHints.includes(reference.continuityId)
    ) {
      findings.push(finding("recall-continuity-hint", "warning", reference.referenceId, "selected continuity is absent from the recall candidate hints"));
    }
    if (
      reference.authority !== "none"
      || reference.standing !== "navigation-only"
      || reference.graphEffect !== "none"
      || reference.canonEffect !== "none"
    ) {
      findings.push(finding("recall-authority", "error", reference.referenceId, "recall reference acquired authority"));
    }
  }
}

function validateGaps(
  dossier: AsoiafResearchQuestionDossier,
  findings: AsoiafResearchDossierFinding[],
): void {
  for (const gap of dossier.gaps) {
    if (!LANES_BY_ID.has(gap.laneId)) {
      findings.push(finding("gap-lane", "error", gap.gapId, "gap lane is absent from the atlas"));
    }
    if (!dossier.question.laneIds.includes(gap.laneId)) {
      findings.push(finding("gap-question-lane", "error", gap.gapId, "gap lane is outside the question"));
    }
    if (!referenceContinuityAllowed(gap.continuityId, dossier.question)) {
      findings.push(finding("gap-continuity", "error", gap.gapId, "gap continuity is outside the question"));
    }
    if (!nonempty(gap.detail)) {
      findings.push(finding("gap-detail", "error", gap.gapId, "gap detail is empty"));
    }
    if (gap.sourceId && !SOURCES_BY_ID.has(gap.sourceId)) {
      findings.push(finding("gap-source", "error", gap.gapId, "gap source is absent from the atlas"));
    }
    if (gap.candidateId && !RECALL_BY_ID.has(gap.candidateId)) {
      findings.push(finding("gap-candidate", "warning", gap.gapId, "gap candidate is absent from the recall estate"));
    }
    if (
      gap.standing !== "unresolved"
      || gap.graphEffect !== "none"
      || gap.canonEffect !== "none"
    ) {
      findings.push(finding("gap-authority", "error", gap.gapId, "research gap acquired authority"));
    }
  }
}

function duplicateFindings(
  values: Array<{ id: string; kind: string }>,
): AsoiafResearchDossierFinding[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value.id, (counts.get(value.id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => finding("duplicate-reference", "error", id, "research dossier contains a duplicate reference identity"));
}

export function validateAsoiafResearchQuestionDossier(
  dossier: AsoiafResearchQuestionDossier,
): AsoiafResearchDossierFinding[] {
  const findings: AsoiafResearchDossierFinding[] = [];
  if (dossier.format !== ASOIAF_RESEARCH_DOSSIER_FORMAT) {
    findings.push(finding("dossier-format", "error", dossier.dossierId, "research dossier format is invalid"));
  }
  validateQuestion(dossier, findings);
  validateRoute(dossier, findings);
  validatePrivateReferences(dossier, findings);
  validateStructuredReferences(dossier, findings);
  validateRecallReferences(dossier, findings);
  validateGaps(dossier, findings);
  findings.push(
    ...duplicateFindings([
      ...dossier.privateReferences.map((entry) => ({ id: entry.referenceId, kind: entry.kind })),
      ...dossier.structuredReferences.map((entry) => ({ id: entry.referenceId, kind: entry.kind })),
      ...dossier.recallReferences.map((entry) => ({ id: entry.referenceId, kind: entry.kind })),
      ...dossier.gaps.map((entry) => ({ id: entry.gapId, kind: "gap" })),
    ]),
  );
  const expectedCounts = standingCounts(dossier);
  if (JSON.stringify(expectedCounts) !== JSON.stringify(dossier.standingCounts)) {
    findings.push(finding("standing-counts", "error", dossier.dossierId, "standing counts are stale"));
  }
  const expectedActions = nextActions(dossier);
  if (JSON.stringify(expectedActions) !== JSON.stringify(dossier.nextActions)) {
    findings.push(finding("next-actions", "error", dossier.dossierId, "next-action projection is stale"));
  }
  if (
    dossier.evidenceReady !== false
    || dossier.answerReady !== false
    || dossier.authority !== "none"
    || dossier.graphEffect !== "none"
    || dossier.canonEffect !== "none"
    || dossier.answerEffect !== "none"
  ) {
    findings.push(finding("dossier-authority", "error", dossier.dossierId, "research dossier acquired answer, graph, or canon authority"));
  }
  const expectedFingerprint = sha256(dossierCore(dossier));
  if (dossier.dossierFingerprint !== expectedFingerprint) {
    findings.push(finding("dossier-fingerprint", "error", dossier.dossierId, "research dossier fingerprint is stale"));
  }
  const expectedId = collectorContentId("asoiaf-research-question-dossier", {
    questionId: dossier.question.questionId,
    dossierFingerprint: expectedFingerprint,
  });
  if (dossier.dossierId !== expectedId) {
    findings.push(finding("dossier-identity", "error", dossier.dossierId, "research dossier identity is not content addressed"));
  }
  return findings.sort(
    (left, right) =>
      ({ error: 0, warning: 1, notice: 2 })[left.severity]
        - ({ error: 0, warning: 1, notice: 2 })[right.severity]
      || left.code.localeCompare(right.code)
      || left.subjectId.localeCompare(right.subjectId),
  );
}

export function routeAsoiafResearchQuestion(
  questionText: string,
  continuityIds: AsoiafExternalContinuity[],
  explicitLaneIds?: AsoiafExternalRole[],
): AsoiafResearchRoute {
  const normalized = normalizeQuestionText(questionText);
  const laneIds = uniqueSorted(explicitLaneIds ?? inferLaneIds(normalized));
  return buildRoute(laneIds, uniqueSorted(continuityIds));
}
