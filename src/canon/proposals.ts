import { compareCodepoints, orderedStrings } from "../runtime/determinism.js";
import {
  canonProposalReceiptFingerprint,
  canonProposalSetFingerprint,
} from "./canonical.js";
import { compileCanonBible } from "./compile.js";
import {
  CANON_PROPOSAL_SET_RECEIPT_FORMAT,
  type CanonBible,
  type CanonContinuationProposal,
  type CanonDecisionSet,
  type CanonProposalCoverage,
  type CanonProposalResult,
  type CanonProposalSetReceipt,
} from "./types.js";
import { getContinuityClosure } from "./validate.js";

function intersects(values: readonly string[], set: ReadonlySet<string>): boolean {
  return values.some((value) => set.has(value));
}

function coverageKey(kind: "endpoint" | "function", id: string): string {
  return `${kind}:${id}`;
}

export function classifyCanonProposals(
  bible: CanonBible,
  decisions: CanonDecisionSet,
  proposals: readonly CanonContinuationProposal[],
): CanonProposalSetReceipt {
  const baseline = compileCanonBible(bible, decisions, { requireClosure: false });
  const closure = getContinuityClosure(bible, decisions.targetContinuityId);
  const unmetEndpointIds = bible.endpoints
    .filter((endpoint) => endpoint.hard && intersects(endpoint.continuityIds, closure))
    .map((endpoint) => endpoint.id)
    .filter((endpointId) => !baseline.state.fulfilledEndpoints.some((entry) => entry.endpointId === endpointId))
    .sort(compareCodepoints);
  const unresolvedFunctionIds = bible.narrativeFunctions
    .filter((fn) => fn.required && intersects(fn.continuityIds, closure))
    .map((fn) => fn.id)
    .filter((functionId) => !baseline.state.resolvedFunctionIds.includes(functionId))
    .sort(compareCodepoints);

  const provisional = [...proposals]
    .sort((left, right) => compareCodepoints(left.id, right.id))
    .map((proposal) => {
      const event = { ...proposal.event, enabledByDefault: true };
      const receipt = compileCanonBible(bible, decisions, {
        requireClosure: false,
        extraEvents: [event],
      });
      const errorCodes = receipt.findings
        .filter((entry) => entry.severity === "error")
        .map((entry) => entry.code)
        .sort(compareCodepoints);
      const fulfilledByProposal = new Set(
        receipt.state.fulfilledEndpoints
          .filter((entry) => entry.eventId === event.id)
          .map((entry) => entry.endpointId),
      );
      const coverage: CanonProposalCoverage = {
        endpointIds: orderedStrings(
          unmetEndpointIds.filter(
            (endpointId) => event.fulfillsEndpointIds.includes(endpointId) && fulfilledByProposal.has(endpointId),
          ),
        ),
        functionIds: orderedStrings(
          unresolvedFunctionIds.filter(
            (functionId) => event.effects.resolveFunctionIds.includes(functionId)
              && receipt.state.resolvedFunctionIds.includes(functionId),
          ),
        ),
      };
      return { proposal, receipt, errorCodes, coverage };
    });

  const coverageCounts = new Map<string, number>();
  for (const entry of provisional) {
    if (entry.errorCodes.length > 0) continue;
    for (const endpointId of entry.coverage.endpointIds) {
      const key = coverageKey("endpoint", endpointId);
      coverageCounts.set(key, (coverageCounts.get(key) ?? 0) + 1);
    }
    for (const functionId of entry.coverage.functionIds) {
      const key = coverageKey("function", functionId);
      coverageCounts.set(key, (coverageCounts.get(key) ?? 0) + 1);
    }
  }

  const results: CanonProposalResult[] = provisional.map((entry) => {
    if (entry.errorCodes.length > 0) {
      return {
        proposalId: entry.proposal.id,
        classification: "contradicted",
        coverage: entry.coverage,
        findingCodes: orderedStrings([...new Set(entry.errorCodes)]),
        reasons: ["The proposal violates at least one hard corpus, chronology, knowledge, capability, or endpoint constraint."],
        compileReceiptFingerprint: entry.receipt.receiptFingerprint,
      };
    }

    const coveredKeys = [
      ...entry.coverage.endpointIds.map((id) => coverageKey("endpoint", id)),
      ...entry.coverage.functionIds.map((id) => coverageKey("function", id)),
    ];
    const uniqueKeys = coveredKeys.filter((key) => coverageCounts.get(key) === 1);
    if (uniqueKeys.length > 0) {
      return {
        proposalId: entry.proposal.id,
        classification: "necessary",
        coverage: entry.coverage,
        findingCodes: [],
        reasons: [
          `It is the only viable proposal in this candidate set that closes ${orderedStrings(uniqueKeys).join(", ")}.`,
        ],
        compileReceiptFingerprint: entry.receipt.receiptFingerprint,
      };
    }
    if (coveredKeys.length > 0) {
      return {
        proposalId: entry.proposal.id,
        classification: "strongly-implied",
        coverage: entry.coverage,
        findingCodes: [],
        reasons: [
          `It closes required branch obligations, but ${coveredKeys.length === 1 ? "another route remains" : "alternative routes remain"}.`,
        ],
        compileReceiptFingerprint: entry.receipt.receiptFingerprint,
      };
    }
    return {
      proposalId: entry.proposal.id,
      classification: "permissible",
      coverage: entry.coverage,
      findingCodes: [],
      reasons: ["It is compatible with the compiled branch but does not close a currently required endpoint or narrative function."],
      compileReceiptFingerprint: entry.receipt.receiptFingerprint,
    };
  });

  const withoutFingerprint: Omit<CanonProposalSetReceipt, "receiptFingerprint"> = {
    format: CANON_PROPOSAL_SET_RECEIPT_FORMAT,
    bibleId: bible.id,
    decisionSetId: decisions.id,
    baselineReceiptFingerprint: baseline.receiptFingerprint,
    proposalSetFingerprint: canonProposalSetFingerprint(proposals),
    unmetEndpointIds,
    unresolvedFunctionIds,
    results,
  };
  return {
    ...withoutFingerprint,
    receiptFingerprint: canonProposalReceiptFingerprint(withoutFingerprint),
  };
}
