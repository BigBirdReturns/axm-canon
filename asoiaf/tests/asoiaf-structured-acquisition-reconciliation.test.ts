import { describe, expect, it } from "vitest";
import {
  ASOIAF_RECALL_ESTATE_PACKETS,
} from "../src/recall/index.js";
import {
  asoiafExternalCandidateId,
  asoiafExternalObservationId,
  getAsoiafExternalSource,
  getAsoiafExternalWorkOrder,
  type AsoiafExternalReviewedObservation,
} from "../src/external/index.js";
import {
  ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT,
} from "../tools/lib/asoiaf-external-collector.js";
import {
  collectorContentId,
  sha256,
} from "../tools/lib/asoiaf-external-estate.js";
import {
  ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
  ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT,
  ASOIAF_STRUCTURED_REQUEST_PLAN_FORMAT,
  buildAsoiafStructuredAcquisitionReviewPacket,
  validateAsoiafStructuredAcquisitionReviewInput,
  verifyAsoiafStructuredAcquisitionReviewPacket,
  type AsoiafStructuredAcquisitionReceipt,
  type AsoiafStructuredAcquisitionReviewInput,
  type AsoiafStructuredAdapterReceipt,
  type AsoiafStructuredRequestPlan,
} from "../tools/lib/asoiaf-structured-acquisition-reconciliation.js";
import {
  buildAsoiafStructuredObservationAdmission,
  type AsoiafStructuredObservationAdmission,
} from "../tools/lib/asoiaf-structured-observation-admission.js";

const SOURCE_ID = "structured-wikidata" as const;
const ADAPTER_ID = "wikidata-sparql" as const;
const REQUEST_ID = "wikidata:varys:Q285779";
const SOURCE_RECORD_ID = "wikidata:Q285779";
const RAW_DIGEST = `sha256:${"a".repeat(64)}` as const;
const NORMALIZED_DIGEST = `sha256:${"b".repeat(64)}` as const;
const ROBOTS_DIGEST = `sha256:${"c".repeat(64)}` as const;
const RAW_BYTES = 1_024;
const NORMALIZED_BYTES = 512;
const REVIEWER = "reviewer:jonathan";
const REVIEWED_AT = "2026-08-04T17:30:00.000Z";
const RETRIEVED_AT = "2026-08-04T17:00:00.000Z";
const PLAN_URL =
  "https://query.wikidata.org/sparql?query=SELECT+%3Fitem+WHERE+%7B+%3Fitem+wdt%3AP31+wd%3AQ5+%7D+LIMIT+1&format=json";

const source = getAsoiafExternalSource(SOURCE_ID)!;
const workOrder = getAsoiafExternalWorkOrder(SOURCE_ID)!;
const recallCandidates = ASOIAF_RECALL_ESTATE_PACKETS.flatMap(
  (packet) => packet.candidates,
);
const recallCandidate = recallCandidates.find((candidate) =>
  workOrder.candidateIds.includes(candidate.id),
)!;
const continuityId = source.continuityIds[0]!;
const observationId = asoiafExternalObservationId({
  sourceId: SOURCE_ID,
  sourceRecordId: SOURCE_RECORD_ID,
  contentDigest: NORMALIZED_DIGEST,
});
const candidateId = asoiafExternalCandidateId(SOURCE_ID, SOURCE_RECORD_ID);

function withoutFingerprint<T extends { receiptFingerprint: string }>(
  value: T,
): Omit<T, "receiptFingerprint"> {
  const { receiptFingerprint: _fingerprint, ...core } = value;
  return core;
}

function reviewedObservation(): AsoiafExternalReviewedObservation {
  return {
    observationId,
    collectorCandidateId: candidateId,
    sourceId: SOURCE_ID,
    sourceRecordId: SOURCE_RECORD_ID,
    retrievedAt: RETRIEVED_AT,
    contentDigest: NORMALIZED_DIGEST,
    receiptUri: "receipts/structured-wikidata-Q285779.json",
    responseBytes: NORMALIZED_BYTES,
    graphEffect: "none",
    canonEffect: "none",
    promotionStatus: "reviewed",
    reviewerId: REVIEWER,
    reviewedAt: REVIEWED_AT,
    rightsReview: {
      status: "public-domain",
      reviewedBy: REVIEWER,
      reviewedAt: REVIEWED_AT,
      rationale:
        "Wikidata CC0 structured data was human reviewed after normalized collector custody.",
    },
  };
}

function signedPlan(): AsoiafStructuredRequestPlan {
  const core = {
    format: ASOIAF_STRUCTURED_REQUEST_PLAN_FORMAT,
    adapterId: ADAPTER_ID,
    sourceId: SOURCE_ID,
    requestId: REQUEST_ID,
    method: "GET" as const,
    url: PLAN_URL,
    headers: {
      "User-Agent": ASOIAF_EXTERNAL_COLLECTOR_USER_AGENT,
      Accept: "application/sparql-results+json",
    },
    responseMediaType: "application/json" as const,
    recordLimit: 1,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return { ...core, planFingerprint: sha256(core) };
}

function adapterReceipt(): AsoiafStructuredAdapterReceipt {
  const core = {
    format: ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT,
    adapterId: ADAPTER_ID,
    sourceId: SOURCE_ID,
    requestId: REQUEST_ID,
    sourceUri: PLAN_URL,
    retrievedAt: RETRIEVED_AT,
    sourceResponseDigest: RAW_DIGEST,
    sourceResponseBytes: RAW_BYTES,
    inputRecordCount: 1,
    committedRecordCount: 1,
    observationIds: [observationId],
    candidateIds: [candidateId],
    normalizedRecordIds: ["asoiaf-structured-record:wikidata-Q285779"],
    rejected: [],
    outcome: "observed" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  return { ...core, receiptFingerprint: sha256(core) };
}

function acquisitionReceipt(input?: {
  outcome?: "observed" | "cache-hit";
  adapter?: AsoiafStructuredAdapterReceipt;
}): AsoiafStructuredAcquisitionReceipt {
  const plan = signedPlan();
  const adapter = input?.adapter ?? adapterReceipt();
  const outcome = input?.outcome ?? "observed";
  const core = {
    format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
    planFingerprint: plan.planFingerprint,
    adapterId: ADAPTER_ID,
    sourceId: SOURCE_ID,
    requestId: REQUEST_ID,
    requestedUrl: PLAN_URL,
    finalUrl: PLAN_URL,
    retrievedAt: RETRIEVED_AT,
    completedAt: outcome === "cache-hit"
      ? "2026-08-04T18:00:00.000Z"
      : "2026-08-04T17:00:03.000Z",
    requestCount: outcome === "cache-hit" ? 0 : 2,
    waitedMilliseconds: outcome === "cache-hit" ? 0 : 1_500,
    redirectCount: 0,
    robotsUrl: "https://query.wikidata.org/robots.txt",
    robotsStatus: "allowed" as const,
    robotsDigest: ROBOTS_DIGEST,
    httpStatus: 200,
    responseMediaType: "application/sparql-results+json",
    responseBytes: RAW_BYTES,
    sourceResponseDigest: RAW_DIGEST,
    adapterReceiptFingerprint: adapter.receiptFingerprint,
    committedRecordCount: 1,
    observationIds: [observationId],
    candidateIds: [candidateId],
    gapId: null,
    outcome,
    rawResponseRetained: false as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const receiptFingerprint = sha256(core);
  return {
    ...core,
    receiptId: collectorContentId("asoiaf-structured-acquisition-receipt", {
      requestId: REQUEST_ID,
      planFingerprint: plan.planFingerprint,
      receiptFingerprint,
    }),
    receiptFingerprint,
  };
}

function reviewInput(input?: {
  outcome?: "observed" | "cache-hit";
  adapter?: AsoiafStructuredAdapterReceipt;
  observation?: AsoiafExternalReviewedObservation;
  acquisitionReceiptUri?: string;
  admission?: AsoiafStructuredObservationAdmission;
}): AsoiafStructuredAcquisitionReviewInput {
  const adapter = input?.adapter ?? adapterReceipt();
  const plan = signedPlan();
  const acquisition = acquisitionReceipt({
    outcome: input?.outcome,
    adapter,
  });
  const observation = input?.observation ?? reviewedObservation();
  const admission = input?.admission ?? buildAsoiafStructuredObservationAdmission({
    sourceId: SOURCE_ID,
    adapterId: ADAPTER_ID,
    requestId: REQUEST_ID,
    planFingerprint: plan.planFingerprint,
    acquisitionReceiptId: acquisition.receiptId,
    acquisitionReceiptFingerprint: acquisition.receiptFingerprint,
    adapterReceiptFingerprint: adapter.receiptFingerprint,
    observationId: observation.observationId,
    candidateId: observation.collectorCandidateId,
    normalizedContentDigest: observation.contentDigest,
    questionLaneIds: ["entity-resolution"],
    evidence: [
      {
        field: "upstream-record",
        value: SOURCE_RECORD_ID,
        effect: "supports-admission",
        note: "The exact Wikidata record identity matches the selected structured entity-resolution fixture.",
      },
      {
        field: "title",
        value: "Varys",
        effect: "supports-admission",
        note: "The reviewed label and record identity serve the bounded Varys entity-resolution question.",
      },
    ],
    outcome: "admit-to-review",
    reason: "exact-identity-and-question-match",
    rationale:
      "The exact upstream record identity and reviewed label match the selected Varys entity-resolution question, while the structured record remains supporting-only evidence.",
    reviewedBy: REVIEWER,
    reviewedAt: REVIEWED_AT,
    authorityRole: "admission-only",
    graphEffect: "none",
    canonEffect: "none",
  });
  return {
    plan,
    acquisitionReceipt: acquisition,
    acquisitionReceiptUri:
      input?.acquisitionReceiptUri
      ?? "structured-acquisition-receipts/acquisition-Q285779.json",
    adapterReceipt: adapter,
    adapterReceiptUri: "structured-adapter-receipts/wikidata-varys-Q285779.json",
    observation,
    admission,
  };
}

function claim(authorityRole: "supporting" | "primary" = "supporting") {
  return {
    id: "reviewed-claim:wikidata:varys",
    evidenceRecordId: "external-evidence:wikidata:varys",
    label: recallCandidate.label,
    claimKind: "dataset-observation" as const,
    authorityRole,
    continuityId,
    locator: {
      id: "external-locator:wikidata:Q285779",
      kind: "record" as const,
      unit: SOURCE_RECORD_ID,
      contentDigest: NORMALIZED_DIGEST,
    },
    text:
      "Human-reviewed structured supporting evidence linked to the selected recall candidate.",
    normalized: {
      statement: recallCandidate.summary,
      upstreamIdentity: SOURCE_RECORD_ID,
    },
    reconciliationKeys: [recallCandidate.reconciliationKeys[0]!],
    recallCandidateIds: [recallCandidate.id],
  };
}

function buildReviewed(input = reviewInput()) {
  return buildAsoiafStructuredAcquisitionReviewPacket({
    ...input,
    packetId: "external-review:wikidata:varys",
    continuityId,
    claims: [claim()],
  });
}

describe("ASOIAF structured acquisition reconciliation custody", () => {
  it("binds signed acquisition, raw response, normalized observation, and reviewed packet deterministically", () => {
    expect(source.authorityClass).toBe("structured-dataset");
    expect(workOrder.candidateIds).toContain(recallCandidate.id);
    const input = reviewInput();
    expect(validateAsoiafStructuredAcquisitionReviewInput(input)).toEqual([]);

    const first = buildReviewed(input);
    const second = buildReviewed(input);
    expect(second).toEqual(first);
    expect(
      verifyAsoiafStructuredAcquisitionReviewPacket(
        first.packet,
        first.binding,
      ),
    ).toEqual([]);

    expect(first.binding).toEqual(
      expect.objectContaining({
        requestId: REQUEST_ID,
        sourceResponseDigest: RAW_DIGEST,
        normalizedContentDigest: NORMALIZED_DIGEST,
      admissionOutcome: "admit-to-review",
      admissionReason: "exact-identity-and-question-match",
      admissionReviewedBy: REVIEWER,
      admissionQuestionLaneIds: ["entity-resolution"],
      rawResponseRetained: false,
        authorityRole: "supporting-only",
        cacheReplay: false,
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
    expect(first.packet.claims[0]?.authorityRole).toBe("supporting");
    expect(first.evidenceBundle.sources[0]).toEqual(
      expect.objectContaining({
        version: SOURCE_RECORD_ID,
        digest: "b".repeat(64),
        fileSizeBytes: NORMALIZED_BYTES,
      }),
    );
    expect(first.evidenceBundle.records[0]?.normalized).toEqual(
      expect.objectContaining({
        acquisitionSourceResponseDigest: RAW_DIGEST,
        normalizedObservationDigest: NORMALIZED_DIGEST,
        acquisitionRawResponseRetained: false,
      structuredAdmissionOutcome: "admit-to-review",
      structuredAdmissionReason: "exact-identity-and-question-match",
      }),
    );
    expect(RAW_DIGEST).not.toBe(NORMALIZED_DIGEST);
  });

  it("refuses an off-topic observation before claim construction", () => {
    const admitted = reviewInput();
    const rejected = buildAsoiafStructuredObservationAdmission({
      sourceId: admitted.plan.sourceId,
      adapterId: admitted.plan.adapterId,
      requestId: admitted.plan.requestId,
      planFingerprint: admitted.plan.planFingerprint,
      acquisitionReceiptId: admitted.acquisitionReceipt.receiptId,
      acquisitionReceiptFingerprint: admitted.acquisitionReceipt.receiptFingerprint,
      adapterReceiptFingerprint: admitted.adapterReceipt.receiptFingerprint,
      observationId: admitted.observation.observationId,
      candidateId: admitted.observation.collectorCandidateId,
      normalizedContentDigest: admitted.observation.contentDigest,
      questionLaneIds: ["entity-resolution"],
      evidence: [
        {
          field: "container",
          value: "Unrelated reference work",
          effect: "supports-rejection",
          note: "The retained container identifies a lexical collision outside the selected ASOIAF question.",
        },
      ],
      outcome: "reject-off-topic",
      reason: "off-topic-query-collision",
      rationale:
        "The exact retained work identity does not serve the selected ASOIAF question, so the observation remains intake-only and cannot enter supporting claim construction.",
      reviewedBy: REVIEWER,
      reviewedAt: REVIEWED_AT,
      authorityRole: "admission-only",
      graphEffect: "none",
      canonEffect: "none",
    });
    const rejectedInput = { ...admitted, admission: rejected };
    expect(
      validateAsoiafStructuredAcquisitionReviewInput(rejectedInput).map(
        (entry) => entry.code,
      ),
    ).toContain("observation-not-admitted");
    expect(() =>
      buildAsoiafStructuredAcquisitionReviewPacket({
        ...rejectedInput,
        packetId: "external-review:wikidata:off-topic-refusal",
        continuityId,
        claims: [claim()],
      }),
    ).toThrow(/observation-not-admitted/);
  });

  it("refuses structured reference evidence that attempts primary adjudicating authority", () => {
    expect(() =>
      buildAsoiafStructuredAcquisitionReviewPacket({
        ...reviewInput(),
        packetId: "external-review:wikidata:primary-refusal",
        continuityId,
        claims: [claim("primary")],
      }),
    ).toThrow(/supporting evidence/);
  });

  it("refuses stale plan, adapter, and acquisition custody", () => {
    const input = reviewInput();
    const stalePlan = {
      ...input.plan,
      recordLimit: input.plan.recordLimit + 1,
    };
    expect(
      validateAsoiafStructuredAcquisitionReviewInput({
        ...input,
        plan: stalePlan,
      }).map((entry) => entry.code),
    ).toContain("plan-fingerprint");

    const changedAdapterCore = {
      ...withoutFingerprint(input.adapterReceipt),
      sourceResponseDigest: `sha256:${"d".repeat(64)}` as const,
    };
    const changedAdapter = {
      ...changedAdapterCore,
      receiptFingerprint: sha256(changedAdapterCore),
    };
    const rawCustodyFindings = validateAsoiafStructuredAcquisitionReviewInput({
      ...input,
      adapterReceipt: changedAdapter,
    }).map((entry) => entry.code);
    expect(rawCustodyFindings).toEqual(
      expect.arrayContaining([
        "raw-response-custody",
        "adapter-acquisition-fingerprint",
      ]),
    );

    const staleAcquisition = {
      ...input.acquisitionReceipt,
      waitedMilliseconds: input.acquisitionReceipt.waitedMilliseconds + 1,
    };
    expect(
      validateAsoiafStructuredAcquisitionReviewInput({
        ...input,
        acquisitionReceipt: staleAcquisition,
      }).map((entry) => entry.code),
    ).toEqual(
      expect.arrayContaining([
        "acquisition-receipt-fingerprint",
        "acquisition-receipt-identity",
      ]),
    );
  });

  it("refuses a reviewed observation outside the acquisition identity set", () => {
    const input = reviewInput();
    const differentDigest = `sha256:${"e".repeat(64)}` as const;
    const differentObservation = {
      ...input.observation,
      observationId: asoiafExternalObservationId({
        sourceId: SOURCE_ID,
        sourceRecordId: SOURCE_RECORD_ID,
        contentDigest: differentDigest,
      }),
      contentDigest: differentDigest,
    };
    expect(
      validateAsoiafStructuredAcquisitionReviewInput({
        ...input,
        observation: differentObservation,
      }).map((entry) => entry.code),
    ).toContain("reviewed-observation-parity");
  });

  it("preserves a zero-request cache replay as supporting custody", () => {
    const input = reviewInput({ outcome: "cache-hit" });
    expect(validateAsoiafStructuredAcquisitionReviewInput(input)).toEqual([]);
    const reviewed = buildReviewed(input);
    expect(reviewed.binding.cacheReplay).toBe(true);
    expect(reviewed.binding.requestCount).toBe(0);
    expect(reviewed.binding.acquisitionOutcome).toBe("cache-hit");
    expect(
      reviewed.evidenceBundle.records[0]?.normalized,
    ).toEqual(expect.objectContaining({ acquisitionCacheReplay: true }));
  });

  it("refuses receipt locators that escape the holder-controlled estate", () => {
    const findings = validateAsoiafStructuredAcquisitionReviewInput(
      reviewInput({ acquisitionReceiptUri: "../outside.json" }),
    );
    expect(findings.map((entry) => entry.code)).toContain("unsafe-receipt-uri");
  });
});