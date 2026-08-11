import { describe, expect, it } from "vitest";
import {
  canonBibleFingerprint,
  classifyCanonProposals,
  compileCanonBible,
  validateCanonBible,
  type CanonBible,
} from "../src/canon/index.js";
import {
  makeCanonBible,
  makeDecision,
  makeMissingKnowledgeProposal,
  makeProposalSet,
  makeResourceUnderflowProposal,
} from "./fixtures.js";

function reverseAuthoredOrder(bible: CanonBible): CanonBible {
  return {
    ...bible,
    continuities: [...bible.continuities].reverse().map((entry) => ({
      ...entry,
      inheritsFromIds: [...entry.inheritsFromIds].reverse(),
    })),
    sources: [...bible.sources].reverse().map((entry) => ({
      ...entry,
      parentSourceIds: [...entry.parentSourceIds].reverse(),
    })),
    locators: [...bible.locators].reverse(),
    entities: [...bible.entities].reverse().map((entry) => ({
      ...entry,
      continuityIds: [...entry.continuityIds].reverse(),
      aliases: [...entry.aliases].reverse(),
      tags: [...entry.tags].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    propositions: [...bible.propositions].reverse().map((entry) => ({
      ...entry,
      continuityIds: [...entry.continuityIds].reverse(),
      tags: [...entry.tags].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    attestations: [...bible.attestations].reverse().map((entry) => ({
      ...entry,
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    capabilities: [...bible.capabilities].reverse().map((entry) => ({
      ...entry,
      continuityIds: [...entry.continuityIds].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    stateVariables: [...bible.stateVariables].reverse().map((entry) => ({
      ...entry,
      continuityIds: [...entry.continuityIds].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    travelEdges: [...bible.travelEdges].reverse().map((entry) => ({
      ...entry,
      requiredCapabilityIds: [...entry.requiredCapabilityIds].reverse(),
      continuityIds: [...entry.continuityIds].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    narrativeFunctions: [...bible.narrativeFunctions].reverse().map((entry) => ({
      ...entry,
      continuityIds: [...entry.continuityIds].reverse(),
      defaultCarrierIds: [...entry.defaultCarrierIds].reverse(),
      requiredByEndpointIds: [...entry.requiredByEndpointIds].reverse(),
      tags: [...entry.tags].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    events: [...bible.events].reverse(),
    endpoints: [...bible.endpoints].reverse(),
    variantGroups: [...bible.variantGroups].reverse().map((entry) => ({
      ...entry,
      continuityIds: [...entry.continuityIds].reverse(),
      optionIds: [...entry.optionIds].reverse(),
      locatorIds: [...entry.locatorIds].reverse(),
    })),
    variantOptions: [...bible.variantOptions].reverse(),
    initialState: {
      ...bible.initialState,
      activePropositionIds: [...bible.initialState.activePropositionIds].reverse(),
      activeEntityIds: bible.initialState.activeEntityIds
        ? [...bible.initialState.activeEntityIds].reverse()
        : undefined,
      entityLocations: [...bible.initialState.entityLocations].reverse(),
      knowledge: [...bible.initialState.knowledge].reverse(),
      capabilities: [...bible.initialState.capabilities].reverse(),
      functionAssignments: [...bible.initialState.functionAssignments].reverse(),
    },
  };
}

describe("canon constraint bible", () => {
  it("validates the synthetic source fixture while preserving contradictory testimony", () => {
    const findings = validateCanonBible(makeCanonBible());
    expect(findings.filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("fingerprints semantic content independently of authored array order", () => {
    const bible = makeCanonBible();
    expect(canonBibleFingerprint(reverseAuthoredOrder(bible))).toBe(canonBibleFingerprint(bible));
  });

  it("refuses a deleted character when the character's inherited function is not reassigned", () => {
    const receipt = compileCanonBible(
      makeCanonBible(),
      makeDecision("remove-rival-unreassigned"),
      { requireClosure: false },
    );

    expect(receipt.passed).toBe(false);
    expect(receipt.findings).toContainEqual(
      expect.objectContaining({ code: "removed-function-carrier", subjectId: "popular-counterclaim" }),
    );
    expect(receipt.findings).toContainEqual(
      expect.objectContaining({ code: "orphaned-function", subjectId: "popular-counterclaim" }),
    );
  });

  it("accepts an explicit function transfer while retaining unresolved closure obligations", () => {
    const receipt = compileCanonBible(
      makeCanonBible(),
      makeDecision("merge-rival-into-regent"),
      { requireClosure: false },
    );

    expect(receipt.passed).toBe(true);
    expect(receipt.closureComplete).toBe(false);
    expect(receipt.state.functionAssignments).toContainEqual(
      expect.objectContaining({ functionId: "popular-counterclaim", carrierIds: ["regent"] }),
    );
    expect(receipt.state.variables).toContainEqual({ variableId: "capital-grain", value: 90 });
    expect(receipt.findings).toContainEqual(
      expect.objectContaining({ code: "unmet-endpoint", subjectId: "endpoint-reckoning" }),
    );
  });

  it("refuses mutually exclusive branch assumptions", () => {
    const decisions = makeDecision("merge-rival-into-regent");
    decisions.assumePropositionIds = ["prop-rival-legitimate", "prop-rival-absent"];

    const receipt = compileCanonBible(makeCanonBible(), decisions, { requireClosure: false });
    expect(receipt.passed).toBe(false);
    expect(receipt.findings).toContainEqual(
      expect.objectContaining({ code: "exclusive-proposition-conflict" }),
    );
  });

  it("refuses action by a character who has not acquired the required knowledge", () => {
    const receipt = compileCanonBible(
      makeCanonBible(),
      makeDecision("merge-rival-into-regent"),
      { requireClosure: false, extraEvents: [makeMissingKnowledgeProposal()] },
    );

    expect(receipt.passed).toBe(false);
    expect(receipt.findings).toContainEqual(
      expect.objectContaining({ code: "missing-knowledge", subjectId: "proposal-secret-used" }),
    );
    expect(receipt.state.completedEventIds).not.toContain("proposal-secret-used");
  });

  it("rolls back an event that violates a bounded material constraint", () => {
    const receipt = compileCanonBible(
      makeCanonBible(),
      makeDecision("merge-rival-into-regent"),
      { requireClosure: false, extraEvents: [makeResourceUnderflowProposal()] },
    );

    expect(receipt.passed).toBe(false);
    expect(receipt.findings).toContainEqual(
      expect.objectContaining({ code: "variable-underflow", subjectId: "proposal-burn-reserve" }),
    );
    expect(receipt.state.variables).toContainEqual({ variableId: "capital-grain", value: 90 });
    expect(receipt.state.completedEventIds).not.toContain("proposal-burn-reserve");
  });

  it("classifies bounded continuations by closure coverage and hard contradiction", () => {
    const receipt = classifyCanonProposals(
      makeCanonBible(),
      makeDecision("merge-rival-into-regent"),
      makeProposalSet(),
    );
    const classes = Object.fromEntries(receipt.results.map((entry) => [entry.proposalId, entry.classification]));

    expect(classes).toEqual({
      "council-settlement": "strongly-implied",
      "memory-coronation": "necessary",
      "oath-settlement": "strongly-implied",
      "regent-island-jump": "contradicted",
      "smallfolk-feast": "permissible",
    });
    expect(receipt.results.find((entry) => entry.proposalId === "regent-island-jump")?.findingCodes)
      .toContain("impossible-travel");
  });

  it("repeats byte-identical receipts without mutating the corpus or decision set", () => {
    const bible = makeCanonBible();
    const decisions = makeDecision("merge-rival-into-regent");
    const beforeBible = JSON.stringify(bible);
    const beforeDecisions = JSON.stringify(decisions);

    const first = compileCanonBible(bible, decisions, { requireClosure: false });
    const second = compileCanonBible(bible, decisions, { requireClosure: false });

    expect(second).toEqual(first);
    expect(JSON.stringify(bible)).toBe(beforeBible);
    expect(JSON.stringify(decisions)).toBe(beforeDecisions);
  });
});
