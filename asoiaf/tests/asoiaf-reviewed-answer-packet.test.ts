import { describe, expect, it } from "vitest";
import {
  ASOIAF_RECALL_ESTATE_PACKETS,
} from "../src/recall/index.js";
import {
  asoiafExternalCandidateId,
  asoiafExternalObservationId,
  buildAsoiafExternalReviewPacket,
  compileAsoiafExternalReconciliationPacket,
  type AsoiafExternalDecisionInput,
  type AsoiafExternalReviewPacket,
} from "../src/external/index.js";
import {
  buildAsoiafResearchQuestionDossier,
} from "../tools/lib/asoiaf-research-question-dossier.js";
import {
  buildAsoiafReviewedAnswerPacket,
  buildAsoiafReviewedAnswerTransaction,
  renderAsoiafReviewedAnswerPacket,
  validateAsoiafReviewedAnswerPacket,
} from "../tools/lib/asoiaf-reviewed-answer-packet.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;
const REVIEWER = "reviewer:jonathan";
const ANSWER_REVIEWER = "answer-reviewer:jonathan";
const REVIEWED_AT = "2026-08-04T12:00:00.000Z";
const ANSWER_REVIEWED_AT = "2026-08-04T21:00:00.000Z";

const recallCandidates = ASOIAF_RECALL_ESTATE_PACKETS.flatMap(
  (packet) => packet.candidates,
);
const agotCandidate = recallCandidates.find(
  (candidate) =>
    candidate.sourceHints.includes("AGOT")
    && candidate.reconciliationKeys.length > 0,
)!;

function primaryPacket(
  authorityRole: "primary" | "supporting" = "primary",
): AsoiafExternalReviewPacket {
  const sourceId = "local-agot";
  const sourceRecordId = "isbn:9780553593716:holder-copy-answer-1";
  return buildAsoiafExternalReviewPacket({
    id: "external-review:answer:agot:bran-1",
    sourceId,
    continuityId: "book-main",
    observation: {
      observationId: asoiafExternalObservationId({
        sourceId,
        sourceRecordId,
        contentDigest: DIGEST,
      }),
      collectorCandidateId: asoiafExternalCandidateId(
        sourceId,
        sourceRecordId,
      ),
      sourceId,
      sourceRecordId,
      retrievedAt: "2026-08-04T10:00:00.000Z",
      contentDigest: DIGEST,
      receiptUri: "receipts/asoiaf-answer-agot.json",
      responseBytes: 987_654,
      graphEffect: "none",
      canonEffect: "none",
      promotionStatus: "reviewed",
      reviewerId: REVIEWER,
      reviewedAt: REVIEWED_AT,
      rightsReview: {
        status: "holder-controlled-private",
        reviewedBy: REVIEWER,
        reviewedAt: REVIEWED_AT,
        rationale:
          "The holder supplied the exact edition and only digest, locator, and reviewed normalization enter the packet.",
      },
    },
    claims: [
      {
        id: "reviewed-claim:answer:agot:bran-1",
        evidenceRecordId: "external-evidence:answer:agot:bran-1",
        label: agotCandidate.label,
        claimKind: "world-state",
        authorityRole,
        continuityId: "book-main",
        locator: {
          id: "external-locator:answer:agot:bran-1",
          kind: "chapter",
          unit: "AGOT/Bran-I/reviewed-range-answer-1",
          start: 1,
          end: 2,
          contentDigest: DIGEST,
        },
        text:
          "Human-reviewed normalized evidence supporting the bounded candidate without publishing the source passage.",
        normalized: {
          statement: agotCandidate.summary,
          sourceStanding: "exact-holder-edition",
        },
        reconciliationKeys: [agotCandidate.reconciliationKeys[0]!],
        recallCandidateIds: [agotCandidate.id],
      },
    ],
  });
}

function decisionInput(packet: AsoiafExternalReviewPacket): AsoiafExternalDecisionInput {
  const claim = packet.claims[0]!;
  return {
    id: "external-decisions:answer:agot:bran-1",
    reviewerId: REVIEWER,
    reviewedAt: REVIEWED_AT,
    decisions: [
      {
        id: "external-decision:answer:confirm-agot-candidate",
        action: "confirm",
        candidateIds: [agotCandidate.id],
        evidenceRecordIds: [claim.evidenceRecordId],
        promotedRecordIds: [claim.evidenceRecordId],
        rationale:
          "The exact holder-controlled edition and locator confirm the bounded candidate.",
      },
    ],
  };
}

function dossier(input?: { includeGap?: boolean; includeRecall?: boolean }) {
  const includeGap = input?.includeGap ?? true;
  const includeRecall = input?.includeRecall ?? true;
  return buildAsoiafResearchQuestionDossier({
    questionText:
      "What does the exact holder-controlled AGOT evidence establish for this bounded candidate?",
    createdBy: "researcher:jonathan",
    createdAt: "2026-08-04T20:00:00.000Z",
    laneIds: ["entity-resolution"],
    continuityIds: ["book-main"],
    privateReferences: [
      {
        sourceId: "local-agot",
        editionKey: "agot-holder-edition",
        continuityId: "book-main",
        unitId: "chapter-1",
        paragraphId: "paragraph-answer-1",
        locator: "local-agot/agot-holder-edition/chapter-1/paragraph-answer-1",
        paragraphDigest: DIGEST,
        queryMode: "phrase",
        matchedTerms: ["bran"],
        tokenPositions: [4],
        snippetDigest: null,
        snippetCharacters: null,
      },
    ],
    recallReferences: includeRecall
      ? [
          {
            candidateId: agotCandidate.id,
            continuityId: "book-main",
          },
        ]
      : [],
    gaps: includeGap
      ? [
          {
            kind: "recall-unreconciled",
            laneId: "entity-resolution",
            continuityId: "book-main",
            candidateId: agotCandidate.id,
            detail:
              "The recall candidate remained unresolved when the research dossier was compiled.",
          },
        ]
      : [],
  });
}

function successfulTransaction() {
  const packet = primaryPacket();
  const receipt = compileAsoiafExternalReconciliationPacket({
    packet,
    decisionInput: decisionInput(packet),
  });
  expect(receipt.passed).toBe(true);
  return buildAsoiafReviewedAnswerTransaction({
    packet,
    reconciliationReceipt: receipt,
  });
}

function completePacket() {
  const researchDossier = dossier();
  const transaction = successfulTransaction();
  const gap = researchDossier.gaps[0]!;
  return buildAsoiafReviewedAnswerPacket({
    dossier: researchDossier,
    reviewedBy: ANSWER_REVIEWER,
    reviewedAt: ANSWER_REVIEWED_AT,
    transactions: [transaction],
    claims: [
      {
        id: "answer-claim:bran-bounded-state",
        order: 1,
        continuityId: "book-main",
        text:
          "The exact reviewed AGOT record confirms the bounded candidate in the book continuity.",
        transactionId: transaction.transactionId,
        evidenceRecordIds: [transaction.packet.claims[0]!.evidenceRecordId],
        resolutionDecisionIds: [
          transaction.reconciliationReceipt.canonReceipt!.resolutions[0]!.decisionId,
        ],
      },
    ],
    gapClosures: [
      {
        id: "answer-gap-closure:bran-recall",
        gapId: gap.gapId,
        claimIds: ["answer-claim:bran-bounded-state"],
        rationale:
          "The cited primary reconciliation transaction resolves the exact recall candidate named by this dossier gap.",
      },
    ],
  });
}

describe("ASOIAF reviewed answer packet", () => {
  it("builds and renders a deterministic sentence-level answer with exact citation custody", () => {
    const first = completePacket();
    const second = completePacket();
    expect(second).toEqual(first);
    expect(validateAsoiafReviewedAnswerPacket(first)).toEqual([]);
    expect(first).toEqual(
      expect.objectContaining({
        answerReady: true,
        scope: "bounded-complete",
        renderAuthority: "reviewed-text-only",
        acquisitionAuthority: "none",
        reconciliationAuthority: "none",
        graphEffect: "none",
        canonEffect: "none",
        answerEffect: "render-reviewed-packet",
      }),
    );
    expect(first.claims[0]).toEqual(
      expect.objectContaining({
        standing: "adjudicated-primary",
        sourceId: "local-agot",
        locatorIds: ["external-locator:answer:agot:bran-1"],
        candidateIds: [agotCandidate.id],
        resolutionActions: ["confirm"],
      }),
    );
    expect(renderAsoiafReviewedAnswerPacket(first)).toContain(
      "[local-agot:external-locator:answer:agot:bran-1]",
    );
  });

  it("requires every answer transaction to resolve a candidate routed by the dossier", () => {
    const researchDossier = dossier({ includeRecall: false, includeGap: false });
    const transaction = successfulTransaction();
    expect(() =>
      buildAsoiafReviewedAnswerPacket({
        dossier: researchDossier,
        reviewedBy: ANSWER_REVIEWER,
        reviewedAt: ANSWER_REVIEWED_AT,
        transactions: [transaction],
        claims: [
          {
            id: "answer-claim:outside-dossier",
            order: 1,
            continuityId: "book-main",
            text: "This claim attempts to use a candidate absent from the dossier.",
            transactionId: transaction.transactionId,
            evidenceRecordIds: [transaction.packet.claims[0]!.evidenceRecordId],
            resolutionDecisionIds: [
              transaction.reconciliationReceipt.canonReceipt!.resolutions[0]!.decisionId,
            ],
          },
        ],
      }),
    ).toThrow(/candidate-outside-dossier/);
  });

  it("refuses supporting-only evidence and incomplete reconciliation", () => {
    const packet = primaryPacket("supporting");
    const receipt = compileAsoiafExternalReconciliationPacket({
      packet,
      decisionInput: decisionInput(packet),
    });
    expect(receipt.passed).toBe(false);
    expect(() =>
      buildAsoiafReviewedAnswerTransaction({
        packet,
        reconciliationReceipt: receipt,
      }),
    ).toThrow(/transaction-not-adjudicated/);
  });

  it("requires every unresolved dossier gap to be closed by an adjudicated claim or exposed as a limitation", () => {
    const researchDossier = dossier();
    const transaction = successfulTransaction();
    expect(() =>
      buildAsoiafReviewedAnswerPacket({
        dossier: researchDossier,
        reviewedBy: ANSWER_REVIEWER,
        reviewedAt: ANSWER_REVIEWED_AT,
        transactions: [transaction],
        claims: [
          {
            id: "answer-claim:uncovered-gap",
            order: 1,
            continuityId: "book-main",
            text: "The claim is adjudicated but the original dossier gap is hidden.",
            transactionId: transaction.transactionId,
            evidenceRecordIds: [transaction.packet.claims[0]!.evidenceRecordId],
            resolutionDecisionIds: [
              transaction.reconciliationReceipt.canonReceipt!.resolutions[0]!.decisionId,
            ],
          },
        ],
      }),
    ).toThrow(/uncovered-gap/);

    const partial = buildAsoiafReviewedAnswerPacket({
      dossier: researchDossier,
      reviewedBy: ANSWER_REVIEWER,
      reviewedAt: ANSWER_REVIEWED_AT,
      transactions: [transaction],
      claims: [
        {
          id: "answer-claim:partial",
          order: 1,
          continuityId: "book-main",
          text: "The exact reviewed claim is rendered within an explicitly partial answer.",
          transactionId: transaction.transactionId,
          evidenceRecordIds: [transaction.packet.claims[0]!.evidenceRecordId],
          resolutionDecisionIds: [
            transaction.reconciliationReceipt.canonReceipt!.resolutions[0]!.decisionId,
          ],
        },
      ],
      limitations: [
        {
          id: "answer-limit:unclosed-recall",
          text:
            "The original dossier gap is preserved because this answer packet does not claim to close it.",
          relatedGapIds: [researchDossier.gaps[0]!.gapId],
        },
      ],
    });
    expect(partial.scope).toBe("partial");
    expect(renderAsoiafReviewedAnswerPacket(partial)).toContain("Limits:");
  });

  it("detects text, citation, closure, and packet fingerprint tampering", () => {
    const packet = completePacket();
    const tampered = {
      ...packet,
      claims: [
        {
          ...packet.claims[0]!,
          text: `${packet.claims[0]!.text} Unreviewed extension.`,
        },
      ],
      gapClosures: [
        {
          ...packet.gapClosures[0]!,
          claimIds: ["answer-claim:missing"],
        },
      ],
    };
    expect(
      validateAsoiafReviewedAnswerPacket(tampered).map((entry) => entry.code),
    ).toEqual(
      expect.arrayContaining([
        "answer-text-digest",
        "answer-claim-projection",
        "gap-closure-claim",
        "rendered-text",
        "answer-fingerprint",
        "answer-identity",
      ]),
    );
  });
});