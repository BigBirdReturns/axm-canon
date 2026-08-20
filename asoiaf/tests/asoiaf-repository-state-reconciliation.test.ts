import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-20-repository-state-reconciliation-v1",
);
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8")) as {
  componentId: string;
  standing: string;
  authorityBoundary: Record<string, boolean | string | number>;
  historicalPacket: {
    filename: string;
    bytes: number;
    sha256: string;
    materialized: boolean;
    preparedAgainstCommit: string;
    patchSha256: string;
    repositoryReplaySha256: string;
  };
  replacementMechanism: Record<string, boolean | string>;
  counts: Record<string, number>;
  automaticCanonPromotions: number;
  automaticGraphMutations: number;
  v4_2Built: boolean;
  v4_2Claimed: boolean;
};
const state = JSON.parse(readFileSync(resolve(root, "STATE.json"), "utf8")) as {
  corpus: Record<string, number | boolean>;
  continuationSuccessors: Array<{ componentId: string; repositoryPath: string }>;
  sealedV3PredecessorHolds: Array<{
    componentId: string;
    filename: string;
    bytes: number;
    sha256: string;
    materialized: boolean;
  }>;
  privateIntegration: Record<string, boolean>;
  reviewStanding: Record<string, boolean | number>;
};
const supersession = JSON.parse(
  readFileSync(resolve(root, "SUPERSESSION.json"), "utf8"),
) as {
  decision: string;
  mechanism: Record<string, boolean>;
  nonClaims: Record<string, boolean | string>;
};

describe("ASOIAF repository-state reconciliation admission", () => {
  it("preserves the exact missing historical patch identity", () => {
    expect(admission.componentId).toBe("asoiaf-repository-state-reconciliation-v1");
    expect(admission.standing).toBe(
      "repository-native-current-state-successor-materialized-historical-patch-held",
    );
    expect(admission.historicalPacket).toMatchObject({
      filename: "axm-canon-state-refresh-v0.2.tar.zst",
      bytes: 3596,
      sha256: "bd4b5f0d5fb46d9cc50e100f8911f7f066f8257c20056fc0928014576a47e533",
      materialized: false,
      preparedAgainstCommit: "fec0ddc9a5697d465ac46e55b7e3cb7647221952",
      patchSha256: "34ddb453952805d99e51ed9638e84871bfa455b566272a05ab13916a096d1b28",
      repositoryReplaySha256: "09dc60b62e0dcd935417dc71b2b9ac0a81d7f3243ea26def36270d2a657c7ac3",
    });
  });

  it("records seven successor lanes while retaining seven predecessor holds", () => {
    expect(state.continuationSuccessors).toHaveLength(7);
    expect(new Set(state.continuationSuccessors.map((item) => item.componentId)).size).toBe(7);
    expect(state.sealedV3PredecessorHolds).toHaveLength(7);
    expect(new Set(state.sealedV3PredecessorHolds.map((item) => item.componentId)).size).toBe(7);
    expect(state.sealedV3PredecessorHolds.every((item) => item.materialized === false)).toBe(true);
    expect(
      state.sealedV3PredecessorHolds.reduce((total, item) => total + item.bytes, 0),
    ).toBe(128151);
    expect(admission.counts.repositoryNativeContinuationSuccessors).toBe(7);
    expect(admission.counts.sealedV3ComponentPredecessorHolds).toBe(7);
    expect(admission.counts.remainingV3FunctionalSuccessorGaps).toBe(0);
  });

  it("reconciles the current corpus census without admitting source text", () => {
    expect(state.corpus).toMatchObject({
      editionIdentities: 6,
      orderedSourceUnits: 458,
      narrativeUnits: 347,
      nonNarrativeUnits: 111,
      paragraphLocators: 45828,
      privatelyHeldSourceWords: 1882845,
      modelRecallCandidates: 726,
      conversationSynthesisCandidates: 79,
      combinedReviewCandidates: 805,
      entityCandidates: 254,
      openingGateRecords: 31,
      registeredExternalSourceIdentities: 219,
      researchLanes: 45,
      privateSourcePayloadInGit: false,
      publicSourceTextInGit: false,
    });
  });

  it("supersedes patch function without manufacturing patch custody", () => {
    expect(supersession.decision).toBe("do-not-apply-or-reconstruct-historical-patch");
    expect(supersession.mechanism.exactPacketBytesAvailable).toBe(false);
    expect(supersession.mechanism.exactPatchBytesAvailable).toBe(false);
    expect(supersession.mechanism.historicalBaseIsCurrentMain).toBe(false);
    expect(supersession.mechanism.currentRepositoryContainsSuccessorStateBeyondHistoricalPatch).toBe(true);
    expect(supersession.mechanism.replacementDerivedFromCurrentRepositoryReceipts).toBe(true);
    expect(supersession.mechanism.historicalPatchIntentSupersededOperationally).toBe(true);
    expect(supersession.mechanism.historicalPacketCustodySuperseded).toBe(false);
    expect(supersession.nonClaims.historicalPatchApplied).toBe(false);
    expect(supersession.nonClaims.historicalPatchReconstructed).toBe(false);
    expect(supersession.nonClaims.currentMainDerivedFromMissingPatch).toBe(false);
  });

  it("passes the live repository-state verifier", () => {
    const result = spawnSync("python", [resolve(root, "verify.py")], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(result.stdout) as {
      status: string;
      checks: { passed: number; total: number };
      repositoryNativeContinuationSuccessors: number;
      sealedV3ComponentPredecessorHolds: number;
      remainingV3FunctionalSuccessorGaps: number;
      automaticCanonPromotions: number;
      automaticGraphMutations: number;
      v4_2Built: boolean;
      v4_2Claimed: boolean;
    };
    expect(receipt.status).toBe("PASS");
    expect(receipt.checks).toEqual({ passed: 18, total: 18 });
    expect(receipt.repositoryNativeContinuationSuccessors).toBe(7);
    expect(receipt.sealedV3ComponentPredecessorHolds).toBe(7);
    expect(receipt.remainingV3FunctionalSuccessorGaps).toBe(0);
    expect(receipt.automaticCanonPromotions).toBe(0);
    expect(receipt.automaticGraphMutations).toBe(0);
    expect(receipt.v4_2Built).toBe(false);
    expect(receipt.v4_2Claimed).toBe(false);
  });

  it("cannot acquire source, canon, graph, patch, or private-integration authority", () => {
    expect(admission.authorityBoundary.historicalPatchApplied).toBe(false);
    expect(admission.authorityBoundary.historicalPatchReconstructed).toBe(false);
    expect(admission.authorityBoundary.currentRepositoryRewrittenFromPatch).toBe(false);
    expect(admission.authorityBoundary.privatePayloadPresent).toBe(false);
    expect(admission.authorityBoundary.sourceTextPresent).toBe(false);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.automaticGraphMutations).toBe(0);
    expect(state.privateIntegration.integrationAuthorized).toBe(false);
    expect(state.privateIntegration.v4_2Built).toBe(false);
    expect(state.privateIntegration.v4_2Claimed).toBe(false);
    expect(state.reviewStanding.humanTransactionRequired).toBe(true);
    expect(admission.v4_2Built).toBe(false);
    expect(admission.v4_2Claimed).toBe(false);
  });
});
