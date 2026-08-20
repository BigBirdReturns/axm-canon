import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-20-repository-state-operator-v1",
);
const historical = JSON.parse(
  readFileSync(resolve(root, "HISTORICAL_PATCH.json"), "utf8"),
);
const holds = JSON.parse(readFileSync(resolve(root, "HOLDS.json"), "utf8"));
const source = readFileSync(resolve(root, "state.py"), "utf8");

function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("ASOIAF repository state operator", () => {
  it("passes its exact 50-check static verifier under warnings-as-errors", () => {
    const run = spawnSync(python(), [resolve(root, "verify.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      componentId: "asoiaf-repository-state-operator-v1",
      passed: 50,
      total: 50,
      status: "PASS",
      warningsAsErrors: true,
      successorLanes: 7,
      unmaterializedPredecessors: 7,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      v4_2Built: false,
      v4_2Claimed: false,
    });
  });

  it("derives the exact checkout and seven successor evidence hashes", () => {
    const run = spawnSync(python(), [resolve(root, "state.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result.standing).toBe("SEVEN_SUCCESSOR_LANES_PRESENT");
    expect(result.headCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.headTree).toMatch(/^[0-9a-f]{40}$/);
    expect(result.branch === null || typeof result.branch === "string").toBe(true);
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
    expect(result.historicalPatch).toMatchObject({
      preparedAgainstCommit: "fec0ddc9a5697d465ac46e55b7e3cb7647221952",
      applicableToExactHead: false,
      applicationAuthorized: false,
      packetMaterialized: false,
    });
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

  it("preserves the historical patch and private integration holds", () => {
    expect(historical.packet).toMatchObject({
      filename: "axm-canon-state-refresh-v0.2.tar.zst",
      bytes: 3596,
      sha256: "bd4b5f0d5fb46d9cc50e100f8911f7f066f8257c20056fc0928014576a47e533",
      materialized: false,
      exactIdentityClaimed: false,
      byteReproductionClaimed: false,
    });
    expect(historical.currentPolicy.applyHistoricalPatch).toBe(false);
    expect(holds.counts).toMatchObject({
      continuationV3SuccessorLanes: 7,
      continuationV3LanesWithoutSuccessor: 0,
      unmaterializedV3PredecessorArchives: 7,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(holds.privateIntegrationRoot).toMatchObject({
      materialized: false,
      v4_2Built: false,
      v4_2Claimed: false,
      substitutionAllowed: false,
      reconstructionAllowed: false,
    });
  });

  it("uses read-only fixed-argument git calls and emits stdout only", () => {
    expect(source).toContain("shell=False");
    expect(source).not.toContain("shell=True");
    expect(source).not.toContain("write_text(");
    expect(source).not.toContain("os.system");
    expect(source).not.toContain("git_required(\"checkout\"");
    expect(source).not.toContain("git_required(\"reset\"");
    expect(source).not.toContain("git_required(\"fetch\"");
    expect(source).not.toContain("git_required(\"commit\"");
    expect(source).not.toContain("git_required(\"push\"");
  });
});
