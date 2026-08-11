import { compareCodepoints, orderedStrings } from "../runtime/determinism.js";
import { narrativeFingerprint } from "../runtime/fingerprint.js";
import type {
  CanonBible,
  CanonCapabilityGrant,
  CanonCompileReceipt,
  CanonContinuationProposal,
  CanonDecisionSet,
  CanonEntityLocation,
  CanonEntityMove,
  CanonEvent,
  CanonFunctionAssignment,
  CanonKnowledgeGrant,
  CanonProposalSetReceipt,
  CanonVariableCondition,
  CanonVariableDelta,
  CanonVariableOverride,
  CanonVariableSet,
} from "./types.js";

function byId<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareCodepoints(left.id, right.id));
}

function byFunctionAssignment(
  left: CanonFunctionAssignment,
  right: CanonFunctionAssignment,
): number {
  return compareCodepoints(left.functionId, right.functionId)
    || compareCodepoints(left.assignedBy, right.assignedBy);
}

function canonicalFunctionAssignment(value: CanonFunctionAssignment): CanonFunctionAssignment {
  return {
    ...value,
    carrierIds: orderedStrings(value.carrierIds),
    locatorIds: orderedStrings(value.locatorIds),
  };
}

function canonicalKnowledge(values: readonly CanonKnowledgeGrant[]): CanonKnowledgeGrant[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.actorId, right.actorId)
      || compareCodepoints(left.propositionId, right.propositionId),
  );
}

function canonicalCapabilities(values: readonly CanonCapabilityGrant[]): CanonCapabilityGrant[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.entityId, right.entityId)
      || compareCodepoints(left.capabilityId, right.capabilityId),
  );
}

function canonicalVariableConditions(values: readonly CanonVariableCondition[]): CanonVariableCondition[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.variableId, right.variableId)
      || compareCodepoints(left.operator, right.operator)
      || left.value - right.value,
  );
}

function canonicalVariableDeltas(values: readonly CanonVariableDelta[]): CanonVariableDelta[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.variableId, right.variableId)
      || left.delta - right.delta,
  );
}

function canonicalVariableSets(values: readonly CanonVariableSet[]): CanonVariableSet[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.variableId, right.variableId)
      || left.value - right.value,
  );
}

function canonicalVariableOverrides(values: readonly CanonVariableOverride[]): CanonVariableOverride[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.variableId, right.variableId)
      || left.value - right.value,
  );
}

function canonicalLocations(values: readonly CanonEntityLocation[]): CanonEntityLocation[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.entityId, right.entityId)
      || left.time.earliest - right.time.earliest
      || left.time.latest - right.time.latest
      || compareCodepoints(left.locationId, right.locationId),
  );
}

function canonicalMoves(values: readonly CanonEntityMove[]): CanonEntityMove[] {
  return [...values].sort(
    (left, right) => compareCodepoints(left.entityId, right.entityId)
      || compareCodepoints(left.toLocationId, right.toLocationId),
  );
}

export function canonicalCanonEvent(event: CanonEvent): CanonEvent {
  return {
    ...event,
    continuityIds: orderedStrings(event.continuityIds),
    participantIds: orderedStrings(event.participantIds),
    causalParentEventIds: orderedStrings(event.causalParentEventIds),
    preconditions: {
      requiredPropositionIds: orderedStrings(event.preconditions.requiredPropositionIds),
      forbiddenPropositionIds: orderedStrings(event.preconditions.forbiddenPropositionIds),
      requiredActiveEntityIds: orderedStrings(event.preconditions.requiredActiveEntityIds),
      knowledge: canonicalKnowledge(event.preconditions.knowledge),
      capabilities: canonicalCapabilities(event.preconditions.capabilities),
      variables: canonicalVariableConditions(event.preconditions.variables),
    },
    effects: {
      establishPropositionIds: orderedStrings(event.effects.establishPropositionIds),
      negatePropositionIds: orderedStrings(event.effects.negatePropositionIds),
      grantKnowledge: canonicalKnowledge(event.effects.grantKnowledge),
      grantCapabilities: canonicalCapabilities(event.effects.grantCapabilities),
      revokeCapabilities: canonicalCapabilities(event.effects.revokeCapabilities),
      variableSets: canonicalVariableSets(event.effects.variableSets),
      variableDeltas: canonicalVariableDeltas(event.effects.variableDeltas),
      moveEntities: canonicalMoves(event.effects.moveEntities),
      activateEntityIds: orderedStrings(event.effects.activateEntityIds),
      deactivateEntityIds: orderedStrings(event.effects.deactivateEntityIds),
      resolveFunctionIds: orderedStrings(event.effects.resolveFunctionIds),
    },
    fulfillsEndpointIds: orderedStrings(event.fulfillsEndpointIds),
    tags: orderedStrings(event.tags),
    locatorIds: orderedStrings(event.locatorIds),
  };
}

export function canonicalCanonBible(bible: CanonBible): CanonBible {
  return {
    ...bible,
    continuities: byId(bible.continuities).map((continuity) => ({
      ...continuity,
      inheritsFromIds: orderedStrings(continuity.inheritsFromIds),
    })),
    sources: byId(bible.sources).map((source) => ({
      ...source,
      parentSourceIds: orderedStrings(source.parentSourceIds),
    })),
    locators: byId(bible.locators),
    entities: byId(bible.entities).map((entity) => ({
      ...entity,
      continuityIds: orderedStrings(entity.continuityIds),
      aliases: orderedStrings(entity.aliases),
      tags: orderedStrings(entity.tags),
      locatorIds: orderedStrings(entity.locatorIds),
    })),
    propositions: byId(bible.propositions).map((proposition) => ({
      ...proposition,
      continuityIds: orderedStrings(proposition.continuityIds),
      tags: orderedStrings(proposition.tags),
      locatorIds: orderedStrings(proposition.locatorIds),
    })),
    attestations: byId(bible.attestations).map((attestation) => ({
      ...attestation,
      locatorIds: orderedStrings(attestation.locatorIds),
    })),
    capabilities: byId(bible.capabilities).map((capability) => ({
      ...capability,
      continuityIds: orderedStrings(capability.continuityIds),
      locatorIds: orderedStrings(capability.locatorIds),
    })),
    stateVariables: byId(bible.stateVariables).map((variable) => ({
      ...variable,
      continuityIds: orderedStrings(variable.continuityIds),
      locatorIds: orderedStrings(variable.locatorIds),
    })),
    travelEdges: byId(bible.travelEdges).map((edge) => ({
      ...edge,
      requiredCapabilityIds: orderedStrings(edge.requiredCapabilityIds),
      continuityIds: orderedStrings(edge.continuityIds),
      locatorIds: orderedStrings(edge.locatorIds),
    })),
    narrativeFunctions: byId(bible.narrativeFunctions).map((fn) => ({
      ...fn,
      continuityIds: orderedStrings(fn.continuityIds),
      defaultCarrierIds: orderedStrings(fn.defaultCarrierIds),
      requiredByEndpointIds: orderedStrings(fn.requiredByEndpointIds),
      tags: orderedStrings(fn.tags),
      locatorIds: orderedStrings(fn.locatorIds),
    })),
    events: byId(bible.events).map(canonicalCanonEvent),
    endpoints: byId(bible.endpoints).map((endpoint) => ({
      ...endpoint,
      continuityIds: orderedStrings(endpoint.continuityIds),
      predecessorEndpointIds: orderedStrings(endpoint.predecessorEndpointIds),
      requiredPropositionIds: orderedStrings(endpoint.requiredPropositionIds),
      forbiddenPropositionIds: orderedStrings(endpoint.forbiddenPropositionIds),
      variableConstraints: canonicalVariableConditions(endpoint.variableConstraints),
      requiredResolvedFunctionIds: orderedStrings(endpoint.requiredResolvedFunctionIds),
      tags: orderedStrings(endpoint.tags),
      locatorIds: orderedStrings(endpoint.locatorIds),
    })),
    variantGroups: byId(bible.variantGroups).map((group) => ({
      ...group,
      continuityIds: orderedStrings(group.continuityIds),
      optionIds: orderedStrings(group.optionIds),
      locatorIds: orderedStrings(group.locatorIds),
    })),
    variantOptions: byId(bible.variantOptions).map((option) => ({
      ...option,
      requiresOptionIds: orderedStrings(option.requiresOptionIds),
      conflictsWithOptionIds: orderedStrings(option.conflictsWithOptionIds),
      effects: {
        activatePropositionIds: orderedStrings(option.effects.activatePropositionIds),
        deactivatePropositionIds: orderedStrings(option.effects.deactivatePropositionIds),
        activateEventIds: orderedStrings(option.effects.activateEventIds),
        deactivateEventIds: orderedStrings(option.effects.deactivateEventIds),
        removeEntityIds: orderedStrings(option.effects.removeEntityIds),
        variableOverrides: canonicalVariableOverrides(option.effects.variableOverrides),
        functionAssignments: option.effects.functionAssignments
          .map(canonicalFunctionAssignment)
          .sort(byFunctionAssignment),
        retireFunctionIds: orderedStrings(option.effects.retireFunctionIds),
      },
      locatorIds: orderedStrings(option.locatorIds),
    })),
    initialState: {
      activePropositionIds: orderedStrings(bible.initialState.activePropositionIds),
      activeEntityIds: bible.initialState.activeEntityIds
        ? orderedStrings(bible.initialState.activeEntityIds)
        : undefined,
      entityLocations: canonicalLocations(bible.initialState.entityLocations),
      knowledge: canonicalKnowledge(bible.initialState.knowledge),
      capabilities: canonicalCapabilities(bible.initialState.capabilities),
      functionAssignments: bible.initialState.functionAssignments
        .map(canonicalFunctionAssignment)
        .sort(byFunctionAssignment),
    },
  };
}

export function canonicalCanonDecisionSet(decisions: CanonDecisionSet): CanonDecisionSet {
  return {
    ...decisions,
    selectedOptionIds: orderedStrings(decisions.selectedOptionIds),
    assumePropositionIds: orderedStrings(decisions.assumePropositionIds),
    excludePropositionIds: orderedStrings(decisions.excludePropositionIds),
    variableOverrides: canonicalVariableOverrides(decisions.variableOverrides),
    functionAssignments: decisions.functionAssignments
      .map(canonicalFunctionAssignment)
      .sort(byFunctionAssignment),
    functionRetirements: [...decisions.functionRetirements]
      .sort((left, right) => compareCodepoints(left.functionId, right.functionId))
      .map((retirement) => ({ ...retirement, locatorIds: orderedStrings(retirement.locatorIds) })),
  };
}

export function canonBibleFingerprint(bible: CanonBible): string {
  return narrativeFingerprint(canonicalCanonBible(bible));
}

export function canonDecisionSetFingerprint(decisions: CanonDecisionSet): string {
  return narrativeFingerprint(canonicalCanonDecisionSet(decisions));
}

export function canonProposalSetFingerprint(proposals: readonly CanonContinuationProposal[]): string {
  return narrativeFingerprint(
    [...proposals]
      .sort((left, right) => compareCodepoints(left.id, right.id))
      .map((proposal) => ({ ...proposal, event: canonicalCanonEvent(proposal.event) })),
  );
}

export function canonCompileReceiptFingerprint(receipt: Omit<CanonCompileReceipt, "receiptFingerprint">): string {
  return narrativeFingerprint(receipt);
}

export function canonProposalReceiptFingerprint(
  receipt: Omit<CanonProposalSetReceipt, "receiptFingerprint">,
): string {
  return narrativeFingerprint(receipt);
}
