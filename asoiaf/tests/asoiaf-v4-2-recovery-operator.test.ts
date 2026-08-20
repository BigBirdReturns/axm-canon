import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-20-v4-2-recovery-operator-v1",
);
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
const receipt = JSON.parse(readFileSync(resolve(root, "RECEIPT.json"), "utf8"));
const operatorSource = readFileSync(resolve(root, "operator.py"), "utf8");

function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("ASOIAF v4.2 recovery operator", () => {
  it("passes its 52-check verifier under warnings-as-errors", () => {
    const run = spawnSync(python(), [resolve(root, "verify.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(run.stdout);
    expect(result).toMatchObject({
      componentId: "asoiaf-v4.2-recovery-operator-v1",
      passed: 52,
      total: 52,
      status: "PASS",
      warningsAsErrors: true,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      v4_2Built: false,
      v4_2Claimed: false,
    });
  });

  it("returns the exact missing-input transport hold without side effects", () => {
    const privatePath = resolve(tmpdir(), "asoiaf-private-world-estate-v4.1.tar.zst");
    const frontierPath = resolve(
      tmpdir(),
      "asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst",
    );
    const run = spawnSync(
      python(),
      [
        resolve(root, "operator.py"),
        "--private-v4-1",
        privatePath,
        "--frontier",
        frontierPath,
      ],
      { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" } },
    );
    expect(run.status, run.stderr).toBe(3);
    const result = JSON.parse(run.stdout);
    expect(result.decision).toBe("HOLD_TRANSPORT");
    expect(result.inputs.map((row: { observedState: string }) => row.observedState)).toEqual([
      "absent",
      "absent",
    ]);
    expect(result.nonEffects).toEqual({
      copiedInputs: false,
      extractedArchives: false,
      reconstructedArchives: false,
      searchedForSubstitutes: false,
      downloadedRemoteContent: false,
      invokedShell: false,
      builtV4_2: false,
      claimedV4_2: false,
      canonPromotions: 0,
      graphMutations: 0,
    });
  });

  it("binds the exact inputs and absent predecessor", () => {
    expect(contract.requiredInputs).toHaveLength(2);
    expect(contract.requiredInputs[0]).toMatchObject({
      filename: "asoiaf-private-world-estate-v4.1.tar.zst",
      bytes: 244436743,
      sha256: "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
      materializedInRepository: false,
    });
    expect(contract.requiredInputs[1]).toMatchObject({
      filename: "asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst",
      bytes: 249906,
      sha256: "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02",
      materializedInRepository: false,
    });
    expect(contract.predecessorArchive).toMatchObject({
      filename: "asoiaf-v4.2-recovery-kit-v0.1.tar.zst",
      bytes: 23112,
      sha256: "538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75",
      materialized: false,
      exactIdentityClaimed: false,
      byteReproductionClaimed: false,
    });
  });

  it("contains no extraction, copy, download, or shell implementation", () => {
    for (const forbidden of [
      "tarfile",
      "extractall",
      "shutil.copy",
      "subprocess",
      "os.system",
      "requests",
      "urllib",
    ]) {
      expect(operatorSource).not.toContain(forbidden);
    }
    expect(receipt.authorityBoundary).toMatchObject({
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
      privateIntegrationEffect: "none",
      v4_2Built: false,
      v4_2Claimed: false,
    });
  });
});
