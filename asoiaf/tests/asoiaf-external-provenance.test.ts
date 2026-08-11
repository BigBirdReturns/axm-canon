import { describe, expect, it } from "vitest";
import {
  ASOIAF_EXTERNAL_PROVENANCE_LINEAGE,
  asoiafExternalCandidateId,
  asoiafExternalObservationId,
  buildAsoiafExternalCandidate,
  buildAsoiafExternalObservation,
  containsPrivateContact,
} from "../src/external/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
const DIGEST_B = `sha256:${"b".repeat(64)}` as const;

describe("ASOIAF external provenance inheritance", () => {
  it("names Clifford Number and UnderCast as the governing collection systems", () => {
    expect(
      ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.inheritedSystems.map(
        (system) => system.repository,
      ),
    ).toEqual([
      "BigBirdReturns/clifford-number",
      "BigBirdReturns/undercast",
    ]);
    expect(
      ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.inheritedSystems[0]
        .inheritedInvariants,
    ).toEqual(
      expect.arrayContaining([
        "retrieval-produces-an-observation-before-an-assertion",
        "source-revisions-append-observations-instead-of-overwriting",
        "crawl-intake-has-no-graph-effect",
        "crawl-intake-has-no-canon-effect",
        "promotion-is-a-separate-human-reviewed-transaction",
        "claim-level-receipts-are-required-for-promotion",
      ]),
    );
    expect(
      ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.inheritedSystems[1]
        .inheritedInvariants,
    ).toEqual(
      expect.arrayContaining([
        "harvest-precedes-triage-and-triage-precedes-card",
        "a-lead-is-not-a-card",
        "default-host-delay-is-1500-milliseconds",
        "retry-after-is-honored",
        "cache-is-disposable-and-offline-replayable",
        "the-machine-source-ledger-is-complete",
        "public-credit-surfaces-include-only-required-attribution",
      ]),
    );
  });

  it("derives stable candidate identity from source and durable source-record identity", () => {
    expect(
      asoiafExternalCandidateId("structured-awoiaf-api", "pageid:123"),
    ).toBe(
      asoiafExternalCandidateId("structured-awoiaf-api", "pageid:123"),
    );
    expect(
      asoiafExternalCandidateId("structured-awoiaf-api", "pageid:123"),
    ).not.toBe(
      asoiafExternalCandidateId("structured-awoiaf-api", "pageid:124"),
    );
  });

  it("adds upstream content identity to immutable observation identity", () => {
    const base = {
      sourceId: "structured-awoiaf-api",
      sourceRecordId: "pageid:123",
    };
    expect(
      asoiafExternalObservationId({ ...base, contentDigest: DIGEST_A }),
    ).not.toBe(
      asoiafExternalObservationId({ ...base, contentDigest: DIGEST_B }),
    );
  });

  it("appends source revisions to one candidate without granting graph or canon effect", () => {
    const first = buildAsoiafExternalObservation({
      sourceId: "structured-awoiaf-api",
      sourceRecordId: "pageid:123",
      retrievedAt: "2026-08-04T00:00:00Z",
      contentDigest: DIGEST_A,
      receiptUri: "receipts/observation-a.json",
      retainedFields: ["pageid", "title", "revision"],
      retainedValue: { pageid: 123, title: "Varys", revision: 1 },
    });
    const revised = buildAsoiafExternalObservation({
      sourceId: "structured-awoiaf-api",
      sourceRecordId: "pageid:123",
      retrievedAt: "2026-08-05T00:00:00Z",
      contentDigest: DIGEST_B,
      receiptUri: "receipts/observation-b.json",
      retainedFields: ["pageid", "title", "revision"],
      retainedValue: { pageid: 123, title: "Varys", revision: 2 },
    });
    const candidate = buildAsoiafExternalCandidate(
      revised,
      buildAsoiafExternalCandidate(first),
    );
    expect(first.candidateId).toBe(revised.candidateId);
    expect(first.observationId).not.toBe(revised.observationId);
    expect(candidate.observationIds).toHaveLength(2);
    expect(candidate.firstSeen).toBe("2026-08-04T00:00:00Z");
    expect(candidate.lastSeen).toBe("2026-08-05T00:00:00Z");
    expect(candidate.graphEffect).toBe("none");
    expect(candidate.canonEffect).toBe("none");
    expect(candidate.promotionStatus).toBe("intake-only");
  });

  it("blocks private contact information before retained observation creation", () => {
    expect(containsPrivateContact({ email: "person@example.com" })).toBe(true);
    expect(containsPrivateContact({ phone: "+1 202 555 0100" })).toBe(true);
    expect(
      containsPrivateContact({
        published_at: "2026-08-04",
        title: "Public fictional reference record",
      }),
    ).toBe(false);
    expect(() =>
      buildAsoiafExternalObservation({
        sourceId: "structured-awoiaf-api",
        sourceRecordId: "pageid:123",
        retrievedAt: "2026-08-04T00:00:00Z",
        contentDigest: DIGEST_A,
        receiptUri: "receipts/rejected.json",
        retainedFields: ["email"],
        retainedValue: { email: "person@example.com" },
      }),
    ).toThrow(/private contact data/);
  });

  it("freezes polite collection and selective public-credit surfaces", () => {
    expect(
      ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.defaultCollectionPolicy,
    ).toMatchObject({
      concurrency: 1,
      hostDelayMs: 1500,
      retryCount: 4,
      robotsRespect: true,
      retryAfterRespect: true,
      cacheFirst: true,
      explicitRefreshRequired: true,
      graphEffect: "none",
      canonEffect: "none",
    });
    expect(ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.sourceLedgerPath).toBe(
      "SOURCE-LEDGER.json",
    );
    expect(ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.publicCreditPaths).toEqual([
      "CREDITS.md",
      "CREDITS.json",
      "CREDITS.bib",
    ]);
  });
});
