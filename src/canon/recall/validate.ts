import { compareCodepoints } from "../../runtime/determinism.js";
import {
  CANON_RECALL_PACKET_FORMAT,
  type CanonRecallCandidate,
  type CanonRecallFinding,
  type CanonRecallPacket,
  type CanonRecallSourceHint,
} from "./types.js";

const FORBIDDEN_NORMALIZED_KEYS = new Set([
  "authorityTier",
  "canonical",
  "contentDigest",
  "locatorIds",
  "quote",
  "quotedText",
  "sourceDigest",
  "verbatim",
]);

const ALLOWED_GENERATORS = new Set<CanonRecallPacket["generatedBy"]>([
  "language-model-recall",
  "conversation-synthesis",
]);

function finding(
  code: string,
  severity: CanonRecallFinding["severity"],
  subjectId: string,
  detail: string,
): CanonRecallFinding {
  return { code, severity, subjectId, detail };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function duplicateIds(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort(compareCodepoints);
}

function candidateFindings(candidate: CanonRecallCandidate): CanonRecallFinding[] {
  const findings: CanonRecallFinding[] = [];
  if (!nonEmpty(candidate.id)) findings.push(finding("missing-id", "error", candidate.id, "candidate id is empty"));
  if (!nonEmpty(candidate.label)) findings.push(finding("missing-label", "error", candidate.id, "candidate label is empty"));
  if (!nonEmpty(candidate.summary)) findings.push(finding("missing-summary", "error", candidate.id, "candidate summary is empty"));
  if (
    !Number.isInteger(candidate.confidencePermille)
    || candidate.confidencePermille < 0
    || candidate.confidencePermille > 1000
  ) {
    findings.push(
      finding(
        "invalid-confidence",
        "error",
        candidate.id,
        `confidencePermille must be an integer from 0 through 1000; received ${candidate.confidencePermille}`,
      ),
    );
  }
  if (candidate.sourceHints.length === 0) {
    findings.push(finding("missing-source-hint", "error", candidate.id, "at least one source hint is required"));
  }
  if (candidate.continuityHints.length === 0) {
    findings.push(finding("missing-continuity-hint", "error", candidate.id, "at least one continuity hint is required"));
  }
  if (candidate.reconciliationKeys.length === 0) {
    findings.push(
      finding("missing-reconciliation-key", "error", candidate.id, "at least one reconciliation key is required"),
    );
  }
  for (const key of Object.keys(candidate.normalized)) {
    if (FORBIDDEN_NORMALIZED_KEYS.has(key)) {
      findings.push(
        finding(
          "recall-claims-source-standing",
          "error",
          candidate.id,
          `${key} is forbidden in an unverified recall candidate`,
        ),
      );
    }
  }
  for (const sourceHint of candidate.sourceHints) {
    if (/^https?:\/\//i.test(sourceHint)) {
      findings.push(
        finding(
          "raw-url-source-hint",
          "error",
          candidate.id,
          "recall candidates use a source-hint registry rather than raw URLs",
        ),
      );
    }
  }
  return findings;
}

export function validateCanonRecallPacket(packet: CanonRecallPacket): CanonRecallFinding[] {
  const findings: CanonRecallFinding[] = [];
  if (packet.format !== CANON_RECALL_PACKET_FORMAT) {
    findings.push(
      finding(
        "invalid-format",
        "error",
        packet.id,
        `expected ${CANON_RECALL_PACKET_FORMAT}; received ${String(packet.format)}`,
      ),
    );
  }
  if (!ALLOWED_GENERATORS.has(packet.generatedBy)) {
    findings.push(
      finding(
        "invalid-generator",
        "error",
        packet.id,
        `generatedBy must be one of ${[...ALLOWED_GENERATORS].join(", ")}`,
      ),
    );
  }
  if (packet.authority !== "none") {
    findings.push(finding("recall-claims-authority", "error", packet.id, "recall packet authority must be none"));
  }
  if (packet.compilationEligible !== false) {
    findings.push(
      finding(
        "recall-claims-compilation-standing",
        "error",
        packet.id,
        "recall packets may not enter canonical compilation",
      ),
    );
  }
  if (!/^\d{4}-\d{2}$/.test(packet.knowledgeCutoff)) {
    findings.push(
      finding("invalid-knowledge-cutoff", "error", packet.id, "knowledgeCutoff must use YYYY-MM"),
    );
  }
  if (!nonEmpty(packet.universeId)) {
    findings.push(finding("missing-universe", "error", packet.id, "universeId is empty"));
  }
  if (!nonEmpty(packet.scope)) findings.push(finding("missing-scope", "error", packet.id, "scope is empty"));
  for (const duplicate of duplicateIds(packet.candidates.map((candidate) => candidate.id))) {
    findings.push(finding("duplicate-candidate-id", "error", duplicate, `${duplicate} occurs more than once`));
  }
  for (const candidate of packet.candidates) findings.push(...candidateFindings(candidate));
  return findings.sort(
    (left, right) => compareCodepoints(left.subjectId, right.subjectId)
      || compareCodepoints(left.code, right.code),
  );
}

export function validateCanonRecallEstate(
  packets: readonly CanonRecallPacket[],
  sourceHints: readonly CanonRecallSourceHint[],
): CanonRecallFinding[] {
  const findings = packets.flatMap(validateCanonRecallPacket);
  for (const duplicate of duplicateIds(packets.map((packet) => packet.id))) {
    findings.push(finding("duplicate-packet-id", "error", duplicate, `${duplicate} occurs more than once`));
  }
  const candidates = packets.flatMap((packet) => packet.candidates);
  for (const duplicate of duplicateIds(candidates.map((candidate) => candidate.id))) {
    findings.push(
      finding("duplicate-estate-candidate-id", "error", duplicate, `${duplicate} occurs in multiple packets`),
    );
  }
  const hintIds = new Set(sourceHints.map((hint) => hint.id));
  for (const duplicate of duplicateIds(sourceHints.map((hint) => hint.id))) {
    findings.push(finding("duplicate-source-hint-id", "error", duplicate, `${duplicate} occurs more than once`));
  }
  for (const candidate of candidates) {
    for (const sourceHint of candidate.sourceHints) {
      if (!hintIds.has(sourceHint)) {
        findings.push(
          finding(
            "unknown-source-hint",
            "error",
            candidate.id,
            `${sourceHint} is not present in the source-hint registry`,
          ),
        );
      }
    }
  }
  return findings.sort(
    (left, right) => compareCodepoints(left.subjectId, right.subjectId)
      || compareCodepoints(left.code, right.code),
  );
}
