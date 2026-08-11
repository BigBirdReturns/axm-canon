import fs from "node:fs";
import path from "node:path";
import {
  ASOIAF_RECALL_ESTATE_PACKETS,
} from "../../src/recall/index.js";
import {
  asoiafExternalCandidateId,
  asoiafExternalObservationId,
  buildAsoiafExternalReviewPacket,
  compileAsoiafExternalReconciliationPacket,
  type AsoiafExternalDecisionInput,
  type AsoiafExternalReviewPacket,
} from "../../src/external/index.js";
import {
  buildAsoiafResearchQuestionDossier,
} from "../../tools/lib/asoiaf-research-question-dossier.js";
import {
  buildAsoiafReviewedAnswerTransaction,
  type AsoiafReviewedAnswerPacketInput,
} from "../../tools/lib/asoiaf-reviewed-answer-packet.js";

const OUTPUT = process.argv[2];
if (!OUTPUT) {
  throw new Error("output path argument is required");
}

const SOURCE_DIGEST = `sha256:${"a".repeat(64)}` as const;
const SOURCE_REVIEWER = "qualification:source-reviewer";
const ANSWER_REVIEWER = "qualification:answer-reviewer";
const SOURCE_REVIEWED_AT = "2026-08-05T04:00:00.000Z";
const ANSWER_REVIEWED_AT = "2026-08-05T04:15:00.000Z";

const selectedRecallCandidate = ASOIAF_RECALL_ESTATE_PACKETS
  .flatMap((packet) => packet.candidates)
  .find(
    (candidate) =>
      candidate.sourceHints.includes("AGOT")
      && candidate.reconciliationKeys.length > 0,
  );
if (!selectedRecallCandidate) {
  throw new Error("qualified recall estate has no AGOT candidate fixture");
}
const recallCandidate = selectedRecallCandidate;

function reviewPacket(): AsoiafExternalReviewPacket {
  const sourceId = "local-agot";
  const sourceRecordId = "isbn:9780553593716:qualification-holder-copy";
  return buildAsoiafExternalReviewPacket({
    id: "external-review:qualification:agot-answer",
    sourceId,
    continuityId: "book-main",
    observation: {
      observationId: asoiafExternalObservationId({
        sourceId,
        sourceRecordId,
        contentDigest: SOURCE_DIGEST,
      }),
      collectorCandidateId: asoiafExternalCandidateId(
        sourceId,
        sourceRecordId,
      ),
      sourceId,
      sourceRecordId,
      retrievedAt: "2026-08-05T03:45:00.000Z",
      contentDigest: SOURCE_DIGEST,
      receiptUri: "receipts/qualification-agot-answer-observation.json",
      responseBytes: 987_654,
      graphEffect: "none",
      canonEffect: "none",
      promotionStatus: "reviewed",
      reviewerId: SOURCE_REVIEWER,
      reviewedAt: SOURCE_REVIEWED_AT,
      rightsReview: {
        status: "holder-controlled-private",
        reviewedBy: SOURCE_REVIEWER,
        reviewedAt: SOURCE_REVIEWED_AT,
        rationale:
          "The synthetic fixture represents a holder-controlled exact edition; only digest, locator, and reviewed normalization enter qualification.",
      },
    },
    claims: [
      {
        id: "reviewed-claim:qualification:agot-answer",
        evidenceRecordId: "external-evidence:qualification:agot-answer",
        label: recallCandidate.label,
        claimKind: "world-state",
        authorityRole: "primary",
        continuityId: "book-main",
        locator: {
          id: "external-locator:qualification:agot-answer",
          kind: "chapter",
          unit: "AGOT/qualification-reviewed-range-1",
          start: 1,
          end: 2,
          contentDigest: SOURCE_DIGEST,
        },
        text:
          "Human-reviewed synthetic normalization supports the bounded recall candidate without retaining or publishing source prose.",
        normalized: {
          statement: recallCandidate.summary,
          sourceStanding: "exact-holder-edition",
        },
        reconciliationKeys: [recallCandidate.reconciliationKeys[0]!],
        recallCandidateIds: [recallCandidate.id],
      },
    ],
  });
}

function decisionInput(
  packet: AsoiafExternalReviewPacket,
): AsoiafExternalDecisionInput {
  const claim = packet.claims[0]!;
  return {
    id: "external-decisions:qualification:agot-answer",
    reviewerId: SOURCE_REVIEWER,
    reviewedAt: SOURCE_REVIEWED_AT,
    decisions: [
      {
        id: "external-decision:qualification:confirm-agot-answer",
        action: "confirm",
        candidateIds: [recallCandidate.id],
        evidenceRecordIds: [claim.evidenceRecordId],
        promotedRecordIds: [claim.evidenceRecordId],
        rationale:
          "The exact holder-controlled edition identity and reviewed locator confirm the bounded candidate for this qualification transaction.",
      },
    ],
  };
}

const packet = reviewPacket();
const reconciliationReceipt = compileAsoiafExternalReconciliationPacket({
  packet,
  decisionInput: decisionInput(packet),
});
if (!reconciliationReceipt.passed || !reconciliationReceipt.canonReceipt?.passed) {
  throw new Error("synthetic reconciliation fixture did not pass");
}
const transaction = buildAsoiafReviewedAnswerTransaction({
  packet,
  reconciliationReceipt,
});
const resolution = reconciliationReceipt.canonReceipt.resolutions.find(
  (entry) => entry.action === "confirm",
);
if (!resolution) {
  throw new Error("synthetic reconciliation fixture has no confirmed resolution");
}

const dossier = buildAsoiafResearchQuestionDossier({
  questionText:
    "What does the exact holder-controlled AGOT evidence establish for this bounded candidate?",
  createdBy: "qualification:researcher",
  createdAt: "2026-08-05T03:30:00.000Z",
  laneIds: ["entity-resolution"],
  continuityIds: ["book-main"],
  privateReferences: [
    {
      sourceId: "local-agot",
      editionKey: "qualification-holder-edition",
      continuityId: "book-main",
      unitId: "qualification-chapter-1",
      paragraphId: "qualification-paragraph-1",
      locator:
        "local-agot/qualification-holder-edition/qualification-chapter-1/qualification-paragraph-1",
      paragraphDigest: SOURCE_DIGEST,
      queryMode: "phrase",
      matchedTerms: ["qualification", "candidate"],
      tokenPositions: [4, 19],
      snippetDigest: null,
      snippetCharacters: null,
    },
  ],
  recallReferences: [
    {
      candidateId: recallCandidate.id,
      continuityId: "book-main",
    },
  ],
  gaps: [],
});

const input: AsoiafReviewedAnswerPacketInput = {
  dossier,
  reviewedBy: ANSWER_REVIEWER,
  reviewedAt: ANSWER_REVIEWED_AT,
  transactions: [transaction],
  claims: [
    {
      id: "answer-claim:qualification:agot-answer",
      order: 1,
      continuityId: "book-main",
      text:
        "The exact reviewed AGOT record confirms the bounded candidate in the book continuity.",
      transactionId: transaction.transactionId,
      evidenceRecordIds: [packet.claims[0]!.evidenceRecordId],
      resolutionDecisionIds: [resolution.decisionId],
    },
  ],
  gapClosures: [],
  limitations: [],
};

const target = path.resolve(OUTPUT);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(input, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    output: target,
    dossierId: dossier.dossierId,
    transactionId: transaction.transactionId,
    candidateId: recallCandidate.id,
  }, null, 2)}\n`,
);