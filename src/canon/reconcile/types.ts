import type {
  CanonRecallCandidate,
  CanonRecallDomain,
  CanonRecallKind,
  CanonRecallValue,
} from "../recall/index.js";

export const CANON_RECONCILIATION_WORK_ORDER_FORMAT =
  "axm-canon-reconciliation-work-order/1" as const;
export const CANON_EVIDENCE_BUNDLE_FORMAT =
  "axm-canon-evidence-bundle/1" as const;
export const CANON_REVIEW_DECISION_SET_FORMAT =
  "axm-canon-review-decision-set/1" as const;
export const CANON_RECONCILIATION_RECEIPT_FORMAT =
  "axm-canon-reconciliation-receipt/1" as const;

export type CanonReconciliationLane =
  | "direct-source"
  | "cross-source-context"
  | "disputed"
  | "high-leverage"
  | "foundational";

export interface CanonReconciliationWorkOrderRequest {
  id: string;
  universeId: string;
  sourceHintIds: string[];
  contextDepth: number;
}

export interface CanonReconciliationCluster {
  id: string;
  candidateIds: string[];
  reconciliationKeys: string[];
  domainIds: CanonRecallDomain[];
  sourceHintIds: string[];
  confidenceFloorPermille: number;
}

export interface CanonReconciliationWorkItem {
  candidateId: string;
  clusterId: string;
  lanes: CanonReconciliationLane[];
  priority: number;
  reasons: string[];
}

export interface CanonReconciliationWorkOrder {
  format: typeof CANON_RECONCILIATION_WORK_ORDER_FORMAT;
  id: string;
  universeId: string;
  sourceHintIds: string[];
  contextDepth: number;
  directCandidateIds: string[];
  contextCandidateIds: string[];
  candidateIds: string[];
  items: CanonReconciliationWorkItem[];
  clusters: CanonReconciliationCluster[];
  countsByDomain: Record<CanonRecallDomain, number>;
  workOrderFingerprint: string;
}

export type CanonEvidenceCustody = "local-private" | "public" | "licensed";
export type CanonEvidenceLocatorKind =
  | "byte"
  | "page"
  | "chapter"
  | "line"
  | "timestamp"
  | "record";

export interface CanonEvidenceSource {
  id: string;
  title: string;
  version: string;
  universeId: string;
  continuityId: string;
  custody: CanonEvidenceCustody;
  sourceHintIds: string[];
  digest: string;
  fileSizeBytes: number;
}

export interface CanonEvidenceLocator {
  id: string;
  sourceId: string;
  kind: CanonEvidenceLocatorKind;
  unit: string;
  start?: number;
  end?: number;
  contentDigest?: string;
}

export type CanonEvidenceReviewStatus = "machine-extracted" | "reviewed";

export interface CanonEvidenceRecord {
  id: string;
  sourceId: string;
  locatorIds: string[];
  continuityId: string;
  kind: CanonRecallKind;
  label: string;
  normalized: Record<string, CanonRecallValue>;
  reconciliationKeys: string[];
  producedBy: "extractor" | "human";
  reviewStatus: CanonEvidenceReviewStatus;
  reviewedBy?: string;
}

export interface CanonEvidenceBundle {
  format: typeof CANON_EVIDENCE_BUNDLE_FORMAT;
  id: string;
  universeId: string;
  sources: CanonEvidenceSource[];
  locators: CanonEvidenceLocator[];
  records: CanonEvidenceRecord[];
}

export type CanonReviewAction =
  | "confirm"
  | "correct"
  | "split"
  | "merge"
  | "reject"
  | "defer";

export interface CanonReviewDecision {
  id: string;
  action: CanonReviewAction;
  candidateIds: string[];
  evidenceRecordIds: string[];
  promotedRecordIds: string[];
  rationale: string;
}

export interface CanonReviewDecisionSet {
  format: typeof CANON_REVIEW_DECISION_SET_FORMAT;
  id: string;
  workOrderId: string;
  workOrderFingerprint: string;
  evidenceBundleId: string;
  evidenceBundleFingerprint: string;
  reviewerId: string;
  decisions: CanonReviewDecision[];
}

export type CanonReconciliationFindingSeverity = "error" | "warning" | "notice";

export interface CanonReconciliationFinding {
  code: string;
  severity: CanonReconciliationFindingSeverity;
  subjectId: string;
  detail: string;
}

export interface CanonReconciliationResolution {
  decisionId: string;
  action: CanonReviewAction;
  candidateIds: string[];
  evidenceRecordIds: string[];
  promotedRecordIds: string[];
}

export interface CanonReconciliationReceipt {
  format: typeof CANON_RECONCILIATION_RECEIPT_FORMAT;
  workOrderId: string;
  workOrderFingerprint: string;
  evidenceBundleId: string;
  evidenceBundleFingerprint: string;
  decisionSetId: string;
  decisionSetFingerprint: string;
  sourceIds: string[];
  reviewedCandidateIds: string[];
  resolvedCandidateIds: string[];
  confirmedCandidateIds: string[];
  correctedCandidateIds: string[];
  splitCandidateIds: string[];
  mergedCandidateIds: string[];
  rejectedCandidateIds: string[];
  deferredCandidateIds: string[];
  pendingCandidateIds: string[];
  promotedRecordIds: string[];
  coveragePermille: number;
  resolutionPermille: number;
  resolutions: CanonReconciliationResolution[];
  findings: CanonReconciliationFinding[];
  passed: boolean;
  reviewComplete: boolean;
  receiptFingerprint: string;
}

export interface CanonReconciliationCompileInput {
  workOrder: CanonReconciliationWorkOrder;
  recallCandidates: CanonRecallCandidate[];
  evidenceBundle: CanonEvidenceBundle;
  decisionSet: CanonReviewDecisionSet;
}
