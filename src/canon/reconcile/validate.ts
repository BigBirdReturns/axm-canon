import { compareCodepoints } from "../../runtime/determinism.js";
import type { CanonRecallCandidate } from "../recall/index.js";
import {
  canonEvidenceBundleFingerprint,
  canonReconciliationWorkOrderFingerprint,
} from "./canonical.js";
import {
  CANON_EVIDENCE_BUNDLE_FORMAT,
  CANON_REVIEW_DECISION_SET_FORMAT,
  type CanonEvidenceBundle,
  type CanonEvidenceRecord,
  type CanonReconciliationFinding,
  type CanonReconciliationWorkOrder,
  type CanonReviewDecision,
  type CanonReviewDecisionSet,
} from "./types.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function finding(
  code: string,
  severity: CanonReconciliationFinding["severity"],
  subjectId: string,
  detail: string,
): CanonReconciliationFinding {
  return { code, severity, subjectId, detail };
}

function duplicateIds(values: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates].sort(compareCodepoints);
}

function sortedFindings(
  findings: readonly CanonReconciliationFinding[],
): CanonReconciliationFinding[] {
  const severityRank: Record<CanonReconciliationFinding["severity"], number> = {
    error: 0,
    warning: 1,
    notice: 2,
  };
  return [...findings].sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity]
      || compareCodepoints(left.code, right.code)
      || compareCodepoints(left.subjectId, right.subjectId)
      || compareCodepoints(left.detail, right.detail),
  );
}

function validateDigest(
  value: string,
  subjectId: string,
  field: string,
): CanonReconciliationFinding[] {
  return SHA256_PATTERN.test(value)
    ? []
    : [
        finding(
          "invalid-sha256",
          "error",
          subjectId,
          `${field} must be a lowercase 64-character SHA-256 digest`,
        ),
      ];
}

export function validateCanonEvidenceBundle(
  bundle: CanonEvidenceBundle,
): CanonReconciliationFinding[] {
  const findings: CanonReconciliationFinding[] = [];
  if (bundle.format !== CANON_EVIDENCE_BUNDLE_FORMAT) {
    findings.push(
      finding(
        "evidence-format",
        "error",
        bundle.id,
        `expected ${CANON_EVIDENCE_BUNDLE_FORMAT}`,
      ),
    );
  }
  if (!bundle.id.trim()) {
    findings.push(finding("missing-id", "error", "evidence-bundle", "bundle id is empty"));
  }
  if (!bundle.universeId.trim()) {
    findings.push(
      finding("missing-universe", "error", bundle.id, "bundle universeId is empty"),
    );
  }

  for (const duplicateId of duplicateIds(bundle.sources)) {
    findings.push(
      finding("duplicate-source", "error", duplicateId, "source id is duplicated"),
    );
  }
  for (const duplicateId of duplicateIds(bundle.locators)) {
    findings.push(
      finding("duplicate-locator", "error", duplicateId, "locator id is duplicated"),
    );
  }
  for (const duplicateId of duplicateIds(bundle.records)) {
    findings.push(
      finding("duplicate-evidence-record", "error", duplicateId, "record id is duplicated"),
    );
  }

  const sourcesById = new Map(bundle.sources.map((source) => [source.id, source] as const));
  const locatorsById = new Map(
    bundle.locators.map((locator) => [locator.id, locator] as const),
  );

  for (const source of bundle.sources) {
    if (!source.id.trim() || !source.title.trim() || !source.version.trim()) {
      findings.push(
        finding(
          "incomplete-source",
          "error",
          source.id || "source",
          "source id, title, and version are required",
        ),
      );
    }
    if (source.universeId !== bundle.universeId) {
      findings.push(
        finding(
          "source-universe-mismatch",
          "error",
          source.id,
          `${source.universeId} does not match bundle universe ${bundle.universeId}`,
        ),
      );
    }
    if (!source.continuityId.trim()) {
      findings.push(
        finding("missing-continuity", "error", source.id, "source continuityId is empty"),
      );
    }
    if (source.sourceHintIds.length === 0) {
      findings.push(
        finding("missing-source-hint", "error", source.id, "source has no source hint"),
      );
    }
    findings.push(...validateDigest(source.digest, source.id, "source digest"));
    if (!Number.isInteger(source.fileSizeBytes) || source.fileSizeBytes <= 0) {
      findings.push(
        finding(
          "invalid-file-size",
          "error",
          source.id,
          "fileSizeBytes must be a positive integer",
        ),
      );
    }
  }

  for (const locator of bundle.locators) {
    if (!sourcesById.has(locator.sourceId)) {
      findings.push(
        finding(
          "unknown-locator-source",
          "error",
          locator.id,
          `unknown source ${locator.sourceId}`,
        ),
      );
    }
    if (!locator.unit.trim()) {
      findings.push(
        finding("missing-locator-unit", "error", locator.id, "locator unit is empty"),
      );
    }
    if (
      locator.start !== undefined
      && (!Number.isFinite(locator.start) || locator.start < 0)
    ) {
      findings.push(
        finding("invalid-locator-range", "error", locator.id, "start must be nonnegative"),
      );
    }
    if (
      locator.end !== undefined
      && (!Number.isFinite(locator.end) || locator.end < 0)
    ) {
      findings.push(
        finding("invalid-locator-range", "error", locator.id, "end must be nonnegative"),
      );
    }
    if (
      locator.start !== undefined
      && locator.end !== undefined
      && locator.start > locator.end
    ) {
      findings.push(
        finding("invalid-locator-range", "error", locator.id, "start exceeds end"),
      );
    }
    if (locator.contentDigest !== undefined) {
      findings.push(
        ...validateDigest(locator.contentDigest, locator.id, "locator content digest"),
      );
    }
  }

  for (const record of bundle.records) {
    const source = sourcesById.get(record.sourceId);
    if (!source) {
      findings.push(
        finding(
          "unknown-record-source",
          "error",
          record.id,
          `unknown source ${record.sourceId}`,
        ),
      );
    }
    if (!record.id.trim() || !record.label.trim()) {
      findings.push(
        finding(
          "incomplete-evidence-record",
          "error",
          record.id || "record",
          "record id and label are required",
        ),
      );
    }
    if (!record.continuityId.trim()) {
      findings.push(
        finding("missing-continuity", "error", record.id, "record continuityId is empty"),
      );
    }
    if (source && record.continuityId !== source.continuityId) {
      findings.push(
        finding(
          "record-continuity-mismatch",
          "error",
          record.id,
          `${record.continuityId} does not match source continuity ${source.continuityId}`,
        ),
      );
    }
    if (record.locatorIds.length === 0) {
      findings.push(
        finding(
          "missing-record-locator",
          "error",
          record.id,
          "evidence record must cite at least one exact locator",
        ),
      );
    }
    if (new Set(record.locatorIds).size !== record.locatorIds.length) {
      findings.push(
        finding("duplicate-record-locator", "error", record.id, "locator ids repeat"),
      );
    }
    for (const locatorId of record.locatorIds) {
      const locator = locatorsById.get(locatorId);
      if (!locator) {
        findings.push(
          finding(
            "unknown-record-locator",
            "error",
            record.id,
            `unknown locator ${locatorId}`,
          ),
        );
      } else if (locator.sourceId !== record.sourceId) {
        findings.push(
          finding(
            "cross-source-locator",
            "error",
            record.id,
            `${locatorId} belongs to ${locator.sourceId}, not ${record.sourceId}`,
          ),
        );
      }
    }
    if (record.reconciliationKeys.length === 0) {
      findings.push(
        finding(
          "missing-reconciliation-key",
          "error",
          record.id,
          "record has no reconciliation key",
        ),
      );
    }
    if (record.reviewStatus === "reviewed" && !record.reviewedBy?.trim()) {
      findings.push(
        finding(
          "missing-evidence-reviewer",
          "error",
          record.id,
          "reviewed evidence must name reviewedBy",
        ),
      );
    }
    if (record.reviewStatus === "machine-extracted" && record.reviewedBy) {
      findings.push(
        finding(
          "premature-reviewer",
          "warning",
          record.id,
          "machine-extracted record names a reviewer but is not marked reviewed",
        ),
      );
    }
  }

  if (bundle.sources.length === 0) {
    findings.push(
      finding("empty-evidence-bundle", "warning", bundle.id, "bundle has no sources"),
    );
  }

  return sortedFindings(findings);
}

function actionShapeFindings(
  decision: CanonReviewDecision,
): CanonReconciliationFinding[] {
  const findings: CanonReconciliationFinding[] = [];
  const candidateCount = decision.candidateIds.length;
  const evidenceCount = decision.evidenceRecordIds.length;
  const promotedCount = decision.promotedRecordIds.length;

  if (!decision.rationale.trim()) {
    findings.push(
      finding("missing-rationale", "error", decision.id, "decision rationale is empty"),
    );
  }
  if (candidateCount === 0) {
    findings.push(
      finding("missing-candidate", "error", decision.id, "decision has no candidates"),
    );
  }

  switch (decision.action) {
    case "confirm":
      if (candidateCount !== 1 || evidenceCount < 1 || promotedCount !== 1) {
        findings.push(
          finding(
            "invalid-confirm-shape",
            "error",
            decision.id,
            "confirm requires one candidate, evidence, and one promoted record",
          ),
        );
      }
      break;
    case "correct":
      if (candidateCount !== 1 || evidenceCount < 1 || promotedCount !== 1) {
        findings.push(
          finding(
            "invalid-correct-shape",
            "error",
            decision.id,
            "correct requires one candidate, evidence, and one replacement record",
          ),
        );
      }
      break;
    case "split":
      if (candidateCount !== 1 || evidenceCount < 2 || promotedCount < 2) {
        findings.push(
          finding(
            "invalid-split-shape",
            "error",
            decision.id,
            "split requires one candidate and at least two reviewed replacement records",
          ),
        );
      }
      break;
    case "merge":
      if (candidateCount < 2 || evidenceCount < 1 || promotedCount !== 1) {
        findings.push(
          finding(
            "invalid-merge-shape",
            "error",
            decision.id,
            "merge requires multiple candidates, evidence, and one promoted record",
          ),
        );
      }
      break;
    case "reject":
      if (candidateCount < 1 || evidenceCount < 1 || promotedCount !== 0) {
        findings.push(
          finding(
            "invalid-reject-shape",
            "error",
            decision.id,
            "reject requires candidates and evidence but promotes no record",
          ),
        );
      }
      break;
    case "defer":
      if (candidateCount < 1 || evidenceCount !== 0 || promotedCount !== 0) {
        findings.push(
          finding(
            "invalid-defer-shape",
            "error",
            decision.id,
            "defer records candidates only and carries no evidence or promotion",
          ),
        );
      }
      break;
  }

  return findings;
}

function overlaps(
  candidate: CanonRecallCandidate,
  record: CanonEvidenceRecord,
): boolean {
  const keys = new Set(record.reconciliationKeys);
  return candidate.reconciliationKeys.some((key) => keys.has(key));
}

export function validateCanonReviewDecisionSet(
  workOrder: CanonReconciliationWorkOrder,
  recallCandidates: readonly CanonRecallCandidate[],
  evidenceBundle: CanonEvidenceBundle,
  decisionSet: CanonReviewDecisionSet,
): CanonReconciliationFinding[] {
  const findings = validateCanonEvidenceBundle(evidenceBundle);
  if (decisionSet.format !== CANON_REVIEW_DECISION_SET_FORMAT) {
    findings.push(
      finding(
        "decision-format",
        "error",
        decisionSet.id,
        `expected ${CANON_REVIEW_DECISION_SET_FORMAT}`,
      ),
    );
  }
  if (!decisionSet.id.trim() || !decisionSet.reviewerId.trim()) {
    findings.push(
      finding(
        "incomplete-decision-set",
        "error",
        decisionSet.id || "decision-set",
        "decision set id and reviewerId are required",
      ),
    );
  }
  if (decisionSet.workOrderId !== workOrder.id) {
    findings.push(
      finding(
        "work-order-id-mismatch",
        "error",
        decisionSet.id,
        `${decisionSet.workOrderId} does not match ${workOrder.id}`,
      ),
    );
  }
  const { workOrderFingerprint: _fingerprint, ...workOrderCore } = workOrder;
  const expectedWorkOrderFingerprint =
    canonReconciliationWorkOrderFingerprint(workOrderCore);
  if (
    workOrder.workOrderFingerprint !== expectedWorkOrderFingerprint
    || decisionSet.workOrderFingerprint !== expectedWorkOrderFingerprint
  ) {
    findings.push(
      finding(
        "work-order-fingerprint-mismatch",
        "error",
        decisionSet.id,
        "decision set is not bound to the exact work order",
      ),
    );
  }
  const expectedEvidenceFingerprint = canonEvidenceBundleFingerprint(evidenceBundle);
  if (
    decisionSet.evidenceBundleId !== evidenceBundle.id
    || decisionSet.evidenceBundleFingerprint !== expectedEvidenceFingerprint
  ) {
    findings.push(
      finding(
        "evidence-bundle-mismatch",
        "error",
        decisionSet.id,
        "decision set is not bound to the exact evidence bundle",
      ),
    );
  }

  for (const duplicateId of duplicateIds(decisionSet.decisions)) {
    findings.push(
      finding("duplicate-decision", "error", duplicateId, "decision id is duplicated"),
    );
  }

  const candidatesById = new Map(
    recallCandidates.map((candidate) => [candidate.id, candidate] as const),
  );
  const workCandidateIds = new Set(workOrder.candidateIds);
  const recordsById = new Map(
    evidenceBundle.records.map((record) => [record.id, record] as const),
  );
  const seenCandidateIds = new Map<string, string>();

  for (const candidateId of workOrder.candidateIds) {
    if (!candidatesById.has(candidateId)) {
      findings.push(
        finding(
          "missing-recall-candidate",
          "error",
          candidateId,
          "work order candidate is absent from supplied recall estate",
        ),
      );
    }
  }

  for (const decision of decisionSet.decisions) {
    findings.push(...actionShapeFindings(decision));
    if (new Set(decision.candidateIds).size !== decision.candidateIds.length) {
      findings.push(
        finding("duplicate-decision-candidate", "error", decision.id, "candidate ids repeat"),
      );
    }
    if (
      new Set(decision.evidenceRecordIds).size !== decision.evidenceRecordIds.length
      || new Set(decision.promotedRecordIds).size !== decision.promotedRecordIds.length
    ) {
      findings.push(
        finding("duplicate-decision-record", "error", decision.id, "record ids repeat"),
      );
    }

    for (const candidateId of decision.candidateIds) {
      if (!workCandidateIds.has(candidateId)) {
        findings.push(
          finding(
            "candidate-outside-work-order",
            "error",
            decision.id,
            `${candidateId} is not in the frozen work order`,
          ),
        );
      }
      const priorDecisionId = seenCandidateIds.get(candidateId);
      if (priorDecisionId) {
        findings.push(
          finding(
            "candidate-double-decision",
            "error",
            decision.id,
            `${candidateId} was already decided by ${priorDecisionId}`,
          ),
        );
      } else {
        seenCandidateIds.set(candidateId, decision.id);
      }
    }

    const evidenceRecords = decision.evidenceRecordIds
      .map((recordId) => recordsById.get(recordId))
      .filter((record): record is CanonEvidenceRecord => record !== undefined);
    for (const recordId of decision.evidenceRecordIds) {
      if (!recordsById.has(recordId)) {
        findings.push(
          finding(
            "unknown-evidence-record",
            "error",
            decision.id,
            `unknown evidence record ${recordId}`,
          ),
        );
      }
    }
    for (const promotedRecordId of decision.promotedRecordIds) {
      if (!decision.evidenceRecordIds.includes(promotedRecordId)) {
        findings.push(
          finding(
            "promotion-without-evidence",
            "error",
            decision.id,
            `${promotedRecordId} is not included in evidenceRecordIds`,
          ),
        );
      }
      const record = recordsById.get(promotedRecordId);
      if (record && record.reviewStatus !== "reviewed") {
        findings.push(
          finding(
            "unreviewed-promotion",
            "error",
            decision.id,
            `${promotedRecordId} is still machine-extracted`,
          ),
        );
      }
    }

    if (decision.action === "merge") {
      const containingCluster = workOrder.clusters.find((cluster) =>
        decision.candidateIds.every((candidateId) =>
          cluster.candidateIds.includes(candidateId),
        ),
      );
      if (!containingCluster) {
        findings.push(
          finding(
            "cross-cluster-merge",
            "error",
            decision.id,
            "merge candidates do not share one reconciliation cluster",
          ),
        );
      }
    }

    if (
      decision.action === "confirm"
      || decision.action === "correct"
      || decision.action === "split"
      || decision.action === "merge"
    ) {
      const promotedRecords = decision.promotedRecordIds
        .map((recordId) => recordsById.get(recordId))
        .filter((record): record is CanonEvidenceRecord => record !== undefined);
      for (const candidateId of decision.candidateIds) {
        const candidate = candidatesById.get(candidateId);
        if (
          candidate
          && promotedRecords.length > 0
          && !promotedRecords.some((record) => overlaps(candidate, record))
        ) {
          findings.push(
            finding(
              "reconciliation-key-mismatch",
              "error",
              decision.id,
              `${candidateId} shares no key with its promoted evidence record`,
            ),
          );
        }
      }
      for (const record of promotedRecords) {
        if (record.reviewStatus !== "reviewed") continue;
        if (!record.reviewedBy?.trim()) {
          findings.push(
            finding(
              "missing-evidence-reviewer",
              "error",
              decision.id,
              `${record.id} lacks reviewedBy`,
            ),
          );
        }
      }
    }

    if (
      decision.action !== "defer"
      && decision.evidenceRecordIds.length > 0
      && evidenceRecords.length === 0
    ) {
      findings.push(
        finding(
          "missing-usable-evidence",
          "error",
          decision.id,
          "decision cites no available evidence records",
        ),
      );
    }
  }

  const undecidedCount = workOrder.candidateIds.length - seenCandidateIds.size;
  if (undecidedCount > 0) {
    findings.push(
      finding(
        "pending-review",
        "notice",
        decisionSet.id,
        `${undecidedCount} work-order candidates remain without a decision`,
      ),
    );
  }

  return sortedFindings(findings);
}

export { sortedFindings as sortCanonReconciliationFindings };
