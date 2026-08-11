import {
  compareCodepoints,
  orderedStrings,
} from "../../../src/runtime/determinism.js";
import { narrativeFingerprint } from "../../../src/runtime/fingerprint.js";
import {
  ASOIAF_RECALL_ESTATE_MANIFEST,
  ASOIAF_RECALL_ESTATE_PACKETS,
} from "../recall/index.js";
import {
  asoiafExternalLaneFingerprint,
  asoiafExternalSourceFingerprint,
  canonicalAsoiafExternalQueryLane,
  canonicalAsoiafExternalSource,
} from "./canonical.js";
import { ASOIAF_EXTERNAL_SOURCES } from "./catalog.js";
import { ASOIAF_EXTERNAL_QUERY_LANES } from "./query-lanes.js";
import type {
  AsoiafExternalAtlasManifest,
  AsoiafExternalAuthorityClass,
  AsoiafExternalCollectionStep,
  AsoiafExternalContinuity,
  AsoiafExternalHarvestWorkOrder,
  AsoiafExternalQueryLane,
  AsoiafExternalRole,
  AsoiafExternalRouteRequest,
  AsoiafExternalRouteResult,
  AsoiafExternalRouteSource,
  AsoiafExternalSource,
  AsoiafExternalSourcePlane,
} from "./types.js";
import {
  ASOIAF_EXTERNAL_ATLAS_MANIFEST_FORMAT,
  ASOIAF_EXTERNAL_HARVEST_WORK_ORDER_FORMAT,
} from "./types.js";

const AUTHORITY_CLASSES: AsoiafExternalAuthorityClass[] = [
  "primary-text",
  "companion-text",
  "released-author-text",
  "author-statement",
  "adaptation-canon",
  "production-testimony",
  "licensed-reference",
  "official-bibliography",
  "structured-dataset",
  "community-reference",
  "community-analysis",
  "discussion-provenance",
  "scholarly-analogue",
  "archival-custody",
  "discovery-only",
];

const SOURCE_PLANES: AsoiafExternalSourcePlane[] = [
  "local-primary",
  "official-author",
  "official-adaptation",
  "publisher-reference",
  "structured-tool",
  "community-reference",
  "community-analysis",
  "discussion",
  "scholarly",
  "archive",
  "discovery",
];

const RECALL_CANDIDATES = ASOIAF_RECALL_ESTATE_PACKETS.flatMap(
  (packet) => packet.candidates,
);

function candidateLaneIds(
  candidate: (typeof RECALL_CANDIDATES)[number],
): AsoiafExternalRole[] {
  const lanes = new Set<AsoiafExternalRole>();
  const byDomain: Record<
    (typeof candidate)["domain"],
    AsoiafExternalRole[]
  > = {
    "core-entities": ["entity-resolution", "networks"],
    "lineage-claims": [
      "genealogy-parentage",
      "succession-legitimacy",
      "gender-kinship",
    ],
    "chronology-geography": ["chronology", "geography-travel", "maps"],
    "actor-knowledge": ["actor-knowledge", "chapter-analysis"],
    "material-logistics": [
      "military-logistics",
      "economics-smallfolk",
      "food-agriculture",
    ],
    "magic-physics": [
      "magic-world-physics",
      "dragons",
      "religion-sacrifice",
      "prophecy",
    ],
    "narrative-functions": [
      "chapter-analysis",
      "adaptation-deltas",
      "endgame-closure",
    ],
    "adaptation-deltas": [
      "adaptation-deltas",
      "production-intent",
      "episode-dialogue",
    ],
    "endgame-coordinates": [
      "endgame-closure",
      "death-status",
      "hotd-endpoints",
    ],
    "smallfolk-systems": [
      "economics-smallfolk",
      "law-governance",
      "medicine-disease",
      "food-agriculture",
    ],
  };
  for (const laneId of byDomain[candidate.domain]) lanes.add(laneId);

  const text = `${candidate.label} ${candidate.summary} ${candidate.tags.join(" ")}`.toLowerCase();
  const rules: Array<[RegExp, AsoiafExternalRole]> = [
    [/varys|r['’]?hllor|red priest|voice in the flame/, "varys-rhllor"],
    [/blackfyre|bittersteel|golden company|young griff/, "blackfyres"],
    [/other|white walker|long night/, "others-long-night"],
    [/dance|green council|dragonseed|tumbleton|rhaenyra|aegon ii/, "dance-of-dragons"],
    [/dragon/, "dragons"],
    [/prophe|dream|vision/, "prophecy"],
    [/sigil|herald|house words|banner/, "heraldry"],
    [/language|valyrian|dothraki|translation/, "language"],
    [/disease|greyscale|plague|medicine|wound/, "medicine-disease"],
    [/death|dead|alive|survive|fate/, "death-status"],
    [/author|martin|grrm/, "author-intent"],
    [/adapt|show|episode|hbo/, "adaptation-deltas"],
  ];
  for (const [pattern, laneId] of rules) {
    if (pattern.test(text)) lanes.add(laneId);
  }
  return [...lanes].sort(compareCodepoints);
}

function collectionSteps(source: AsoiafExternalSource): AsoiafExternalCollectionStep[] {
  const steps: AsoiafExternalCollectionStep[] = ["establish-source-custody"];
  const network = source.harvestPolicy.mode !== "local-private-only";
  if (network) steps.push("check-robots-and-terms");
  if (
    source.accessMethods.some(
      (method) => method.machineReadable && method.kind !== "local-file",
    )
  ) {
    steps.push("discover-schema");
  }
  if (source.harvestPolicy.mode !== "route-only-no-mirror") {
    steps.push("fetch-bounded-records");
  }
  steps.push("hash-source-record");
  if (source.harvestPolicy.mode !== "route-only-no-mirror") {
    steps.push("normalize-whitelisted-fields", "block-private-contact");
  }
  steps.push("write-immutable-observation", "deduplicate-candidate");
  if (source.rightsMode === "cc-by" || source.rightsMode === "cc-by-sa") {
    steps.push("generate-credit-if-required");
  }
  steps.push("reconcile-held-candidates", "record-honest-terminal-result");
  return steps;
}

function buildWorkOrder(
  source: AsoiafExternalSource,
): AsoiafExternalHarvestWorkOrder {
  const candidateIds = RECALL_CANDIDATES.filter((candidate) =>
    candidate.sourceHints.some((hint) => source.sourceHintRoutes.includes(hint))
    || candidateLaneIds(candidate).some((laneId) => source.roles.includes(laneId))
    || source.id === "structured-github-datasets",
  )
    .map((candidate) => candidate.id)
    .sort(compareCodepoints);
  const core = {
    format: ASOIAF_EXTERNAL_HARVEST_WORK_ORDER_FORMAT,
    id: `asoiaf-external-harvest:${source.id}`,
    sourceId: source.id,
    sourceFingerprint: asoiafExternalSourceFingerprint(source),
    laneIds: [...source.roles].sort(compareCodepoints),
    sourceHintIds: orderedStrings(source.sourceHintRoutes),
    candidateIds,
    collectionSteps: collectionSteps(source),
    reviewActions: [
      "confirm",
      "correct",
      "split",
      "merge",
      "reject",
      "defer",
    ] as AsoiafExternalHarvestWorkOrder["reviewActions"],
    receiptRequirements: [
      "durable-source-record-identifier",
      "retrieval-timestamp",
      "upstream-content-sha256",
      "normalized-record-sha256",
      "rights-and-retention-decision",
      "source-specific-locator",
      "reviewer-identity-before-promotion",
    ],
    promotionForbiddenUntil: [
      "source-identity-resolved",
      "continuity-resolved",
      "rights-mode-satisfied",
      "claim-level-receipts-attached",
      "human-review-recorded",
      "reconciliation-transaction-passes",
    ],
  };
  return {
    ...core,
    workOrderFingerprint: narrativeFingerprint(core),
  };
}

function countBy<T extends string>(
  vocabulary: readonly T[],
  values: readonly T[],
): Record<T, number> {
  const output = Object.fromEntries(
    vocabulary.map((value) => [value, 0]),
  ) as Record<T, number>;
  for (const value of values) output[value] += 1;
  return output;
}

export function buildAsoiafExternalAtlas(
  inputSources: readonly AsoiafExternalSource[] = ASOIAF_EXTERNAL_SOURCES,
  inputLanes: readonly AsoiafExternalQueryLane[] = ASOIAF_EXTERNAL_QUERY_LANES,
): {
  sources: AsoiafExternalSource[];
  lanes: AsoiafExternalQueryLane[];
  workOrders: AsoiafExternalHarvestWorkOrder[];
  manifest: AsoiafExternalAtlasManifest;
} {
  const sources = inputSources
    .map(canonicalAsoiafExternalSource)
    .sort((left, right) => compareCodepoints(left.id, right.id));
  const lanes = inputLanes
    .map(canonicalAsoiafExternalQueryLane)
    .sort((left, right) => compareCodepoints(left.id, right.id));
  const workOrders = sources
    .map(buildWorkOrder)
    .sort((left, right) => compareCodepoints(left.id, right.id));
  const routedCandidates = new Set(
    workOrders.flatMap((workOrder) => workOrder.candidateIds),
  );
  const fingerprintInput = {
    sourceFingerprints: sources.map((source) => ({
      sourceId: source.id,
      fingerprint: asoiafExternalSourceFingerprint(source),
    })),
    laneFingerprints: lanes.map((lane) => ({
      laneId: lane.id,
      fingerprint: asoiafExternalLaneFingerprint(lane),
    })),
    workOrderFingerprints: workOrders.map((workOrder) => ({
      workOrderId: workOrder.id,
      fingerprint: workOrder.workOrderFingerprint,
    })),
  };
  const manifestCore: Omit<AsoiafExternalAtlasManifest, "atlasFingerprint"> = {
    format: ASOIAF_EXTERNAL_ATLAS_MANIFEST_FORMAT,
    universeId: "asoiaf",
    sourceIds: sources.map((source) => source.id),
    laneIds: lanes.map((lane) => lane.id),
    workOrderIds: workOrders.map((workOrder) => workOrder.id),
    authorityClasses: [...AUTHORITY_CLASSES].sort(compareCodepoints),
    sourceCount: sources.length,
    laneCount: lanes.length,
    workOrderCount: workOrders.length,
    sourceLaneEdgeCount: sources.reduce(
      (total, source) => total + source.roles.length,
      0,
    ),
    heldCandidateCount: ASOIAF_RECALL_ESTATE_MANIFEST.candidateCount,
    routedCandidateCount: routedCandidates.size,
    countsByPlane: countBy(
      SOURCE_PLANES,
      sources.map((source) => source.sourcePlane),
    ),
    countsByAuthority: countBy(
      AUTHORITY_CLASSES,
      sources.map((source) => source.authorityClass),
    ),
  };
  return {
    sources,
    lanes,
    workOrders,
    manifest: {
      ...manifestCore,
      atlasFingerprint: narrativeFingerprint({
        ...manifestCore,
        ...fingerprintInput,
      }),
    },
  };
}

const BUILT_ATLAS = buildAsoiafExternalAtlas();

export const ASOIAF_EXTERNAL_ATLAS_SOURCES = BUILT_ATLAS.sources;
export const ASOIAF_EXTERNAL_ATLAS_LANES = BUILT_ATLAS.lanes;
export const ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS = BUILT_ATLAS.workOrders;
export const ASOIAF_EXTERNAL_ATLAS_MANIFEST = BUILT_ATLAS.manifest;

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeLaneScores(
  request: AsoiafExternalRouteRequest,
): Map<AsoiafExternalRole, number> {
  const scores = new Map<AsoiafExternalRole, number>();
  const text = normalizedText(request.text);
  for (const lane of ASOIAF_EXTERNAL_ATLAS_LANES) {
    let score = request.laneIds?.includes(lane.id) ? 1_000 : 0;
    if (text.includes(normalizedText(lane.id))) score += 200;
    for (const alias of lane.aliases) {
      const normalizedAlias = normalizedText(alias);
      if (normalizedAlias && text.includes(normalizedAlias)) {
        score += Math.max(20, normalizedAlias.length * 4);
      }
    }
    if (score > 0) scores.set(lane.id, score);
  }
  if (scores.size === 0) scores.set("entity-resolution", 1);
  return scores;
}

export function routeAsoiafExternalQuestion(
  request: AsoiafExternalRouteRequest,
): AsoiafExternalRouteResult {
  const laneScores = routeLaneScores(request);
  const selectedLanes = ASOIAF_EXTERNAL_ATLAS_LANES.filter((lane) =>
    laneScores.has(lane.id),
  ).sort(
    (left, right) =>
      (laneScores.get(right.id) ?? 0) - (laneScores.get(left.id) ?? 0)
      || compareCodepoints(left.id, right.id),
  );
  const sources: AsoiafExternalRouteSource[] = [];
  for (const source of ASOIAF_EXTERNAL_ATLAS_SOURCES) {
    let score = 0;
    const reasons: string[] = [];
    for (const lane of selectedLanes) {
      const laneScore = laneScores.get(lane.id) ?? 0;
      if (source.roles.includes(lane.id)) {
        score += laneScore + 80;
        reasons.push(`role:${lane.id}`);
      }
      if (lane.preferredSourceIds.includes(source.id)) {
        score += laneScore + 250;
        reasons.push(`preferred:${lane.id}`);
      }
      if (lane.preferredAuthorityClasses.includes(source.authorityClass)) {
        score += Math.max(10, Math.floor(laneScore / 2));
        reasons.push(`preferred-authority:${lane.id}`);
      } else if (lane.supportingAuthorityClasses.includes(source.authorityClass)) {
        score += Math.max(5, Math.floor(laneScore / 5));
        reasons.push(`supporting-authority:${lane.id}`);
      }
    }
    if (request.continuityIds?.length) {
      if (
        request.continuityIds.some((continuity) =>
          source.continuityIds.includes(continuity),
        )
      ) {
        score += 120;
        reasons.push("continuity-match");
      } else {
        score -= 100;
      }
    }
    if (score > 0) {
      sources.push({
        sourceId: source.id,
        score,
        reasons: orderedStrings([...new Set(reasons)]),
      });
    }
  }
  sources.sort(
    (left, right) =>
      right.score - left.score || compareCodepoints(left.sourceId, right.sourceId),
  );
  const routeCore = {
    request: {
      ...request,
      continuityIds: request.continuityIds
        ? (orderedStrings(request.continuityIds) as AsoiafExternalContinuity[])
        : undefined,
      laneIds: request.laneIds
        ? (orderedStrings(request.laneIds) as AsoiafExternalRole[])
        : undefined,
    },
    laneIds: selectedLanes.map((lane) => lane.id),
    sources: sources.slice(0, request.limit ?? 12),
    responsePolicies: selectedLanes.map((lane) => lane.responsePolicy),
  };
  return {
    ...routeCore,
    routeFingerprint: narrativeFingerprint(routeCore),
  };
}

export function getAsoiafExternalSource(
  sourceId: string,
): AsoiafExternalSource | undefined {
  return ASOIAF_EXTERNAL_ATLAS_SOURCES.find((source) => source.id === sourceId);
}

export function getAsoiafExternalLane(
  laneId: AsoiafExternalRole,
): AsoiafExternalQueryLane | undefined {
  return ASOIAF_EXTERNAL_ATLAS_LANES.find((lane) => lane.id === laneId);
}

export function getAsoiafExternalWorkOrder(
  sourceId: string,
): AsoiafExternalHarvestWorkOrder | undefined {
  return ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.find(
    (workOrder) => workOrder.sourceId === sourceId,
  );
}

export { AUTHORITY_CLASSES as ASOIAF_EXTERNAL_AUTHORITY_CLASSES };
export { SOURCE_PLANES as ASOIAF_EXTERNAL_SOURCE_PLANES };
