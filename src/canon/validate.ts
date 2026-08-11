import { compareCodepoints } from "../runtime/determinism.js";
import {
  CANON_BIBLE_FORMAT,
  CANON_DECISION_SET_FORMAT,
  type CanonBible,
  type CanonDecisionSet,
  type CanonEntityMove,
  type CanonEvent,
  type CanonFinding,
  type CanonFunctionAssignment,
  type CanonKnowledgeGrant,
  type CanonCapabilityGrant,
  type CanonStateVariable,
  type CanonVariableCondition,
  type CanonVariableDelta,
  type CanonVariableOverride,
  type CanonVariableSet,
  type CanonTimeWindow,
} from "./types.js";

const SEVERITY_ORDER: Record<CanonFinding["severity"], number> = {
  error: 0,
  warning: 1,
  notice: 2,
};

export function sortCanonFindings(findings: readonly CanonFinding[]): CanonFinding[] {
  return [...findings].sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
      || compareCodepoints(left.subjectId, right.subjectId)
      || compareCodepoints(left.code, right.code)
      || compareCodepoints(left.detail, right.detail),
  );
}

function finding(
  code: string,
  severity: CanonFinding["severity"],
  subjectId: string,
  detail: string,
): CanonFinding {
  return { code, severity, subjectId, detail };
}

function duplicates(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort(compareCodepoints);
}

function requireUnique(findings: CanonFinding[], values: readonly string[], subjectId: string): void {
  for (const id of duplicates(values)) {
    findings.push(finding("duplicate-id", "error", subjectId, `${subjectId} contains duplicate ${id}`));
  }
}

function requireNonEmpty(findings: CanonFinding[], value: string, subjectId: string, field: string): void {
  if (value.trim().length === 0) {
    findings.push(finding("missing-text", "error", subjectId, `${field} must be non-empty`));
  }
}

function validateTimeWindow(findings: CanonFinding[], window: CanonTimeWindow, subjectId: string): void {
  if (!Number.isFinite(window.earliest) || !Number.isFinite(window.latest)) {
    findings.push(finding("invalid-time-window", "error", subjectId, "time bounds must be finite"));
    return;
  }
  if (window.earliest > window.latest) {
    findings.push(
      finding(
        "invalid-time-window",
        "error",
        subjectId,
        `earliest ${window.earliest} exceeds latest ${window.latest}`,
      ),
    );
  }
}

function requireReferences(
  findings: CanonFinding[],
  values: readonly string[],
  known: ReadonlySet<string>,
  subjectId: string,
  kind: string,
): void {
  for (const value of values) {
    if (!known.has(value)) {
      findings.push(finding("missing-reference", "error", subjectId, `unknown ${kind} ${value}`));
    }
  }
}

function validateKnowledgeGrant(
  findings: CanonFinding[],
  grant: CanonKnowledgeGrant,
  subjectId: string,
  entityIds: ReadonlySet<string>,
  propositionIds: ReadonlySet<string>,
): void {
  if (!entityIds.has(grant.actorId)) {
    findings.push(finding("missing-reference", "error", subjectId, `unknown actor ${grant.actorId}`));
  }
  if (!propositionIds.has(grant.propositionId)) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown proposition ${grant.propositionId}`),
    );
  }
}

function validateCapabilityGrant(
  findings: CanonFinding[],
  grant: CanonCapabilityGrant,
  subjectId: string,
  entityIds: ReadonlySet<string>,
  capabilityIds: ReadonlySet<string>,
): void {
  if (!entityIds.has(grant.entityId)) {
    findings.push(finding("missing-reference", "error", subjectId, `unknown entity ${grant.entityId}`));
  }
  if (!capabilityIds.has(grant.capabilityId)) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown capability ${grant.capabilityId}`),
    );
  }
}

function variableValueFinding(
  variable: CanonStateVariable,
  value: number,
  subjectId: string,
  field: string,
): CanonFinding | null {
  if (!Number.isFinite(value)) {
    return finding("invalid-variable-value", "error", subjectId, `${field} must be finite`);
  }
  if (variable.integer && !Number.isInteger(value)) {
    return finding(
      "invalid-variable-value",
      "error",
      subjectId,
      `${field} for ${variable.id} must be an integer; received ${value}`,
    );
  }
  if (variable.minimum !== undefined && value < variable.minimum) {
    return finding(
      "variable-bounds",
      "error",
      subjectId,
      `${field} for ${variable.id} is ${value}, below minimum ${variable.minimum}`,
    );
  }
  if (variable.maximum !== undefined && value > variable.maximum) {
    return finding(
      "variable-bounds",
      "error",
      subjectId,
      `${field} for ${variable.id} is ${value}, above maximum ${variable.maximum}`,
    );
  }
  return null;
}

function validateVariableCondition(
  findings: CanonFinding[],
  condition: CanonVariableCondition,
  subjectId: string,
  variableById: ReadonlyMap<string, CanonStateVariable>,
): void {
  const variable = variableById.get(condition.variableId);
  if (!variable) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown state variable ${condition.variableId}`),
    );
    return;
  }
  if (!Number.isFinite(condition.value)) {
    findings.push(
      finding("invalid-variable-value", "error", subjectId, `condition for ${condition.variableId} must be finite`),
    );
  }
}

function validateVariableSet(
  findings: CanonFinding[],
  change: CanonVariableSet | CanonVariableOverride,
  subjectId: string,
  variableById: ReadonlyMap<string, CanonStateVariable>,
  field: string,
): void {
  const variable = variableById.get(change.variableId);
  if (!variable) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown state variable ${change.variableId}`),
    );
    return;
  }
  const issue = variableValueFinding(variable, change.value, subjectId, field);
  if (issue) findings.push(issue);
}

function validateVariableDelta(
  findings: CanonFinding[],
  change: CanonVariableDelta,
  subjectId: string,
  variableById: ReadonlyMap<string, CanonStateVariable>,
): void {
  if (!variableById.has(change.variableId)) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown state variable ${change.variableId}`),
    );
  }
  if (!Number.isFinite(change.delta)) {
    findings.push(
      finding("invalid-variable-value", "error", subjectId, `delta for ${change.variableId} must be finite`),
    );
  }
}

function validateMove(
  findings: CanonFinding[],
  move: CanonEntityMove,
  subjectId: string,
  entityIds: ReadonlySet<string>,
  locationIds: ReadonlySet<string>,
): void {
  if (!entityIds.has(move.entityId)) {
    findings.push(finding("missing-reference", "error", subjectId, `unknown entity ${move.entityId}`));
  }
  if (!locationIds.has(move.toLocationId)) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown location ${move.toLocationId}`),
    );
  }
}

function validateFunctionAssignment(
  findings: CanonFinding[],
  assignment: CanonFunctionAssignment,
  subjectId: string,
  functionIds: ReadonlySet<string>,
  entityIds: ReadonlySet<string>,
  locatorIds: ReadonlySet<string>,
): void {
  if (!functionIds.has(assignment.functionId)) {
    findings.push(
      finding("missing-reference", "error", subjectId, `unknown narrative function ${assignment.functionId}`),
    );
  }
  if (assignment.carrierIds.length === 0) {
    findings.push(
      finding("empty-function-assignment", "error", subjectId, `${assignment.functionId} has no carrier`),
    );
  }
  requireReferences(findings, assignment.carrierIds, entityIds, subjectId, "carrier entity");
  requireReferences(findings, assignment.locatorIds, locatorIds, subjectId, "locator");
  requireNonEmpty(findings, assignment.assignedBy, subjectId, "assignedBy");
}

interface EventValidationSets {
  continuityIds: ReadonlySet<string>;
  entityIds: ReadonlySet<string>;
  locationIds: ReadonlySet<string>;
  propositionIds: ReadonlySet<string>;
  capabilityIds: ReadonlySet<string>;
  variableIds: ReadonlySet<string>;
  variableById: ReadonlyMap<string, CanonStateVariable>;
  functionIds: ReadonlySet<string>;
  endpointIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
  locatorIds: ReadonlySet<string>;
}

export function validateCanonEventReferences(
  event: CanonEvent,
  sets: EventValidationSets,
): CanonFinding[] {
  const findings: CanonFinding[] = [];
  requireNonEmpty(findings, event.id, event.id || "event", "event.id");
  requireNonEmpty(findings, event.label, event.id, "event.label");
  requireReferences(findings, event.continuityIds, sets.continuityIds, event.id, "continuity");
  if (!Number.isInteger(event.sequence) || event.sequence < 0) {
    findings.push(
      finding("invalid-sequence", "error", event.id, `sequence must be a non-negative integer; received ${event.sequence}`),
    );
  }
  validateTimeWindow(findings, event.time, event.id);
  if (event.locationId && !sets.locationIds.has(event.locationId)) {
    findings.push(finding("missing-reference", "error", event.id, `unknown location ${event.locationId}`));
  }
  requireReferences(findings, event.participantIds, sets.entityIds, event.id, "participant");
  requireReferences(findings, event.causalParentEventIds, sets.eventIds, event.id, "causal parent event");
  requireReferences(
    findings,
    event.preconditions.requiredPropositionIds,
    sets.propositionIds,
    event.id,
    "required proposition",
  );
  requireReferences(
    findings,
    event.preconditions.forbiddenPropositionIds,
    sets.propositionIds,
    event.id,
    "forbidden proposition",
  );
  requireReferences(
    findings,
    event.preconditions.requiredActiveEntityIds,
    sets.entityIds,
    event.id,
    "required active entity",
  );
  for (const grant of event.preconditions.knowledge) {
    validateKnowledgeGrant(findings, grant, event.id, sets.entityIds, sets.propositionIds);
  }
  for (const grant of event.preconditions.capabilities) {
    validateCapabilityGrant(findings, grant, event.id, sets.entityIds, sets.capabilityIds);
  }
  for (const condition of event.preconditions.variables) {
    validateVariableCondition(findings, condition, event.id, sets.variableById);
  }
  requireReferences(
    findings,
    event.effects.establishPropositionIds,
    sets.propositionIds,
    event.id,
    "established proposition",
  );
  requireReferences(
    findings,
    event.effects.negatePropositionIds,
    sets.propositionIds,
    event.id,
    "negated proposition",
  );
  for (const grant of event.effects.grantKnowledge) {
    validateKnowledgeGrant(findings, grant, event.id, sets.entityIds, sets.propositionIds);
  }
  for (const grant of event.effects.grantCapabilities) {
    validateCapabilityGrant(findings, grant, event.id, sets.entityIds, sets.capabilityIds);
  }
  for (const grant of event.effects.revokeCapabilities) {
    validateCapabilityGrant(findings, grant, event.id, sets.entityIds, sets.capabilityIds);
  }
  for (const change of event.effects.variableSets) {
    validateVariableSet(findings, change, event.id, sets.variableById, "variable set");
  }
  for (const change of event.effects.variableDeltas) {
    validateVariableDelta(findings, change, event.id, sets.variableById);
  }
  for (const variableId of duplicates(event.effects.variableSets.map((entry) => entry.variableId))) {
    findings.push(finding("duplicate-variable-effect", "error", event.id, `multiple sets target ${variableId}`));
  }
  for (const variableId of duplicates(event.effects.variableDeltas.map((entry) => entry.variableId))) {
    findings.push(finding("duplicate-variable-effect", "error", event.id, `multiple deltas target ${variableId}`));
  }
  for (const change of event.effects.variableSets) {
    if (event.effects.variableDeltas.some((entry) => entry.variableId === change.variableId)) {
      findings.push(
        finding(
          "contradictory-variable-effect",
          "error",
          event.id,
          `${change.variableId} is both set and incremented in one event`,
        ),
      );
    }
  }
  for (const move of event.effects.moveEntities) {
    validateMove(findings, move, event.id, sets.entityIds, sets.locationIds);
  }
  requireReferences(findings, event.effects.activateEntityIds, sets.entityIds, event.id, "activated entity");
  requireReferences(
    findings,
    event.effects.deactivateEntityIds,
    sets.entityIds,
    event.id,
    "deactivated entity",
  );
  requireReferences(
    findings,
    event.effects.resolveFunctionIds,
    sets.functionIds,
    event.id,
    "resolved narrative function",
  );
  requireReferences(findings, event.fulfillsEndpointIds, sets.endpointIds, event.id, "endpoint");
  requireReferences(findings, event.locatorIds, sets.locatorIds, event.id, "locator");
  return sortCanonFindings(findings);
}

export function getContinuityClosure(bible: CanonBible, targetContinuityId: string): Set<string> {
  const byId = new Map(bible.continuities.map((continuity) => [continuity.id, continuity] as const));
  const closure = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (closure.has(id) || visiting.has(id)) return;
    const continuity = byId.get(id);
    if (!continuity) return;
    visiting.add(id);
    for (const parentId of continuity.inheritsFromIds) visit(parentId);
    visiting.delete(id);
    closure.add(id);
  }

  visit(targetContinuityId);
  return closure;
}

function intersects(values: readonly string[], set: ReadonlySet<string>): boolean {
  return values.some((value) => set.has(value));
}

export function validateCanonBible(bible: CanonBible): CanonFinding[] {
  const findings: CanonFinding[] = [];
  if (bible.format !== CANON_BIBLE_FORMAT) {
    findings.push(finding("invalid-format", "error", bible.id || "bible", `expected ${CANON_BIBLE_FORMAT}`));
    return findings;
  }
  requireNonEmpty(findings, bible.id, "bible", "bible.id");
  requireNonEmpty(findings, bible.version, bible.id, "bible.version");
  requireNonEmpty(findings, bible.title, bible.id, "bible.title");
  requireNonEmpty(findings, bible.description, bible.id, "bible.description");

  requireUnique(findings, bible.continuities.map((value) => value.id), "continuities");
  requireUnique(findings, bible.sources.map((value) => value.id), "sources");
  requireUnique(findings, bible.locators.map((value) => value.id), "locators");
  requireUnique(findings, bible.entities.map((value) => value.id), "entities");
  requireUnique(findings, bible.propositions.map((value) => value.id), "propositions");
  requireUnique(findings, bible.attestations.map((value) => value.id), "attestations");
  requireUnique(findings, bible.capabilities.map((value) => value.id), "capabilities");
  requireUnique(findings, bible.stateVariables.map((value) => value.id), "stateVariables");
  requireUnique(findings, bible.travelEdges.map((value) => value.id), "travelEdges");
  requireUnique(findings, bible.narrativeFunctions.map((value) => value.id), "narrativeFunctions");
  requireUnique(findings, bible.events.map((value) => value.id), "events");
  requireUnique(findings, bible.endpoints.map((value) => value.id), "endpoints");
  requireUnique(findings, bible.variantGroups.map((value) => value.id), "variantGroups");
  requireUnique(findings, bible.variantOptions.map((value) => value.id), "variantOptions");

  const continuityIds = new Set(bible.continuities.map((value) => value.id));
  const sourceIds = new Set(bible.sources.map((value) => value.id));
  const locatorIds = new Set(bible.locators.map((value) => value.id));
  const entityIds = new Set(bible.entities.map((value) => value.id));
  const locationIds = new Set(
    bible.entities.filter((value) => value.kind === "location").map((value) => value.id),
  );
  const propositionIds = new Set(bible.propositions.map((value) => value.id));
  const capabilityIds = new Set(bible.capabilities.map((value) => value.id));
  const variableIds = new Set(bible.stateVariables.map((value) => value.id));
  const variableById = new Map(bible.stateVariables.map((value) => [value.id, value] as const));
  const functionIds = new Set(bible.narrativeFunctions.map((value) => value.id));
  const eventIds = new Set(bible.events.map((value) => value.id));
  const endpointIds = new Set(bible.endpoints.map((value) => value.id));
  const groupIds = new Set(bible.variantGroups.map((value) => value.id));
  const optionIds = new Set(bible.variantOptions.map((value) => value.id));

  for (const continuity of bible.continuities) {
    requireNonEmpty(findings, continuity.id, continuity.id || "continuity", "continuity.id");
    requireNonEmpty(findings, continuity.label, continuity.id, "continuity.label");
    requireReferences(
      findings,
      continuity.inheritsFromIds,
      continuityIds,
      continuity.id,
      "parent continuity",
    );
    if (continuity.inheritsFromIds.includes(continuity.id)) {
      findings.push(finding("continuity-cycle", "error", continuity.id, "continuity cannot inherit from itself"));
    }
  }

  for (const continuity of bible.continuities) {
    const stack = new Set<string>();
    const visited = new Set<string>();
    const byId = new Map(bible.continuities.map((entry) => [entry.id, entry] as const));
    const walk = (id: string): boolean => {
      if (stack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      stack.add(id);
      const entry = byId.get(id);
      const cyclical = entry?.inheritsFromIds.some((parentId) => walk(parentId)) ?? false;
      stack.delete(id);
      return cyclical;
    };
    if (walk(continuity.id)) {
      findings.push(finding("continuity-cycle", "error", continuity.id, "continuity inheritance is cyclic"));
    }
  }

  for (const source of bible.sources) {
    requireNonEmpty(findings, source.id, source.id || "source", "source.id");
    requireNonEmpty(findings, source.title, source.id, "source.title");
    requireNonEmpty(findings, source.version, source.id, "source.version");
    if (!continuityIds.has(source.continuityId)) {
      findings.push(
        finding("missing-reference", "error", source.id, `unknown continuity ${source.continuityId}`),
      );
    }
    requireReferences(findings, source.parentSourceIds, sourceIds, source.id, "parent source");
  }

  for (const locator of bible.locators) {
    requireNonEmpty(findings, locator.id, locator.id || "locator", "locator.id");
    requireNonEmpty(findings, locator.unit, locator.id, "locator.unit");
    if (!sourceIds.has(locator.sourceId)) {
      findings.push(finding("missing-reference", "error", locator.id, `unknown source ${locator.sourceId}`));
    }
    if (locator.start !== undefined && (!Number.isFinite(locator.start) || locator.start < 0)) {
      findings.push(finding("invalid-locator-range", "error", locator.id, `invalid start ${locator.start}`));
    }
    if (locator.end !== undefined && (!Number.isFinite(locator.end) || locator.end < 0)) {
      findings.push(finding("invalid-locator-range", "error", locator.id, `invalid end ${locator.end}`));
    }
    if (locator.start !== undefined && locator.end !== undefined && locator.start > locator.end) {
      findings.push(
        finding("invalid-locator-range", "error", locator.id, `start ${locator.start} exceeds end ${locator.end}`),
      );
    }
  }

  for (const entity of bible.entities) {
    requireNonEmpty(findings, entity.id, entity.id || "entity", "entity.id");
    requireNonEmpty(findings, entity.label, entity.id, "entity.label");
    requireReferences(findings, entity.continuityIds, continuityIds, entity.id, "continuity");
    requireReferences(findings, entity.locatorIds, locatorIds, entity.id, "locator");
  }

  for (const proposition of bible.propositions) {
    requireNonEmpty(findings, proposition.id, proposition.id || "proposition", "proposition.id");
    requireNonEmpty(findings, proposition.predicate, proposition.id, "proposition.predicate");
    if (!entityIds.has(proposition.subjectId)) {
      findings.push(
        finding("missing-reference", "error", proposition.id, `unknown subject entity ${proposition.subjectId}`),
      );
    }
    if (proposition.object.kind === "entity" && !entityIds.has(proposition.object.entityId)) {
      findings.push(
        finding("missing-reference", "error", proposition.id, `unknown object entity ${proposition.object.entityId}`),
      );
    }
    requireReferences(findings, proposition.continuityIds, continuityIds, proposition.id, "continuity");
    requireReferences(findings, proposition.locatorIds, locatorIds, proposition.id, "locator");
  }

  for (const attestation of bible.attestations) {
    if (!propositionIds.has(attestation.propositionId)) {
      findings.push(
        finding("missing-reference", "error", attestation.id, `unknown proposition ${attestation.propositionId}`),
      );
    }
    requireReferences(findings, attestation.locatorIds, locatorIds, attestation.id, "locator");
    if (attestation.narratorEntityId && !entityIds.has(attestation.narratorEntityId)) {
      findings.push(
        finding("missing-reference", "error", attestation.id, `unknown narrator ${attestation.narratorEntityId}`),
      );
    }
    if (
      attestation.confidencePermille !== undefined
      && (!Number.isInteger(attestation.confidencePermille)
        || attestation.confidencePermille < 0
        || attestation.confidencePermille > 1000)
    ) {
      findings.push(
        finding(
          "invalid-confidence",
          "error",
          attestation.id,
          `confidencePermille must be an integer from 0 through 1000`,
        ),
      );
    }
  }

  for (const capability of bible.capabilities) {
    requireNonEmpty(findings, capability.label, capability.id, "capability.label");
    requireNonEmpty(findings, capability.description, capability.id, "capability.description");
    requireReferences(findings, capability.continuityIds, continuityIds, capability.id, "continuity");
    requireReferences(findings, capability.locatorIds, locatorIds, capability.id, "locator");
  }

  for (const variable of bible.stateVariables) {
    requireNonEmpty(findings, variable.id, variable.id || "stateVariable", "stateVariable.id");
    requireNonEmpty(findings, variable.label, variable.id, "stateVariable.label");
    requireNonEmpty(findings, variable.description, variable.id, "stateVariable.description");
    requireNonEmpty(findings, variable.unit, variable.id, "stateVariable.unit");
    requireReferences(findings, variable.continuityIds, continuityIds, variable.id, "continuity");
    requireReferences(findings, variable.locatorIds, locatorIds, variable.id, "locator");
    if (variable.subjectId && !entityIds.has(variable.subjectId)) {
      findings.push(
        finding("missing-reference", "error", variable.id, `unknown subject entity ${variable.subjectId}`),
      );
    }
    if (variable.minimum !== undefined && !Number.isFinite(variable.minimum)) {
      findings.push(finding("invalid-variable-bounds", "error", variable.id, "minimum must be finite"));
    }
    if (variable.maximum !== undefined && !Number.isFinite(variable.maximum)) {
      findings.push(finding("invalid-variable-bounds", "error", variable.id, "maximum must be finite"));
    }
    if (
      variable.minimum !== undefined
      && variable.maximum !== undefined
      && variable.minimum > variable.maximum
    ) {
      findings.push(
        finding(
          "invalid-variable-bounds",
          "error",
          variable.id,
          `minimum ${variable.minimum} exceeds maximum ${variable.maximum}`,
        ),
      );
    }
    const issue = variableValueFinding(variable, variable.initialValue, variable.id, "initialValue");
    if (issue) findings.push(issue);
  }

  for (const edge of bible.travelEdges) {
    if (!locationIds.has(edge.fromLocationId)) {
      findings.push(finding("missing-reference", "error", edge.id, `unknown location ${edge.fromLocationId}`));
    }
    if (!locationIds.has(edge.toLocationId)) {
      findings.push(finding("missing-reference", "error", edge.id, `unknown location ${edge.toLocationId}`));
    }
    if (!Number.isFinite(edge.minimumDuration) || edge.minimumDuration < 0) {
      findings.push(
        finding("invalid-travel-duration", "error", edge.id, `invalid duration ${edge.minimumDuration}`),
      );
    }
    requireReferences(
      findings,
      edge.requiredCapabilityIds,
      capabilityIds,
      edge.id,
      "required capability",
    );
    requireReferences(findings, edge.continuityIds, continuityIds, edge.id, "continuity");
    requireReferences(findings, edge.locatorIds, locatorIds, edge.id, "locator");
  }

  for (const fn of bible.narrativeFunctions) {
    requireNonEmpty(findings, fn.label, fn.id, "narrativeFunction.label");
    requireNonEmpty(findings, fn.description, fn.id, "narrativeFunction.description");
    requireReferences(findings, fn.continuityIds, continuityIds, fn.id, "continuity");
    requireReferences(findings, fn.defaultCarrierIds, entityIds, fn.id, "default carrier");
    requireReferences(findings, fn.requiredByEndpointIds, endpointIds, fn.id, "endpoint");
    requireReferences(findings, fn.locatorIds, locatorIds, fn.id, "locator");
    if (fn.required && fn.defaultCarrierIds.length === 0) {
      findings.push(
        finding("missing-default-carrier", "warning", fn.id, "required function has no default carrier"),
      );
    }
    if (fn.deadlineSequence !== undefined && (!Number.isInteger(fn.deadlineSequence) || fn.deadlineSequence < 0)) {
      findings.push(
        finding("invalid-sequence", "error", fn.id, `invalid deadline sequence ${fn.deadlineSequence}`),
      );
    }
  }

  const eventSets: EventValidationSets = {
    continuityIds,
    entityIds,
    locationIds,
    propositionIds,
    capabilityIds,
    variableIds,
    variableById,
    functionIds,
    endpointIds,
    eventIds,
    locatorIds,
  };
  for (const event of bible.events) findings.push(...validateCanonEventReferences(event, eventSets));
  for (const event of bible.events) {
    for (const parentId of event.causalParentEventIds) {
      const parent = bible.events.find((candidate) => candidate.id === parentId);
      if (parent && parent.sequence >= event.sequence) {
        findings.push(
          finding(
            "causal-order",
            "error",
            event.id,
            `causal parent ${parentId} sequence ${parent.sequence} is not before ${event.sequence}`,
          ),
        );
      }
    }
  }

  for (const endpoint of bible.endpoints) {
    requireNonEmpty(findings, endpoint.label, endpoint.id, "endpoint.label");
    requireNonEmpty(findings, endpoint.description, endpoint.id, "endpoint.description");
    validateTimeWindow(findings, endpoint.window, endpoint.id);
    requireReferences(findings, endpoint.continuityIds, continuityIds, endpoint.id, "continuity");
    requireReferences(
      findings,
      endpoint.predecessorEndpointIds,
      endpointIds,
      endpoint.id,
      "predecessor endpoint",
    );
    requireReferences(
      findings,
      endpoint.requiredPropositionIds,
      propositionIds,
      endpoint.id,
      "required proposition",
    );
    requireReferences(
      findings,
      endpoint.forbiddenPropositionIds,
      propositionIds,
      endpoint.id,
      "forbidden proposition",
    );
    for (const condition of endpoint.variableConstraints) {
      validateVariableCondition(findings, condition, endpoint.id, variableById);
    }
    requireReferences(
      findings,
      endpoint.requiredResolvedFunctionIds,
      functionIds,
      endpoint.id,
      "required resolved function",
    );
    requireReferences(findings, endpoint.locatorIds, locatorIds, endpoint.id, "locator");
    if (endpoint.predecessorEndpointIds.includes(endpoint.id)) {
      findings.push(finding("endpoint-cycle", "error", endpoint.id, "endpoint cannot precede itself"));
    }
  }

  for (const group of bible.variantGroups) {
    requireNonEmpty(findings, group.label, group.id, "variantGroup.label");
    requireNonEmpty(findings, group.description, group.id, "variantGroup.description");
    requireReferences(findings, group.continuityIds, continuityIds, group.id, "continuity");
    requireReferences(findings, group.optionIds, optionIds, group.id, "variant option");
    requireReferences(findings, group.locatorIds, locatorIds, group.id, "locator");
    requireUnique(findings, group.optionIds, group.id);
    for (const optionId of group.optionIds) {
      const option = bible.variantOptions.find((entry) => entry.id === optionId);
      if (option && option.groupId !== group.id) {
        findings.push(
          finding(
            "variant-membership",
            "error",
            group.id,
            `${optionId} declares group ${option.groupId}`,
          ),
        );
      }
    }
    if (group.cardinality !== "any" && group.optionIds.length === 0) {
      findings.push(finding("empty-variant-group", "error", group.id, "variant group has no options"));
    }
  }

  for (const option of bible.variantOptions) {
    requireNonEmpty(findings, option.label, option.id, "variantOption.label");
    requireNonEmpty(findings, option.description, option.id, "variantOption.description");
    if (!groupIds.has(option.groupId)) {
      findings.push(finding("missing-reference", "error", option.id, `unknown variant group ${option.groupId}`));
    } else {
      const group = bible.variantGroups.find((candidate) => candidate.id === option.groupId);
      if (group && !group.optionIds.includes(option.id)) {
        findings.push(
          finding("variant-membership", "error", option.id, `group ${option.groupId} does not list this option`),
        );
      }
    }
    requireReferences(findings, option.requiresOptionIds, optionIds, option.id, "required option");
    requireReferences(findings, option.conflictsWithOptionIds, optionIds, option.id, "conflicting option");
    requireReferences(
      findings,
      option.effects.activatePropositionIds,
      propositionIds,
      option.id,
      "activated proposition",
    );
    requireReferences(
      findings,
      option.effects.deactivatePropositionIds,
      propositionIds,
      option.id,
      "deactivated proposition",
    );
    requireReferences(findings, option.effects.activateEventIds, eventIds, option.id, "activated event");
    requireReferences(findings, option.effects.deactivateEventIds, eventIds, option.id, "deactivated event");
    requireReferences(findings, option.effects.removeEntityIds, entityIds, option.id, "removed entity");
    for (const override of option.effects.variableOverrides) {
      validateVariableSet(findings, override, option.id, variableById, "variable override");
    }
    for (const variableId of duplicates(option.effects.variableOverrides.map((entry) => entry.variableId))) {
      findings.push(
        finding("duplicate-variable-override", "error", option.id, `multiple overrides target ${variableId}`),
      );
    }
    for (const assignment of option.effects.functionAssignments) {
      validateFunctionAssignment(
        findings,
        assignment,
        option.id,
        functionIds,
        entityIds,
        locatorIds,
      );
    }
    requireReferences(
      findings,
      option.effects.retireFunctionIds,
      functionIds,
      option.id,
      "retired narrative function",
    );
    requireReferences(findings, option.locatorIds, locatorIds, option.id, "locator");
  }

  requireReferences(
    findings,
    bible.initialState.activePropositionIds,
    propositionIds,
    "initialState",
    "active proposition",
  );
  if (bible.initialState.activeEntityIds) {
    requireReferences(
      findings,
      bible.initialState.activeEntityIds,
      entityIds,
      "initialState",
      "active entity",
    );
  }
  for (const location of bible.initialState.entityLocations) {
    if (!entityIds.has(location.entityId)) {
      findings.push(
        finding("missing-reference", "error", "initialState", `unknown entity ${location.entityId}`),
      );
    }
    if (!locationIds.has(location.locationId)) {
      findings.push(
        finding("missing-reference", "error", "initialState", `unknown location ${location.locationId}`),
      );
    }
    validateTimeWindow(findings, location.time, `initialState:${location.entityId}`);
  }
  for (const grant of bible.initialState.knowledge) {
    validateKnowledgeGrant(findings, grant, "initialState", entityIds, propositionIds);
  }
  for (const grant of bible.initialState.capabilities) {
    validateCapabilityGrant(findings, grant, "initialState", entityIds, capabilityIds);
  }
  for (const assignment of bible.initialState.functionAssignments) {
    validateFunctionAssignment(
      findings,
      assignment,
      "initialState",
      functionIds,
      entityIds,
      locatorIds,
    );
  }

  return sortCanonFindings(findings);
}

export function validateCanonDecisionSet(
  bible: CanonBible,
  decisions: CanonDecisionSet,
): CanonFinding[] {
  const findings: CanonFinding[] = [];
  if (decisions.format !== CANON_DECISION_SET_FORMAT) {
    findings.push(
      finding("invalid-format", "error", decisions.id || "decisionSet", `expected ${CANON_DECISION_SET_FORMAT}`),
    );
    return findings;
  }
  requireNonEmpty(findings, decisions.id, "decisionSet", "decisionSet.id");
  if (decisions.bibleId !== bible.id) {
    findings.push(
      finding("bible-mismatch", "error", decisions.id, `expected bible ${bible.id}; received ${decisions.bibleId}`),
    );
  }
  if (decisions.bibleVersion !== bible.version) {
    findings.push(
      finding(
        "bible-version-mismatch",
        "error",
        decisions.id,
        `expected bible version ${bible.version}; received ${decisions.bibleVersion}`,
      ),
    );
  }

  const continuityIds = new Set(bible.continuities.map((value) => value.id));
  const propositionIds = new Set(bible.propositions.map((value) => value.id));
  const optionIds = new Set(bible.variantOptions.map((value) => value.id));
  const functionIds = new Set(bible.narrativeFunctions.map((value) => value.id));
  const entityIds = new Set(bible.entities.map((value) => value.id));
  const variableById = new Map(bible.stateVariables.map((value) => [value.id, value] as const));
  const locatorIds = new Set(bible.locators.map((value) => value.id));

  if (!continuityIds.has(decisions.targetContinuityId)) {
    findings.push(
      finding(
        "missing-reference",
        "error",
        decisions.id,
        `unknown target continuity ${decisions.targetContinuityId}`,
      ),
    );
    return sortCanonFindings(findings);
  }

  requireUnique(findings, decisions.selectedOptionIds, `${decisions.id}:selectedOptionIds`);
  requireUnique(findings, decisions.assumePropositionIds, `${decisions.id}:assumePropositionIds`);
  requireUnique(findings, decisions.excludePropositionIds, `${decisions.id}:excludePropositionIds`);
  requireReferences(findings, decisions.selectedOptionIds, optionIds, decisions.id, "selected option");
  requireReferences(
    findings,
    decisions.assumePropositionIds,
    propositionIds,
    decisions.id,
    "assumed proposition",
  );
  requireReferences(
    findings,
    decisions.excludePropositionIds,
    propositionIds,
    decisions.id,
    "excluded proposition",
  );
  for (const propositionId of decisions.assumePropositionIds) {
    if (decisions.excludePropositionIds.includes(propositionId)) {
      findings.push(
        finding(
          "contradictory-decision",
          "error",
          decisions.id,
          `${propositionId} is both assumed and excluded`,
        ),
      );
    }
  }

  const closure = getContinuityClosure(bible, decisions.targetContinuityId);
  const selected = new Set(decisions.selectedOptionIds);
  for (const group of bible.variantGroups.filter((entry) => intersects(entry.continuityIds, closure))) {
    const count = group.optionIds.filter((id) => selected.has(id)).length;
    const valid = group.cardinality === "exactly-one"
      ? count === 1
      : group.cardinality === "zero-or-one"
        ? count <= 1
        : group.cardinality === "one-or-more"
          ? count >= 1
          : true;
    if (!valid) {
      findings.push(
        finding(
          "variant-cardinality",
          "error",
          group.id,
          `${group.cardinality} selected ${count} of ${group.optionIds.length} options`,
        ),
      );
    }
  }

  for (const optionId of decisions.selectedOptionIds) {
    const option = bible.variantOptions.find((candidate) => candidate.id === optionId);
    if (!option) continue;
    for (const requiredId of option.requiresOptionIds) {
      if (!selected.has(requiredId)) {
        findings.push(
          finding("missing-required-option", "error", option.id, `requires selected option ${requiredId}`),
        );
      }
    }
    for (const conflictId of option.conflictsWithOptionIds) {
      if (selected.has(conflictId)) {
        findings.push(
          finding("conflicting-option", "error", option.id, `conflicts with selected option ${conflictId}`),
        );
      }
    }
    const group = bible.variantGroups.find((candidate) => candidate.id === option.groupId);
    if (group && !intersects(group.continuityIds, closure)) {
      findings.push(
        finding(
          "foreign-continuity-option",
          "error",
          option.id,
          `option belongs outside target continuity ${decisions.targetContinuityId}`,
        ),
      );
    }
  }

  for (const override of decisions.variableOverrides) {
    validateVariableSet(findings, override, decisions.id, variableById, "variable override");
  }
  for (const variableId of duplicates(decisions.variableOverrides.map((entry) => entry.variableId))) {
    findings.push(
      finding(
        "duplicate-variable-override",
        "error",
        decisions.id,
        `multiple decision overrides target ${variableId}`,
      ),
    );
  }

  for (const assignment of decisions.functionAssignments) {
    validateFunctionAssignment(
      findings,
      assignment,
      decisions.id,
      functionIds,
      entityIds,
      locatorIds,
    );
  }
  for (const functionId of duplicates(decisions.functionAssignments.map((entry) => entry.functionId))) {
    findings.push(
      finding(
        "conflicting-function-assignment",
        "error",
        decisions.id,
        `multiple decision assignments target ${functionId}`,
      ),
    );
  }

  for (const retirement of decisions.functionRetirements) {
    if (!functionIds.has(retirement.functionId)) {
      findings.push(
        finding(
          "missing-reference",
          "error",
          decisions.id,
          `unknown retired narrative function ${retirement.functionId}`,
        ),
      );
    }
    requireNonEmpty(findings, retirement.rationale, decisions.id, "functionRetirement.rationale");
    requireReferences(findings, retirement.locatorIds, locatorIds, decisions.id, "locator");
    if (decisions.functionAssignments.some((entry) => entry.functionId === retirement.functionId)) {
      findings.push(
        finding(
          "contradictory-decision",
          "error",
          decisions.id,
          `${retirement.functionId} is both assigned and retired`,
        ),
      );
    }
  }
  for (const functionId of duplicates(decisions.functionRetirements.map((entry) => entry.functionId))) {
    findings.push(
      finding("duplicate-retirement", "error", decisions.id, `multiple retirements target ${functionId}`),
    );
  }

  return sortCanonFindings(findings);
}
