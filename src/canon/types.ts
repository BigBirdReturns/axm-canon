export const CANON_BIBLE_FORMAT = "axm-canon-bible/1" as const;
export const CANON_DECISION_SET_FORMAT = "axm-canon-decision-set/1" as const;
export const CANON_COMPILE_RECEIPT_FORMAT = "axm-canon-compile-receipt/1" as const;
export const CANON_PROPOSAL_SET_RECEIPT_FORMAT = "axm-canon-proposal-set-receipt/1" as const;

export type CanonAuthorityTier =
  | "primary-canon"
  | "companion-canon"
  | "author-statement"
  | "adaptation"
  | "production-testimony"
  | "licensed-reference"
  | "historical-analogue"
  | "analysis";

export type CanonSourceCustody = "local-private" | "public" | "licensed" | "derived";
export type CanonLocatorKind = "byte" | "page" | "chapter" | "line" | "timestamp" | "record";
export type CanonEntityKind =
  | "actor"
  | "faction"
  | "house"
  | "polity"
  | "location"
  | "creature"
  | "artifact"
  | "institution"
  | "office"
  | "lineage"
  | "force"
  | "other";

export type CanonAttestationStance = "supports" | "contradicts" | "reports" | "uncertain" | "withholds";
export type CanonVariantCardinality = "exactly-one" | "zero-or-one" | "one-or-more" | "any";
export type CanonNarrativeFunctionKind =
  | "political-pressure"
  | "causal-trigger"
  | "information-channel"
  | "resource-carrier"
  | "symbolic-payoff"
  | "endpoint-prerequisite"
  | "character-pressure"
  | "institutional-function"
  | "other";

export type CanonFindingSeverity = "error" | "warning" | "notice";
export type CanonProposalClassification = "necessary" | "strongly-implied" | "permissible" | "contradicted";
export type CanonScalar = string | number | boolean | null;
export type CanonComparisonOperator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

export interface CanonTimeWindow {
  earliest: number;
  latest: number;
}

export interface CanonContinuity {
  id: string;
  label: string;
  inheritsFromIds: string[];
  description?: string;
}

export interface CanonSource {
  id: string;
  title: string;
  authorityTier: CanonAuthorityTier;
  continuityId: string;
  version: string;
  custody: CanonSourceCustody;
  digest?: string;
  parentSourceIds: string[];
  notes?: string;
}

export interface CanonLocator {
  id: string;
  sourceId: string;
  kind: CanonLocatorKind;
  unit: string;
  start?: number;
  end?: number;
  contentDigest?: string;
  notes?: string;
}

export interface CanonEntity {
  id: string;
  label: string;
  kind: CanonEntityKind;
  continuityIds: string[];
  aliases: string[];
  tags: string[];
  locatorIds: string[];
}

export type CanonPropositionObject =
  | { kind: "entity"; entityId: string }
  | { kind: "literal"; value: CanonScalar };

export interface CanonProposition {
  id: string;
  subjectId: string;
  predicate: string;
  object: CanonPropositionObject;
  continuityIds: string[];
  enabledByDefault: boolean;
  exclusiveGroupId?: string;
  tags: string[];
  locatorIds: string[];
}

export interface CanonAttestation {
  id: string;
  propositionId: string;
  stance: CanonAttestationStance;
  locatorIds: string[];
  confidencePermille?: number;
  narratorEntityId?: string;
  notes?: string;
}

export interface CanonCapability {
  id: string;
  label: string;
  description: string;
  continuityIds: string[];
  locatorIds: string[];
}

export interface CanonStateVariable {
  id: string;
  label: string;
  description: string;
  subjectId?: string;
  unit: string;
  continuityIds: string[];
  initialValue: number;
  minimum?: number;
  maximum?: number;
  integer: boolean;
  locatorIds: string[];
}

export interface CanonVariableCondition {
  variableId: string;
  operator: CanonComparisonOperator;
  value: number;
}

export interface CanonVariableDelta {
  variableId: string;
  delta: number;
}

export interface CanonVariableSet {
  variableId: string;
  value: number;
}

export interface CanonVariableOverride {
  variableId: string;
  value: number;
}

export interface CanonVariableValue {
  variableId: string;
  value: number;
}

export interface CanonTravelEdge {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  minimumDuration: number;
  requiredCapabilityIds: string[];
  continuityIds: string[];
  locatorIds: string[];
}

export interface CanonKnowledgeGrant {
  actorId: string;
  propositionId: string;
}

export interface CanonCapabilityGrant {
  entityId: string;
  capabilityId: string;
}

export interface CanonEntityLocation {
  entityId: string;
  locationId: string;
  time: CanonTimeWindow;
}

export interface CanonFunctionAssignment {
  functionId: string;
  carrierIds: string[];
  assignedBy: string;
  locatorIds: string[];
}

export interface CanonInitialState {
  activePropositionIds: string[];
  activeEntityIds?: string[];
  entityLocations: CanonEntityLocation[];
  knowledge: CanonKnowledgeGrant[];
  capabilities: CanonCapabilityGrant[];
  functionAssignments: CanonFunctionAssignment[];
}

export interface CanonNarrativeFunction {
  id: string;
  label: string;
  description: string;
  kind: CanonNarrativeFunctionKind;
  required: boolean;
  continuityIds: string[];
  defaultCarrierIds: string[];
  requiredByEndpointIds: string[];
  deadlineSequence?: number;
  tags: string[];
  locatorIds: string[];
}

export interface CanonEventPreconditions {
  requiredPropositionIds: string[];
  forbiddenPropositionIds: string[];
  requiredActiveEntityIds: string[];
  knowledge: CanonKnowledgeGrant[];
  capabilities: CanonCapabilityGrant[];
  variables: CanonVariableCondition[];
}

export interface CanonEntityMove {
  entityId: string;
  toLocationId: string;
}

export interface CanonEventEffects {
  establishPropositionIds: string[];
  negatePropositionIds: string[];
  grantKnowledge: CanonKnowledgeGrant[];
  grantCapabilities: CanonCapabilityGrant[];
  revokeCapabilities: CanonCapabilityGrant[];
  variableSets: CanonVariableSet[];
  variableDeltas: CanonVariableDelta[];
  moveEntities: CanonEntityMove[];
  activateEntityIds: string[];
  deactivateEntityIds: string[];
  resolveFunctionIds: string[];
}

export interface CanonEvent {
  id: string;
  label: string;
  continuityIds: string[];
  enabledByDefault: boolean;
  sequence: number;
  time: CanonTimeWindow;
  locationId?: string;
  participantIds: string[];
  causalParentEventIds: string[];
  preconditions: CanonEventPreconditions;
  effects: CanonEventEffects;
  fulfillsEndpointIds: string[];
  tags: string[];
  locatorIds: string[];
}

export interface CanonEndpoint {
  id: string;
  label: string;
  description: string;
  continuityIds: string[];
  hard: boolean;
  window: CanonTimeWindow;
  predecessorEndpointIds: string[];
  requiredPropositionIds: string[];
  forbiddenPropositionIds: string[];
  variableConstraints: CanonVariableCondition[];
  requiredResolvedFunctionIds: string[];
  tags: string[];
  locatorIds: string[];
}

export interface CanonVariantGroup {
  id: string;
  label: string;
  description: string;
  continuityIds: string[];
  cardinality: CanonVariantCardinality;
  optionIds: string[];
  locatorIds: string[];
}

export interface CanonVariantEffects {
  activatePropositionIds: string[];
  deactivatePropositionIds: string[];
  activateEventIds: string[];
  deactivateEventIds: string[];
  removeEntityIds: string[];
  variableOverrides: CanonVariableOverride[];
  functionAssignments: CanonFunctionAssignment[];
  retireFunctionIds: string[];
}

export interface CanonVariantOption {
  id: string;
  groupId: string;
  label: string;
  description: string;
  requiresOptionIds: string[];
  conflictsWithOptionIds: string[];
  effects: CanonVariantEffects;
  locatorIds: string[];
}

export interface CanonBible {
  format: typeof CANON_BIBLE_FORMAT;
  id: string;
  version: string;
  title: string;
  description: string;
  continuities: CanonContinuity[];
  sources: CanonSource[];
  locators: CanonLocator[];
  entities: CanonEntity[];
  propositions: CanonProposition[];
  attestations: CanonAttestation[];
  capabilities: CanonCapability[];
  stateVariables: CanonStateVariable[];
  travelEdges: CanonTravelEdge[];
  narrativeFunctions: CanonNarrativeFunction[];
  events: CanonEvent[];
  endpoints: CanonEndpoint[];
  variantGroups: CanonVariantGroup[];
  variantOptions: CanonVariantOption[];
  initialState: CanonInitialState;
}

export interface CanonFunctionRetirement {
  functionId: string;
  rationale: string;
  locatorIds: string[];
}

export interface CanonDecisionSet {
  format: typeof CANON_DECISION_SET_FORMAT;
  id: string;
  bibleId: string;
  bibleVersion: string;
  targetContinuityId: string;
  selectedOptionIds: string[];
  assumePropositionIds: string[];
  excludePropositionIds: string[];
  variableOverrides: CanonVariableOverride[];
  functionAssignments: CanonFunctionAssignment[];
  functionRetirements: CanonFunctionRetirement[];
}

export interface CanonFinding {
  code: string;
  severity: CanonFindingSeverity;
  subjectId: string;
  detail: string;
}

export interface CanonFulfilledEndpoint {
  endpointId: string;
  eventId: string;
  sequence: number;
}

export interface CanonCompiledState {
  activeEntityIds: string[];
  activePropositionIds: string[];
  activeEventIds: string[];
  completedEventIds: string[];
  activeOptionIds: string[];
  entityLocations: CanonEntityLocation[];
  knowledge: CanonKnowledgeGrant[];
  capabilities: CanonCapabilityGrant[];
  variables: CanonVariableValue[];
  functionAssignments: CanonFunctionAssignment[];
  retiredFunctionIds: string[];
  resolvedFunctionIds: string[];
  fulfilledEndpoints: CanonFulfilledEndpoint[];
}

export interface CanonCompileReceipt {
  format: typeof CANON_COMPILE_RECEIPT_FORMAT;
  bibleId: string;
  bibleVersion: string;
  decisionSetId: string;
  targetContinuityId: string;
  bibleFingerprint: string;
  decisionSetFingerprint: string;
  inputFingerprint: string;
  state: CanonCompiledState;
  findings: CanonFinding[];
  passed: boolean;
  closureComplete: boolean;
  receiptFingerprint: string;
}

export interface CanonCompileOptions {
  requireClosure?: boolean;
  extraEvents?: CanonEvent[];
}

export interface CanonContinuationProposal {
  id: string;
  label: string;
  event: CanonEvent;
}

export interface CanonProposalCoverage {
  endpointIds: string[];
  functionIds: string[];
}

export interface CanonProposalResult {
  proposalId: string;
  classification: CanonProposalClassification;
  coverage: CanonProposalCoverage;
  findingCodes: string[];
  reasons: string[];
  compileReceiptFingerprint: string;
}

export interface CanonProposalSetReceipt {
  format: typeof CANON_PROPOSAL_SET_RECEIPT_FORMAT;
  bibleId: string;
  decisionSetId: string;
  baselineReceiptFingerprint: string;
  proposalSetFingerprint: string;
  unmetEndpointIds: string[];
  unresolvedFunctionIds: string[];
  results: CanonProposalResult[];
  receiptFingerprint: string;
}
