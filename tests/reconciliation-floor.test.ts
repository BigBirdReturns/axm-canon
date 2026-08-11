import { describe, expect, it } from "vitest";
import {
  CANON_RECALL_PACKET_FORMAT,
  type CanonRecallCandidate,
  type CanonRecallPacket,
  type CanonRecallSourceHint,
} from "../src/canon/recall/index.js";
import {
  CANON_EVIDENCE_BUNDLE_FORMAT,
  CANON_REVIEW_DECISION_SET_FORMAT,
  buildCanonReconciliationWorkOrder,
  canonEvidenceBundleFingerprint,
  compileCanonReconciliation,
  validateCanonEvidenceBundle,
  type CanonEvidenceBundle,
  type CanonReviewDecisionSet,
} from "../src/canon/reconcile/index.js";
import {
  ASOIAF_AGOT_RECONCILIATION_WORK_ORDER,
  ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS,
  ASOIAF_RECONCILIATION_FLOOR_MANIFEST,
} from "../asoiaf/src/reconcile/index.js";
import {
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
} from "../asoiaf/src/recall/index.js";

const sourceHints: CanonRecallSourceHint[] = [
  {
    id: "S1",
    label: "Fixture Source One",
    category: "fixture",
    standing: "placeholder-only",
    continuityHint: "fixture",
  },
  {
    id: "S2",
    label: "Fixture Source Two",
    category: "fixture",
    standing: "placeholder-only",
    continuityHint: "fixture",
  },
];

const candidates: CanonRecallCandidate[] = [
  {
    id: "candidate-alpha",
    domain: "core-entities",
    kind: "entity",
    label: "Alpha",
    summary: "Fixture alpha",
    confidencePermille: 900,
    sourceHints: ["S1"],
    continuityHints: ["fixture"],
    normalized: { entityId: "alpha" },
    reconciliationKeys: ["shared-claim"],
    tags: ["fixture"],
  },
  {
    id: "candidate-beta",
    domain: "lineage-claims",
    kind: "relation",
    label: "Beta relation",
    summary: "Fixture beta",
    confidencePermille: 800,
    sourceHints: ["S2"],
    continuityHints: ["fixture"],
    normalized: { relationId: "beta" },
    reconciliationKeys: ["shared-claim"],
    tags: ["fixture"],
  },
  {
    id: "candidate-gamma",
    domain: "endgame-coordinates",
    kind: "question",
    label: "Gamma question",
    summary: "Fixture gamma",
    confidencePermille: 400,
    sourceHints: ["S1"],
    continuityHints: ["fixture"],
    normalized: { questionId: "gamma" },
    reconciliationKeys: ["isolated-question"],
    tags: ["fixture"],
  },
];

const packet: CanonRecallPacket = {
  format: CANON_RECALL_PACKET_FORMAT,
  id: "fixture-recall-packet",
  universeId: "fixture",
  scope: "fixture",
  generatedBy: "language-model-recall",
  knowledgeCutoff: "2025-12",
  authority: "none",
  compilationEligible: false,
  candidates,
  openQuestions: [],
  notes: "Synthetic reconciliation fixture",
};

const workOrder = buildCanonReconciliationWorkOrder(
  [packet],
  sourceHints,
  {
    id: "fixture-work-order",
    universeId: "fixture",
    sourceHintIds: ["S1"],
    contextDepth: 1,
  },
);

function evidenceBundle(): CanonEvidenceBundle {
  return {
    format: CANON_EVIDENCE_BUNDLE_FORMAT,
    id: "fixture-evidence",
    universeId: "fixture",
    sources: [
      {
        id: "source-fixture",
        title: "Fixture exact source",
        version: "1",
        universeId: "fixture",
        continuityId: "fixture",
        custody: "local-private",
        sourceHintIds: ["S1"],
        digest: "a".repeat(64),
        fileSizeBytes: 4096,
      },
    ],
    locators: [
      {
        id: "locator-alpha",
        sourceId: "source-fixture",
        kind: "record",
        unit: "alpha",
        start: 1,
        end: 1,
        contentDigest: "b".repeat(64),
      },
      {
        id: "locator-gamma-one",
        sourceId: "source-fixture",
        kind: "record",
        unit: "gamma-one",
        start: 2,
        end: 2,
        contentDigest: "c".repeat(64),
      },
      {
        id: "locator-gamma-two",
        sourceId: "source-fixture",
        kind: "record",
        unit: "gamma-two",
        start: 3,
        end: 3,
        contentDigest: "d".repeat(64),
      },
    ],
    records: [
      {
        id: "record-alpha",
        sourceId: "source-fixture",
        locatorIds: ["locator-alpha"],
        continuityId: "fixture",
        kind: "proposition",
        label: "Exact alpha record",
        normalized: { exact: true },
        reconciliationKeys: ["shared-claim"],
        producedBy: "human",
        reviewStatus: "reviewed",
        reviewedBy: "fixture-reviewer",
      },
      {
        id: "record-gamma-one",
        sourceId: "source-fixture",
        locatorIds: ["locator-gamma-one"],
        continuityId: "fixture",
        kind: "proposition",
        label: "Exact gamma record one",
        normalized: { exact: true, branch: 1 },
        reconciliationKeys: ["isolated-question"],
        producedBy: "human",
        reviewStatus: "reviewed",
        reviewedBy: "fixture-reviewer",
      },
      {
        id: "record-gamma-two",
        sourceId: "source-fixture",
        locatorIds: ["locator-gamma-two"],
        continuityId: "fixture",
        kind: "proposition",
        label: "Exact gamma record two",
        normalized: { exact: true, branch: 2 },
        reconciliationKeys: ["isolated-question"],
        producedBy: "human",
        reviewStatus: "reviewed",
        reviewedBy: "fixture-reviewer",
      },
    ],
  };
}

function decisionSet(
  decisions: CanonReviewDecisionSet["decisions"],
  bundle = evidenceBundle(),
): CanonReviewDecisionSet {
  return {
    format: CANON_REVIEW_DECISION_SET_FORMAT,
    id: "fixture-decision-set",
    workOrderId: workOrder.id,
    workOrderFingerprint: workOrder.workOrderFingerprint,
    evidenceBundleId: bundle.id,
    evidenceBundleFingerprint: canonEvidenceBundleFingerprint(bundle),
    reviewerId: "fixture-reviewer",
    decisions,
  };
}

describe("canon reconciliation floor", () => {
  it("precomputes all five main-novel work orders from the recall estate", () => {
    expect(Object.keys(ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS)).toHaveLength(5);
    for (const work of Object.values(ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS)) {
      expect(work.directCandidateIds.length).toBeGreaterThan(0);
      expect(work.candidateIds.length).toBeGreaterThanOrEqual(
        work.directCandidateIds.length,
      );
      expect(work.workOrderFingerprint).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    }
    expect(ASOIAF_RECONCILIATION_FLOOR_MANIFEST.workOrders).toHaveLength(5);
  });

  it("builds the AGOT work order deterministically under estate reordering", () => {
    const rebuilt = buildCanonReconciliationWorkOrder(
      [...ASOIAF_MODEL_RECALL_PACKETS].reverse(),
      [...ASOIAF_RECALL_SOURCE_HINTS].reverse(),
      {
        id: ASOIAF_AGOT_RECONCILIATION_WORK_ORDER.id,
        universeId: "asoiaf",
        sourceHintIds: ["AGOT"],
        contextDepth: 1,
      },
    );
    expect(rebuilt).toEqual(ASOIAF_AGOT_RECONCILIATION_WORK_ORDER);
  });

  it("pulls cross-source context through shared reconciliation keys", () => {
    expect(workOrder.directCandidateIds).toEqual([
      "candidate-alpha",
      "candidate-gamma",
    ]);
    expect(workOrder.contextCandidateIds).toEqual(["candidate-beta"]);
    expect(workOrder.clusters).toHaveLength(2);
  });

  it("refuses evidence without exact source identity and bounded locators", () => {
    const invalid = evidenceBundle();
    invalid.sources[0]!.digest = "not-a-digest";
    invalid.records[0]!.locatorIds = [];
    expect(
      validateCanonEvidenceBundle(invalid).map((finding) => finding.code),
    ).toEqual(
      expect.arrayContaining(["invalid-sha256", "missing-record-locator"]),
    );
  });

  it("confirms a recall candidate only through reviewed source evidence", () => {
    const bundle = evidenceBundle();
    const receipt = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "confirm-alpha",
          action: "confirm",
          candidateIds: ["candidate-alpha"],
          evidenceRecordIds: ["record-alpha"],
          promotedRecordIds: ["record-alpha"],
          rationale: "Exact fixture evidence confirms the normalized object.",
        },
      ], bundle),
    });
    expect(receipt.passed).toBe(true);
    expect(receipt.confirmedCandidateIds).toEqual(["candidate-alpha"]);
    expect(receipt.promotedRecordIds).toEqual(["record-alpha"]);
    expect(receipt.pendingCandidateIds).toEqual([
      "candidate-beta",
      "candidate-gamma",
    ]);
  });

  it("refuses a confirmation that attempts to promote model recall without evidence", () => {
    const bundle = evidenceBundle();
    const receipt = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "confirm-without-evidence",
          action: "confirm",
          candidateIds: ["candidate-alpha"],
          evidenceRecordIds: [],
          promotedRecordIds: [],
          rationale: "The model remembers it.",
        },
      ], bundle),
    });
    expect(receipt.passed).toBe(false);
    expect(receipt.promotedRecordIds).toEqual([]);
    expect(receipt.pendingCandidateIds).toEqual(workOrder.candidateIds);
    expect(receipt.findings.map((finding) => finding.code)).toContain(
      "invalid-confirm-shape",
    );
  });

  it("supports an evidence-backed split without promoting the recalled object", () => {
    const bundle = evidenceBundle();
    const receipt = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "split-gamma",
          action: "split",
          candidateIds: ["candidate-gamma"],
          evidenceRecordIds: ["record-gamma-one", "record-gamma-two"],
          promotedRecordIds: ["record-gamma-one", "record-gamma-two"],
          rationale: "The recalled question conflated two source-backed records.",
        },
      ], bundle),
    });
    expect(receipt.passed).toBe(true);
    expect(receipt.splitCandidateIds).toEqual(["candidate-gamma"]);
    expect(receipt.promotedRecordIds).toEqual([
      "record-gamma-one",
      "record-gamma-two",
    ]);
  });

  it("permits merges only within one reconciliation cluster", () => {
    const bundle = evidenceBundle();
    const valid = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "merge-alpha-beta",
          action: "merge",
          candidateIds: ["candidate-alpha", "candidate-beta"],
          evidenceRecordIds: ["record-alpha"],
          promotedRecordIds: ["record-alpha"],
          rationale: "Both recalled candidates describe one source-backed object.",
        },
      ], bundle),
    });
    expect(valid.passed).toBe(true);
    expect(valid.mergedCandidateIds).toEqual([
      "candidate-alpha",
      "candidate-beta",
    ]);

    const invalid = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "merge-across-clusters",
          action: "merge",
          candidateIds: ["candidate-alpha", "candidate-gamma"],
          evidenceRecordIds: ["record-alpha"],
          promotedRecordIds: ["record-alpha"],
          rationale: "Improper cross-cluster merge.",
        },
      ], bundle),
    });
    expect(invalid.passed).toBe(false);
    expect(invalid.findings.map((finding) => finding.code)).toContain(
      "cross-cluster-merge",
    );
  });

  it("rolls the entire transaction back when one candidate receives two decisions", () => {
    const bundle = evidenceBundle();
    const receipt = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "confirm-alpha",
          action: "confirm",
          candidateIds: ["candidate-alpha"],
          evidenceRecordIds: ["record-alpha"],
          promotedRecordIds: ["record-alpha"],
          rationale: "Confirm alpha.",
        },
        {
          id: "reject-alpha",
          action: "reject",
          candidateIds: ["candidate-alpha"],
          evidenceRecordIds: ["record-alpha"],
          promotedRecordIds: [],
          rationale: "Reject alpha.",
        },
      ], bundle),
    });
    expect(receipt.passed).toBe(false);
    expect(receipt.resolutions).toEqual([]);
    expect(receipt.promotedRecordIds).toEqual([]);
    expect(receipt.pendingCandidateIds).toEqual(workOrder.candidateIds);
  });

  it("keeps an explicit deferral visible without fabricating closure", () => {
    const bundle = evidenceBundle();
    const receipt = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet([
        {
          id: "defer-gamma",
          action: "defer",
          candidateIds: ["candidate-gamma"],
          evidenceRecordIds: [],
          promotedRecordIds: [],
          rationale: "The available source slice does not decide the question.",
        },
      ], bundle),
    });
    expect(receipt.passed).toBe(true);
    expect(receipt.deferredCandidateIds).toEqual(["candidate-gamma"]);
    expect(receipt.resolvedCandidateIds).toEqual([]);
    expect(receipt.reviewComplete).toBe(false);
  });

  it("produces an order-independent receipt and does not mutate inputs", () => {
    const bundle = evidenceBundle();
    const decisions: CanonReviewDecisionSet["decisions"] = [
      {
        id: "confirm-alpha",
        action: "confirm",
        candidateIds: ["candidate-alpha"],
        evidenceRecordIds: ["record-alpha"],
        promotedRecordIds: ["record-alpha"],
        rationale: "Confirm alpha.",
      },
      {
        id: "reject-gamma",
        action: "reject",
        candidateIds: ["candidate-gamma"],
        evidenceRecordIds: ["record-gamma-one"],
        promotedRecordIds: [],
        rationale: "Exact evidence rejects the recalled formulation.",
      },
    ];
    const before = JSON.stringify({ workOrder, candidates, bundle });
    const first = compileCanonReconciliation({
      workOrder,
      recallCandidates: candidates,
      evidenceBundle: bundle,
      decisionSet: decisionSet(decisions, bundle),
    });
    const second = compileCanonReconciliation({
      workOrder,
      recallCandidates: [...candidates].reverse(),
      evidenceBundle: {
        ...bundle,
        sources: [...bundle.sources].reverse(),
        locators: [...bundle.locators].reverse(),
        records: [...bundle.records].reverse(),
      },
      decisionSet: decisionSet([...decisions].reverse(), bundle),
    });
    expect(second.receiptFingerprint).toBe(first.receiptFingerprint);
    expect(JSON.stringify({ workOrder, candidates, bundle })).toBe(before);
  });
});
