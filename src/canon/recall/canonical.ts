import { compareCodepoints, orderRecordKeysDeep, orderedStrings } from "../../runtime/determinism.js";
import { narrativeFingerprint } from "../../runtime/fingerprint.js";
import type {
  CanonRecallCandidate,
  CanonRecallEstateManifest,
  CanonRecallPacket,
} from "./types.js";

function canonicalCandidate(candidate: CanonRecallCandidate): CanonRecallCandidate {
  return {
    ...candidate,
    sourceHints: orderedStrings(candidate.sourceHints),
    continuityHints: orderedStrings(candidate.continuityHints),
    normalized: orderRecordKeysDeep(candidate.normalized),
    reconciliationKeys: orderedStrings(candidate.reconciliationKeys),
    tags: orderedStrings(candidate.tags),
  };
}

export function canonicalCanonRecallPacket(packet: CanonRecallPacket): CanonRecallPacket {
  return {
    ...packet,
    candidates: [...packet.candidates]
      .map(canonicalCandidate)
      .sort((left, right) => compareCodepoints(left.id, right.id)),
    openQuestions: orderedStrings(packet.openQuestions),
  };
}

export function canonRecallPacketFingerprint(packet: CanonRecallPacket): string {
  return narrativeFingerprint(canonicalCanonRecallPacket(packet));
}

export function canonRecallEstateManifestFingerprint(
  manifest: Omit<CanonRecallEstateManifest, "manifestFingerprint">,
): string {
  return narrativeFingerprint(manifest);
}
