import { describe, expect, it } from "vitest";
import {
  getAsoiafExternalSource,
  type AsoiafExternalContinuity,
} from "../src/external/index.js";
import {
  ASOIAF_RECALL_ESTATE_PACKETS,
} from "../src/recall/index.js";
import {
  collectorContentId,
  sha256,
} from "../tools/lib/asoiaf-external-estate.js";
import {
  ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
  type AsoiafStructuredAcquisitionReceipt,
} from "../tools/lib/asoiaf-structured-acquisition-source-health.js";
import {
  ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT,
  type AsoiafStructuredObservationAdmission,
  type AsoiafStructuredObservationAdmissionOutcome,
} from "../tools/lib/asoiaf-structured-observation-admission-health.js";
import {
  buildAsoiafResearchQuestionDossier,
  routeAsoiafResearchQuestion,
  validateAsoiafResearchQuestionDossier,
  type AsoiafResearchQuestionDossier,
} from "../tools/lib/asoiaf-research-question-dossier.js";

const CREATED_AT = "2026-08-04T20:00:00.000Z";
const REVIEWED_AT = "2026-08-04T19:30:00.000Z";
const RETRIEVED_AT = "2026-08-04T19:00:00.000Z";
const COMPLETED_AT = "2026-08-04T19:00:03.000Z";
const RAW_DIGEST = `sha256:${"a".repeat(64)}` as const;
const NORMALIZED_DIGEST = `sha256:${"b".repeat(64)}` as const;
const ROBOTS_DIGEST = `sha256:${"c".repeat(64)}` as const;
const ADAPTER_FINGERPRINT = `sha256:${"d".repeat(64)}` as const;
const STRUCTURED_SOURCE_ID = "structured-wikidata" as const;
const STRUCTURED_ADAPTER_ID = "wikidata-sparql" as const;
const REQUEST_ID = "wikidata:varys:Q285779";
const OBSERVATION_ID = "asoiaf-external-observation:question-dossier-varys";
const CANDIDATE_ID = "asoiaf-external-candidate:question-dossier-varys";
const PLAN_URL =
  "https://query.wikidata.org/sparql?query=SELECT+%3Fitem+WHERE+%7B+%3Fitem+rdfs%3Alabel+%22Varys%22%40en+%7D+LIMIT+1&format=json";
const STRUCTURED_CONTINUITY = getAsoiafExternalSource(
  STRUCTURED_SOURCE_ID,
)!.continuityIds[0]!;
const RECALL_CANDIDATE = ASOIAF_RECALL_ESTATE_PACKETS
  .flatMap((packet) => packet.candidates)
  .find((candidate) => candidate.continuityHints.includes("book-main"))!;

function acquisitionReceipt(): AsoiafStructuredAcquisitionReceipt {
  const planCore = {
    format: "axm-asoiaf-structured-request-plan/1",
    adapterId: STRUCTURED_ADAPTER_ID,
    sourceId: STRUCTURED_SOURCE_ID,
    requestId: REQUEST_ID,
    method: "GET",
    url: PLAN_URL,
    headers: { Accept: "application/sparql-results+json" },
    responseMediaType: "application/json",
    recordLimit: 1,
    graphEffect: "none",
    canonEffect: "none",
  };
  const planFingerprint = sha256(planCore);
  const core = {
    format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
    planFingerprint,
    adapterId: STRUCTURED_ADAPTER_ID,
    sourceId: STRUCTURED_SOURCE_ID,
    requestId: REQUEST_ID,
    requestedUrl: PLAN_URL,
    finalUrl: PLAN_URL,
    retrievedAt: RETRIEVED_AT,
    completedAt: COMPLETED_AT,
    requestCount: 2,
    waitedMilliseconds: 1_500,
    redirectCount: 0,
    robotsUrl: "https://query.wikidata.org/robots.txt",
    robotsStatus: "allowed" as const,
    robotsDigest: ROBOTS_DIGEST,
    httpStatus: 200,
    responseMediaType: "application/sparql-results+json",
    responseBytes: 1_024,
    sourceResponseDigest: RAW_DIGEST,
    adapterReceiptFingerprint: ADAPTER_FINGERPRINT,
    committedRecordCount: 1,
    observationIds: [OBSERVATION_ID],
    candidateIds: [CANDIDATE_ID],
    gapId: null,
    outcome: "observed" as const,
    rawResponseRetained: false as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const receiptFingerprint = sha256(core);
  return {
    ...core,
    receiptId: collectorContentId("asoiaf-structured-acquisition-receipt", {
      requestId: REQUEST_ID,
      planFingerprint,
      receiptFingerprint,
    }),
    receiptFingerprint,
  };
}

function admission(
  receipt: AsoiafStructuredAcquisitionReceipt,
  outcome: AsoiafStructuredObservationAdmissionOutcome = "admit-to-review",
): AsoiafStructuredObservationAdmission {
  const outcomeFields = outcome === "admit-to-review"
    ? {
        reason: "exact-identity-and-question-match" as const,
        evidence: [
          {
            field: "title" as const,
            value: "Varys",
            effect: "supports-admission" as const,
            note: "The reviewed label serves the bounded entity-resolution question.",
          },
          {
            field: "upstream-record" as const,
            value: "wikidata:Q285779",
            effect: "supports-admission" as const,
            note: "The exact upstream record identity matches the selected fixture.",
          },
        ],
        rationale:
          "The exact upstream identity and reviewed label serve the selected entity-resolution question while remaining supporting-only evidence.",
      }
    : outcome === "reject-off-topic"
      ? {
          reason: "off-topic-query-collision" as const,
          evidence: [
            {
              field: "container" as const,
              value: "Unrelated reference work",
              effect: "supports-rejection" as const,
              note: "The retained container identifies a lexical collision outside ASOIAF.",
            },
          ],
          rationale:
            "The retained work identity does not serve the selected ASOIAF question and remains intake-only without claim construction.",
        }
      : {
          reason: "insufficient-work-identity" as const,
          evidence: [
            {
              field: "title" as const,
              value: "Varys",
              effect: "unresolved" as const,
              note: "The retained title lacks a durable upstream identity sufficient for review.",
            },
          ],
          rationale:
            "The retained title lacks a durable creator, revision, edition, or upstream record identity sufficient for semantic admission.",
        };
  const core = {
    format: ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT,
    sourceId: STRUCTURED_SOURCE_ID,
    adapterId: STRUCTURED_ADAPTER_ID,
    requestId: REQUEST_ID,
    planFingerprint: receipt.planFingerprint,
    acquisitionReceiptId: receipt.receiptId,
    acquisitionReceiptFingerprint: receipt.receiptFingerprint,
    adapterReceiptFingerprint: ADAPTER_FINGERPRINT,
    observationId: OBSERVATION_ID,
    candidateId: CANDIDATE_ID,
    normalizedContentDigest: NORMALIZED_DIGEST,
    questionLaneIds: ["entity-resolution"],
    evidence: outcomeFields.evidence,
    outcome,
    reason: outcomeFields.reason,
    rationale: outcomeFields.rationale,
    reviewedBy: "reviewer:jonathan",
    reviewedAt: REVIEWED_AT,
    authorityRole: "admission-only" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const admissionFingerprint = sha256(core);
  return {
    ...core,
    admissionId: collectorContentId(
      "asoiaf-structured-observation-admission",
      {
        observationId: OBSERVATION_ID,
        candidateId: CANDIDATE_ID,
        admissionFingerprint,
      },
    ),
    admissionFingerprint,
  };
}

function completeDossier(
  outcome: AsoiafStructuredObservationAdmissionOutcome = "admit-to-review",
): AsoiafResearchQuestionDossier {
  const receipt = acquisitionReceipt();
  return buildAsoiafResearchQuestionDossier({
    questionText: "Who is Varys, and which exact sources establish his identity?",
    createdBy: "researcher:jonathan",
    createdAt: CREATED_AT,
    laneIds: ["entity-resolution"],
    continuityIds: ["book-main", STRUCTURED_CONTINUITY].sort() as AsoiafExternalContinuity[],
    crossContinuityReason:
      "Compare holder-controlled book evidence with structured identity metadata without blending their authority.",
    privateReferences: [
      {
        sourceId: "local-agot",
        editionKey: "agot-holder-edition",
        continuityId: "book-main",
        unitId: "chapter-4",
        paragraphId: "paragraph-12",
        locator: "local-agot/agot-holder-edition/chapter-4/paragraph-12",
        paragraphDigest: `sha256:${"e".repeat(64)}`,
        queryMode: "phrase",
        matchedTerms: ["varys", "spider"],
        tokenPositions: [4, 19],
        snippetDigest: `sha256:${"f".repeat(64)}`,
        snippetCharacters: 180,
      },
    ],
    structuredReferences: [
      {
        continuityId: STRUCTURED_CONTINUITY,
        acquisitionReceipt: receipt,
        admission: admission(receipt, outcome),
      },
    ],
    recallReferences: [
      {
        candidateId: RECALL_CANDIDATE.id,
        continuityId: "book-main",
      },
    ],
    gaps: [
      {
        kind: "recall-unreconciled",
        laneId: "entity-resolution",
        continuityId: "book-main",
        candidateId: RECALL_CANDIDATE.id,
        detail:
          "The recall candidate remains a navigation lead until exact source evidence is reconciled.",
      },
    ],
  });
}

describe("ASOIAF research question dossier", () => {
  it("builds one deterministic evidence map without retaining the question or source text", () => {
    const first = completeDossier();
    const second = completeDossier();
    expect(second).toEqual(first);
    expect(
      validateAsoiafResearchQuestionDossier(first).filter(
        (finding) => finding.severity === "error",
      ),
    ).toEqual([]);
    expect(first.question).toEqual(
      expect.objectContaining({
        laneIds: ["entity-resolution"],
        questionTextRetained: false,
        authority: "none",
        answerEffect: "none",
      }),
    );
    expect(first.privateReferences[0]).toEqual(
      expect.objectContaining({
        standing: "navigation-only",
        textRetained: false,
      }),
    );
    expect(first.structuredReferences[0]?.standing).toBe("supporting-only");
    expect(first.recallReferences[0]).toEqual(
      expect.objectContaining({
        authority: "none",
        standing: "navigation-only",
      }),
    );
    expect(first.nextActions).toEqual(
      expect.arrayContaining([
        "close-gap",
        "reconcile-candidate",
        "split-continuity",
      ]),
    );
    expect(first.evidenceReady).toBe(false);
    expect(first.answerReady).toBe(false);
  });

  it("routes a natural-language question through the qualified lane aliases", () => {
    const route = routeAsoiafResearchQuestion(
      "Who is Varys and what is his relation to R'hllor?",
      ["book-main"],
    );
    expect(route.laneIds).toEqual(
      expect.arrayContaining(["entity-resolution", "varys-rhllor"]),
    );
    expect(route.sourceIds).toContain("local-acok");
  });

  it("keeps an off-topic structured observation visible as rejected", () => {
    const dossier = completeDossier("reject-off-topic");
    expect(dossier.structuredReferences[0]?.standing).toBe("rejected");
    expect(dossier.standingCounts.rejected).toBe(1);
    expect(dossier.nextActions).toContain("inspect-disposition");
    expect(
      validateAsoiafResearchQuestionDossier(dossier).filter(
        (finding) => finding.severity === "error",
      ),
    ).toEqual([]);
  });

  it("keeps an insufficient-identity structured observation visible as deferred", () => {
    const dossier = completeDossier("defer-insufficient-identity");
    expect(dossier.structuredReferences[0]?.standing).toBe("deferred");
    expect(dossier.standingCounts.deferred).toBe(1);
    expect(dossier.nextActions).toContain("inspect-disposition");
  });

  it("refuses silent multi-continuity research", () => {
    expect(() =>
      buildAsoiafResearchQuestionDossier({
        questionText: "Who is Varys?",
        createdBy: "researcher:jonathan",
        createdAt: CREATED_AT,
        laneIds: ["entity-resolution"],
        continuityIds: ["book-main", "hbo-got"],
      }),
    ).toThrow(/question-cross-continuity-reason/);
  });

  it("refuses a same-continuity lane that spans book and adaptation continuities", () => {
    expect(() =>
      buildAsoiafResearchQuestionDossier({
        questionText: "Locate the exact line in both book and episode dialogue.",
        createdBy: "researcher:jonathan",
        createdAt: CREATED_AT,
        laneIds: ["exact-quotation"],
        continuityIds: ["book-main", "hbo-got"],
        crossContinuityReason: "Compare the adaptation line with the book line.",
      }),
    ).toThrow(/question-continuity-mix/);
  });

  it("refuses a stale acquisition fingerprint inside a structured reference", () => {
    const receipt = acquisitionReceipt();
    const staleReceipt = {
      ...receipt,
      waitedMilliseconds: receipt.waitedMilliseconds + 1,
    };
    expect(() =>
      buildAsoiafResearchQuestionDossier({
        questionText: "Who is Varys?",
        createdBy: "researcher:jonathan",
        createdAt: CREATED_AT,
        laneIds: ["entity-resolution"],
        continuityIds: [STRUCTURED_CONTINUITY],
        structuredReferences: [
          {
            continuityId: STRUCTURED_CONTINUITY,
            acquisitionReceipt: staleReceipt,
            admission: admission(receipt),
          },
        ],
      }),
    ).toThrow(/structured-acquisition-integrity/);
  });

  it("refuses a structured admission whose question lane is outside the dossier", () => {
    const receipt = acquisitionReceipt();
    const original = admission(receipt);
    const changedCore = {
      ...original,
      questionLaneIds: ["varys-rhllor"],
    };
    const {
      admissionId: _admissionId,
      admissionFingerprint: _admissionFingerprint,
      ...core
    } = changedCore;
    const admissionFingerprint = sha256(core);
    const changedAdmission = {
      ...core,
      admissionId: collectorContentId(
        "asoiaf-structured-observation-admission",
        {
          observationId: core.observationId,
          candidateId: core.candidateId,
          admissionFingerprint,
        },
      ),
      admissionFingerprint,
    };
    expect(() =>
      buildAsoiafResearchQuestionDossier({
        questionText: "Who is Varys?",
        createdBy: "researcher:jonathan",
        createdAt: CREATED_AT,
        laneIds: ["entity-resolution"],
        continuityIds: [STRUCTURED_CONTINUITY],
        structuredReferences: [
          {
            continuityId: STRUCTURED_CONTINUITY,
            acquisitionReceipt: receipt,
            admission: changedAdmission,
          },
        ],
      }),
    ).toThrow(/structured-lane-parity/);
  });

  it("refuses an unknown recall candidate", () => {
    expect(() =>
      buildAsoiafResearchQuestionDossier({
        questionText: "Who is Varys?",
        createdBy: "researcher:jonathan",
        createdAt: CREATED_AT,
        laneIds: ["entity-resolution"],
        continuityIds: ["book-main"],
        recallReferences: [
          {
            candidateId: "asoiaf-recall:missing-candidate",
            continuityId: "book-main",
          },
        ],
      }),
    ).toThrow(/recall-candidate/);
  });

  it("detects dossier tampering and stale projections", () => {
    const dossier = completeDossier();
    const tampered = {
      ...dossier,
      answerReady: true as const,
      nextActions: [],
    };
    expect(
      validateAsoiafResearchQuestionDossier(
        tampered as unknown as typeof dossier,
      ).map(
        (finding) => finding.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "dossier-authority",
        "next-actions",
        "dossier-fingerprint",
        "dossier-identity",
      ]),
    );
  });

  it("refuses a private reference that escapes its exact local locator", () => {
    expect(() =>
      buildAsoiafResearchQuestionDossier({
        questionText: "Who is Varys?",
        createdBy: "researcher:jonathan",
        createdAt: CREATED_AT,
        laneIds: ["entity-resolution"],
        continuityIds: ["book-main"],
        privateReferences: [
          {
            sourceId: "local-agot",
            editionKey: "agot-holder-edition",
            continuityId: "book-main",
            unitId: "chapter-4",
            paragraphId: "paragraph-12",
            locator: "../outside-private-estate",
            paragraphDigest: `sha256:${"e".repeat(64)}`,
            queryMode: "all",
            matchedTerms: ["varys"],
            tokenPositions: [4],
          },
        ],
      }),
    ).toThrow(/private-custody/);
  });
});