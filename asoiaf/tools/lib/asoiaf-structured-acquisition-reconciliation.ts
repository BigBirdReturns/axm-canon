import path from "node:path";
import {
  getAsoiafExternalSource,
} from "../../src/external/atlas.js";
import {
  buildAsoiafExternalEvidenceBundle,
  buildAsoiafExternalReviewPacket,
  validateAsoiafExternalReviewPacket,
  type AsoiafExternalReviewedClaim,
  type AsoiafExternalReviewedObservation,
  type AsoiafExternalReviewPacket,
} from "../../src/external/reconciliation-packets.js";
import {
  ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT,
} from "./asoiaf-external-collector.js";
import {
  collectorContentId,
  sha256,
} from "./asoiaf-external-estate.js";
import {
  assertAsoiafStructuredObservationAdmitted,
  validateAsoiafStructuredObservationAdmission,
  type AsoiafStructuredObservationAdmission,
} from "./asoiaf-structured-observation-admission.js";

export const ASOIAF_STRUCTURED_ACQUISITION_REVIEW_BINDING_FORMAT =
  "axm-asoiaf-structured-acquisition-review-binding/1" as const;
export const ASOIAF_STRUCTURED_REQUEST_PLAN_FORMAT =
  "axm-asoiaf-structured-request-plan/1" as const;
export const ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT =
  "axm-asoiaf-structured-adapter-receipt/1" as const;
export const ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT =
  "axm-asoiaf-structured-acquisition-receipt/1" as const;

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

export interface AsoiafStructuredRequestPlan {
  format: typeof ASOIAF_STRUCTURED_REQUEST_PLAN_FORMAT;
  adapterId: AsoiafStructuredAdapterId;
  sourceId: AsoiafStructuredAdapterSourceId;
  requestId: string;
  method: "GET";
  url: string;
  headers: Record<string, string>;
  responseMediaType: "application/json";
  recordLimit: number;
  graphEffect: "none";
  canonEffect: "none";
  planFingerprint: `sha256:${string}`;
}

export interface AsoiafStructuredAdapterRejection {
  index: number;
  code: string;
  detail: string;
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
  rejected: AsoiafStructuredAdapterRejection[];
  outcome: "observed" | "partial" | "refused";
  graphEffect: "none";
  canonEffect: "none";
  receiptFingerprint: `sha256:${string}`;
}

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

export interface AsoiafStructuredAcquisitionReviewInput {
  plan: AsoiafStructuredRequestPlan;
  acquisitionReceipt: AsoiafStructuredAcquisitionReceipt;
  acquisitionReceiptUri: string;
  adapterReceipt: AsoiafStructuredAdapterReceipt;
  adapterReceiptUri: string;
  observation: AsoiafExternalReviewedObservation;
  admission: AsoiafStructuredObservationAdmission;
}

export interface AsoiafStructuredAcquisitionReviewPacketInput
  extends AsoiafStructuredAcquisitionReviewInput {
  packetId: string;
  continuityId: AsoiafExternalReviewedClaim["continuityId"];
  claims: AsoiafExternalReviewedClaim[];
}

export interface AsoiafStructuredAcquisitionReviewBinding {
  format: typeof ASOIAF_STRUCTURED_ACQUISITION_REVIEW_BINDING_FORMAT;
  sourceId: AsoiafStructuredAdapterSourceId;
  adapterId: AsoiafStructuredAdapterId;
  requestId: string;
  planFingerprint: `sha256:${string}`;
  requestedUrl: string;
  finalUrl: string;
  acquisitionReceiptId: string;
  acquisitionReceiptFingerprint: `sha256:${string}`;
  acquisitionReceiptUri: string;
  adapterReceiptFingerprint: `sha256:${string}`;
  adapterReceiptUri: string;
  sourceResponseDigest: `sha256:${string}`;
  sourceResponseBytes: number;
  normalizedObservationId: string;
  normalizedCandidateId: string;
  normalizedContentDigest: `sha256:${string}`;
  admissionId: string;
  admissionFingerprint: `sha256:${string}`;
  admissionOutcome: AsoiafStructuredObservationAdmission["outcome"];
  admissionReason: AsoiafStructuredObservationAdmission["reason"];
  admissionReviewedBy: string;
  admissionReviewedAt: string;
  admissionQuestionLaneIds: string[];
  collectorReceiptUri: string;
  robotsStatus: "allowed" | "absent";
  robotsDigest: `sha256:${string}` | null;
  httpStatus: number;
  responseMediaType: string;
  requestCount: number;
  waitedMilliseconds: number;
  redirectCount: number;
  acquisitionOutcome: "observed" | "partial" | "cache-hit";
  cacheReplay: boolean;
  rawResponseRetained: false;
  authorityRole: "supporting-only";
  graphEffect: "none";
  canonEffect: "none";
  bindingFingerprint: `sha256:${string}`;
}

export interface AsoiafStructuredAcquisitionReviewResult {
  binding: AsoiafStructuredAcquisitionReviewBinding;
  packet: AsoiafExternalReviewPacket;
  evidenceBundle: ReturnType<typeof buildAsoiafExternalEvidenceBundle>;
}

export interface AsoiafStructuredAcquisitionReviewFinding {
  code: string;
  subjectId: string;
  detail: string;
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

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
]);

function finding(
  code: string,
  subjectId: string,
  detail: string,
): AsoiafStructuredAcquisitionReviewFinding {
  return { code, subjectId, detail };
}

function validDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function safeRelativeUri(value: string): boolean {
  if (!value.trim() || path.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }
  if (value.includes("\\")) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
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

function planCore(
  plan: AsoiafStructuredRequestPlan,
): Omit<AsoiafStructuredRequestPlan, "planFingerprint"> {
  const { planFingerprint: _fingerprint, ...core } = plan;
  return core;
}

function adapterReceiptCore(
  receipt: AsoiafStructuredAdapterReceipt,
): Omit<AsoiafStructuredAdapterReceipt, "receiptFingerprint"> {
  const { receiptFingerprint: _fingerprint, ...core } = receipt;
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

function bindingCore(
  binding: AsoiafStructuredAcquisitionReviewBinding,
): Omit<AsoiafStructuredAcquisitionReviewBinding, "bindingFingerprint"> {
  const { bindingFingerprint: _fingerprint, ...core } = binding;
  return core;
}

export function validateAsoiafStructuredAcquisitionReviewInput(
  input: AsoiafStructuredAcquisitionReviewInput,
): AsoiafStructuredAcquisitionReviewFinding[] {
  const findings: AsoiafStructuredAcquisitionReviewFinding[] = [];
  const {
    plan,
    acquisitionReceipt,
    adapterReceipt,
    observation,
    admission,
  } = input;
  const source = getAsoiafExternalSource(plan.sourceId);
  const registered = REGISTERED_ENDPOINTS[plan.adapterId];
  const headers = new Map(
    Object.entries(plan.headers).map(([name, value]) => [name.toLowerCase(), value] as const),
  );

  if (plan.format !== ASOIAF_STRUCTURED_REQUEST_PLAN_FORMAT) {
    findings.push(finding("plan-format", plan.requestId, "request plan format is invalid"));
  }
  if (plan.planFingerprint !== sha256(planCore(plan))) {
    findings.push(finding("plan-fingerprint", plan.requestId, "request plan fingerprint is stale"));
  }
  if (!plan.requestId.trim() || plan.method !== "GET") {
    findings.push(finding("plan-identity", plan.requestId || "request", "request identity and GET method are required"));
  }
  if (plan.graphEffect !== "none" || plan.canonEffect !== "none") {
    findings.push(finding("plan-authority-leak", plan.requestId, "request plan acquired graph or canon effect"));
  }
  if (!Number.isSafeInteger(plan.recordLimit) || plan.recordLimit < 1 || plan.recordLimit > 500) {
    findings.push(finding("plan-record-limit", plan.requestId, "request plan record limit is outside 1 through 500"));
  }
  if (!registered.sourceIds.has(plan.sourceId)) {
    findings.push(finding("adapter-source-registration", plan.requestId, `${plan.sourceId} is not registered for ${plan.adapterId}`));
  }
  if (!source || source.harvestPolicy.mode !== "structured-cache-with-attribution") {
    findings.push(finding("source-harvest-contract", plan.sourceId, "source does not authorize structured acquisition"));
  }
  if (!endpointAllowed(plan.adapterId, plan.url)) {
    findings.push(finding("plan-endpoint", plan.requestId, "request plan escaped its registered HTTPS endpoint"));
  }
  if ([...headers.keys()].some((name) => SENSITIVE_HEADERS.has(name))) {
    findings.push(finding("plan-sensitive-header", plan.requestId, "request plan contains a credential-bearing header"));
  }
  if ([...headers.values()].some((value) => /[\r\n]/.test(value))) {
    findings.push(finding("plan-multiline-header", plan.requestId, "request plan contains a multiline header value"));
  }
  if (headers.get("user-agent") !== ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT) {
    findings.push(finding("plan-user-agent", plan.requestId, "request plan user agent differs from the qualified collector identity"));
  }

  if (adapterReceipt.format !== ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT) {
    findings.push(finding("adapter-receipt-format", plan.requestId, "adapter receipt format is invalid"));
  }
  if (adapterReceipt.receiptFingerprint !== sha256(adapterReceiptCore(adapterReceipt))) {
    findings.push(finding("adapter-receipt-fingerprint", plan.requestId, "adapter receipt fingerprint is stale"));
  }
  if (adapterReceipt.outcome !== "observed" && adapterReceipt.outcome !== "partial") {
    findings.push(finding("adapter-outcome", plan.requestId, "refused adapter output cannot enter review"));
  }
  if (adapterReceipt.graphEffect !== "none" || adapterReceipt.canonEffect !== "none") {
    findings.push(finding("adapter-authority-leak", plan.requestId, "adapter receipt acquired graph or canon effect"));
  }
  if (!validDigest(adapterReceipt.sourceResponseDigest) || adapterReceipt.sourceResponseBytes <= 0) {
    findings.push(finding("adapter-source-response", plan.requestId, "adapter receipt lacks a positive digest-bound source response"));
  }
  if (
    adapterReceipt.adapterId !== plan.adapterId
    || adapterReceipt.sourceId !== plan.sourceId
    || adapterReceipt.requestId !== plan.requestId
  ) {
    findings.push(finding("adapter-plan-mismatch", plan.requestId, "adapter receipt differs from the signed request plan"));
  }
  if (
    adapterReceipt.committedRecordCount !== adapterReceipt.observationIds.length
    || adapterReceipt.committedRecordCount !== adapterReceipt.candidateIds.length
    || adapterReceipt.committedRecordCount !== adapterReceipt.normalizedRecordIds.length
    || hasDuplicates(adapterReceipt.observationIds)
    || hasDuplicates(adapterReceipt.candidateIds)
    || hasDuplicates(adapterReceipt.normalizedRecordIds)
  ) {
    findings.push(finding("adapter-record-parity", plan.requestId, "adapter receipt record counts and identities do not agree"));
  }

  if (acquisitionReceipt.format !== ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT) {
    findings.push(finding("acquisition-receipt-format", plan.requestId, "acquisition receipt format is invalid"));
  }
  const acquisitionCore = acquisitionReceiptCore(acquisitionReceipt);
  const expectedReceiptFingerprint = sha256(acquisitionCore);
  if (acquisitionReceipt.receiptFingerprint !== expectedReceiptFingerprint) {
    findings.push(finding("acquisition-receipt-fingerprint", plan.requestId, "acquisition receipt fingerprint is stale"));
  }
  const expectedReceiptId = collectorContentId("asoiaf-structured-acquisition-receipt", {
    requestId: acquisitionReceipt.requestId,
    planFingerprint: acquisitionReceipt.planFingerprint,
    receiptFingerprint: expectedReceiptFingerprint,
  });
  if (acquisitionReceipt.receiptId !== expectedReceiptId) {
    findings.push(finding("acquisition-receipt-identity", plan.requestId, "acquisition receipt identity is not content bound"));
  }
  if (!["observed", "partial", "cache-hit"].includes(acquisitionReceipt.outcome)) {
    findings.push(finding("acquisition-outcome", plan.requestId, "unsuccessful acquisition cannot enter review"));
  }
  if (acquisitionReceipt.rawResponseRetained !== false) {
    findings.push(finding("raw-response-retention", plan.requestId, "raw response retention is forbidden"));
  }
  if (acquisitionReceipt.graphEffect !== "none" || acquisitionReceipt.canonEffect !== "none") {
    findings.push(finding("acquisition-authority-leak", plan.requestId, "acquisition receipt acquired graph or canon effect"));
  }
  if (
    acquisitionReceipt.adapterId !== plan.adapterId
    || acquisitionReceipt.sourceId !== plan.sourceId
    || acquisitionReceipt.requestId !== plan.requestId
    || acquisitionReceipt.planFingerprint !== plan.planFingerprint
    || acquisitionReceipt.requestedUrl !== plan.url
  ) {
    findings.push(finding("acquisition-plan-mismatch", plan.requestId, "acquisition receipt differs from the signed request plan"));
  }
  if (!acquisitionReceipt.finalUrl || !endpointAllowed(plan.adapterId, acquisitionReceipt.finalUrl)) {
    findings.push(finding("acquisition-final-endpoint", plan.requestId, "acquisition final route is absent or outside the registered endpoint"));
  }
  if (acquisitionReceipt.robotsStatus !== "allowed" && acquisitionReceipt.robotsStatus !== "absent") {
    findings.push(finding("acquisition-robots", plan.requestId, "acquisition did not pass a usable robots decision"));
  }
  if (acquisitionReceipt.robotsDigest !== null && !validDigest(acquisitionReceipt.robotsDigest)) {
    findings.push(finding("acquisition-robots-digest", plan.requestId, "robots digest is malformed"));
  }
  if (
    acquisitionReceipt.httpStatus === null
    || acquisitionReceipt.httpStatus < 200
    || acquisitionReceipt.httpStatus > 299
    || acquisitionReceipt.responseMediaType === null
    || !/^application\/(?:json|sparql-results\+json)(?:\s*;|$)/i.test(acquisitionReceipt.responseMediaType)
  ) {
    findings.push(finding("acquisition-http-result", plan.requestId, "acquisition lacks a successful bounded JSON result"));
  }
  if (
    !validDigest(acquisitionReceipt.sourceResponseDigest)
    || acquisitionReceipt.responseBytes <= 0
    || acquisitionReceipt.sourceResponseDigest !== adapterReceipt.sourceResponseDigest
    || acquisitionReceipt.responseBytes !== adapterReceipt.sourceResponseBytes
  ) {
    findings.push(finding("raw-response-custody", plan.requestId, "acquisition and adapter raw-response custody do not agree"));
  }
  if (acquisitionReceipt.adapterReceiptFingerprint !== adapterReceipt.receiptFingerprint) {
    findings.push(finding("adapter-acquisition-fingerprint", plan.requestId, "acquisition does not bind the supplied adapter receipt"));
  }
  if (
    acquisitionReceipt.committedRecordCount !== adapterReceipt.committedRecordCount
    || !arraysEqual(acquisitionReceipt.observationIds, adapterReceipt.observationIds)
    || !arraysEqual(acquisitionReceipt.candidateIds, adapterReceipt.candidateIds)
  ) {
    findings.push(finding("acquisition-adapter-parity", plan.requestId, "acquisition and adapter committed identities do not agree"));
  }
  if (
    acquisitionReceipt.outcome === "cache-hit"
      ? acquisitionReceipt.requestCount !== 0
      : acquisitionReceipt.requestCount <= 0
  ) {
    findings.push(finding("acquisition-request-count", plan.requestId, "request count is incompatible with the acquisition outcome"));
  }

  if (
    observation.sourceId !== plan.sourceId
    || !acquisitionReceipt.observationIds.includes(observation.observationId)
    || !acquisitionReceipt.candidateIds.includes(observation.collectorCandidateId)
  ) {
    findings.push(finding("reviewed-observation-parity", observation.observationId, "reviewed observation is absent from the acquisition custody chain"));
  }
  if (!validDigest(observation.contentDigest) || observation.responseBytes <= 0) {
    findings.push(finding("normalized-observation-custody", observation.observationId, "reviewed observation lacks a positive normalized digest and byte count"));
  }
  if (!admission) {
    findings.push(
      finding(
        "admission-missing",
        observation.observationId,
        "structured observation admission disposition is required",
      ),
    );
  } else {
    for (const admissionFinding of validateAsoiafStructuredObservationAdmission(admission)) {
      findings.push(
        finding(
          `admission-${admissionFinding.code}`,
          admissionFinding.subjectId,
          admissionFinding.detail,
        ),
      );
    }
    if (admission.outcome !== "admit-to-review") {
      findings.push(
        finding(
          "observation-not-admitted",
          admission.admissionId,
          `structured observation disposition is ${admission.outcome}`,
        ),
      );
    }
    if (
      admission.sourceId !== plan.sourceId
      || admission.adapterId !== plan.adapterId
      || admission.requestId !== plan.requestId
      || admission.planFingerprint !== plan.planFingerprint
      || admission.acquisitionReceiptId !== acquisitionReceipt.receiptId
      || admission.acquisitionReceiptFingerprint !== acquisitionReceipt.receiptFingerprint
      || admission.adapterReceiptFingerprint !== adapterReceipt.receiptFingerprint
      || admission.observationId !== observation.observationId
      || admission.candidateId !== observation.collectorCandidateId
      || admission.normalizedContentDigest !== observation.contentDigest
      || admission.reviewedBy !== observation.reviewerId
    ) {
      findings.push(
        finding(
          "admission-custody-parity",
          admission.admissionId,
          "admission disposition differs from the signed plan, receipts, reviewed observation, candidate, digest, or reviewer",
        ),
      );
    }
  }
  if (
    !safeRelativeUri(input.acquisitionReceiptUri)
    || !safeRelativeUri(input.adapterReceiptUri)
    || !safeRelativeUri(observation.receiptUri)
  ) {
    findings.push(finding("unsafe-receipt-uri", observation.observationId, "receipt URIs must remain safe estate-relative paths"));
  }

  return findings.sort(
    (left, right) => left.code.localeCompare(right.code) || left.subjectId.localeCompare(right.subjectId),
  );
}

export function buildAsoiafStructuredAcquisitionReviewBinding(
  input: AsoiafStructuredAcquisitionReviewInput,
): AsoiafStructuredAcquisitionReviewBinding {
  const findings = validateAsoiafStructuredAcquisitionReviewInput(input);
  if (findings.length > 0) {
    throw new Error(
      `invalid structured acquisition review input: ${findings
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  const {
    plan,
    acquisitionReceipt,
    adapterReceipt,
    observation,
    admission,
  } = input;
  assertAsoiafStructuredObservationAdmitted(admission);
  const core = {
    format: ASOIAF_STRUCTURED_ACQUISITION_REVIEW_BINDING_FORMAT,
    sourceId: plan.sourceId,
    adapterId: plan.adapterId,
    requestId: plan.requestId,
    planFingerprint: plan.planFingerprint,
    requestedUrl: plan.url,
    finalUrl: acquisitionReceipt.finalUrl!,
    acquisitionReceiptId: acquisitionReceipt.receiptId,
    acquisitionReceiptFingerprint: acquisitionReceipt.receiptFingerprint,
    acquisitionReceiptUri: input.acquisitionReceiptUri,
    adapterReceiptFingerprint: adapterReceipt.receiptFingerprint,
    adapterReceiptUri: input.adapterReceiptUri,
    sourceResponseDigest: acquisitionReceipt.sourceResponseDigest!,
    sourceResponseBytes: acquisitionReceipt.responseBytes,
    normalizedObservationId: observation.observationId,
    normalizedCandidateId: observation.collectorCandidateId,
    normalizedContentDigest: observation.contentDigest,
    admissionId: admission.admissionId,
    admissionFingerprint: admission.admissionFingerprint,
    admissionOutcome: admission.outcome,
    admissionReason: admission.reason,
    admissionReviewedBy: admission.reviewedBy,
    admissionReviewedAt: admission.reviewedAt,
    admissionQuestionLaneIds: [...admission.questionLaneIds],
    collectorReceiptUri: observation.receiptUri,
    robotsStatus: acquisitionReceipt.robotsStatus as "allowed" | "absent",
    robotsDigest: acquisitionReceipt.robotsDigest,
    httpStatus: acquisitionReceipt.httpStatus!,
    responseMediaType: acquisitionReceipt.responseMediaType!,
    requestCount: acquisitionReceipt.requestCount,
    waitedMilliseconds: acquisitionReceipt.waitedMilliseconds,
    redirectCount: acquisitionReceipt.redirectCount,
    acquisitionOutcome: acquisitionReceipt.outcome as "observed" | "partial" | "cache-hit",
    cacheReplay: acquisitionReceipt.outcome === "cache-hit",
    rawResponseRetained: false as const,
    authorityRole: "supporting-only" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return { ...core, bindingFingerprint: sha256(core) };
}

export function validateAsoiafStructuredAcquisitionReviewBinding(
  binding: AsoiafStructuredAcquisitionReviewBinding,
): AsoiafStructuredAcquisitionReviewFinding[] {
  const findings: AsoiafStructuredAcquisitionReviewFinding[] = [];
  if (binding.format !== ASOIAF_STRUCTURED_ACQUISITION_REVIEW_BINDING_FORMAT) {
    findings.push(finding("binding-format", binding.requestId, "review binding format is invalid"));
  }
  if (binding.bindingFingerprint !== sha256(bindingCore(binding))) {
    findings.push(finding("binding-fingerprint", binding.requestId, "review binding fingerprint is stale"));
  }
  if (
    !validDigest(binding.planFingerprint)
    || !validDigest(binding.acquisitionReceiptFingerprint)
    || !validDigest(binding.adapterReceiptFingerprint)
    || !validDigest(binding.sourceResponseDigest)
    || !validDigest(binding.normalizedContentDigest)
    || !validDigest(binding.admissionFingerprint)
  ) {
    findings.push(finding("binding-digest", binding.requestId, "review binding contains a malformed digest"));
  }
  if (
    binding.rawResponseRetained !== false
    || binding.authorityRole !== "supporting-only"
    || binding.admissionOutcome !== "admit-to-review"
    || (
      binding.admissionReason !== "exact-identity-and-question-match"
      && binding.admissionReason !== "bounded-relevant-metadata"
    )
    || !binding.admissionReviewedBy.trim()
    || !Number.isFinite(Date.parse(binding.admissionReviewedAt))
    || binding.admissionQuestionLaneIds.length === 0
    || binding.graphEffect !== "none"
    || binding.canonEffect !== "none"
  ) {
    findings.push(finding("binding-authority", binding.requestId, "review binding crossed its retention or authority boundary"));
  }
  return findings;
}

export function buildAsoiafStructuredAcquisitionReviewPacket(
  input: AsoiafStructuredAcquisitionReviewPacketInput,
): AsoiafStructuredAcquisitionReviewResult {
  if (input.claims.some((claim) => claim.authorityRole !== "supporting")) {
    throw new Error("structured acquisition claims may enter reconciliation only as supporting evidence");
  }
  const binding = buildAsoiafStructuredAcquisitionReviewBinding(input);
  const boundObservation = {
    ...input.observation,
    acquisitionBindingFingerprint: binding.bindingFingerprint,
    acquisitionReceiptId: binding.acquisitionReceiptId,
    acquisitionReceiptFingerprint: binding.acquisitionReceiptFingerprint,
    acquisitionReceiptUri: binding.acquisitionReceiptUri,
    adapterReceiptFingerprint: binding.adapterReceiptFingerprint,
    adapterReceiptUri: binding.adapterReceiptUri,
    structuredAdmissionId: binding.admissionId,
    structuredAdmissionFingerprint: binding.admissionFingerprint,
    structuredAdmissionOutcome: binding.admissionOutcome,
    structuredAdmissionReason: binding.admissionReason,
    structuredAdmissionReviewedBy: binding.admissionReviewedBy,
    structuredAdmissionReviewedAt: binding.admissionReviewedAt,
    structuredAdmissionQuestionLaneIds: binding.admissionQuestionLaneIds,
  } as AsoiafExternalReviewedObservation;
  const claims = input.claims.map((claim) => ({
    ...claim,
    normalized: {
      ...claim.normalized,
      acquisitionBindingFingerprint: binding.bindingFingerprint,
      acquisitionRequestId: binding.requestId,
      acquisitionPlanFingerprint: binding.planFingerprint,
      acquisitionReceiptId: binding.acquisitionReceiptId,
      acquisitionReceiptFingerprint: binding.acquisitionReceiptFingerprint,
      acquisitionReceiptUri: binding.acquisitionReceiptUri,
      acquisitionAdapterReceiptFingerprint: binding.adapterReceiptFingerprint,
      acquisitionAdapterReceiptUri: binding.adapterReceiptUri,
      acquisitionSourceResponseDigest: binding.sourceResponseDigest,
      acquisitionSourceResponseBytes: binding.sourceResponseBytes,
      acquisitionRobotsStatus: binding.robotsStatus,
      acquisitionRobotsDigest: binding.robotsDigest ?? "none",
      acquisitionRequestCount: binding.requestCount,
      acquisitionRedirectCount: binding.redirectCount,
      acquisitionCacheReplay: binding.cacheReplay,
      acquisitionRawResponseRetained: false,
      normalizedObservationDigest: binding.normalizedContentDigest,
      structuredAdmissionId: binding.admissionId,
      structuredAdmissionFingerprint: binding.admissionFingerprint,
      structuredAdmissionOutcome: binding.admissionOutcome,
      structuredAdmissionReason: binding.admissionReason,
      structuredAdmissionReviewedBy: binding.admissionReviewedBy,
      structuredAdmissionReviewedAt: binding.admissionReviewedAt,
      structuredAdmissionQuestionLaneIds: binding.admissionQuestionLaneIds,
    },
  }));
  const packet = buildAsoiafExternalReviewPacket({
    id: input.packetId,
    sourceId: input.plan.sourceId,
    continuityId: input.continuityId,
    observation: boundObservation,
    claims,
  });
  const verification = verifyAsoiafStructuredAcquisitionReviewPacket(packet, binding);
  if (verification.length > 0) {
    throw new Error(
      `invalid acquisition-bound review packet: ${verification
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  return {
    binding,
    packet,
    evidenceBundle: buildAsoiafExternalEvidenceBundle(packet),
  };
}

export function verifyAsoiafStructuredAcquisitionReviewPacket(
  packet: AsoiafExternalReviewPacket,
  binding: AsoiafStructuredAcquisitionReviewBinding,
): AsoiafStructuredAcquisitionReviewFinding[] {
  const findings = [...validateAsoiafStructuredAcquisitionReviewBinding(binding)];
  for (const packetFinding of validateAsoiafExternalReviewPacket(packet)) {
    if (packetFinding.severity === "error") {
      findings.push(
        finding(
          `packet-${packetFinding.code}`,
          packetFinding.subjectId,
          packetFinding.detail,
        ),
      );
    }
  }
  const observation = packet.observation as unknown as Record<string, unknown>;
  if (
    packet.sourceId !== binding.sourceId
    || packet.observation.observationId !== binding.normalizedObservationId
    || packet.observation.collectorCandidateId !== binding.normalizedCandidateId
    || packet.observation.contentDigest !== binding.normalizedContentDigest
  ) {
    findings.push(finding("packet-binding-parity", packet.id, "packet observation differs from the acquisition binding"));
  }
  if (
    observation.acquisitionBindingFingerprint !== binding.bindingFingerprint
    || observation.acquisitionReceiptId !== binding.acquisitionReceiptId
    || observation.acquisitionReceiptFingerprint !== binding.acquisitionReceiptFingerprint
    || observation.adapterReceiptFingerprint !== binding.adapterReceiptFingerprint
    || observation.structuredAdmissionId !== binding.admissionId
    || observation.structuredAdmissionFingerprint !== binding.admissionFingerprint
    || observation.structuredAdmissionOutcome !== "admit-to-review"
  ) {
    findings.push(finding("packet-observation-binding", packet.id, "packet observation omitted acquisition receipt custody"));
  }
  for (const claim of packet.claims) {
    if (
      claim.authorityRole !== "supporting"
      || claim.normalized.acquisitionBindingFingerprint !== binding.bindingFingerprint
      || claim.normalized.acquisitionSourceResponseDigest !== binding.sourceResponseDigest
      || claim.normalized.normalizedObservationDigest !== binding.normalizedContentDigest
      || claim.normalized.acquisitionRawResponseRetained !== false
    || claim.normalized.structuredAdmissionId !== binding.admissionId
    || claim.normalized.structuredAdmissionFingerprint !== binding.admissionFingerprint
    || claim.normalized.structuredAdmissionOutcome !== "admit-to-review"
    ) {
      findings.push(finding("claim-binding-parity", claim.id, "claim omitted acquisition custody or exceeded supporting authority"));
    }
  }
  return findings.sort(
    (left, right) => left.code.localeCompare(right.code) || left.subjectId.localeCompare(right.subjectId),
  );
}