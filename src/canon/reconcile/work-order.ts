import {
  compareCodepoints,
  orderedStrings,
} from "../../runtime/determinism.js";
import { narrativeFingerprint } from "../../runtime/fingerprint.js";
import type {
  CanonRecallCandidate,
  CanonRecallDomain,
  CanonRecallPacket,
  CanonRecallSourceHint,
} from "../recall/index.js";
import { validateCanonRecallEstate } from "../recall/index.js";
import { canonReconciliationWorkOrderFingerprint } from "./canonical.js";
import {
  CANON_RECONCILIATION_WORK_ORDER_FORMAT,
  type CanonReconciliationCluster,
  type CanonReconciliationLane,
  type CanonReconciliationWorkItem,
  type CanonReconciliationWorkOrder,
  type CanonReconciliationWorkOrderRequest,
} from "./types.js";

const DOMAINS: CanonRecallDomain[] = [
  "core-entities",
  "lineage-claims",
  "chronology-geography",
  "actor-knowledge",
  "material-logistics",
  "magic-physics",
  "narrative-functions",
  "adaptation-deltas",
  "endgame-coordinates",
  "smallfolk-systems",
];

const FOUNDATIONAL_DOMAINS = new Set<CanonRecallDomain>([
  "core-entities",
  "lineage-claims",
  "chronology-geography",
  "actor-knowledge",
]);

function zeroDomainCounts(): Record<CanonRecallDomain, number> {
  return Object.fromEntries(DOMAINS.map((domain) => [domain, 0])) as Record<
    CanonRecallDomain,
    number
  >;
}

function intersects(left: readonly string[], right: ReadonlySet<string>): boolean {
  return left.some((value) => right.has(value));
}

function candidateMap(
  packets: readonly CanonRecallPacket[],
): Map<string, CanonRecallCandidate> {
  return new Map(
    packets
      .flatMap((packet) => packet.candidates)
      .map((candidate) => [candidate.id, candidate] as const),
  );
}

function buildKeyIndex(
  candidates: Iterable<CanonRecallCandidate>,
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const candidate of candidates) {
    for (const key of candidate.reconciliationKeys) {
      const values = index.get(key) ?? [];
      values.push(candidate.id);
      index.set(key, values);
    }
  }
  for (const [key, values] of index) index.set(key, orderedStrings(values));
  return index;
}

function expandContext(
  directCandidateIds: ReadonlySet<string>,
  candidatesById: ReadonlyMap<string, CanonRecallCandidate>,
  keyIndex: ReadonlyMap<string, readonly string[]>,
  contextDepth: number,
): Set<string> {
  const selected = new Set(directCandidateIds);
  let frontier = new Set(directCandidateIds);

  for (let depth = 0; depth < contextDepth; depth += 1) {
    const next = new Set<string>();
    for (const candidateId of frontier) {
      const candidate = candidatesById.get(candidateId);
      if (!candidate) continue;
      for (const key of candidate.reconciliationKeys) {
        for (const neighborId of keyIndex.get(key) ?? []) {
          if (!selected.has(neighborId)) next.add(neighborId);
        }
      }
    }
    for (const candidateId of next) selected.add(candidateId);
    frontier = next;
    if (frontier.size === 0) break;
  }

  return selected;
}

function buildClusters(
  selectedCandidateIds: readonly string[],
  candidatesById: ReadonlyMap<string, CanonRecallCandidate>,
  keyIndex: ReadonlyMap<string, readonly string[]>,
): CanonReconciliationCluster[] {
  const selected = new Set(selectedCandidateIds);
  const remaining = new Set(selectedCandidateIds);
  const clusters: CanonReconciliationCluster[] = [];

  while (remaining.size > 0) {
    const startId = [...remaining].sort(compareCodepoints)[0];
    if (!startId) break;
    const stack = [startId];
    const component = new Set<string>();

    while (stack.length > 0) {
      const candidateId = stack.pop();
      if (!candidateId || component.has(candidateId)) continue;
      component.add(candidateId);
      remaining.delete(candidateId);
      const candidate = candidatesById.get(candidateId);
      if (!candidate) continue;
      for (const key of candidate.reconciliationKeys) {
        for (const neighborId of keyIndex.get(key) ?? []) {
          if (selected.has(neighborId) && !component.has(neighborId)) {
            stack.push(neighborId);
          }
        }
      }
    }

    const candidateIds = orderedStrings([...component]);
    const candidates = candidateIds
      .map((candidateId) => candidatesById.get(candidateId))
      .filter((candidate): candidate is CanonRecallCandidate => candidate !== undefined);
    const reconciliationKeys = orderedStrings(
      [...new Set(candidates.flatMap((candidate) => candidate.reconciliationKeys))],
    );
    const domainIds = [...new Set(candidates.map((candidate) => candidate.domain))]
      .sort(compareCodepoints);
    const sourceHintIds = orderedStrings(
      [...new Set(candidates.flatMap((candidate) => candidate.sourceHints))],
    );
    const confidenceFloorPermille = Math.min(
      ...candidates.map((candidate) => candidate.confidencePermille),
    );
    const suffix = narrativeFingerprint({
      candidateIds,
      reconciliationKeys,
    }).replace("fnv1a32:", "");
    clusters.push({
      id: `cluster-${candidateIds[0] ?? "empty"}-${suffix}`,
      candidateIds,
      reconciliationKeys,
      domainIds,
      sourceHintIds,
      confidenceFloorPermille,
    });
  }

  return clusters.sort((left, right) => compareCodepoints(left.id, right.id));
}

function workItem(
  candidate: CanonRecallCandidate,
  directCandidateIds: ReadonlySet<string>,
  cluster: CanonReconciliationCluster,
): CanonReconciliationWorkItem {
  const lanes: CanonReconciliationLane[] = [];
  const reasons: string[] = [];
  let priority = 0;

  if (directCandidateIds.has(candidate.id)) {
    lanes.push("direct-source");
    reasons.push("candidate names at least one requested source family");
    priority += 1000;
  } else {
    lanes.push("cross-source-context");
    reasons.push("candidate shares a reconciliation key with a direct-source candidate");
    priority += 500;
  }

  if (FOUNDATIONAL_DOMAINS.has(candidate.domain)) {
    lanes.push("foundational");
    reasons.push(`${candidate.domain} establishes base vocabulary or state`);
    priority += 300;
  }

  if (
    cluster.candidateIds.length >= 3
    || cluster.domainIds.length >= 2
    || cluster.sourceHintIds.length >= 3
  ) {
    lanes.push("high-leverage");
    reasons.push("candidate participates in a multi-record or cross-domain cluster");
    priority += 200;
  }

  if (candidate.kind === "question" || candidate.confidencePermille < 600) {
    lanes.push("disputed");
    reasons.push("candidate is explicitly unresolved or low-confidence");
    priority += 150;
  }

  priority += Math.floor(candidate.confidencePermille / 10);

  return {
    candidateId: candidate.id,
    clusterId: cluster.id,
    lanes: [...new Set(lanes)].sort(compareCodepoints),
    priority,
    reasons: orderedStrings(reasons),
  };
}

export function buildCanonReconciliationWorkOrder(
  packets: readonly CanonRecallPacket[],
  sourceHints: readonly CanonRecallSourceHint[],
  request: CanonReconciliationWorkOrderRequest,
): CanonReconciliationWorkOrder {
  const estateErrors = validateCanonRecallEstate(packets, sourceHints).filter(
    (finding) => finding.severity === "error",
  );
  if (estateErrors.length > 0) {
    throw new Error(
      `Invalid recall estate: ${estateErrors
        .map((finding) => `${finding.code}:${finding.subjectId}`)
        .join(", ")}`,
    );
  }
  if (
    !Number.isInteger(request.contextDepth)
    || request.contextDepth < 0
    || request.contextDepth > 3
  ) {
    throw new Error("contextDepth must be an integer between 0 and 3");
  }

  const knownHintIds = new Set(sourceHints.map((hint) => hint.id));
  const requestedHintIds = orderedStrings([...new Set(request.sourceHintIds)]);
  const unknownHintIds = requestedHintIds.filter((hintId) => !knownHintIds.has(hintId));
  if (unknownHintIds.length > 0) {
    throw new Error(`Unknown source hints: ${unknownHintIds.join(", ")}`);
  }

  const candidatesById = candidateMap(packets);
  const allCandidates = [...candidatesById.values()];
  const requested = new Set(requestedHintIds);
  const directCandidateIds = new Set(
    allCandidates
      .filter((candidate) => intersects(candidate.sourceHints, requested))
      .map((candidate) => candidate.id),
  );
  const keyIndex = buildKeyIndex(allCandidates);
  const selectedCandidateIds = expandContext(
    directCandidateIds,
    candidatesById,
    keyIndex,
    request.contextDepth,
  );
  const candidateIds = orderedStrings([...selectedCandidateIds]);
  const contextCandidateIds = candidateIds.filter(
    (candidateId) => !directCandidateIds.has(candidateId),
  );
  const clusters = buildClusters(candidateIds, candidatesById, keyIndex);
  const clusterByCandidateId = new Map<string, CanonReconciliationCluster>();
  for (const cluster of clusters) {
    for (const candidateId of cluster.candidateIds) {
      clusterByCandidateId.set(candidateId, cluster);
    }
  }

  const items = candidateIds
    .map((candidateId) => {
      const candidate = candidatesById.get(candidateId);
      const cluster = clusterByCandidateId.get(candidateId);
      if (!candidate || !cluster) {
        throw new Error(`Work-order construction lost ${candidateId}`);
      }
      return workItem(candidate, directCandidateIds, cluster);
    })
    .sort(
      (left, right) =>
        right.priority - left.priority
        || compareCodepoints(left.candidateId, right.candidateId),
    );

  const countsByDomain = zeroDomainCounts();
  for (const candidateId of candidateIds) {
    const candidate = candidatesById.get(candidateId);
    if (candidate) countsByDomain[candidate.domain] += 1;
  }

  const core = {
    format: CANON_RECONCILIATION_WORK_ORDER_FORMAT,
    id: request.id,
    universeId: request.universeId,
    sourceHintIds: requestedHintIds,
    contextDepth: request.contextDepth,
    directCandidateIds: orderedStrings([...directCandidateIds]),
    contextCandidateIds,
    candidateIds,
    items,
    clusters,
    countsByDomain,
  };
  return {
    ...core,
    workOrderFingerprint: canonReconciliationWorkOrderFingerprint(core),
  };
}
