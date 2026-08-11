import { orderedStrings } from "../../runtime/determinism.js";
import {
  canonicalCanonReviewDecisionSet,
  canonEvidenceBundleFingerprint,
  canonReconciliationReceiptFingerprint,
  canonReviewDecisionSetFingerprint,
} from "./canonical.js";
import {
  CANON_RECONCILIATION_RECEIPT_FORMAT,
  type CanonReconciliationCompileInput,
  type CanonReconciliationReceipt,
  type CanonReconciliationResolution,
  type CanonReviewAction,
} from "./types.js";
import {
  sortCanonReconciliationFindings,
  validateCanonReviewDecisionSet,
} from "./validate.js";

function candidateIdsForAction(
  resolutions: readonly CanonReconciliationResolution[],
  action: CanonReviewAction,
): string[] {
  return orderedStrings(
    resolutions
      .filter((resolution) => resolution.action === action)
      .flatMap((resolution) => resolution.candidateIds),
  );
}

function ratioPermille(numerator: number, denominator: number): number {
  if (denominator === 0) return 1000;
  return Math.floor((numerator * 1000) / denominator);
}

export function compileCanonReconciliation(
  input: CanonReconciliationCompileInput,
): CanonReconciliationReceipt {
  const decisionSet = canonicalCanonReviewDecisionSet(input.decisionSet);
  const decisionSetFingerprint = canonReviewDecisionSetFingerprint(decisionSet);
  const evidenceBundleFingerprint = canonEvidenceBundleFingerprint(
    input.evidenceBundle,
  );
  const findings = validateCanonReviewDecisionSet(
    input.workOrder,
    input.recallCandidates,
    input.evidenceBundle,
    decisionSet,
  );
  const errors = findings.filter((finding) => finding.severity === "error");

  if (errors.length > 0) {
    const core = {
      format: CANON_RECONCILIATION_RECEIPT_FORMAT,
      workOrderId: input.workOrder.id,
      workOrderFingerprint: input.workOrder.workOrderFingerprint,
      evidenceBundleId: input.evidenceBundle.id,
      evidenceBundleFingerprint,
      decisionSetId: decisionSet.id,
      decisionSetFingerprint,
      sourceIds: orderedStrings(
        input.evidenceBundle.sources.map((source) => source.id),
      ),
      reviewedCandidateIds: [],
      resolvedCandidateIds: [],
      confirmedCandidateIds: [],
      correctedCandidateIds: [],
      splitCandidateIds: [],
      mergedCandidateIds: [],
      rejectedCandidateIds: [],
      deferredCandidateIds: [],
      pendingCandidateIds: orderedStrings(input.workOrder.candidateIds),
      promotedRecordIds: [],
      coveragePermille: 0,
      resolutionPermille: 0,
      resolutions: [],
      findings: sortCanonReconciliationFindings(findings),
      passed: false,
      reviewComplete: false,
    };
    return {
      ...core,
      receiptFingerprint: canonReconciliationReceiptFingerprint(core),
    };
  }

  const resolutions: CanonReconciliationResolution[] = decisionSet.decisions.map(
    (decision) => ({
      decisionId: decision.id,
      action: decision.action,
      candidateIds: orderedStrings(decision.candidateIds),
      evidenceRecordIds: orderedStrings(decision.evidenceRecordIds),
      promotedRecordIds: orderedStrings(decision.promotedRecordIds),
    }),
  );
  const reviewedCandidateIds = orderedStrings(
    [...new Set(resolutions.flatMap((resolution) => resolution.candidateIds))],
  );
  const deferredCandidateIds = candidateIdsForAction(resolutions, "defer");
  const deferred = new Set(deferredCandidateIds);
  const resolvedCandidateIds = reviewedCandidateIds.filter(
    (candidateId) => !deferred.has(candidateId),
  );
  const reviewed = new Set(reviewedCandidateIds);
  const pendingCandidateIds = orderedStrings(
    input.workOrder.candidateIds.filter((candidateId) => !reviewed.has(candidateId)),
  );
  const promotedRecordIds = orderedStrings(
    [...new Set(resolutions.flatMap((resolution) => resolution.promotedRecordIds))],
  );
  const complete = pendingCandidateIds.length === 0 && deferredCandidateIds.length === 0;
  const completeFindings = [...findings];
  if (deferredCandidateIds.length > 0) {
    completeFindings.push({
      code: "deferred-review",
      severity: "notice",
      subjectId: decisionSet.id,
      detail: `${deferredCandidateIds.length} candidates were explicitly deferred`,
    });
  }

  const core = {
    format: CANON_RECONCILIATION_RECEIPT_FORMAT,
    workOrderId: input.workOrder.id,
    workOrderFingerprint: input.workOrder.workOrderFingerprint,
    evidenceBundleId: input.evidenceBundle.id,
    evidenceBundleFingerprint,
    decisionSetId: decisionSet.id,
    decisionSetFingerprint,
    sourceIds: orderedStrings(
      input.evidenceBundle.sources.map((source) => source.id),
    ),
    reviewedCandidateIds,
    resolvedCandidateIds,
    confirmedCandidateIds: candidateIdsForAction(resolutions, "confirm"),
    correctedCandidateIds: candidateIdsForAction(resolutions, "correct"),
    splitCandidateIds: candidateIdsForAction(resolutions, "split"),
    mergedCandidateIds: candidateIdsForAction(resolutions, "merge"),
    rejectedCandidateIds: candidateIdsForAction(resolutions, "reject"),
    deferredCandidateIds,
    pendingCandidateIds,
    promotedRecordIds,
    coveragePermille: ratioPermille(
      reviewedCandidateIds.length,
      input.workOrder.candidateIds.length,
    ),
    resolutionPermille: ratioPermille(
      resolvedCandidateIds.length,
      input.workOrder.candidateIds.length,
    ),
    resolutions,
    findings: sortCanonReconciliationFindings(completeFindings),
    passed: true,
    reviewComplete: complete,
  };
  return {
    ...core,
    receiptFingerprint: canonReconciliationReceiptFingerprint(core),
  };
}
