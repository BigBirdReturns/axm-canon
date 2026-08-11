import { compareCodepoints, orderedStrings } from "../runtime/determinism.js";
import { narrativeFingerprint } from "../runtime/fingerprint.js";
import {
  canonBibleFingerprint,
  canonCompileReceiptFingerprint,
  canonDecisionSetFingerprint,
  canonicalCanonEvent,
} from "./canonical.js";
import {
  CANON_COMPILE_RECEIPT_FORMAT,
  type CanonBible,
  type CanonCapabilityGrant,
  type CanonCompileOptions,
  type CanonCompileReceipt,
  type CanonCompiledState,
  type CanonDecisionSet,
  type CanonEndpoint,
  type CanonEntityLocation,
  type CanonEvent,
  type CanonFinding,
  type CanonFulfilledEndpoint,
  type CanonFunctionAssignment,
  type CanonKnowledgeGrant,
  type CanonNarrativeFunction,
  type CanonTimeWindow,
  type CanonTravelEdge,
  type CanonStateVariable,
  type CanonVariableCondition,
  type CanonVariableOverride,
  type CanonVariableValue,
} from "./types.js";
import {
  getContinuityClosure,
  sortCanonFindings,
  validateCanonBible,
  validateCanonDecisionSet,
} from "./validate.js";

interface MutablePosition {
  locationId: string;
  time: CanonTimeWindow;
}

interface CompileContext {
  activeEntityIds: Set<string>;
  activePropositionIds: Set<string>;
  knowledge: Set<string>;
  capabilities: Set<string>;
  variables: Map<string, number>;
  positions: Map<string, MutablePosition>;
  resolvedFunctionIds: Set<string>;
  fulfilledEndpoints: Map<string, CanonFulfilledEndpoint>;
  processedEventIds: Set<string>;
}

interface CompileContextSnapshot {
  activeEntityIds: Set<string>;
  activePropositionIds: Set<string>;
  knowledge: Set<string>;
  capabilities: Set<string>;
  variables: Map<string, number>;
  positions: Map<string, MutablePosition>;
  resolvedFunctionIds: Set<string>;
  fulfilledEndpoints: Map<string, CanonFulfilledEndpoint>;
  processedEventIds: Set<string>;
}

function snapshotContext(context: CompileContext): CompileContextSnapshot {
  return {
    activeEntityIds: new Set(context.activeEntityIds),
    activePropositionIds: new Set(context.activePropositionIds),
    knowledge: new Set(context.knowledge),
    capabilities: new Set(context.capabilities),
    variables: new Map(context.variables),
    positions: new Map(
      [...context.positions.entries()].map(([entityId, position]) => [
        entityId,
        { locationId: position.locationId, time: { ...position.time } },
      ] as const),
    ),
    resolvedFunctionIds: new Set(context.resolvedFunctionIds),
    fulfilledEndpoints: new Map(
      [...context.fulfilledEndpoints.entries()].map(([endpointId, value]) => [endpointId, { ...value }] as const),
    ),
    processedEventIds: new Set(context.processedEventIds),
  };
}

function restoreSet(target: Set<string>, source: ReadonlySet<string>): void {
  target.clear();
  for (const value of source) target.add(value);
}

function restoreContext(context: CompileContext, snapshot: CompileContextSnapshot): void {
  restoreSet(context.activeEntityIds, snapshot.activeEntityIds);
  restoreSet(context.activePropositionIds, snapshot.activePropositionIds);
  restoreSet(context.knowledge, snapshot.knowledge);
  restoreSet(context.capabilities, snapshot.capabilities);
  context.variables.clear();
  for (const [variableId, value] of snapshot.variables) context.variables.set(variableId, value);
  context.positions.clear();
  for (const [entityId, position] of snapshot.positions) {
    context.positions.set(entityId, { locationId: position.locationId, time: { ...position.time } });
  }
  restoreSet(context.resolvedFunctionIds, snapshot.resolvedFunctionIds);
  context.fulfilledEndpoints.clear();
  for (const [endpointId, value] of snapshot.fulfilledEndpoints) {
    context.fulfilledEndpoints.set(endpointId, { ...value });
  }
  restoreSet(context.processedEventIds, snapshot.processedEventIds);
}

function finding(
  code: string,
  severity: CanonFinding["severity"],
  subjectId: string,
  detail: string,
): CanonFinding {
  return { code, severity, subjectId, detail };
}

function intersects(values: readonly string[], set: ReadonlySet<string>): boolean {
  return values.some((value) => set.has(value));
}

function knowledgeKey(value: CanonKnowledgeGrant): string {
  return `${value.actorId}\u0000${value.propositionId}`;
}

function capabilityKey(value: CanonCapabilityGrant): string {
  return `${value.entityId}\u0000${value.capabilityId}`;
}

function splitPair(value: string): [string, string] {
  const index = value.indexOf("\u0000");
  return [value.slice(0, index), value.slice(index + 1)];
}

function canonicalAssignments(values: Iterable<CanonFunctionAssignment>): CanonFunctionAssignment[] {
  return [...values]
    .map((assignment) => ({
      ...assignment,
      carrierIds: orderedStrings(assignment.carrierIds),
      locatorIds: orderedStrings(assignment.locatorIds),
    }))
    .sort(
      (left, right) => compareCodepoints(left.functionId, right.functionId)
        || compareCodepoints(left.assignedBy, right.assignedBy),
    );
}

function canonicalLocations(positions: ReadonlyMap<string, MutablePosition>): CanonEntityLocation[] {
  return [...positions.entries()]
    .map(([entityId, position]) => ({ entityId, locationId: position.locationId, time: { ...position.time } }))
    .sort((left, right) => compareCodepoints(left.entityId, right.entityId));
}

function canonicalKnowledge(values: ReadonlySet<string>): CanonKnowledgeGrant[] {
  return [...values]
    .map((value) => {
      const [actorId, propositionId] = splitPair(value);
      return { actorId, propositionId };
    })
    .sort(
      (left, right) => compareCodepoints(left.actorId, right.actorId)
        || compareCodepoints(left.propositionId, right.propositionId),
    );
}

function canonicalCapabilities(values: ReadonlySet<string>): CanonCapabilityGrant[] {
  return [...values]
    .map((value) => {
      const [entityId, capabilityId] = splitPair(value);
      return { entityId, capabilityId };
    })
    .sort(
      (left, right) => compareCodepoints(left.entityId, right.entityId)
        || compareCodepoints(left.capabilityId, right.capabilityId),
    );
}

function canonicalVariableValues(values: ReadonlyMap<string, number>): CanonVariableValue[] {
  return [...values.entries()]
    .map(([variableId, value]) => ({ variableId, value }))
    .sort((left, right) => compareCodepoints(left.variableId, right.variableId));
}

function emptyState(): CanonCompiledState {
  return {
    activeEntityIds: [],
    activePropositionIds: [],
    activeEventIds: [],
    completedEventIds: [],
    activeOptionIds: [],
    entityLocations: [],
    knowledge: [],
    capabilities: [],
    variables: [],
    functionAssignments: [],
    retiredFunctionIds: [],
    resolvedFunctionIds: [],
    fulfilledEndpoints: [],
  };
}

function sameAssignment(left: CanonFunctionAssignment, right: CanonFunctionAssignment): boolean {
  return JSON.stringify(orderedStrings(left.carrierIds)) === JSON.stringify(orderedStrings(right.carrierIds));
}

function checkExclusivePropositions(
  propositions: CanonBible["propositions"],
  active: ReadonlySet<string>,
  subjectId: string,
): CanonFinding[] {
  const byGroup = new Map<string, string[]>();
  for (const proposition of propositions) {
    if (!proposition.exclusiveGroupId || !active.has(proposition.id)) continue;
    const values = byGroup.get(proposition.exclusiveGroupId) ?? [];
    values.push(proposition.id);
    byGroup.set(proposition.exclusiveGroupId, values);
  }
  const findings: CanonFinding[] = [];
  for (const [groupId, propositionIds] of byGroup) {
    if (propositionIds.length > 1) {
      findings.push(
        finding(
          "exclusive-proposition-conflict",
          "error",
          subjectId,
          `${groupId} simultaneously activates ${orderedStrings(propositionIds).join(", ")}`,
        ),
      );
    }
  }
  return findings;
}

function heldCapabilityIds(context: CompileContext, entityId: string): Set<string> {
  const output = new Set<string>();
  const prefix = `${entityId}\u0000`;
  for (const key of context.capabilities) {
    if (key.startsWith(prefix)) output.add(key.slice(prefix.length));
  }
  return output;
}

function minimumTravelDuration(
  fromLocationId: string,
  toLocationId: string,
  edges: readonly CanonTravelEdge[],
  heldCapabilities: ReadonlySet<string>,
): number | null {
  if (fromLocationId === toLocationId) return 0;
  const distances = new Map<string, number>([[fromLocationId, 0]]);
  const visited = new Set<string>();

  while (true) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const [locationId, distance] of distances) {
      if (visited.has(locationId)) continue;
      if (distance < currentDistance || (distance === currentDistance && currentId !== null && compareCodepoints(locationId, currentId) < 0)) {
        currentId = locationId;
        currentDistance = distance;
      }
    }
    if (currentId === null) return null;
    if (currentId === toLocationId) return currentDistance;
    visited.add(currentId);

    for (const edge of edges) {
      if (edge.fromLocationId !== currentId) continue;
      if (!edge.requiredCapabilityIds.every((capabilityId) => heldCapabilities.has(capabilityId))) continue;
      const candidate = currentDistance + edge.minimumDuration;
      const existing = distances.get(edge.toLocationId);
      if (existing === undefined || candidate < existing) distances.set(edge.toLocationId, candidate);
    }
  }
}

function validateTravelToEvent(
  event: CanonEvent,
  participantId: string,
  context: CompileContext,
  travelEdges: readonly CanonTravelEdge[],
): CanonFinding[] {
  if (!event.locationId) return [];
  const previous = context.positions.get(participantId);
  if (!previous) {
    context.positions.set(participantId, { locationId: event.locationId, time: { ...event.time } });
    return [
      finding(
        "unbounded-origin",
        "notice",
        event.id,
        `${participantId} has no earlier bounded location; ${event.locationId} becomes the first known position`,
      ),
    ];
  }
  if (previous.locationId === event.locationId) {
    context.positions.set(participantId, { locationId: event.locationId, time: { ...event.time } });
    return [];
  }

  const duration = minimumTravelDuration(
    previous.locationId,
    event.locationId,
    travelEdges,
    heldCapabilityIds(context, participantId),
  );
  if (duration === null) {
    return [
      finding(
        "missing-travel-path",
        "error",
        event.id,
        `${participantId} cannot reach ${event.locationId} from ${previous.locationId} with active capabilities`,
      ),
    ];
  }
  if (previous.time.earliest + duration > event.time.latest) {
    return [
      finding(
        "impossible-travel",
        "error",
        event.id,
        `${participantId} needs ${duration} time units from ${previous.locationId}; earliest departure ${previous.time.earliest} misses latest arrival ${event.time.latest}`,
      ),
    ];
  }

  context.positions.set(participantId, { locationId: event.locationId, time: { ...event.time } });
  if (previous.time.latest + duration > event.time.earliest) {
    return [
      finding(
        "travel-window-ambiguous",
        "warning",
        event.id,
        `${participantId} can arrive only under part of the authored time ranges`,
      ),
    ];
  }
  return [];
}

function variableConditionPasses(value: number, condition: CanonVariableCondition): boolean {
  switch (condition.operator) {
    case "eq": return value === condition.value;
    case "ne": return value !== condition.value;
    case "lt": return value < condition.value;
    case "lte": return value <= condition.value;
    case "gt": return value > condition.value;
    case "gte": return value >= condition.value;
  }
}

function variableBoundFindings(
  variables: readonly CanonStateVariable[],
  values: ReadonlyMap<string, number>,
  subjectId: string,
): CanonFinding[] {
  const findings: CanonFinding[] = [];
  for (const variable of variables) {
    const value = values.get(variable.id);
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      findings.push(finding("invalid-variable-value", "error", subjectId, `${variable.id} is not finite`));
      continue;
    }
    if (variable.integer && !Number.isInteger(value)) {
      findings.push(
        finding(
          "invalid-variable-value",
          "error",
          subjectId,
          `${variable.id} requires an integer but resolved to ${value}`,
        ),
      );
    }
    if (variable.minimum !== undefined && value < variable.minimum) {
      findings.push(
        finding(
          "variable-underflow",
          "error",
          subjectId,
          `${variable.id} resolved to ${value}, below minimum ${variable.minimum}`,
        ),
      );
    }
    if (variable.maximum !== undefined && value > variable.maximum) {
      findings.push(
        finding(
          "variable-overflow",
          "error",
          subjectId,
          `${variable.id} resolved to ${value}, above maximum ${variable.maximum}`,
        ),
      );
    }
  }
  return findings;
}

function unresolvedFunctionCarrierFindings(
  narrativeFunctions: readonly CanonNarrativeFunction[],
  assignmentByFunction: ReadonlyMap<string, CanonFunctionAssignment>,
  retiredFunctionIds: ReadonlySet<string>,
  context: CompileContext,
  subjectId: string,
): CanonFinding[] {
  const findings: CanonFinding[] = [];
  for (const fn of narrativeFunctions) {
    if (retiredFunctionIds.has(fn.id) || context.resolvedFunctionIds.has(fn.id)) continue;
    const assignment = assignmentByFunction.get(fn.id);
    if (!assignment) continue;
    const inactive = assignment.carrierIds.filter((carrierId) => !context.activeEntityIds.has(carrierId));
    if (inactive.length === 0) continue;
    const active = assignment.carrierIds.length - inactive.length;
    findings.push(
      finding(
        "inactive-function-carrier",
        active === 0 && fn.required ? "error" : "warning",
        subjectId,
        `${fn.id} loses ${orderedStrings(inactive).join(", ")}${active === 0 ? " and has no active carrier" : ""}`,
      ),
    );
  }
  return findings;
}

function endpointFindings(
  endpoint: CanonEndpoint,
  event: CanonEvent,
  context: CompileContext,
): CanonFinding[] {
  const findings: CanonFinding[] = [];
  if (context.fulfilledEndpoints.has(endpoint.id)) {
    findings.push(
      finding(
        "duplicate-endpoint-fulfillment",
        "error",
        event.id,
        `${endpoint.id} was already fulfilled by ${context.fulfilledEndpoints.get(endpoint.id)?.eventId}`,
      ),
    );
  }
  if (event.time.latest < endpoint.window.earliest || event.time.earliest > endpoint.window.latest) {
    findings.push(
      finding(
        "endpoint-window",
        "error",
        event.id,
        `${endpoint.id} window ${endpoint.window.earliest}-${endpoint.window.latest} excludes event ${event.time.earliest}-${event.time.latest}`,
      ),
    );
  } else if (event.time.earliest < endpoint.window.earliest || event.time.latest > endpoint.window.latest) {
    findings.push(
      finding(
        "endpoint-window-ambiguous",
        "warning",
        event.id,
        `${endpoint.id} is satisfied only under part of the event time range`,
      ),
    );
  }
  for (const predecessorId of endpoint.predecessorEndpointIds) {
    const predecessor = context.fulfilledEndpoints.get(predecessorId);
    if (!predecessor) {
      findings.push(
        finding("endpoint-order", "error", event.id, `${endpoint.id} requires predecessor ${predecessorId}`),
      );
    } else if (predecessor.sequence >= event.sequence) {
      findings.push(
        finding(
          "endpoint-order",
          "error",
          event.id,
          `${predecessorId} sequence ${predecessor.sequence} is not before ${endpoint.id}`,
        ),
      );
    }
  }
  for (const propositionId of endpoint.requiredPropositionIds) {
    if (!context.activePropositionIds.has(propositionId)) {
      findings.push(
        finding(
          "endpoint-required-proposition",
          "error",
          event.id,
          `${endpoint.id} requires active proposition ${propositionId}`,
        ),
      );
    }
  }
  for (const propositionId of endpoint.forbiddenPropositionIds) {
    if (context.activePropositionIds.has(propositionId)) {
      findings.push(
        finding(
          "endpoint-forbidden-proposition",
          "error",
          event.id,
          `${endpoint.id} forbids active proposition ${propositionId}`,
        ),
      );
    }
  }
  for (const condition of endpoint.variableConstraints) {
    const value = context.variables.get(condition.variableId);
    if (value === undefined || !variableConditionPasses(value, condition)) {
      findings.push(
        finding(
          "endpoint-variable-constraint",
          "error",
          event.id,
          `${endpoint.id} requires ${condition.variableId} ${condition.operator} ${condition.value}; received ${String(value)}`,
        ),
      );
    }
  }
  for (const functionId of endpoint.requiredResolvedFunctionIds) {
    if (!context.resolvedFunctionIds.has(functionId)) {
      findings.push(
        finding(
          "endpoint-unresolved-function",
          "error",
          event.id,
          `${endpoint.id} requires resolved narrative function ${functionId}`,
        ),
      );
    }
  }
  return findings;
}

function makeReceipt(
  bible: CanonBible,
  decisions: CanonDecisionSet,
  inputFingerprint: string,
  state: CanonCompiledState,
  findings: readonly CanonFinding[],
  closureComplete: boolean,
): CanonCompileReceipt {
  const orderedFindings = sortCanonFindings(findings);
  const withoutFingerprint: Omit<CanonCompileReceipt, "receiptFingerprint"> = {
    format: CANON_COMPILE_RECEIPT_FORMAT,
    bibleId: bible.id,
    bibleVersion: bible.version,
    decisionSetId: decisions.id,
    targetContinuityId: decisions.targetContinuityId,
    bibleFingerprint: canonBibleFingerprint(bible),
    decisionSetFingerprint: canonDecisionSetFingerprint(decisions),
    inputFingerprint,
    state,
    findings: orderedFindings,
    passed: !orderedFindings.some((entry) => entry.severity === "error"),
    closureComplete,
  };
  return {
    ...withoutFingerprint,
    receiptFingerprint: canonCompileReceiptFingerprint(withoutFingerprint),
  };
}

export function compileCanonBible(
  bible: CanonBible,
  decisions: CanonDecisionSet,
  options: CanonCompileOptions = {},
): CanonCompileReceipt {
  const requireClosure = options.requireClosure ?? true;
  const extraEvents = options.extraEvents ?? [];
  const workingBible: CanonBible = extraEvents.length === 0
    ? bible
    : { ...bible, events: [...bible.events, ...extraEvents] };
  const bibleFingerprint = canonBibleFingerprint(bible);
  const decisionSetFingerprint = canonDecisionSetFingerprint(decisions);
  const inputFingerprint = narrativeFingerprint({
    bibleFingerprint,
    decisionSetFingerprint,
    extraEvents: extraEvents
      .map(canonicalCanonEvent)
      .sort((left, right) => compareCodepoints(left.id, right.id)),
    requireClosure,
  });

  const findings: CanonFinding[] = [
    ...validateCanonBible(workingBible),
    ...validateCanonDecisionSet(bible, decisions),
  ];
  if (findings.some((entry) => entry.severity === "error")) {
    return makeReceipt(bible, decisions, inputFingerprint, emptyState(), findings, false);
  }

  const closure = getContinuityClosure(workingBible, decisions.targetContinuityId);
  const entities = workingBible.entities.filter((entry) => intersects(entry.continuityIds, closure));
  const propositions = workingBible.propositions.filter((entry) => intersects(entry.continuityIds, closure));
  const capabilities = workingBible.capabilities.filter((entry) => intersects(entry.continuityIds, closure));
  const stateVariables = workingBible.stateVariables.filter((entry) => intersects(entry.continuityIds, closure));
  const travelEdges = workingBible.travelEdges.filter((entry) => intersects(entry.continuityIds, closure));
  const narrativeFunctions = workingBible.narrativeFunctions.filter((entry) => intersects(entry.continuityIds, closure));
  const endpoints = workingBible.endpoints.filter((entry) => intersects(entry.continuityIds, closure));
  const selectedOptions = decisions.selectedOptionIds
    .map((id) => workingBible.variantOptions.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((left, right) => compareCodepoints(left.id, right.id));

  const eligibleEntityIds = new Set(entities.map((entry) => entry.id));
  const initialEntityIds = workingBible.initialState.activeEntityIds
    ? new Set(workingBible.initialState.activeEntityIds.filter((id) => eligibleEntityIds.has(id)))
    : new Set(eligibleEntityIds);
  const activeEntityIds = new Set(initialEntityIds);
  for (const option of selectedOptions) {
    for (const entityId of option.effects.removeEntityIds) activeEntityIds.delete(entityId);
  }

  const eligiblePropositionIds = new Set(propositions.map((entry) => entry.id));
  const activePropositionIds = new Set(
    propositions.filter((entry) => entry.enabledByDefault).map((entry) => entry.id),
  );
  for (const propositionId of workingBible.initialState.activePropositionIds) {
    if (eligiblePropositionIds.has(propositionId)) activePropositionIds.add(propositionId);
  }
  for (const option of selectedOptions) {
    for (const propositionId of option.effects.activatePropositionIds) {
      if (eligiblePropositionIds.has(propositionId)) activePropositionIds.add(propositionId);
    }
    for (const propositionId of option.effects.deactivatePropositionIds) activePropositionIds.delete(propositionId);
  }
  for (const propositionId of decisions.assumePropositionIds) {
    if (eligiblePropositionIds.has(propositionId)) activePropositionIds.add(propositionId);
  }
  for (const propositionId of decisions.excludePropositionIds) activePropositionIds.delete(propositionId);
  findings.push(...checkExclusivePropositions(propositions, activePropositionIds, decisions.id));

  const variableById = new Map(stateVariables.map((entry) => [entry.id, entry] as const));
  const variableValues = new Map(stateVariables.map((entry) => [entry.id, entry.initialValue] as const));
  const optionOverrides = new Map<string, CanonVariableOverride[]>();
  for (const option of selectedOptions) {
    for (const override of option.effects.variableOverrides) {
      const values = optionOverrides.get(override.variableId) ?? [];
      values.push(override);
      optionOverrides.set(override.variableId, values);
    }
  }
  for (const [variableId, overrides] of optionOverrides) {
    const first = overrides[0];
    if (!first) continue;
    if (overrides.some((entry) => entry.value !== first.value)) {
      findings.push(
        finding(
          "conflicting-variable-override",
          "error",
          variableId,
          `selected options assign incompatible values to ${variableId}`,
        ),
      );
      continue;
    }
    if (variableById.has(variableId)) variableValues.set(variableId, first.value);
  }
  for (const override of decisions.variableOverrides) {
    if (variableById.has(override.variableId)) variableValues.set(override.variableId, override.value);
  }
  findings.push(...variableBoundFindings(stateVariables, variableValues, decisions.id));

  const eligibleEventIds = new Set(
    workingBible.events
      .filter((entry) => intersects(entry.continuityIds, closure))
      .map((entry) => entry.id),
  );
  const activeEventIds = new Set(
    workingBible.events
      .filter((entry) => intersects(entry.continuityIds, closure) && entry.enabledByDefault)
      .map((entry) => entry.id),
  );
  for (const option of selectedOptions) {
    for (const eventId of option.effects.activateEventIds) {
      if (eligibleEventIds.has(eventId)) activeEventIds.add(eventId);
    }
    for (const eventId of option.effects.deactivateEventIds) activeEventIds.delete(eventId);
  }

  const functionById = new Map(narrativeFunctions.map((entry) => [entry.id, entry] as const));
  const assignmentByFunction = new Map<string, CanonFunctionAssignment>();
  for (const fn of narrativeFunctions) {
    if (fn.defaultCarrierIds.length > 0) {
      assignmentByFunction.set(fn.id, {
        functionId: fn.id,
        carrierIds: [...fn.defaultCarrierIds],
        assignedBy: "canon-default",
        locatorIds: [...fn.locatorIds],
      });
    }
  }
  for (const assignment of workingBible.initialState.functionAssignments) {
    if (functionById.has(assignment.functionId)) assignmentByFunction.set(assignment.functionId, assignment);
  }

  const selectedOptionAssignments = new Map<string, CanonFunctionAssignment[]>();
  for (const option of selectedOptions) {
    for (const assignment of option.effects.functionAssignments) {
      const values = selectedOptionAssignments.get(assignment.functionId) ?? [];
      values.push(assignment);
      selectedOptionAssignments.set(assignment.functionId, values);
    }
  }
  for (const [functionId, assignments] of selectedOptionAssignments) {
    const first = assignments[0];
    if (!first) continue;
    if (assignments.some((entry) => !sameAssignment(first, entry))) {
      findings.push(
        finding(
          "conflicting-function-assignment",
          "error",
          functionId,
          `selected options assign incompatible carriers to ${functionId}`,
        ),
      );
      continue;
    }
    assignmentByFunction.set(functionId, first);
  }
  for (const assignment of decisions.functionAssignments) {
    if (functionById.has(assignment.functionId)) assignmentByFunction.set(assignment.functionId, assignment);
  }

  const retiredFunctionIds = new Set<string>();
  for (const option of selectedOptions) {
    for (const functionId of option.effects.retireFunctionIds) retiredFunctionIds.add(functionId);
  }
  for (const retirement of decisions.functionRetirements) retiredFunctionIds.add(retirement.functionId);

  for (const functionId of retiredFunctionIds) {
    const fn = functionById.get(functionId);
    if (fn?.required) {
      findings.push(
        finding(
          "required-function-retired",
          "error",
          functionId,
          "required narrative function cannot be retired from the branch",
        ),
      );
    }
    assignmentByFunction.delete(functionId);
  }

  for (const fn of narrativeFunctions) {
    if (retiredFunctionIds.has(fn.id)) continue;
    const assignment = assignmentByFunction.get(fn.id);
    if (!assignment) {
      findings.push(
        finding(
          "orphaned-function",
          fn.required ? "error" : "warning",
          fn.id,
          "no carrier remains assigned",
        ),
      );
      continue;
    }
    const activeCarriers = assignment.carrierIds.filter((carrierId) => activeEntityIds.has(carrierId));
    if (activeCarriers.length !== assignment.carrierIds.length) {
      const removed = assignment.carrierIds.filter((carrierId) => !activeEntityIds.has(carrierId));
      findings.push(
        finding(
          "removed-function-carrier",
          activeCarriers.length === 0 && fn.required ? "error" : "warning",
          fn.id,
          `inactive carriers: ${orderedStrings(removed).join(", ")}`,
        ),
      );
    }
    if (activeCarriers.length === 0) {
      findings.push(
        finding(
          "orphaned-function",
          fn.required ? "error" : "warning",
          fn.id,
          "all assigned carriers are inactive",
        ),
      );
      assignmentByFunction.delete(fn.id);
    } else {
      assignmentByFunction.set(fn.id, { ...assignment, carrierIds: activeCarriers });
    }
  }

  const knowledge = new Set<string>();
  for (const grant of workingBible.initialState.knowledge) {
    if (activeEntityIds.has(grant.actorId) && eligiblePropositionIds.has(grant.propositionId)) {
      knowledge.add(knowledgeKey(grant));
    }
  }
  const capabilitySet = new Set<string>();
  const eligibleCapabilityIds = new Set(capabilities.map((entry) => entry.id));
  for (const grant of workingBible.initialState.capabilities) {
    if (activeEntityIds.has(grant.entityId) && eligibleCapabilityIds.has(grant.capabilityId)) {
      capabilitySet.add(capabilityKey(grant));
    }
  }
  const positions = new Map<string, MutablePosition>();
  for (const position of workingBible.initialState.entityLocations) {
    if (activeEntityIds.has(position.entityId)) {
      positions.set(position.entityId, { locationId: position.locationId, time: { ...position.time } });
    }
  }

  const context: CompileContext = {
    activeEntityIds,
    activePropositionIds,
    knowledge,
    capabilities: capabilitySet,
    variables: variableValues,
    positions,
    resolvedFunctionIds: new Set<string>(),
    fulfilledEndpoints: new Map<string, CanonFulfilledEndpoint>(),
    processedEventIds: new Set<string>(),
  };

  const eventById = new Map(workingBible.events.map((entry) => [entry.id, entry] as const));
  const endpointById = new Map(endpoints.map((entry) => [entry.id, entry] as const));
  const activeEvents = workingBible.events
    .filter((event) => activeEventIds.has(event.id))
    .sort((left, right) => left.sequence - right.sequence || compareCodepoints(left.id, right.id));

  for (const event of activeEvents) {
    const eventFindings: CanonFinding[] = [];
    const snapshot = snapshotContext(context);
    for (const parentId of event.causalParentEventIds) {
      const parent = eventById.get(parentId);
      if (!activeEventIds.has(parentId)) {
        eventFindings.push(
          finding("missing-active-causal-parent", "error", event.id, `causal parent ${parentId} is inactive`),
        );
      } else if (!context.processedEventIds.has(parentId)) {
        eventFindings.push(
          finding("unresolved-causal-parent", "error", event.id, `causal parent ${parentId} did not complete`),
        );
      }
      if (parent) {
        if (parent.time.earliest > event.time.latest) {
          eventFindings.push(
            finding("causal-time", "error", event.id, `${parentId} cannot occur before this event`),
          );
        } else if (parent.time.latest > event.time.earliest) {
          eventFindings.push(
            finding("causal-time-ambiguous", "warning", event.id, `${parentId} and this event have overlapping ranges`),
          );
        }
      }
    }

    for (const entityId of [...event.participantIds, ...event.preconditions.requiredActiveEntityIds]) {
      if (!context.activeEntityIds.has(entityId)) {
        eventFindings.push(
          finding("inactive-entity", "error", event.id, `${entityId} is inactive before the event`),
        );
      }
    }
    for (const propositionId of event.preconditions.requiredPropositionIds) {
      if (!context.activePropositionIds.has(propositionId)) {
        eventFindings.push(
          finding("missing-required-proposition", "error", event.id, `requires ${propositionId}`),
        );
      }
    }
    for (const propositionId of event.preconditions.forbiddenPropositionIds) {
      if (context.activePropositionIds.has(propositionId)) {
        eventFindings.push(
          finding("forbidden-proposition-active", "error", event.id, `forbids ${propositionId}`),
        );
      }
    }
    for (const grant of event.preconditions.knowledge) {
      if (!context.knowledge.has(knowledgeKey(grant))) {
        eventFindings.push(
          finding(
            "missing-knowledge",
            "error",
            event.id,
            `${grant.actorId} does not know ${grant.propositionId}`,
          ),
        );
      }
    }
    for (const grant of event.preconditions.capabilities) {
      if (!context.capabilities.has(capabilityKey(grant))) {
        eventFindings.push(
          finding(
            "missing-capability",
            "error",
            event.id,
            `${grant.entityId} lacks ${grant.capabilityId}`,
          ),
        );
      }
    }
    for (const condition of event.preconditions.variables) {
      const value = context.variables.get(condition.variableId);
      if (value === undefined || !variableConditionPasses(value, condition)) {
        eventFindings.push(
          finding(
            "variable-precondition",
            "error",
            event.id,
            `${condition.variableId} must be ${condition.operator} ${condition.value}; received ${String(value)}`,
          ),
        );
      }
    }
    const both = event.effects.establishPropositionIds.filter((id) => event.effects.negatePropositionIds.includes(id));
    for (const propositionId of both) {
      eventFindings.push(
        finding(
          "contradictory-event-effect",
          "error",
          event.id,
          `${propositionId} is both established and negated`,
        ),
      );
    }

    for (const participantId of event.participantIds) {
      eventFindings.push(...validateTravelToEvent(event, participantId, context, travelEdges));
    }

    if (eventFindings.some((entry) => entry.severity === "error")) {
      findings.push(...eventFindings);
      restoreContext(context, snapshot);
      continue;
    }

    for (const propositionId of event.effects.negatePropositionIds) {
      context.activePropositionIds.delete(propositionId);
    }
    for (const propositionId of event.effects.establishPropositionIds) {
      context.activePropositionIds.add(propositionId);
    }
    for (const grant of event.effects.grantKnowledge) context.knowledge.add(knowledgeKey(grant));
    for (const grant of event.effects.grantCapabilities) context.capabilities.add(capabilityKey(grant));
    for (const grant of event.effects.revokeCapabilities) context.capabilities.delete(capabilityKey(grant));
    for (const change of event.effects.variableSets) context.variables.set(change.variableId, change.value);
    for (const change of event.effects.variableDeltas) {
      const current = context.variables.get(change.variableId);
      if (current !== undefined) context.variables.set(change.variableId, current + change.delta);
    }
    for (const move of event.effects.moveEntities) {
      context.positions.set(move.entityId, { locationId: move.toLocationId, time: { ...event.time } });
    }
    for (const entityId of event.effects.activateEntityIds) context.activeEntityIds.add(entityId);
    for (const entityId of event.effects.deactivateEntityIds) context.activeEntityIds.delete(entityId);
    for (const functionId of event.effects.resolveFunctionIds) {
      if (!retiredFunctionIds.has(functionId)) context.resolvedFunctionIds.add(functionId);
    }
    const postEffectFindings: CanonFinding[] = [
      ...checkExclusivePropositions(propositions, context.activePropositionIds, event.id),
      ...variableBoundFindings(stateVariables, context.variables, event.id),
      ...unresolvedFunctionCarrierFindings(
        narrativeFunctions,
        assignmentByFunction,
        retiredFunctionIds,
        context,
        event.id,
      ),
    ];
    const fulfilledByEvent: CanonFulfilledEndpoint[] = [];
    for (const endpointId of event.fulfillsEndpointIds) {
      const endpoint = endpointById.get(endpointId);
      if (!endpoint) continue;
      const checks = endpointFindings(endpoint, event, context);
      postEffectFindings.push(...checks);
      if (!checks.some((entry) => entry.severity === "error")) {
        fulfilledByEvent.push({ endpointId, eventId: event.id, sequence: event.sequence });
      }
    }

    findings.push(...eventFindings, ...postEffectFindings);
    if (postEffectFindings.some((entry) => entry.severity === "error")) {
      restoreContext(context, snapshot);
      continue;
    }
    for (const fulfilled of fulfilledByEvent) {
      context.fulfilledEndpoints.set(fulfilled.endpointId, fulfilled);
    }
    context.processedEventIds.add(event.id);
  }

  const maximumSequence = activeEvents
    .filter((event) => context.processedEventIds.has(event.id))
    .reduce((maximum, event) => Math.max(maximum, event.sequence), 0);
  for (const endpoint of endpoints) {
    if (!endpoint.hard || context.fulfilledEndpoints.has(endpoint.id)) continue;
    findings.push(
      finding(
        "unmet-endpoint",
        requireClosure ? "error" : "warning",
        endpoint.id,
        "hard endpoint has no valid fulfilling event in the compiled branch",
      ),
    );
  }
  for (const fn of narrativeFunctions) {
    if (!fn.required || retiredFunctionIds.has(fn.id) || context.resolvedFunctionIds.has(fn.id)) continue;
    const deadlinePassed = fn.deadlineSequence !== undefined && maximumSequence >= fn.deadlineSequence;
    findings.push(
      finding(
        deadlinePassed ? "function-deadline-missed" : "unresolved-function",
        deadlinePassed || requireClosure ? "error" : "warning",
        fn.id,
        deadlinePassed
          ? `deadline sequence ${fn.deadlineSequence} passed without resolution`
          : "required narrative function remains unresolved",
      ),
    );
  }

  const closureComplete = !findings.some((entry) => entry.severity === "error")
    && endpoints.filter((entry) => entry.hard)
      .every((entry) => context.fulfilledEndpoints.has(entry.id))
    && narrativeFunctions.filter((entry) => entry.required)
      .every((entry) => context.resolvedFunctionIds.has(entry.id));

  const state: CanonCompiledState = {
    activeEntityIds: orderedStrings([...context.activeEntityIds]),
    activePropositionIds: orderedStrings([...context.activePropositionIds]),
    activeEventIds: orderedStrings([...activeEventIds]),
    completedEventIds: orderedStrings([...context.processedEventIds]),
    activeOptionIds: orderedStrings(selectedOptions.map((entry) => entry.id)),
    entityLocations: canonicalLocations(context.positions),
    knowledge: canonicalKnowledge(context.knowledge),
    capabilities: canonicalCapabilities(context.capabilities),
    variables: canonicalVariableValues(context.variables),
    functionAssignments: canonicalAssignments(assignmentByFunction.values()),
    retiredFunctionIds: orderedStrings([...retiredFunctionIds]),
    resolvedFunctionIds: orderedStrings([...context.resolvedFunctionIds]),
    fulfilledEndpoints: [...context.fulfilledEndpoints.values()].sort(
      (left, right) => left.sequence - right.sequence || compareCodepoints(left.endpointId, right.endpointId),
    ),
  };

  return makeReceipt(bible, decisions, inputFingerprint, state, findings, closureComplete);
}
