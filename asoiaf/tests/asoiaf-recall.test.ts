import { describe, expect, it } from "vitest";
import {
  ASOIAF_MODEL_RECALL_FINDINGS,
  ASOIAF_MODEL_RECALL_MANIFEST,
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
  queryAsoiafModelRecall,
} from "../src/recall/index.js";
import {
  buildCanonRecallEstateManifest,
  validateCanonRecallEstate,
} from "../../src/canon/recall/index.js";

describe("ASOIAF model-recall estate", () => {
  it("is a non-authoritative review queue rather than canon", () => {
    expect(ASOIAF_MODEL_RECALL_PACKETS).toHaveLength(10);
    expect(
      ASOIAF_MODEL_RECALL_PACKETS.every(
        (packet) => packet.authority === "none" && packet.compilationEligible === false,
      ),
    ).toBe(true);
    expect(ASOIAF_MODEL_RECALL_FINDINGS.filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("materializes the complete first fanout", () => {
    expect(ASOIAF_MODEL_RECALL_MANIFEST.packetCount).toBe(10);
    expect(ASOIAF_MODEL_RECALL_MANIFEST.candidateCount).toBe(726);
    expect(ASOIAF_MODEL_RECALL_MANIFEST.countsByDomain).toEqual({
      "core-entities": 254,
      "lineage-claims": 74,
      "chronology-geography": 58,
      "actor-knowledge": 58,
      "material-logistics": 52,
      "magic-physics": 67,
      "narrative-functions": 56,
      "adaptation-deltas": 30,
      "endgame-coordinates": 37,
      "smallfolk-systems": 40,
    });
  });

  it("is deterministic under packet and candidate reordering", () => {
    const reversed = [...ASOIAF_MODEL_RECALL_PACKETS]
      .reverse()
      .map((packet) => ({ ...packet, candidates: [...packet.candidates].reverse() }));
    expect(buildCanonRecallEstateManifest(reversed, [...ASOIAF_RECALL_SOURCE_HINTS].reverse()))
      .toEqual(ASOIAF_MODEL_RECALL_MANIFEST);
  });

  it("contains no direct locator, digest, authority, or quotation claims", () => {
    const forbidden = new Set([
      "authorityTier",
      "canonical",
      "contentDigest",
      "locatorIds",
      "quote",
      "quotedText",
      "sourceDigest",
      "verbatim",
    ]);
    for (const packet of ASOIAF_MODEL_RECALL_PACKETS) {
      for (const candidate of packet.candidates) {
        expect(Object.keys(candidate.normalized).filter((key) => forbidden.has(key))).toEqual([]);
      }
    }
  });

  it("requires every source hint to resolve through the placeholder registry", () => {
    expect(validateCanonRecallEstate(ASOIAF_MODEL_RECALL_PACKETS, ASOIAF_RECALL_SOURCE_HINTS))
      .toEqual([]);
    expect(ASOIAF_RECALL_SOURCE_HINTS.every((hint) => hint.standing !== undefined)).toBe(true);
  });

  it("queries across domain, tag, confidence, and text without mutating the estate", () => {
    const before = JSON.stringify(ASOIAF_MODEL_RECALL_PACKETS);
    const results = queryAsoiafModelRecall({
      domains: ["narrative-functions", "adaptation-deltas"],
      tags: ["aegon-project"],
      minimumConfidencePermille: 900,
      text: "claim",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((candidate) => candidate.confidencePermille >= 900)).toBe(true);
    expect(JSON.stringify(ASOIAF_MODEL_RECALL_PACKETS)).toBe(before);
  });

  it("keeps low-confidence theories visible and reviewable", () => {
    const low = ASOIAF_MODEL_RECALL_PACKETS
      .flatMap((packet) => packet.candidates)
      .filter((candidate) => candidate.confidencePermille < 600);
    expect(low.map((candidate) => candidate.id)).toContain(
      "recall-question-tyrion-aerys-paternity",
    );
    expect(ASOIAF_MODEL_RECALL_MANIFEST.lowConfidenceCount).toBe(low.length);
  });

  it("carries both hero-line and smallfolk-scale closure surfaces", () => {
    expect(queryAsoiafModelRecall({ text: "bran-sovereign" }).length).toBeGreaterThan(0);
    expect(queryAsoiafModelRecall({ domains: ["smallfolk-systems"] })).toHaveLength(40);
    expect(queryAsoiafModelRecall({ text: "seed grain" }).length).toBeGreaterThan(0);
  });

  it("records adaptation deletions as function obligations", () => {
    const youngGriff = queryAsoiafModelRecall({
      domains: ["adaptation-deltas"],
      text: "Remove Young Griff",
    });
    expect(youngGriff).toHaveLength(1);
    expect(youngGriff[0]?.normalized["bookFunctions"]).toEqual(
      expect.arrayContaining([
        "rival-targaryen-claim",
        "prior-popular-restoration",
        "varys-project",
        "golden-company-force",
      ]),
    );
  });
});
