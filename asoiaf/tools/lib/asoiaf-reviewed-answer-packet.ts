import {
  compareCodepoints,
  orderedStrings,
} from "../../../src/runtime/determinism.js";
import { narrativeFingerprint } from "../../../src/runtime/fingerprint.js";
import {
  validateAsoiafExternalReviewPacket,
  type AsoiafExternalReconciliationReceipt,
  type AsoiafExternalReviewPacket,
} from "../../src/external/reconciliation-packets.js";
import type {
  CanonReconciliationResolution,
} from "../../../src/canon/reconcile/types.js";
import {
  collectorContentId,
  sha256,
} from "./asoiaf-external-estate.js";
import {
  validateAsoiafResearchQuestionDossier,
  type AsoiafResearchQuestionDossier,
} from "./asoiaf-research-question-dossier.js";

export const ASOIAF_REVIEWED_ANSWER_TRANSACTION_FORMAT =
  "axm-asoiaf-reviewed-answer-transaction/1" as const;
export const ASOIAF_REVIEWED_ANSWER_GAP_CLOSURE_FORMAT =
  "axm-asoiaf-reviewed-answer-gap-closure/1" as const;
export const ASOIAF_REVIEWED_ANSWER_PACKET_FORMAT =
  "axm-asoiaf-reviewed-answer-packet/1" as const;

export type AsoiafReviewedAnswerScope = "bounded-complete" | "partial";

export interface AsoiafReviewedAnswerTransactionInput {
  packet: AsoiafExternalReviewPacket;
  reconciliationReceipt: AsoiafExternalReconciliationReceipt;
}

export interface AsoiafReviewedAnswerTransaction
  extends AsoiafReviewedAnswerTransactionInput {
  format: typeof ASOIAF_REVIEWED_ANSWER_TRANSACTION_FORMAT;
  transactionId: string;
  transactionFingerprint: `sha256:${string}`;
}

export interface AsoiafReviewedAnswerClaimInput {
  id: string;
  order: number;
  continuityId: string;
  text: string;
  transactionId: string;
  evidenceRecordIds: string[];
  resolutionDecisionIds: string[];
}

export interface AsoiafReviewedAnswerClaim
  extends AsoiafReviewedAnswerClaimInput {
  textDigest: `sha256:${string}`;
  textCharacters: number;
  sourceId: string;
  observationId: string;
  packetId: string;
  packetFingerprint: string;
  reconciliationReceiptFingerprint: string;
  canonReceiptFingerprint: string;
  evidenceBundleFingerprint: string;
  locatorIds: string[];
  candidateIds: string[];
  resolutionActions: Array<"confirm" | "correct" | "split" | "merge">;
  standing: "adjudicated-primary";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafReviewedAnswerGapClosureInput {
  id: string;
  gapId: string;
  claimIds: string[];
  rationale: string;
}

export interface AsoiafReviewedAnswerGapClosure
  extends AsoiafReviewedAnswerGapClosureInput {
  format: typeof ASOIAF_REVIEWED_ANSWER_GAP_CLOSURE_FORMAT;
  closureFingerprint: `sha256:${string}`;
  standing: "resolved-by-adjudicated-claim";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafReviewedAnswerLimitationInput {
  id: string;
  text: string;
  relatedGapIds?: string[];
  relatedReferenceIds?: string[];
}

export interface AsoiafReviewedAnswerLimitation
  extends AsoiafReviewedAnswerLimitationInput {
  textDigest: `sha256:${string}`;
  standing: "explicit-limitation";
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafReviewedAnswerPacketInput {
  dossier: AsoiafResearchQuestionDossier;
  reviewedBy: string;
  reviewedAt: string;
  transactions: AsoiafReviewedAnswerTransaction[];
  claims: AsoiafReviewedAnswerClaimInput[];
  gapClosures?: AsoiafReviewedAnswerGapClosureInput[];
  limitations?: AsoiafReviewedAnswerLimitationInput[];
}

export interface AsoiafReviewedAnswerPacket {
  format: typeof ASOIAF_REVIEWED_ANSWER_PACKET_FORMAT;
  answerPacketId: string;
  dossier: AsoiafResearchQuestionDossier;
  dossierId: string;
  dossierFingerprint: `sha256:${string}`;
  questionId: string;
  questionDigest: `sha256:${string}`;
  continuityIds: string[];
  reviewedBy: string;
  reviewedAt: string;
  transactions: AsoiafReviewedAnswerTransaction[];
  claims: AsoiafReviewedAnswerClaim[];
  gapClosures: AsoiafReviewedAnswerGapClosure[];
  limitations: AsoiafReviewedAnswerLimitation[];
  scope: AsoiafReviewedAnswerScope;
  renderedTextDigest: `sha256:${string}`;
  renderedTextCharacters: number;
  answerReady: true;
  renderAuthority: "reviewed-text-only";
  acquisitionAuthority: "none";
  reconciliationAuthority: "none";
  graphEffect: "none";
  canonEffect: "none";
  answerEffect: "render-reviewed-packet";
  answerPacketFingerprint: `sha256:${string}`;
}

export interface AsoiafReviewedAnswerFinding {
  code: string;
  severity: "error" | "warning" | "notice";
  subjectId: string;
  detail: string;
}

function finding(
  code: string,
  severity: AsoiafReviewedAnswerFinding["severity"],
  subjectId: string,
  detail: string,
): AsoiafReviewedAnswerFinding {
  return { code, severity, subjectId, detail };
}

function sortedFindings(
  findings: readonly AsoiafReviewedAnswerFinding[],
): AsoiafReviewedAnswerFinding[] {
  const rank = { error: 0, warning: 1, notice: 2 } as const;
  return [...findings].sort(
    (left, right) =>
      rank[left.severity] - rank[right.severity]
      || compareCodepoints(left.code, right.code)
      || compareCodepoints(left.subjectId, right.subjectId)
      || compareCodepoints(left.detail, right.detail),
  );
}

function nonempty(value: string): boolean {
  return value.trim().length > 0;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function transactionCore(input: AsoiafReviewedAnswerTransactionInput) {
  return {
    format: ASOIAF_REVIEWED_ANSWER_TRANSACTION_FORMAT,
    packet: input.packet,
    reconciliationReceipt: input.reconciliationReceipt,
  };
}

function externalReceiptCore(
  receipt: AsoiafExternalReconciliationReceipt,
): Omit<AsoiafExternalReconciliationReceipt, "receiptFingerprint"> {
  const { receiptFingerprint: _fingerprint, ...core } = receipt;
  return core;
}

function validateTransaction(
  transaction: AsoiafReviewedAnswerTransaction,
): AsoiafReviewedAnswerFinding[] {
  const findings: AsoiafReviewedAnswerFinding[] = [];
  const { packet, reconciliationReceipt: receipt } = transaction;
  if (transaction.format !== ASOIAF_REVIEWED_ANSWER_TRANSACTION_FORMAT) {
    findings.push(
      finding(
        "transaction-format",
        "error",
        transaction.transactionId,
        "answer transaction format is invalid",
      ),
    );
  }
  for (const packetFinding of validateAsoiafExternalReviewPacket(packet)) {
    if (packetFinding.severity === "error") {
      findings.push(
        finding(
          `review-packet:${packetFinding.code}`,
          "error",
          packetFinding.subjectId,
          packetFinding.detail,
        ),
      );
    }
  }
  const expectedTransactionFingerprint = sha256(transactionCore(transaction));
  if (transaction.transactionFingerprint !== expectedTransactionFingerprint) {
    findings.push(
      finding(
        "transaction-fingerprint",
        "error",
        transaction.transactionId,
        "answer transaction fingerprint is stale",
      ),
    );
  }
  const expectedTransactionId = collectorContentId(
    "asoiaf-reviewed-answer-transaction",
    {
      packetId: packet.id,
      packetFingerprint: packet.packetFingerprint,
      reconciliationReceiptFingerprint: receipt.receiptFingerprint,
      transactionFingerprint: expectedTransactionFingerprint,
    },
  );
  if (transaction.transactionId !== expectedTransactionId) {
    findings.push(
      finding(
        "transaction-identity",
        "error",
        transaction.transactionId,
        "answer transaction identity is not content addressed",
      ),
    );
  }
  if (receipt.receiptFingerprint !== narrativeFingerprint(externalReceiptCore(receipt))) {
    findings.push(
      finding(
        "reconciliation-receipt-fingerprint",
        "error",
        transaction.transactionId,
        "external reconciliation receipt fingerprint is stale",
      ),
    );
  }
  if (
    receipt.packetId !== packet.id
    || receipt.packetFingerprint !== packet.packetFingerprint
    || receipt.sourceId !== packet.sourceId
    || receipt.observationId !== packet.observation.observationId
  ) {
    findings.push(
      finding(
        "transaction-packet-parity",
        "error",
        transaction.transactionId,
        "review packet and reconciliation receipt do not describe the same observation transaction",
      ),
    );
  }
  if (
    receipt.passed !== true
    || receipt.canonReceipt === null
    || receipt.canonReceipt.passed !== true
  ) {
    findings.push(
      finding(
        "transaction-not-adjudicated",
        "error",
        transaction.transactionId,
        "answer transaction requires a passed reconciliation receipt and passed canon receipt",
      ),
    );
  }
  if (
    !receipt.evidenceBundleFingerprint
    || !receipt.canonReceipt?.receiptFingerprint
  ) {
    findings.push(
      finding(
        "transaction-custody",
        "error",
        transaction.transactionId,
        "answer transaction lacks evidence-bundle or canon-receipt custody",
      ),
    );
  }
  return findings;
}

export function buildAsoiafReviewedAnswerTransaction(
  input: AsoiafReviewedAnswerTransactionInput,
): AsoiafReviewedAnswerTransaction {
  const core = transactionCore(input);
  const transactionFingerprint = sha256(core);
  const transaction: AsoiafReviewedAnswerTransaction = {
    ...core,
    transactionId: collectorContentId("asoiaf-reviewed-answer-transaction", {
      packetId: input.packet.id,
      packetFingerprint: input.packet.packetFingerprint,
      reconciliationReceiptFingerprint:
        input.reconciliationReceipt.receiptFingerprint,
      transactionFingerprint,
    }),
    transactionFingerprint,
  };
  const errors = validateTransaction(transaction).filter(
    (entry) => entry.severity === "error",
  );
  if (errors.length > 0) {
    throw new Error(
      `invalid reviewed answer transaction: ${errors
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  return transaction;
}

function approvedResolution(
  resolution: CanonReconciliationResolution,
): resolution is CanonReconciliationResolution & {
  action: "confirm" | "correct" | "split" | "merge";
} {
  return (
    resolution.action === "confirm"
    || resolution.action === "correct"
    || resolution.action === "split"
    || resolution.action === "merge"
  );
}

function buildClaim(
  input: AsoiafReviewedAnswerClaimInput,
  transaction: AsoiafReviewedAnswerTransaction,
): AsoiafReviewedAnswerClaim {
  const packetClaims = new Map(
    transaction.packet.claims.map((claim) => [claim.evidenceRecordId, claim] as const),
  );
  const resolutions = new Map(
    (transaction.reconciliationReceipt.canonReceipt?.resolutions ?? [])
      .map((resolution) => [resolution.decisionId, resolution] as const),
  );
  const citedClaims = input.evidenceRecordIds
    .map((recordId) => packetClaims.get(recordId))
    .filter((claim): claim is NonNullable<typeof claim> => claim !== undefined);
  const citedResolutions = input.resolutionDecisionIds
    .map((decisionId) => resolutions.get(decisionId))
    .filter(
      (resolution): resolution is CanonReconciliationResolution =>
        resolution !== undefined,
    );
  return {
    ...input,
    evidenceRecordIds: orderedStrings(input.evidenceRecordIds),
    resolutionDecisionIds: orderedStrings(input.resolutionDecisionIds),
    textDigest: sha256(input.text),
    textCharacters: [...input.text].length,
    sourceId: transaction.packet.sourceId,
    observationId: transaction.packet.observation.observationId,
    packetId: transaction.packet.id,
    packetFingerprint: transaction.packet.packetFingerprint,
    reconciliationReceiptFingerprint:
      transaction.reconciliationReceipt.receiptFingerprint,
    canonReceiptFingerprint:
      transaction.reconciliationReceipt.canonReceipt?.receiptFingerprint ?? "",
    evidenceBundleFingerprint:
      transaction.reconciliationReceipt.evidenceBundleFingerprint ?? "",
    locatorIds: orderedStrings(citedClaims.map((claim) => claim.locator.id)),
    candidateIds: orderedStrings(
      citedResolutions.flatMap((resolution) => resolution.candidateIds),
    ),
    resolutionActions: [...new Set(
      citedResolutions
        .filter(approvedResolution)
        .map((resolution) => resolution.action),
    )].sort(compareCodepoints),
    standing: "adjudicated-primary",
    graphEffect: "none",
    canonEffect: "none",
  };
}

function gapClosureCore(input: AsoiafReviewedAnswerGapClosureInput) {
  return {
    format: ASOIAF_REVIEWED_ANSWER_GAP_CLOSURE_FORMAT,
    id: input.id,
    gapId: input.gapId,
    claimIds: orderedStrings(input.claimIds),
    rationale: input.rationale,
    standing: "resolved-by-adjudicated-claim" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
}

function buildGapClosure(
  input: AsoiafReviewedAnswerGapClosureInput,
): AsoiafReviewedAnswerGapClosure {
  const core = gapClosureCore(input);
  return {
    ...core,
    closureFingerprint: sha256(core),
  };
}

function buildLimitation(
  input: AsoiafReviewedAnswerLimitationInput,
): AsoiafReviewedAnswerLimitation {
  return {
    ...input,
    relatedGapIds: orderedStrings(input.relatedGapIds ?? []),
    relatedReferenceIds: orderedStrings(input.relatedReferenceIds ?? []),
    textDigest: sha256(input.text),
    standing: "explicit-limitation",
    graphEffect: "none",
    canonEffect: "none",
  };
}

function renderClaimsAndLimitations(input: {
  claims: readonly AsoiafReviewedAnswerClaim[];
  limitations: readonly AsoiafReviewedAnswerLimitation[];
}): string {
  const claimText = [...input.claims]
    .sort((left, right) => left.order - right.order)
    .map((claim) => {
      const citations = claim.locatorIds
        .map((locatorId) => `[${claim.sourceId}:${locatorId}]`)
        .join(" ");
      return `${claim.text}${citations ? ` ${citations}` : ""}`;
    })
    .join("\n\n");
  const limitationText = input.limitations.length === 0
    ? ""
    : `\n\nLimits:\n${input.limitations
      .map((limitation) => `- ${limitation.text}`)
      .join("\n")}`;
  return `${claimText}${limitationText}`;
}

function packetCore(
  packet: AsoiafReviewedAnswerPacket,
): Omit<
  AsoiafReviewedAnswerPacket,
  "answerPacketId" | "answerPacketFingerprint"
> {
  const {
    answerPacketId: _id,
    answerPacketFingerprint: _fingerprint,
    ...core
  } = packet;
  return core;
}

export function validateAsoiafReviewedAnswerPacket(
  packet: AsoiafReviewedAnswerPacket,
): AsoiafReviewedAnswerFinding[] {
  const findings: AsoiafReviewedAnswerFinding[] = [];
  for (const dossierFinding of validateAsoiafResearchQuestionDossier(packet.dossier)) {
    if (dossierFinding.severity === "error") {
      findings.push(
        finding(
          `dossier:${dossierFinding.code}`,
          "error",
          dossierFinding.subjectId,
          dossierFinding.detail,
        ),
      );
    }
  }
  if (packet.format !== ASOIAF_REVIEWED_ANSWER_PACKET_FORMAT) {
    findings.push(
      finding(
        "answer-format",
        "error",
        packet.answerPacketId,
        "answer packet format is invalid",
      ),
    );
  }
  if (
    packet.dossierId !== packet.dossier.dossierId
    || packet.dossierFingerprint !== packet.dossier.dossierFingerprint
    || packet.questionId !== packet.dossier.question.questionId
    || packet.questionDigest !== packet.dossier.question.questionDigest
    || JSON.stringify(packet.continuityIds)
      !== JSON.stringify(orderedStrings(packet.dossier.question.continuityIds))
  ) {
    findings.push(
      finding(
        "answer-dossier-parity",
        "error",
        packet.answerPacketId,
        "answer packet question and dossier custody are stale",
      ),
    );
  }
  if (!nonempty(packet.reviewedBy) || !Number.isFinite(Date.parse(packet.reviewedAt))) {
    findings.push(
      finding(
        "answer-reviewer",
        "error",
        packet.answerPacketId,
        "answer packet requires a named reviewer and valid review time",
      ),
    );
  }
  if (packet.claims.length === 0) {
    findings.push(
      finding(
        "answer-empty",
        "error",
        packet.answerPacketId,
        "answer packet requires at least one adjudicated claim",
      ),
    );
  }
  if (!unique(packet.transactions.map((entry) => entry.transactionId))) {
    findings.push(
      finding(
        "duplicate-transaction",
        "error",
        packet.answerPacketId,
        "answer packet contains duplicate transaction identities",
      ),
    );
  }
  if (!unique(packet.claims.map((entry) => entry.id))) {
    findings.push(
      finding(
        "duplicate-answer-claim",
        "error",
        packet.answerPacketId,
        "answer packet contains duplicate claim identities",
      ),
    );
  }
  if (
    !unique(packet.gapClosures.map((entry) => entry.id))
    || !unique(packet.gapClosures.map((entry) => entry.gapId))
  ) {
    findings.push(
      finding(
        "duplicate-gap-closure",
        "error",
        packet.answerPacketId,
        "answer packet contains duplicate closure or gap identities",
      ),
    );
  }
  if (!unique(packet.limitations.map((entry) => entry.id))) {
    findings.push(
      finding(
        "duplicate-limitation",
        "error",
        packet.answerPacketId,
        "answer packet contains duplicate limitation identities",
      ),
    );
  }

  const transactionsById = new Map(
    packet.transactions.map((entry) => [entry.transactionId, entry] as const),
  );
  for (const transaction of packet.transactions) {
    findings.push(...validateTransaction(transaction));
    if (!packet.dossier.route.sourceIds.includes(transaction.packet.sourceId)) {
      findings.push(
        finding(
          "transaction-source-outside-dossier",
          "error",
          transaction.transactionId,
          `${transaction.packet.sourceId} is outside the dossier route`,
        ),
      );
    }
  }

  const expectedOrders = packet.claims
    .map((claim) => claim.order)
    .sort((left, right) => left - right);
  if (
    JSON.stringify(expectedOrders)
    !== JSON.stringify(packet.claims.map((_, index) => index + 1))
  ) {
    findings.push(
      finding(
        "answer-order",
        "error",
        packet.answerPacketId,
        "answer claim order must be contiguous from one",
      ),
    );
  }

  const dossierCandidateIds = new Set(
    packet.dossier.recallReferences.map((reference) => reference.candidateId),
  );
  const usedTransactions = new Set<string>();
  for (const claim of packet.claims) {
    const transaction = transactionsById.get(claim.transactionId);
    if (!transaction) {
      findings.push(
        finding(
          "answer-transaction-missing",
          "error",
          claim.id,
          "answer claim references an unknown reconciliation transaction",
        ),
      );
      continue;
    }
    usedTransactions.add(transaction.transactionId);
    if (!packet.continuityIds.includes(claim.continuityId)) {
      findings.push(
        finding(
          "answer-continuity",
          "error",
          claim.id,
          "answer claim continuity is outside the dossier scope",
        ),
      );
    }
    if (transaction.packet.continuityId !== claim.continuityId) {
      findings.push(
        finding(
          "answer-transaction-continuity",
          "error",
          claim.id,
          "answer claim continuity differs from its reviewed packet",
        ),
      );
    }
    if (!nonempty(claim.text) || claim.textCharacters < 1 || claim.textCharacters > 4_000) {
      findings.push(
        finding(
          "answer-text",
          "error",
          claim.id,
          "answer claim text is empty or exceeds 4,000 characters",
        ),
      );
    }
    if (claim.textDigest !== sha256(claim.text)) {
      findings.push(
        finding(
          "answer-text-digest",
          "error",
          claim.id,
          "answer claim text digest is stale",
        ),
      );
    }
    if (claim.evidenceRecordIds.length === 0 || claim.resolutionDecisionIds.length === 0) {
      findings.push(
        finding(
          "answer-evidence-empty",
          "error",
          claim.id,
          "answer claim requires evidence records and adjudication decisions",
        ),
      );
    }
    const packetClaims = new Map(
      transaction.packet.claims.map((entry) => [entry.evidenceRecordId, entry] as const),
    );
    const canonReceipt = transaction.reconciliationReceipt.canonReceipt;
    const resolutions = new Map(
      (canonReceipt?.resolutions ?? [])
        .map((entry) => [entry.decisionId, entry] as const),
    );
    for (const evidenceRecordId of claim.evidenceRecordIds) {
      const packetClaim = packetClaims.get(evidenceRecordId);
      if (!packetClaim) {
        findings.push(
          finding(
            "answer-evidence-unknown",
            "error",
            claim.id,
            `${evidenceRecordId} is absent from the reviewed packet`,
          ),
        );
      } else if (packetClaim.authorityRole !== "primary") {
        findings.push(
          finding(
            "answer-evidence-nonprimary",
            "error",
            claim.id,
            `${evidenceRecordId} enters as ${packetClaim.authorityRole}`,
          ),
        );
      }
      if (!canonReceipt?.promotedRecordIds.includes(evidenceRecordId)) {
        findings.push(
          finding(
            "answer-evidence-not-promoted",
            "error",
            claim.id,
            `${evidenceRecordId} was not promoted by reconciliation`,
          ),
        );
      }
    }
    for (const decisionId of claim.resolutionDecisionIds) {
      const resolution = resolutions.get(decisionId);
      if (!resolution || !approvedResolution(resolution)) {
        findings.push(
          finding(
            "answer-resolution",
            "error",
            claim.id,
            `${decisionId} is absent, rejected, or deferred`,
          ),
        );
      } else if (
        !claim.evidenceRecordIds.some((recordId) =>
          resolution.evidenceRecordIds.includes(recordId),
        )
      ) {
        findings.push(
          finding(
            "answer-resolution-evidence",
            "error",
            claim.id,
            `${decisionId} does not cite this answer claim's evidence`,
          ),
        );
      }
    }
    for (const candidateId of claim.candidateIds) {
      if (!dossierCandidateIds.has(candidateId)) {
        findings.push(
          finding(
            "candidate-outside-dossier",
            "error",
            claim.id,
            `${candidateId} is absent from the dossier recall set`,
          ),
        );
      }
    }
    const rebuilt = buildClaim(claim, transaction);
    if (JSON.stringify(rebuilt) !== JSON.stringify(claim)) {
      findings.push(
        finding(
          "answer-claim-projection",
          "error",
          claim.id,
          "answer claim custody projection is stale",
        ),
      );
    }
  }
  for (const transaction of packet.transactions) {
    if (!usedTransactions.has(transaction.transactionId)) {
      findings.push(
        finding(
          "unused-transaction",
          "error",
          transaction.transactionId,
          "answer packet contains an unused reconciliation transaction",
        ),
      );
    }
  }

  const gapsById = new Map(
    packet.dossier.gaps.map((gap) => [gap.gapId, gap] as const),
  );
  const claimsById = new Map(
    packet.claims.map((claim) => [claim.id, claim] as const),
  );
  const closedGapIds = new Set<string>();
  for (const closure of packet.gapClosures) {
    const gap = gapsById.get(closure.gapId);
    if (!gap) {
      findings.push(
        finding(
          "gap-closure-gap",
          "error",
          closure.id,
          `${closure.gapId} is absent from the dossier`,
        ),
      );
      continue;
    }
    closedGapIds.add(closure.gapId);
    if (!nonempty(closure.rationale) || closure.rationale.trim().length < 32) {
      findings.push(
        finding(
          "gap-closure-rationale",
          "error",
          closure.id,
          "gap closure requires a substantive reviewer rationale",
        ),
      );
    }
    if (closure.claimIds.length === 0 || !unique(closure.claimIds)) {
      findings.push(
        finding(
          "gap-closure-claims",
          "error",
          closure.id,
          "gap closure requires unique adjudicated answer claims",
        ),
      );
    }
    const closureClaims = closure.claimIds
      .map((claimId) => claimsById.get(claimId))
      .filter((claim): claim is AsoiafReviewedAnswerClaim => claim !== undefined);
    for (const claimId of closure.claimIds) {
      if (!claimsById.has(claimId)) {
        findings.push(
          finding(
            "gap-closure-claim",
            "error",
            closure.id,
            `${claimId} is absent from the answer packet`,
          ),
        );
      }
    }
    if (
      gap.candidateId
      && !closureClaims.some((claim) => claim.candidateIds.includes(gap.candidateId!))
    ) {
      findings.push(
        finding(
          "gap-closure-candidate",
          "error",
          closure.id,
          "gap closure claims do not adjudicate the dossier candidate",
        ),
      );
    }
    if (
      gap.observationId
      && !closureClaims.some((claim) => claim.observationId === gap.observationId)
    ) {
      findings.push(
        finding(
          "gap-closure-observation",
          "error",
          closure.id,
          "gap closure claims do not bind the dossier observation",
        ),
      );
    }
    if (
      gap.sourceId
      && !closureClaims.some((claim) => claim.sourceId === gap.sourceId)
    ) {
      findings.push(
        finding(
          "gap-closure-source",
          "error",
          closure.id,
          "gap closure claims do not bind the dossier source",
        ),
      );
    }
    const expectedClosure = buildGapClosure(closure);
    if (JSON.stringify(expectedClosure) !== JSON.stringify(closure)) {
      findings.push(
        finding(
          "gap-closure-projection",
          "error",
          closure.id,
          "gap closure projection is stale",
        ),
      );
    }
  }

  const rejectedOrDeferredReferenceIds = new Set(
    packet.dossier.structuredReferences
      .filter(
        (reference) =>
          reference.standing === "rejected"
          || reference.standing === "deferred",
      )
      .map((reference) => reference.referenceId),
  );
  const limitedGapIds = new Set(
    packet.limitations.flatMap((entry) => entry.relatedGapIds ?? []),
  );
  const limitedReferenceIds = new Set(
    packet.limitations.flatMap((entry) => entry.relatedReferenceIds ?? []),
  );
  for (const gapId of gapsById.keys()) {
    if (!closedGapIds.has(gapId) && !limitedGapIds.has(gapId)) {
      findings.push(
        finding(
          "uncovered-gap",
          "error",
          gapId,
          "every dossier gap must be closed or appear in an explicit answer limitation",
        ),
      );
    }
    if (closedGapIds.has(gapId) && limitedGapIds.has(gapId)) {
      findings.push(
        finding(
          "gap-both-closed-and-limited",
          "error",
          gapId,
          "a dossier gap cannot be both closed and retained as a limitation",
        ),
      );
    }
  }
  for (const referenceId of rejectedOrDeferredReferenceIds) {
    if (!limitedReferenceIds.has(referenceId)) {
      findings.push(
        finding(
          "uncovered-disposition",
          "error",
          referenceId,
          "every rejected or deferred structured reference must appear in an explicit answer limitation",
        ),
      );
    }
  }
  for (const limitation of packet.limitations) {
    if (!nonempty(limitation.text) || limitation.textDigest !== sha256(limitation.text)) {
      findings.push(
        finding(
          "limitation-text",
          "error",
          limitation.id,
          "answer limitation text is empty or has a stale digest",
        ),
      );
    }
    for (const gapId of limitation.relatedGapIds ?? []) {
      if (!gapsById.has(gapId)) {
        findings.push(
          finding(
            "limitation-gap",
            "error",
            limitation.id,
            `${gapId} is absent from the dossier`,
          ),
        );
      }
    }
    for (const referenceId of limitation.relatedReferenceIds ?? []) {
      if (!rejectedOrDeferredReferenceIds.has(referenceId)) {
        findings.push(
          finding(
            "limitation-reference",
            "error",
            limitation.id,
            `${referenceId} is not a rejected or deferred dossier reference`,
          ),
        );
      }
    }
    const rebuilt = buildLimitation(limitation);
    if (JSON.stringify(rebuilt) !== JSON.stringify(limitation)) {
      findings.push(
        finding(
          "limitation-projection",
          "error",
          limitation.id,
          "answer limitation projection is stale",
        ),
      );
    }
  }

  const expectedScope: AsoiafReviewedAnswerScope =
    packet.limitations.length > 0 ? "partial" : "bounded-complete";
  if (packet.scope !== expectedScope) {
    findings.push(
      finding(
        "answer-scope",
        "error",
        packet.answerPacketId,
        "answer scope differs from its explicit limitations",
      ),
    );
  }
  const rendered = renderClaimsAndLimitations(packet);
  if (
    packet.renderedTextDigest !== sha256(rendered)
    || packet.renderedTextCharacters !== [...rendered].length
  ) {
    findings.push(
      finding(
        "rendered-text",
        "error",
        packet.answerPacketId,
        "rendered answer digest or character count is stale",
      ),
    );
  }
  if (
    packet.answerReady !== true
    || packet.renderAuthority !== "reviewed-text-only"
    || packet.acquisitionAuthority !== "none"
    || packet.reconciliationAuthority !== "none"
    || packet.graphEffect !== "none"
    || packet.canonEffect !== "none"
    || packet.answerEffect !== "render-reviewed-packet"
  ) {
    findings.push(
      finding(
        "answer-authority",
        "error",
        packet.answerPacketId,
        "answer packet crossed its render-only authority boundary",
      ),
    );
  }
  const expectedFingerprint = sha256(packetCore(packet));
  if (packet.answerPacketFingerprint !== expectedFingerprint) {
    findings.push(
      finding(
        "answer-fingerprint",
        "error",
        packet.answerPacketId,
        "answer packet fingerprint is stale",
      ),
    );
  }
  const expectedId = collectorContentId("asoiaf-reviewed-answer-packet", {
    dossierId: packet.dossierId,
    answerPacketFingerprint: expectedFingerprint,
  });
  if (packet.answerPacketId !== expectedId) {
    findings.push(
      finding(
        "answer-identity",
        "error",
        packet.answerPacketId,
        "answer packet identity is not content addressed",
      ),
    );
  }
  return sortedFindings(findings);
}

export function buildAsoiafReviewedAnswerPacket(
  input: AsoiafReviewedAnswerPacketInput,
): AsoiafReviewedAnswerPacket {
  const dossierErrors = validateAsoiafResearchQuestionDossier(input.dossier)
    .filter((entry) => entry.severity === "error");
  if (dossierErrors.length > 0) {
    throw new Error(
      `invalid research dossier: ${dossierErrors
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  const transactions = [...input.transactions]
    .sort((left, right) => compareCodepoints(left.transactionId, right.transactionId));
  for (const transaction of transactions) {
    const errors = validateTransaction(transaction).filter(
      (entry) => entry.severity === "error",
    );
    if (errors.length > 0) {
      throw new Error(
        `invalid reviewed answer transaction: ${errors
          .map((entry) => `${entry.code}:${entry.subjectId}`)
          .join(", ")}`,
      );
    }
  }
  const transactionsById = new Map(
    transactions.map((entry) => [entry.transactionId, entry] as const),
  );
  const claims = [...input.claims]
    .sort(
      (left, right) =>
        left.order - right.order || compareCodepoints(left.id, right.id),
    )
    .map((claim) => {
      const transaction = transactionsById.get(claim.transactionId);
      if (!transaction) {
        throw new Error(`unknown answer transaction ${claim.transactionId}`);
      }
      return buildClaim(claim, transaction);
    });
  const gapClosures = (input.gapClosures ?? [])
    .map(buildGapClosure)
    .sort((left, right) => compareCodepoints(left.id, right.id));
  const limitations = (input.limitations ?? [])
    .map(buildLimitation)
    .sort((left, right) => compareCodepoints(left.id, right.id));
  const rendered = renderClaimsAndLimitations({ claims, limitations });
  const core = {
    format: ASOIAF_REVIEWED_ANSWER_PACKET_FORMAT,
    dossier: input.dossier,
    dossierId: input.dossier.dossierId,
    dossierFingerprint: input.dossier.dossierFingerprint,
    questionId: input.dossier.question.questionId,
    questionDigest: input.dossier.question.questionDigest,
    continuityIds: orderedStrings(input.dossier.question.continuityIds),
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt,
    transactions,
    claims,
    gapClosures,
    limitations,
    scope: (limitations.length > 0
      ? "partial"
      : "bounded-complete") as AsoiafReviewedAnswerScope,
    renderedTextDigest: sha256(rendered),
    renderedTextCharacters: [...rendered].length,
    answerReady: true as const,
    renderAuthority: "reviewed-text-only" as const,
    acquisitionAuthority: "none" as const,
    reconciliationAuthority: "none" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
    answerEffect: "render-reviewed-packet" as const,
  };
  const answerPacketFingerprint = sha256(core);
  const packet: AsoiafReviewedAnswerPacket = {
    ...core,
    answerPacketId: collectorContentId("asoiaf-reviewed-answer-packet", {
      dossierId: input.dossier.dossierId,
      answerPacketFingerprint,
    }),
    answerPacketFingerprint,
  };
  const errors = validateAsoiafReviewedAnswerPacket(packet)
    .filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `invalid reviewed answer packet: ${errors
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  return packet;
}

export function renderAsoiafReviewedAnswerPacket(
  packet: AsoiafReviewedAnswerPacket,
): string {
  const errors = validateAsoiafReviewedAnswerPacket(packet)
    .filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `invalid reviewed answer packet: ${errors
        .map((entry) => `${entry.code}:${entry.subjectId}`)
        .join(", ")}`,
    );
  }
  return renderClaimsAndLimitations(packet);
}
