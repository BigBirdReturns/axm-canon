import {
  compareCodepoints,
  orderRecordKeysDeep,
  orderedStrings,
} from "../../runtime/determinism.js";
import { narrativeFingerprint } from "../../runtime/fingerprint.js";
import type {
  CanonEvidenceBundle,
  CanonEvidenceRecord,
  CanonReconciliationReceipt,
  CanonReconciliationWorkOrder,
  CanonReviewDecisionSet,
} from "./types.js";

function canonicalEvidenceRecord(record: CanonEvidenceRecord): CanonEvidenceRecord {
  return {
    ...record,
    locatorIds: orderedStrings(record.locatorIds),
    normalized: orderRecordKeysDeep(record.normalized),
    reconciliationKeys: orderedStrings(record.reconciliationKeys),
  };
}

export function canonicalCanonEvidenceBundle(
  bundle: CanonEvidenceBundle,
): CanonEvidenceBundle {
  return {
    ...bundle,
    sources: [...bundle.sources]
      .map((source) => ({
        ...source,
        sourceHintIds: orderedStrings(source.sourceHintIds),
      }))
      .sort((left, right) => compareCodepoints(left.id, right.id)),
    locators: [...bundle.locators].sort(
      (left, right) => compareCodepoints(left.id, right.id),
    ),
    records: [...bundle.records]
      .map(canonicalEvidenceRecord)
      .sort((left, right) => compareCodepoints(left.id, right.id)),
  };
}

export function canonEvidenceBundleFingerprint(
  bundle: CanonEvidenceBundle,
): string {
  return narrativeFingerprint(canonicalCanonEvidenceBundle(bundle));
}

export function canonicalCanonReconciliationWorkOrder(
  workOrder: CanonReconciliationWorkOrder,
): CanonReconciliationWorkOrder {
  return {
    ...workOrder,
    sourceHintIds: orderedStrings(workOrder.sourceHintIds),
    directCandidateIds: orderedStrings(workOrder.directCandidateIds),
    contextCandidateIds: orderedStrings(workOrder.contextCandidateIds),
    candidateIds: orderedStrings(workOrder.candidateIds),
    items: [...workOrder.items]
      .map((item) => ({
        ...item,
        lanes: [...item.lanes].sort(compareCodepoints),
        reasons: orderedStrings(item.reasons),
      }))
      .sort(
        (left, right) =>
          right.priority - left.priority
          || compareCodepoints(left.candidateId, right.candidateId),
      ),
    clusters: [...workOrder.clusters]
      .map((cluster) => ({
        ...cluster,
        candidateIds: orderedStrings(cluster.candidateIds),
        reconciliationKeys: orderedStrings(cluster.reconciliationKeys),
        domainIds: [...cluster.domainIds].sort(compareCodepoints),
        sourceHintIds: orderedStrings(cluster.sourceHintIds),
      }))
      .sort((left, right) => compareCodepoints(left.id, right.id)),
    countsByDomain: orderRecordKeysDeep(workOrder.countsByDomain),
  };
}

export function canonReconciliationWorkOrderFingerprint(
  workOrder: Omit<CanonReconciliationWorkOrder, "workOrderFingerprint">,
): string {
  const canonical = canonicalCanonReconciliationWorkOrder({
    ...workOrder,
    workOrderFingerprint: "",
  });
  const { workOrderFingerprint: _fingerprint, ...core } = canonical;
  return narrativeFingerprint(core);
}

export function canonicalCanonReviewDecisionSet(
  decisionSet: CanonReviewDecisionSet,
): CanonReviewDecisionSet {
  return {
    ...decisionSet,
    decisions: [...decisionSet.decisions]
      .map((decision) => ({
        ...decision,
        candidateIds: orderedStrings(decision.candidateIds),
        evidenceRecordIds: orderedStrings(decision.evidenceRecordIds),
        promotedRecordIds: orderedStrings(decision.promotedRecordIds),
      }))
      .sort((left, right) => compareCodepoints(left.id, right.id)),
  };
}

export function canonReviewDecisionSetFingerprint(
  decisionSet: CanonReviewDecisionSet,
): string {
  return narrativeFingerprint(canonicalCanonReviewDecisionSet(decisionSet));
}

export function canonicalCanonReconciliationReceipt(
  receipt: Omit<CanonReconciliationReceipt, "receiptFingerprint">,
): Omit<CanonReconciliationReceipt, "receiptFingerprint"> {
  return {
    ...receipt,
    sourceIds: orderedStrings(receipt.sourceIds),
    reviewedCandidateIds: orderedStrings(receipt.reviewedCandidateIds),
    resolvedCandidateIds: orderedStrings(receipt.resolvedCandidateIds),
    confirmedCandidateIds: orderedStrings(receipt.confirmedCandidateIds),
    correctedCandidateIds: orderedStrings(receipt.correctedCandidateIds),
    splitCandidateIds: orderedStrings(receipt.splitCandidateIds),
    mergedCandidateIds: orderedStrings(receipt.mergedCandidateIds),
    rejectedCandidateIds: orderedStrings(receipt.rejectedCandidateIds),
    deferredCandidateIds: orderedStrings(receipt.deferredCandidateIds),
    pendingCandidateIds: orderedStrings(receipt.pendingCandidateIds),
    promotedRecordIds: orderedStrings(receipt.promotedRecordIds),
    resolutions: [...receipt.resolutions]
      .map((resolution) => ({
        ...resolution,
        candidateIds: orderedStrings(resolution.candidateIds),
        evidenceRecordIds: orderedStrings(resolution.evidenceRecordIds),
        promotedRecordIds: orderedStrings(resolution.promotedRecordIds),
      }))
      .sort((left, right) => compareCodepoints(left.decisionId, right.decisionId)),
    findings: [...receipt.findings].sort(
      (left, right) =>
        compareCodepoints(left.severity, right.severity)
        || compareCodepoints(left.code, right.code)
        || compareCodepoints(left.subjectId, right.subjectId)
        || compareCodepoints(left.detail, right.detail),
    ),
  };
}

export function canonReconciliationReceiptFingerprint(
  receipt: Omit<CanonReconciliationReceipt, "receiptFingerprint">,
): string {
  return narrativeFingerprint(canonicalCanonReconciliationReceipt(receipt));
}
