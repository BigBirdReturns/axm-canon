import {
  compareCodepoints,
  orderedStrings,
} from "../../../src/runtime/determinism.js";
import { narrativeFingerprint } from "../../../src/runtime/fingerprint.js";
import type {
  AsoiafExternalAccessMethod,
  AsoiafExternalAuthorityClass,
  AsoiafExternalCollectionCandidate,
  AsoiafExternalCollectionObservation,
  AsoiafExternalContentClass,
  AsoiafExternalContinuity,
  AsoiafExternalQueryLane,
  AsoiafExternalRole,
  AsoiafExternalSource,
} from "./types.js";
import {
  ASOIAF_EXTERNAL_COLLECTION_CANDIDATE_FORMAT,
  ASOIAF_EXTERNAL_COLLECTION_OBSERVATION_FORMAT,
} from "./types.js";

function canonicalAccessMethods(
  methods: readonly AsoiafExternalAccessMethod[],
): AsoiafExternalAccessMethod[] {
  return [...methods].sort(
    (left, right) =>
      compareCodepoints(left.kind, right.kind)
      || compareCodepoints(left.uri, right.uri),
  );
}

export function canonicalAsoiafExternalSource(
  source: AsoiafExternalSource,
): AsoiafExternalSource {
  return {
    ...source,
    continuityIds: orderedStrings(
      source.continuityIds,
    ) as AsoiafExternalContinuity[],
    roles: orderedStrings(source.roles) as AsoiafExternalRole[],
    contentClasses: orderedStrings(
      source.contentClasses,
    ) as AsoiafExternalContentClass[],
    accessMethods: canonicalAccessMethods(source.accessMethods),
    strengths: orderedStrings(source.strengths),
    cautions: orderedStrings(source.cautions),
    coverageObservations: orderedStrings(source.coverageObservations),
    sourceHintRoutes: orderedStrings(source.sourceHintRoutes),
    queryTemplates: orderedStrings(source.queryTemplates),
  };
}

export function canonicalAsoiafExternalQueryLane(
  lane: AsoiafExternalQueryLane,
): AsoiafExternalQueryLane {
  return {
    ...lane,
    aliases: orderedStrings(lane.aliases),
    preferredAuthorityClasses: orderedStrings(
      lane.preferredAuthorityClasses,
    ) as AsoiafExternalAuthorityClass[],
    supportingAuthorityClasses: orderedStrings(
      lane.supportingAuthorityClasses,
    ) as AsoiafExternalAuthorityClass[],
    preferredSourceIds: orderedStrings(lane.preferredSourceIds),
    requiredRoles: orderedStrings(lane.requiredRoles) as AsoiafExternalRole[],
  };
}

export function asoiafExternalSourceFingerprint(
  source: AsoiafExternalSource,
): string {
  return narrativeFingerprint(canonicalAsoiafExternalSource(source));
}

export function asoiafExternalLaneFingerprint(
  lane: AsoiafExternalQueryLane,
): string {
  return narrativeFingerprint(canonicalAsoiafExternalQueryLane(lane));
}

export function isSha256Digest(value: string): value is `sha256:${string}` {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

export function asoiafExternalCandidateId(
  sourceId: string,
  sourceRecordId: string,
): string {
  return `asoiaf-external-candidate:${narrativeFingerprint({
    sourceId,
    sourceRecordId,
  }).slice("fnv1a32:".length)}`;
}

export function asoiafExternalObservationId(input: {
  sourceId: string;
  sourceRecordId: string;
  contentDigest: `sha256:${string}`;
}): string {
  return `asoiaf-external-observation:${narrativeFingerprint({
    sourceId: input.sourceId,
    sourceRecordId: input.sourceRecordId,
    contentDigest: input.contentDigest,
  }).slice("fnv1a32:".length)}`;
}

export function containsPrivateContact(value: unknown): boolean {
  const text = JSON.stringify(value);
  const explicitInternationalPhone =
    /\+\d{1,3}[ .-]?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}\b/;
  const labelledPhone =
    /\b(?:tel(?:ephone)?|phone|mobile|call|sms)\b[^\d+]{0,12}\+?\d[\d ().-]{8,}\d/i;
  return (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /\b(?:phone|mobile|street[_ -]?address|mailing[_ -]?address|point[_ -]?of[_ -]?contact)\b/i.test(
      text,
    )
    || explicitInternationalPhone.test(text)
    || labelledPhone.test(text)
  );
}

export function buildAsoiafExternalObservation(input: {
  sourceId: string;
  sourceRecordId: string;
  retrievedAt: string;
  contentDigest: `sha256:${string}`;
  receiptUri: string;
  retainedFields: string[];
  status?: AsoiafExternalCollectionObservation["status"];
  retainedValue?: unknown;
}): AsoiafExternalCollectionObservation {
  if (!isSha256Digest(input.contentDigest)) {
    throw new Error("external observation requires a lowercase sha256 digest");
  }
  if (input.retainedValue !== undefined && containsPrivateContact(input.retainedValue)) {
    throw new Error("external observation retained private contact data");
  }
  const candidateId = asoiafExternalCandidateId(
    input.sourceId,
    input.sourceRecordId,
  );
  return {
    format: ASOIAF_EXTERNAL_COLLECTION_OBSERVATION_FORMAT,
    observationId: asoiafExternalObservationId(input),
    candidateId,
    sourceId: input.sourceId,
    sourceRecordId: input.sourceRecordId,
    retrievedAt: input.retrievedAt,
    contentDigest: input.contentDigest,
    receiptUri: input.receiptUri,
    retainedFields: orderedStrings(input.retainedFields),
    graphEffect: "none",
    canonEffect: "none",
    status: input.status ?? "observed",
  };
}

export function buildAsoiafExternalCandidate(
  observation: AsoiafExternalCollectionObservation,
  existing?: AsoiafExternalCollectionCandidate,
): AsoiafExternalCollectionCandidate {
  if (existing && existing.candidateId !== observation.candidateId) {
    throw new Error("cannot merge observations from different candidates");
  }
  return {
    format: ASOIAF_EXTERNAL_COLLECTION_CANDIDATE_FORMAT,
    candidateId: observation.candidateId,
    sourceId: observation.sourceId,
    sourceRecordId: observation.sourceRecordId,
    observationIds: orderedStrings([
      ...(existing?.observationIds ?? []),
      observation.observationId,
    ].filter((value, index, values) => values.indexOf(value) === index)),
    firstSeen: existing?.firstSeen ?? observation.retrievedAt,
    lastSeen: observation.retrievedAt,
    graphEffect: "none",
    canonEffect: "none",
    promotionStatus: existing?.promotionStatus ?? "intake-only",
  };
}

export function asoiafExternalCreditRequired(
  source: AsoiafExternalSource,
): boolean {
  return source.rightsMode === "cc-by" || source.rightsMode === "cc-by-sa";
}
