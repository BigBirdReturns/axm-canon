import { compareCodepoints, orderedStrings } from "../../runtime/determinism.js";
import {
  canonRecallEstateManifestFingerprint,
  canonRecallPacketFingerprint,
} from "./canonical.js";
import {
  CANON_RECALL_ESTATE_MANIFEST_FORMAT,
  type CanonRecallCandidate,
  type CanonRecallDomain,
  type CanonRecallEstateManifest,
  type CanonRecallKind,
  type CanonRecallPacket,
  type CanonRecallQuery,
  type CanonRecallSourceHint,
} from "./types.js";
import { validateCanonRecallEstate } from "./validate.js";

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

const KINDS: CanonRecallKind[] = [
  "entity",
  "relation",
  "proposition",
  "event",
  "event-chain",
  "knowledge",
  "state",
  "rule",
  "function",
  "decision",
  "endpoint",
  "question",
];

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function buildCanonRecallEstateManifest(
  packets: readonly CanonRecallPacket[],
  sourceHints: readonly CanonRecallSourceHint[],
): CanonRecallEstateManifest {
  const errors = validateCanonRecallEstate(packets, sourceHints).filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Invalid canon recall estate: ${errors.map((entry) => `${entry.code}:${entry.subjectId}`).join(", ")}`,
    );
  }

  const orderedPackets = [...packets].sort((left, right) => compareCodepoints(left.id, right.id));
  const candidates = orderedPackets
    .flatMap((packet) => packet.candidates)
    .sort((left, right) => compareCodepoints(left.id, right.id));
  const countsByDomain = zeroRecord(DOMAINS);
  const countsByKind = zeroRecord(KINDS);
  for (const candidate of candidates) {
    countsByDomain[candidate.domain] += 1;
    countsByKind[candidate.kind] += 1;
  }

  const core = {
    format: CANON_RECALL_ESTATE_MANIFEST_FORMAT,
    universeId: orderedPackets[0]?.universeId ?? "",
    packetIds: orderedPackets.map((packet) => packet.id),
    packetFingerprints: orderedPackets.map((packet) => ({
      packetId: packet.id,
      fingerprint: canonRecallPacketFingerprint(packet),
    })),
    candidateIds: candidates.map((candidate) => candidate.id),
    packetCount: orderedPackets.length,
    candidateCount: candidates.length,
    countsByDomain,
    countsByKind,
    highConfidenceCount: candidates.filter((candidate) => candidate.confidencePermille >= 850).length,
    mediumConfidenceCount: candidates.filter(
      (candidate) => candidate.confidencePermille >= 600 && candidate.confidencePermille < 850,
    ).length,
    lowConfidenceCount: candidates.filter((candidate) => candidate.confidencePermille < 600).length,
  };
  return { ...core, manifestFingerprint: canonRecallEstateManifestFingerprint(core) };
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const expected = new Set(right);
  return left.some((value) => expected.has(value));
}

export function queryCanonRecallCandidates(
  packets: readonly CanonRecallPacket[],
  query: CanonRecallQuery,
): CanonRecallCandidate[] {
  const needle = query.text?.trim().toLowerCase();
  return packets
    .flatMap((packet) => packet.candidates)
    .filter((candidate) => !query.domains || query.domains.includes(candidate.domain))
    .filter((candidate) => !query.kinds || query.kinds.includes(candidate.kind))
    .filter((candidate) => !query.tags || intersects(candidate.tags, query.tags))
    .filter((candidate) => !query.sourceHints || intersects(candidate.sourceHints, query.sourceHints))
    .filter(
      (candidate) =>
        query.minimumConfidencePermille === undefined
        || candidate.confidencePermille >= query.minimumConfidencePermille,
    )
    .filter((candidate) => {
      if (!needle) return true;
      const haystack = [
        candidate.id,
        candidate.label,
        candidate.summary,
        ...candidate.reconciliationKeys,
        ...candidate.tags,
      ].join("\n").toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => compareCodepoints(left.id, right.id));
}

export function recallCandidateIds(packets: readonly CanonRecallPacket[]): string[] {
  return orderedStrings(packets.flatMap((packet) => packet.candidates.map((candidate) => candidate.id)));
}
