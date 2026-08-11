import { describe, expect, it } from "vitest";
import {
  ASOIAF_CONVERSATION_SYNTHESIS_FINDINGS,
  ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST,
  ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
  ASOIAF_RECALL_ESTATE_FINDINGS,
  ASOIAF_RECALL_ESTATE_MANIFEST,
  ASOIAF_RECALL_ESTATE_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
  queryAsoiafConversationSynthesis,
  queryAsoiafRecallEstate,
} from "../src/recall/index.js";
import {
  buildCanonRecallEstateManifest,
  validateCanonRecallEstate,
} from "../../src/canon/recall/index.js";

describe("ASOIAF conversation synthesis", () => {
  it("promotes the recent discussion into five review packets without source authority", () => {
    expect(ASOIAF_CONVERSATION_SYNTHESIS_PACKETS).toHaveLength(5);
    expect(ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST.candidateCount).toBe(79);
    expect(
      ASOIAF_CONVERSATION_SYNTHESIS_PACKETS.every(
        (packet) =>
          packet.generatedBy === "conversation-synthesis"
          && packet.authority === "none"
          && packet.compilationEligible === false,
      ),
    ).toBe(true);
    expect(
      ASOIAF_CONVERSATION_SYNTHESIS_FINDINGS.filter(
        (entry) => entry.severity === "error",
      ),
    ).toEqual([]);
  });

  it("unions model recall and conversation synthesis without changing model-only custody", () => {
    expect(ASOIAF_RECALL_ESTATE_MANIFEST.packetCount).toBe(15);
    expect(ASOIAF_RECALL_ESTATE_MANIFEST.candidateCount).toBe(805);
    expect(ASOIAF_RECALL_ESTATE_PACKETS).toHaveLength(15);
    expect(
      ASOIAF_RECALL_ESTATE_FINDINGS.filter(
        (entry) => entry.severity === "error",
      ),
    ).toEqual([]);
  });

  it("is deterministic under packet, candidate, and source-hint reordering", () => {
    const reversed = [...ASOIAF_RECALL_ESTATE_PACKETS]
      .reverse()
      .map((packet) => ({
        ...packet,
        candidates: [...packet.candidates].reverse(),
      }));
    expect(
      buildCanonRecallEstateManifest(
        reversed,
        [...ASOIAF_RECALL_SOURCE_HINTS].reverse(),
      ),
    ).toEqual(ASOIAF_RECALL_ESTATE_MANIFEST);
  });

  it("keeps the conversation source plane explicit and non-citable", () => {
    const hintIds = ASOIAF_RECALL_SOURCE_HINTS.map((hint) => hint.id);
    expect(hintIds).toEqual(
      expect.arrayContaining([
        "CHAT-HOTD-VARYS-RHLLOR",
        "CHAT-ASOIAF-ENDGAME-BIBLE",
      ]),
    );
    expect(
      ASOIAF_RECALL_SOURCE_HINTS
        .filter((hint) => hint.id.startsWith("CHAT-"))
        .every((hint) => hint.standing === "placeholder-only"),
    ).toBe(true);
  });

  it("carries the Varys and R'hllor tangent as structured hypotheses", () => {
    expect(
      queryAsoiafConversationSynthesis({
        text: "Varys's mutilation is one integrated fire ritual",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-varys-castration-fire-ritual");
    expect(
      queryAsoiafConversationSynthesis({
        text: "R'hllor is the leading institutional attribution",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-rhllor-leading-attribution");
    expect(
      queryAsoiafConversationSynthesis({
        text: "Cybele",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-cybele-attis-analogue");
  });

  it("carries the House of the Dragon ledger and command-responsibility corrections", () => {
    expect(
      queryAsoiafConversationSynthesis({
        text: "Daemon commissions the Blackwood terror campaign",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-daemon-orders-blackwood-terror");
    expect(
      queryAsoiafConversationSynthesis({
        text: "Dragon claiming is not a legal or moral legitimacy test",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-red-sowing-not-legitimacy-test");
  });

  it("carries the ending and adaptation-bible mechanism rather than only lore facts", () => {
    expect(
      queryAsoiafConversationSynthesis({
        text: "A proper adaptation bible",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-adaptation-bible-variant-ledger");
    expect(
      queryAsoiafConversationSynthesis({
        text: "Young Griff carries",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-young-griff-function-bundle");
    expect(
      queryAsoiafConversationSynthesis({
        text: "closure lattice",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-closure-lattice");
  });

  it("keeps conversation analysis queryable beside the original recall estate", () => {
    const varys = queryAsoiafRecallEstate({
      sourceHints: ["CHAT-HOTD-VARYS-RHLLOR"],
      tags: ["varys"],
    });
    expect(varys.length).toBeGreaterThan(5);
    expect(
      queryAsoiafRecallEstate({
        text: "conversation itself is a dense analysis source plane",
      }).map((candidate) => candidate.id),
    ).toContain("conversation-conversation-as-analysis-plane");
  });

  it("still refuses forbidden source-standing fields", () => {
    expect(
      validateCanonRecallEstate(
        ASOIAF_RECALL_ESTATE_PACKETS,
        ASOIAF_RECALL_SOURCE_HINTS,
      ),
    ).toEqual([]);
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
    for (const packet of ASOIAF_CONVERSATION_SYNTHESIS_PACKETS) {
      for (const candidate of packet.candidates) {
        expect(
          Object.keys(candidate.normalized).filter((key) =>
            forbidden.has(key),
          ),
        ).toEqual([]);
      }
    }
  });
});
