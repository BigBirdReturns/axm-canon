import { describe, expect, it } from "vitest";
import {
  assertAsoiafStructuredObservationAdmitted,
  buildAsoiafStructuredObservationAdmission,
  validateAsoiafStructuredObservationAdmission,
  type AsoiafStructuredObservationAdmissionInput,
} from "../tools/lib/asoiaf-structured-observation-admission.js";

const PLAN_DIGEST = `sha256:${"1".repeat(64)}` as const;
const ACQUISITION_DIGEST = `sha256:${"2".repeat(64)}` as const;
const ADAPTER_DIGEST = `sha256:${"3".repeat(64)}` as const;
const NORMALIZED_DIGEST = `sha256:${"4".repeat(64)}` as const;

function input(
  overrides: Partial<AsoiafStructuredObservationAdmissionInput> = {},
): AsoiafStructuredObservationAdmissionInput {
  return {
    sourceId: "structured-crossref-api",
    adapterId: "crossref-works",
    requestId: "canary:crossref:asoiaf-search",
    planFingerprint: PLAN_DIGEST,
    acquisitionReceiptId:
      "asoiaf-structured-acquisition-receipt:ed537a216b5805b220b413faea315b46",
    acquisitionReceiptFingerprint: ACQUISITION_DIGEST,
    adapterReceiptFingerprint: ADAPTER_DIGEST,
    observationId: "asoiaf-external-observation:98eab5f8",
    candidateId: "asoiaf-external-candidate:348e451b",
    normalizedContentDigest: NORMALIZED_DIGEST,
    questionLaneIds: ["publication-and-edition-history"],
    evidence: [
      {
        field: "doi",
        value: "10.2307/j.ctvckq9kd.7",
        effect: "supports-rejection",
        note: "The DOI identifies a University of Arizona Press chapter rather than an ASOIAF publication.",
      },
      {
        field: "container",
        value: "The Northeast",
        effect: "supports-rejection",
        note: "The container title places the work outside the registered ASOIAF publication question.",
      },
      {
        field: "publisher",
        value: "University of Arizona Press",
        effect: "supports-rejection",
        note: "The publisher metadata does not match an ASOIAF book, companion, adaptation, or scholarship target.",
      },
    ],
    outcome: "reject-off-topic",
    reason: "off-topic-query-collision",
    rationale:
      "The broad title search returned a lexical collision whose exact DOI, container, and publisher identify a different work, so the observation remains intake-only and cannot enter ASOIAF claim review.",
    reviewedBy: "reviewer:jonathan",
    reviewedAt: "2026-08-04T18:00:00.000Z",
    authorityRole: "admission-only",
    graphEffect: "none",
    canonEffect: "none",
    ...overrides,
  };
}

describe("ASOIAF structured observation admission", () => {
  it("builds a deterministic content-addressed off-topic rejection", () => {
    const first = buildAsoiafStructuredObservationAdmission(input());
    const second = buildAsoiafStructuredObservationAdmission(input());

    expect(second).toEqual(first);
    expect(validateAsoiafStructuredObservationAdmission(first)).toEqual([]);
    expect(first).toEqual(
      expect.objectContaining({
        outcome: "reject-off-topic",
        reason: "off-topic-query-collision",
        authorityRole: "admission-only",
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
    expect(first.evidence.map((entry) => entry.field)).toEqual([
      "container",
      "doi",
      "publisher",
    ]);
    expect(() => assertAsoiafStructuredObservationAdmitted(first)).toThrow(
      /reject-off-topic/,
    );
  });

  it("admits a bounded relevant metadata observation only through a named review", () => {
    const admitted = buildAsoiafStructuredObservationAdmission(
      input({
        outcome: "admit-to-review",
        reason: "exact-identity-and-question-match",
        evidence: [
          {
            field: "doi",
            value: "10.0000/example.asoiaf",
            effect: "supports-admission",
            note: "The exact DOI resolves to the selected ASOIAF scholarship work.",
          },
          {
            field: "title",
            value: "A Song of Ice and Fire: Exact Scholarship Fixture",
            effect: "supports-admission",
            note: "The title and work identity match the publication-history question lane.",
          },
        ],
        rationale:
          "The exact DOI and title identify the selected work, and the retained bibliographic fields directly support the bounded publication-history question without acquiring adjudicating authority.",
      }),
    );

    expect(validateAsoiafStructuredObservationAdmission(admitted)).toEqual([]);
    expect(() => assertAsoiafStructuredObservationAdmitted(admitted)).not.toThrow();
  });

  it("preserves an insufficient-identity defer without constructing review authority", () => {
    const deferred = buildAsoiafStructuredObservationAdmission(
      input({
        outcome: "defer-insufficient-identity",
        reason: "insufficient-work-identity",
        evidence: [
          {
            field: "title",
            value: "A Song of Ice and Fire",
            effect: "unresolved",
            note: "The title alone does not distinguish the intended work from lexical collisions.",
          },
        ],
        rationale:
          "The retained title lacks an exact creator, edition, DOI, ISBN, revision, or other durable identity sufficient to decide whether the observation serves the selected question lane.",
      }),
    );

    expect(validateAsoiafStructuredObservationAdmission(deferred)).toEqual([]);
    expect(() => assertAsoiafStructuredObservationAdmitted(deferred)).toThrow(
      /defer-insufficient-identity/,
    );
  });

  it("refuses incompatible reasons and evidence effects", () => {
    expect(() =>
      buildAsoiafStructuredObservationAdmission(
        input({
          outcome: "admit-to-review",
          reason: "off-topic-query-collision",
        }),
      ),
    ).toThrow(/admission-reason/);

    expect(() =>
      buildAsoiafStructuredObservationAdmission(
        input({
          outcome: "admit-to-review",
          reason: "bounded-relevant-metadata",
          evidence: [
            {
              field: "title",
              value: "Ambiguous title",
              effect: "unresolved",
              note: "The title remains unresolved and cannot support admission.",
            },
          ],
        }),
      ),
    ).toThrow(/admission-evidence-effect/);
  });

  it("detects stale fingerprints and admission identities", () => {
    const admission = buildAsoiafStructuredObservationAdmission(input());
    const stale = {
      ...admission,
      rationale: `${admission.rationale} Altered after review.`,
    };
    expect(
      validateAsoiafStructuredObservationAdmission(stale).map(
        (entry) => entry.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "admission-fingerprint",
        "admission-id",
      ]),
    );
  });
});