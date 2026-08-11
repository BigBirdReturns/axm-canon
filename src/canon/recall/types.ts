import type { CanonScalar } from "../types.js";

export const CANON_RECALL_PACKET_FORMAT = "axm-canon-recall-packet/1" as const;
export const CANON_RECALL_ESTATE_MANIFEST_FORMAT = "axm-canon-recall-estate-manifest/1" as const;

export type CanonRecallDomain =
  | "core-entities"
  | "lineage-claims"
  | "chronology-geography"
  | "actor-knowledge"
  | "material-logistics"
  | "magic-physics"
  | "narrative-functions"
  | "adaptation-deltas"
  | "endgame-coordinates"
  | "smallfolk-systems";

export type CanonRecallKind =
  | "entity"
  | "relation"
  | "proposition"
  | "event"
  | "event-chain"
  | "knowledge"
  | "state"
  | "rule"
  | "function"
  | "decision"
  | "endpoint"
  | "question";

export type CanonRecallGenerator =
  | "language-model-recall"
  | "conversation-synthesis";

export type CanonRecallValue = CanonScalar | CanonScalar[];

export interface CanonRecallCandidate {
  id: string;
  domain: CanonRecallDomain;
  kind: CanonRecallKind;
  label: string;
  summary: string;
  confidencePermille: number;
  sourceHints: string[];
  continuityHints: string[];
  normalized: Record<string, CanonRecallValue>;
  reconciliationKeys: string[];
  tags: string[];
}

export interface CanonRecallPacket {
  format: typeof CANON_RECALL_PACKET_FORMAT;
  id: string;
  universeId: string;
  scope: string;
  generatedBy: CanonRecallGenerator;
  knowledgeCutoff: string;
  authority: "none";
  compilationEligible: false;
  candidates: CanonRecallCandidate[];
  openQuestions: string[];
  notes: string;
}

export interface CanonRecallSourceHint {
  id: string;
  label: string;
  category: string;
  standing:
    | "placeholder-only"
    | "requires-exact-venue-and-locator"
    | "requires-bounded-source";
  continuityHint: string;
}

export type CanonRecallFindingSeverity = "error" | "warning" | "notice";

export interface CanonRecallFinding {
  code: string;
  severity: CanonRecallFindingSeverity;
  subjectId: string;
  detail: string;
}

export interface CanonRecallEstateManifest {
  format: typeof CANON_RECALL_ESTATE_MANIFEST_FORMAT;
  universeId: string;
  packetIds: string[];
  packetFingerprints: Array<{ packetId: string; fingerprint: string }>;
  candidateIds: string[];
  packetCount: number;
  candidateCount: number;
  countsByDomain: Record<CanonRecallDomain, number>;
  countsByKind: Record<CanonRecallKind, number>;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  manifestFingerprint: string;
}

export interface CanonRecallQuery {
  domains?: CanonRecallDomain[];
  kinds?: CanonRecallKind[];
  tags?: string[];
  sourceHints?: string[];
  minimumConfidencePermille?: number;
  text?: string;
}
