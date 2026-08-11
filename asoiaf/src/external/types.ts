export const ASOIAF_EXTERNAL_SOURCE_FORMAT =
  "axm-asoiaf-external-source/1" as const;
export const ASOIAF_EXTERNAL_QUERY_LANE_FORMAT =
  "axm-asoiaf-external-query-lane/1" as const;
export const ASOIAF_EXTERNAL_HARVEST_WORK_ORDER_FORMAT =
  "axm-asoiaf-external-harvest-work-order/1" as const;
export const ASOIAF_EXTERNAL_ATLAS_MANIFEST_FORMAT =
  "axm-asoiaf-external-atlas-manifest/1" as const;
export const ASOIAF_EXTERNAL_COLLECTION_OBSERVATION_FORMAT =
  "axm-asoiaf-external-observation/1" as const;
export const ASOIAF_EXTERNAL_COLLECTION_CANDIDATE_FORMAT =
  "axm-asoiaf-external-candidate/1" as const;
export const ASOIAF_EXTERNAL_SOURCE_LEDGER_ROW_FORMAT =
  "axm-asoiaf-external-source-ledger-row/1" as const;

export type AsoiafExternalAuthorityClass =
  | "primary-text"
  | "companion-text"
  | "released-author-text"
  | "author-statement"
  | "adaptation-canon"
  | "production-testimony"
  | "licensed-reference"
  | "official-bibliography"
  | "structured-dataset"
  | "community-reference"
  | "community-analysis"
  | "discussion-provenance"
  | "scholarly-analogue"
  | "archival-custody"
  | "discovery-only";

export type AsoiafExternalSourcePlane =
  | "local-primary"
  | "official-author"
  | "official-adaptation"
  | "publisher-reference"
  | "structured-tool"
  | "community-reference"
  | "community-analysis"
  | "discussion"
  | "scholarly"
  | "archive"
  | "discovery";

export type AsoiafExternalContinuity =
  | "book-main"
  | "book-companion"
  | "released-future-book"
  | "author-statement"
  | "hbo-got"
  | "hbo-hotd"
  | "production-testimony"
  | "cross-continuity"
  | "analysis"
  | "historical-analogue"
  | "scientific-analogue";

export type AsoiafExternalRole =
  | "exact-quotation"
  | "entity-resolution"
  | "genealogy-parentage"
  | "succession-legitimacy"
  | "chronology"
  | "geography-travel"
  | "dragons"
  | "magic-world-physics"
  | "religion-sacrifice"
  | "varys-rhllor"
  | "prophecy"
  | "actor-knowledge"
  | "military-logistics"
  | "economics-smallfolk"
  | "law-governance"
  | "dance-of-dragons"
  | "blackfyres"
  | "others-long-night"
  | "language"
  | "author-intent"
  | "production-intent"
  | "adaptation-deltas"
  | "episode-dialogue"
  | "historical-analogue"
  | "religious-analogue"
  | "scientific-analogue"
  | "community-consensus"
  | "theory-provenance"
  | "chapter-analysis"
  | "publication-history"
  | "edition-resolution"
  | "maps"
  | "networks"
  | "fandom-history"
  | "endgame-closure"
  | "hotd-endpoints"
  | "heraldry"
  | "food-agriculture"
  | "medicine-disease"
  | "gender-kinship"
  | "death-status"
  | "literary-influences"
  | "dataset-validation"
  | "archive-recovery"
  | "international-reference";

export type AsoiafExternalContentClass =
  | "book-text"
  | "sample-text"
  | "episode"
  | "script"
  | "subtitle"
  | "statement"
  | "interview"
  | "production-feature"
  | "reference-article"
  | "chapter-guide"
  | "family-tree"
  | "timeline"
  | "map"
  | "dataset"
  | "forum-thread"
  | "podcast"
  | "video"
  | "social-post"
  | "bibliographic-record"
  | "finding-aid"
  | "scholarly-source"
  | "search-index";

export type AsoiafExternalAccessKind =
  | "local-file"
  | "html"
  | "mediawiki-api"
  | "rest-api"
  | "rss"
  | "dataset-download"
  | "search-ui"
  | "archive-api"
  | "podcast-feed"
  | "video-channel"
  | "social-search";

export type AsoiafExternalRightsMode =
  | "user-controlled-private"
  | "public-domain"
  | "cc0"
  | "cc-by"
  | "cc-by-sa"
  | "publisher-copyright"
  | "unknown-review-required"
  | "link-only";

export type AsoiafExternalHarvestMode =
  | "local-private-only"
  | "route-only-no-mirror"
  | "manual-rights-review"
  | "structured-cache-with-attribution"
  | "metadata-and-bounded-excerpt"
  | "metadata-only";

export type AsoiafExternalVerificationStatus =
  | "verified-route"
  | "verified-schema"
  | "unverified"
  | "manual-only"
  | "retired";

export interface AsoiafExternalAccessMethod {
  kind: AsoiafExternalAccessKind;
  uri: string;
  machineReadable: boolean;
  credential: "none" | "user-copy" | "session" | "api-key";
  notes: string;
}

export interface AsoiafExternalHarvestPolicy {
  mode: AsoiafExternalHarvestMode;
  robotsRespect: true;
  hostDelayMs: number;
  maxRequestsPerRun: number;
  maxResponseBytes: number;
  retryCount: number;
  refreshDays: number | null;
  retainRawBody: boolean;
  excerptMaxChars: number;
  requiresHumanReview: true;
}

export interface AsoiafExternalSource {
  format: typeof ASOIAF_EXTERNAL_SOURCE_FORMAT;
  id: string;
  label: string;
  canonicalUri: string;
  sourcePlane: AsoiafExternalSourcePlane;
  authorityClass: AsoiafExternalAuthorityClass;
  continuityIds: AsoiafExternalContinuity[];
  roles: AsoiafExternalRole[];
  contentClasses: AsoiafExternalContentClass[];
  accessMethods: AsoiafExternalAccessMethod[];
  harvestPolicy: AsoiafExternalHarvestPolicy;
  rightsMode: AsoiafExternalRightsMode;
  verificationStatus: AsoiafExternalVerificationStatus;
  strengths: string[];
  cautions: string[];
  coverageObservations: string[];
  sourceHintRoutes: string[];
  queryTemplates: string[];
}

export type AsoiafExternalContinuityPolicy =
  | "same-continuity-required"
  | "separate-continuities"
  | "cross-continuity-explicit"
  | "analogue-only";

export interface AsoiafExternalResponsePolicy {
  verbatimHandling:
    | "exact-local-locator"
    | "bounded-public-excerpt"
    | "locate-only-no-mirror";
  attributionRequired: boolean;
  communityStanding: "supporting-only" | "provenance-only" | "not-applicable";
  analogueStanding: "constraint-only" | "not-applicable";
}

export interface AsoiafExternalQueryLane {
  format: typeof ASOIAF_EXTERNAL_QUERY_LANE_FORMAT;
  id: AsoiafExternalRole;
  label: string;
  aliases: string[];
  preferredAuthorityClasses: AsoiafExternalAuthorityClass[];
  supportingAuthorityClasses: AsoiafExternalAuthorityClass[];
  preferredSourceIds: string[];
  requiredRoles: AsoiafExternalRole[];
  continuityPolicy: AsoiafExternalContinuityPolicy;
  responsePolicy: AsoiafExternalResponsePolicy;
}

export type AsoiafExternalCollectionStep =
  | "establish-source-custody"
  | "check-robots-and-terms"
  | "discover-schema"
  | "fetch-bounded-records"
  | "hash-source-record"
  | "normalize-whitelisted-fields"
  | "block-private-contact"
  | "write-immutable-observation"
  | "deduplicate-candidate"
  | "generate-credit-if-required"
  | "reconcile-held-candidates"
  | "record-honest-terminal-result";

export interface AsoiafExternalHarvestWorkOrder {
  format: typeof ASOIAF_EXTERNAL_HARVEST_WORK_ORDER_FORMAT;
  id: string;
  sourceId: string;
  sourceFingerprint: string;
  laneIds: AsoiafExternalRole[];
  sourceHintIds: string[];
  candidateIds: string[];
  collectionSteps: AsoiafExternalCollectionStep[];
  reviewActions: Array<
    "confirm" | "correct" | "split" | "merge" | "reject" | "defer"
  >;
  receiptRequirements: string[];
  promotionForbiddenUntil: string[];
  workOrderFingerprint: string;
}

export interface AsoiafExternalAtlasManifest {
  format: typeof ASOIAF_EXTERNAL_ATLAS_MANIFEST_FORMAT;
  universeId: "asoiaf";
  sourceIds: string[];
  laneIds: AsoiafExternalRole[];
  workOrderIds: string[];
  authorityClasses: AsoiafExternalAuthorityClass[];
  sourceCount: number;
  laneCount: number;
  workOrderCount: number;
  sourceLaneEdgeCount: number;
  heldCandidateCount: number;
  routedCandidateCount: number;
  countsByPlane: Record<AsoiafExternalSourcePlane, number>;
  countsByAuthority: Record<AsoiafExternalAuthorityClass, number>;
  atlasFingerprint: string;
}

export interface AsoiafExternalRouteRequest {
  text: string;
  continuityIds?: AsoiafExternalContinuity[];
  laneIds?: AsoiafExternalRole[];
  limit?: number;
}

export interface AsoiafExternalRouteSource {
  sourceId: string;
  score: number;
  reasons: string[];
}

export interface AsoiafExternalRouteResult {
  request: AsoiafExternalRouteRequest;
  laneIds: AsoiafExternalRole[];
  sources: AsoiafExternalRouteSource[];
  responsePolicies: AsoiafExternalResponsePolicy[];
  routeFingerprint: string;
}

export interface AsoiafExternalCollectionObservation {
  format: typeof ASOIAF_EXTERNAL_COLLECTION_OBSERVATION_FORMAT;
  observationId: string;
  candidateId: string;
  sourceId: string;
  sourceRecordId: string;
  retrievedAt: string;
  contentDigest: `sha256:${string}`;
  receiptUri: string;
  retainedFields: string[];
  graphEffect: "none";
  canonEffect: "none";
  status: "observed" | "rejected" | "unavailable" | "ambiguous";
}

export interface AsoiafExternalCollectionCandidate {
  format: typeof ASOIAF_EXTERNAL_COLLECTION_CANDIDATE_FORMAT;
  candidateId: string;
  sourceId: string;
  sourceRecordId: string;
  observationIds: string[];
  firstSeen: string;
  lastSeen: string;
  graphEffect: "none";
  canonEffect: "none";
  promotionStatus: "intake-only" | "review-pending" | "reviewed";
}

export interface AsoiafExternalSourceLedgerRow {
  format: typeof ASOIAF_EXTERNAL_SOURCE_LEDGER_ROW_FORMAT;
  sourceId: string;
  represented: boolean;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  observationCount: number;
  candidateCount: number;
  gapCount: number;
  creditRequired: boolean;
  creditRecordCount: number;
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafExternalFinding {
  code: string;
  severity: "error" | "warning" | "notice";
  subjectId: string;
  detail: string;
}
