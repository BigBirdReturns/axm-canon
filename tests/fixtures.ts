import {
  CANON_BIBLE_FORMAT,
  CANON_DECISION_SET_FORMAT,
  type CanonBible,
  type CanonContinuationProposal,
  type CanonDecisionSet,
  type CanonEvent,
} from "../src/canon/index.js";

const EMPTY_PRECONDITIONS: CanonEvent["preconditions"] = {
  requiredPropositionIds: [],
  forbiddenPropositionIds: [],
  requiredActiveEntityIds: [],
  knowledge: [],
  capabilities: [],
  variables: [],
};

const EMPTY_EFFECTS: CanonEvent["effects"] = {
  establishPropositionIds: [],
  negatePropositionIds: [],
  grantKnowledge: [],
  grantCapabilities: [],
  revokeCapabilities: [],
  variableSets: [],
  variableDeltas: [],
  moveEntities: [],
  activateEntityIds: [],
  deactivateEntityIds: [],
  resolveFunctionIds: [],
};

export function makeCanonBible(): CanonBible {
  return {
    format: CANON_BIBLE_FORMAT,
    id: "ash-crown-canon",
    version: "0.1.0",
    title: "The Ash Crown",
    description: "Synthetic succession corpus used to qualify the canon compiler without importing copyrighted text.",
    continuities: [
      {
        id: "novel",
        label: "Novel continuity",
        inheritsFromIds: [],
      },
    ],
    sources: [
      {
        id: "source-novel",
        title: "The Ash Crown source",
        authorityTier: "primary-canon",
        continuityId: "novel",
        version: "1",
        custody: "derived",
        parentSourceIds: [],
      },
    ],
    locators: [
      {
        id: "loc-core",
        sourceId: "source-novel",
        kind: "record",
        unit: "fixture-core",
        contentDigest: "sha256:fixture",
      },
    ],
    entities: [
      {
        id: "regent",
        label: "The Regent",
        kind: "actor",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["claimant"],
        locatorIds: ["loc-core"],
      },
      {
        id: "rival",
        label: "The Hidden Rival",
        kind: "actor",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["claimant"],
        locatorIds: ["loc-core"],
      },
      {
        id: "seer",
        label: "The Archive Seer",
        kind: "actor",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["memory"],
        locatorIds: ["loc-core"],
      },
      {
        id: "courier",
        label: "The Courier",
        kind: "actor",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["messenger"],
        locatorIds: ["loc-core"],
      },
      {
        id: "capital",
        label: "The Capital",
        kind: "location",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["seat"],
        locatorIds: ["loc-core"],
      },
      {
        id: "island",
        label: "The Island",
        kind: "location",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["remote"],
        locatorIds: ["loc-core"],
      },
      {
        id: "archive",
        label: "The Archive",
        kind: "location",
        continuityIds: ["novel"],
        aliases: [],
        tags: ["memory"],
        locatorIds: ["loc-core"],
      },
    ],
    propositions: [
      {
        id: "prop-regent-rules",
        subjectId: "regent",
        predicate: "rules",
        object: { kind: "entity", entityId: "capital" },
        continuityIds: ["novel"],
        enabledByDefault: true,
        tags: ["politics"],
        locatorIds: ["loc-core"],
      },
      {
        id: "prop-rival-legitimate",
        subjectId: "rival",
        predicate: "status",
        object: { kind: "literal", value: "legitimate" },
        continuityIds: ["novel"],
        enabledByDefault: false,
        exclusiveGroupId: "rival-status",
        tags: ["claim"],
        locatorIds: ["loc-core"],
      },
      {
        id: "prop-rival-absent",
        subjectId: "rival",
        predicate: "status",
        object: { kind: "literal", value: "absent" },
        continuityIds: ["novel"],
        enabledByDefault: false,
        exclusiveGroupId: "rival-status",
        tags: ["adaptation"],
        locatorIds: ["loc-core"],
      },
      {
        id: "prop-secret-lineage",
        subjectId: "regent",
        predicate: "has-secret-lineage",
        object: { kind: "literal", value: true },
        continuityIds: ["novel"],
        enabledByDefault: true,
        tags: ["secret"],
        locatorIds: ["loc-core"],
      },
      {
        id: "prop-realm-settled",
        subjectId: "capital",
        predicate: "state",
        object: { kind: "literal", value: "settled" },
        continuityIds: ["novel"],
        enabledByDefault: false,
        tags: ["endpoint"],
        locatorIds: ["loc-core"],
      },
    ],
    attestations: [
      {
        id: "attestation-secret-support",
        propositionId: "prop-secret-lineage",
        stance: "supports",
        locatorIds: ["loc-core"],
        confidencePermille: 900,
      },
      {
        id: "attestation-secret-denial",
        propositionId: "prop-secret-lineage",
        stance: "contradicts",
        locatorIds: ["loc-core"],
        confidencePermille: 400,
      },
    ],
    capabilities: [
      {
        id: "swift-travel",
        label: "Swift travel",
        description: "A bounded fast route available only to a qualified carrier.",
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
    ],
    stateVariables: [
      {
        id: "capital-grain",
        label: "Capital grain reserve",
        description: "A bounded material reserve that constrains public action and terminal settlement.",
        subjectId: "capital",
        unit: "reserve-unit",
        continuityIds: ["novel"],
        initialValue: 100,
        minimum: 0,
        maximum: 1000,
        integer: true,
        locatorIds: ["loc-core"],
      },
    ],
    travelEdges: [
      {
        id: "capital-to-island",
        fromLocationId: "capital",
        toLocationId: "island",
        minimumDuration: 4,
        requiredCapabilityIds: [],
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
      {
        id: "island-to-capital",
        fromLocationId: "island",
        toLocationId: "capital",
        minimumDuration: 4,
        requiredCapabilityIds: [],
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
      {
        id: "capital-to-island-swift",
        fromLocationId: "capital",
        toLocationId: "island",
        minimumDuration: 1,
        requiredCapabilityIds: ["swift-travel"],
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
      {
        id: "island-to-capital-swift",
        fromLocationId: "island",
        toLocationId: "capital",
        minimumDuration: 1,
        requiredCapabilityIds: ["swift-travel"],
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
      {
        id: "capital-to-archive",
        fromLocationId: "capital",
        toLocationId: "archive",
        minimumDuration: 2,
        requiredCapabilityIds: [],
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
      {
        id: "archive-to-capital",
        fromLocationId: "archive",
        toLocationId: "capital",
        minimumDuration: 2,
        requiredCapabilityIds: [],
        continuityIds: ["novel"],
        locatorIds: ["loc-core"],
      },
    ],
    narrativeFunctions: [
      {
        id: "popular-counterclaim",
        label: "Popular counterclaim",
        description: "A rival restoration must challenge the incumbent's liberator identity.",
        kind: "political-pressure",
        required: true,
        continuityIds: ["novel"],
        defaultCarrierIds: ["rival"],
        requiredByEndpointIds: [],
        tags: ["succession"],
        locatorIds: ["loc-core"],
      },
      {
        id: "memory-sovereign",
        label: "Memory sovereign",
        description: "The archive must acquire a political carrier before settlement.",
        kind: "endpoint-prerequisite",
        required: true,
        continuityIds: ["novel"],
        defaultCarrierIds: ["seer"],
        requiredByEndpointIds: [],
        tags: ["memory"],
        locatorIds: ["loc-core"],
      },
    ],
    events: [
      {
        id: "event-regent-consolidates",
        label: "The regent consolidates the capital",
        continuityIds: ["novel"],
        enabledByDefault: true,
        sequence: 1,
        time: { earliest: 2, latest: 2 },
        locationId: "capital",
        participantIds: ["regent"],
        causalParentEventIds: [],
        preconditions: { ...EMPTY_PRECONDITIONS },
        effects: { ...EMPTY_EFFECTS, variableDeltas: [{ variableId: "capital-grain", delta: -10 }] },
        fulfillsEndpointIds: [],
        tags: ["politics"],
        locatorIds: ["loc-core"],
      },
      {
        id: "event-rival-arrives",
        label: "The hidden rival reaches the capital",
        continuityIds: ["novel"],
        enabledByDefault: false,
        sequence: 2,
        time: { earliest: 6, latest: 6 },
        locationId: "capital",
        participantIds: ["rival"],
        causalParentEventIds: [],
        preconditions: { ...EMPTY_PRECONDITIONS },
        effects: { ...EMPTY_EFFECTS, establishPropositionIds: ["prop-rival-legitimate"] },
        fulfillsEndpointIds: [],
        tags: ["restoration"],
        locatorIds: ["loc-core"],
      },
    ],
    endpoints: [
      {
        id: "endpoint-reckoning",
        label: "The succession reckoning",
        description: "The capital reaches a durable settlement inside the fixed terminal window.",
        continuityIds: ["novel"],
        hard: true,
        window: { earliest: 8, latest: 12 },
        predecessorEndpointIds: [],
        requiredPropositionIds: ["prop-realm-settled"],
        forbiddenPropositionIds: [],
        variableConstraints: [{ variableId: "capital-grain", operator: "gte", value: 20 }],
        requiredResolvedFunctionIds: [],
        tags: ["terminal"],
        locatorIds: ["loc-core"],
      },
    ],
    variantGroups: [
      {
        id: "rival-adaptation",
        label: "Rival claimant adaptation",
        description: "Preserve, remove, or merge the rival storyline while carrying its narrative functions.",
        continuityIds: ["novel"],
        cardinality: "exactly-one",
        optionIds: ["preserve-rival", "remove-rival-unreassigned", "merge-rival-into-regent"],
        locatorIds: ["loc-core"],
      },
    ],
    variantOptions: [
      {
        id: "preserve-rival",
        groupId: "rival-adaptation",
        label: "Preserve the rival",
        description: "Keep the claimant and arrival event intact.",
        requiresOptionIds: [],
        conflictsWithOptionIds: [],
        effects: {
          activatePropositionIds: ["prop-rival-legitimate"],
          deactivatePropositionIds: ["prop-rival-absent"],
          activateEventIds: ["event-rival-arrives"],
          deactivateEventIds: [],
          removeEntityIds: [],
          variableOverrides: [],
          functionAssignments: [],
          retireFunctionIds: [],
        },
        locatorIds: ["loc-core"],
      },
      {
        id: "remove-rival-unreassigned",
        groupId: "rival-adaptation",
        label: "Remove the rival without substitution",
        description: "Delete the claimant and leave the inherited functions unassigned.",
        requiresOptionIds: [],
        conflictsWithOptionIds: [],
        effects: {
          activatePropositionIds: ["prop-rival-absent"],
          deactivatePropositionIds: ["prop-rival-legitimate"],
          activateEventIds: [],
          deactivateEventIds: ["event-rival-arrives"],
          removeEntityIds: ["rival"],
          variableOverrides: [],
          functionAssignments: [],
          retireFunctionIds: [],
        },
        locatorIds: ["loc-core"],
      },
      {
        id: "merge-rival-into-regent",
        groupId: "rival-adaptation",
        label: "Merge the rival function into the regent",
        description: "Delete the claimant while explicitly transferring the counterclaim function.",
        requiresOptionIds: [],
        conflictsWithOptionIds: [],
        effects: {
          activatePropositionIds: ["prop-rival-absent"],
          deactivatePropositionIds: ["prop-rival-legitimate"],
          activateEventIds: [],
          deactivateEventIds: ["event-rival-arrives"],
          removeEntityIds: ["rival"],
          variableOverrides: [],
          functionAssignments: [
            {
              functionId: "popular-counterclaim",
              carrierIds: ["regent"],
              assignedBy: "merge-rival-into-regent",
              locatorIds: ["loc-core"],
            },
          ],
          retireFunctionIds: [],
        },
        locatorIds: ["loc-core"],
      },
    ],
    initialState: {
      activePropositionIds: [],
      entityLocations: [
        { entityId: "regent", locationId: "capital", time: { earliest: 0, latest: 0 } },
        { entityId: "rival", locationId: "island", time: { earliest: 0, latest: 0 } },
        { entityId: "seer", locationId: "archive", time: { earliest: 0, latest: 0 } },
        { entityId: "courier", locationId: "capital", time: { earliest: 0, latest: 0 } },
      ],
      knowledge: [{ actorId: "seer", propositionId: "prop-secret-lineage" }],
      capabilities: [{ entityId: "courier", capabilityId: "swift-travel" }],
      functionAssignments: [],
    },
  };
}

export function makeDecision(optionId: string): CanonDecisionSet {
  return {
    format: CANON_DECISION_SET_FORMAT,
    id: `decision-${optionId}`,
    bibleId: "ash-crown-canon",
    bibleVersion: "0.1.0",
    targetContinuityId: "novel",
    selectedOptionIds: [optionId],
    assumePropositionIds: [],
    excludePropositionIds: [],
    variableOverrides: [],
    functionAssignments: [],
    functionRetirements: [],
  };
}

function proposalEvent(
  id: string,
  sequence: number,
  time: number,
  locationId: string,
  participantId: string,
): CanonEvent {
  return {
    id,
    label: id,
    continuityIds: ["novel"],
    enabledByDefault: true,
    sequence,
    time: { earliest: time, latest: time },
    locationId,
    participantIds: [participantId],
    causalParentEventIds: ["event-regent-consolidates"],
    preconditions: { ...EMPTY_PRECONDITIONS },
    effects: { ...EMPTY_EFFECTS },
    fulfillsEndpointIds: [],
    tags: ["proposal"],
    locatorIds: ["loc-core"],
  };
}

export function makeProposalSet(): CanonContinuationProposal[] {
  const necessary = proposalEvent("proposal-memory-coronation", 3, 5, "archive", "seer");
  necessary.causalParentEventIds = [];
  necessary.effects = { ...necessary.effects, resolveFunctionIds: ["memory-sovereign"] };

  const settlementA = proposalEvent("proposal-council-settlement", 4, 9, "capital", "regent");
  settlementA.effects = { ...settlementA.effects, establishPropositionIds: ["prop-realm-settled"] };
  settlementA.fulfillsEndpointIds = ["endpoint-reckoning"];

  const settlementB = proposalEvent("proposal-oath-settlement", 4, 10, "capital", "regent");
  settlementB.effects = { ...settlementB.effects, establishPropositionIds: ["prop-realm-settled"] };
  settlementB.fulfillsEndpointIds = ["endpoint-reckoning"];

  const permissible = proposalEvent("proposal-smallfolk-feast", 3, 6, "capital", "regent");
  permissible.effects = {
    ...permissible.effects,
    variableDeltas: [{ variableId: "capital-grain", delta: -5 }],
  };

  const contradicted = proposalEvent("proposal-regent-island-jump", 3, 3, "island", "regent");

  return [
    { id: "memory-coronation", label: "Archive memory receives a sovereign carrier", event: necessary },
    { id: "council-settlement", label: "Council settlement", event: settlementA },
    { id: "oath-settlement", label: "Oath settlement", event: settlementB },
    { id: "smallfolk-feast", label: "A compatible background feast", event: permissible },
    { id: "regent-island-jump", label: "Impossible regent jump", event: contradicted },
  ];
}

export function makeMissingKnowledgeProposal(): CanonEvent {
  const event = proposalEvent("proposal-secret-used", 3, 4, "capital", "regent");
  event.preconditions = {
    ...event.preconditions,
    knowledge: [{ actorId: "regent", propositionId: "prop-secret-lineage" }],
  };
  return event;
}


export function makeResourceUnderflowProposal(): CanonEvent {
  const event = proposalEvent("proposal-burn-reserve", 3, 4, "capital", "regent");
  event.effects = {
    ...event.effects,
    variableDeltas: [{ variableId: "capital-grain", delta: -200 }],
  };
  return event;
}
