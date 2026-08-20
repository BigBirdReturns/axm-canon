import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-20-public-admission-stack-v2",
);
const stateOperator = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-20-repository-state-operator-v1/state.py",
);
const stack = JSON.parse(readFileSync(resolve(root, "STACK.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(root, "RECEIPT.json"), "utf8"));
const historical = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "asoiaf/public/continuation/2026-08-19-public-admission-stack-v1/STACK.json",
    ),
    "utf8",
  ),
);

function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("ASOIAF public admission stack v2", () => {
  it("passes its exact 32-check verifier under warnings-as-errors", () => {
    const run = spawnSync(python(), [resolve(root, "verify.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      stackId: "asoiaf-public-admission-stack-v2",
      passed: 32,
      total: 32,
      status: "PASS",
      warningsAsErrors: true,
      successorLanes: 7,
      unmaterializedPredecessorArchives: 7,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      v4_2Built: false,
      v4_2Claimed: false,
    });
  });

  it("binds reconciliation to the exact-checkout state operator", () => {
    const run = spawnSync(python(), [stateOperator], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result.standing).toBe("SEVEN_SUCCESSOR_LANES_PRESENT");
    expect(result.headCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.headTree).toMatch(/^[0-9a-f]{40}$/);
    expect(result.successorEvidenceCount).toBe(7);
    expect(result.successorEvidence).toHaveLength(7);
    expect(result.missingEvidence).toEqual([]);
    expect(result.rejectedEvidence).toEqual([]);
    expect(
      result.successorEvidence.every(
        (row: {
          evidenceBytes: number;
          evidenceSha256: string;
          predecessorArchive: { materialized: boolean };
        }) =>
          row.evidenceBytes > 0 &&
          /^[0-9a-f]{64}$/.test(row.evidenceSha256) &&
          row.predecessorArchive.materialized === false,
      ),
    ).toBe(true);
    expect(result.nonEffects).toMatchObject({
      historicalPatchApplied: false,
      checkoutChanged: false,
      repositoryReset: false,
      remoteFetched: false,
      repositoryFilesWritten: 0,
      commitsCreated: 0,
      branchesUpdated: 0,
      sourceTextIngested: false,
      predecessorArchivesMaterialized: 0,
      canonPromotions: 0,
      graphMutations: 0,
      v4_2Built: false,
      v4_2Claimed: false,
    });
  });

  it("retains the five-successor stack as history and reconciles seven current lanes", () => {
    expect(historical.standing).toBe(
      "five-public-successors-admitted-two-v3-payloads-held-private-v4.2-held",
    );
    expect(stack).toMatchObject({
      schema: "axm-asoiaf-public-admission-stack/2",
      stackId: "asoiaf-public-admission-stack-v2",
      standing: "seven-successor-lanes-admitted-predecessors-held",
      predecessorStack: {
        path: "asoiaf/public/continuation/2026-08-19-public-admission-stack-v1/STACK.json",
        standing: "historical-five-successor-snapshot",
        rewritten: false,
      },
      stateBinding: {
        mode: "runtime-exact-checkout",
        operatorPath:
          "asoiaf/public/continuation/2026-08-20-repository-state-operator-v1/state.py",
        staticCommitClaim: false,
        staticTreeClaim: false,
      },
      counts: {
        successorLanes: 7,
        successorLanesWithoutRepositorySurface: 0,
        unmaterializedPredecessorArchives: 7,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      },
    });
    expect(stack.successors).toHaveLength(7);
    expect(new Set(stack.successors.map((row: { componentId: string }) => row.componentId)).size).toBe(7);
    expect(
      stack.successors.every(
        (row: { predecessorArchive: { materialized: boolean; sha256: string } }) =>
          row.predecessorArchive.materialized === false &&
          /^[0-9a-f]{64}$/.test(row.predecessorArchive.sha256),
      ),
    ).toBe(true);
  });

  it("preserves the wave, campaign, private-root, canon, and graph holds", () => {
    expect(stack.remainingHolds.continuationWave).toMatchObject({
      sha256: "0e999b7f8c921e7e81d439fc4c2fc1fd004a2b4a2adb375f0df3b99aefe92ab9",
      materialized: false,
    });
    expect(stack.remainingHolds.fourthGenerationCampaign).toMatchObject({
      bytes: 249906,
      sha256: "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02",
      materialized: false,
    });
    expect(stack.remainingHolds.privateV4_1Root).toMatchObject({
      bytes: 244436743,
      sha256: "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
      materialized: false,
      v4_2Built: false,
      v4_2Claimed: false,
    });
    expect(receipt.authorityBoundary).toMatchObject({
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
      privateIntegrationEffect: "none",
      successfulReconciliationDoesNotMaterializePredecessors: true,
      successfulReconciliationDoesNotMaterializeWave: true,
      successfulReconciliationDoesNotAuthorizePrivateIntegration: true,
    });
  });
});
