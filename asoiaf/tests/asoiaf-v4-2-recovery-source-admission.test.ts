import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-20-v4-2-recovery-source-v1",
);
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8")) as {
  componentId: string;
  standing: string;
  authorityBoundary: Record<string, boolean | string | number>;
  requiredInputs: Array<{
    filename: string;
    bytes: number;
    sha256: string;
    materialized: boolean;
    substitutionAllowed: boolean;
    reconstructionAllowed: boolean;
  }>;
  sealedPredecessor: {
    bytes: number;
    sha256: string;
    materialized: boolean;
    exactIdentityClaimed: boolean;
    byteReproductionClaimed: boolean;
  };
  qualifiedLocalPackage: {
    filename: string;
    bytes: number;
    sha256: string;
    gitBlobSha1: string;
    repositoryReachable: boolean;
    materializationClaimed: boolean;
  };
  currentExecution: {
    status: string;
    exitCode: number;
    allExactInputsVerified: boolean;
    integrationAuthorized: boolean;
    v4_2Built: boolean;
    v4_2Claimed: boolean;
  };
  automaticCanonPromotions: number;
  automaticGraphMutations: number;
  v4_2Built: boolean;
  v4_2Claimed: boolean;
};

const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8")) as {
  allowedOperations: string[];
  forbiddenOperations: string[];
  states: Record<string, { exitCode: number }>;
  receiptBoundary: Record<string, boolean | string>;
};

const currentHold = JSON.parse(readFileSync(resolve(root, "CURRENT_HOLD.json"), "utf8")) as {
  status: string;
  exitCode: number;
  requiredInputs: Array<{ materialized: boolean }>;
  effects: Record<string, boolean | number>;
};

const operatorSource = readFileSync(resolve(root, "operator.py"), "utf8");

describe("ASOIAF v4.2 fail-closed recovery source admission", () => {
  it("preserves the exact inherited input identities and transport hold", () => {
    expect(admission.componentId).toBe("asoiaf-v4-2-recovery-source-v1");
    expect(admission.standing).toBe(
      "repository-native-fail-closed-source-successor-materialized-exact-inputs-held",
    );
    expect(admission.requiredInputs).toHaveLength(2);
    expect(admission.requiredInputs[0]).toMatchObject({
      filename: "asoiaf-private-world-estate-v4.1.tar.zst",
      bytes: 244436743,
      sha256: "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
      materialized: false,
      substitutionAllowed: false,
      reconstructionAllowed: false,
    });
    expect(admission.requiredInputs[1]).toMatchObject({
      filename: "asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst",
      bytes: 249906,
      sha256: "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02",
      materialized: false,
      substitutionAllowed: false,
      reconstructionAllowed: false,
    });
    expect(currentHold.status).toBe("HOLD_EXACT_ARCHIVES_UNAVAILABLE");
    expect(currentHold.exitCode).toBe(10);
    expect(currentHold.requiredInputs.every((item) => item.materialized === false)).toBe(true);
  });

  it("retains the sealed predecessor and local package as non-materialized identities", () => {
    expect(admission.sealedPredecessor).toEqual({
      filename: "asoiaf-v4.2-recovery-kit-v0.1.tar.zst",
      bytes: 23112,
      sha256: "538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75",
      archiveReplaySha256: "e5c0769a3a1847c64b152281cc3c0e40b1d7f2ea83d1ccb65b81edb9aa832f23",
      materialized: false,
      exactIdentityClaimed: false,
      byteReproductionClaimed: false,
    });
    expect(admission.qualifiedLocalPackage).toMatchObject({
      filename: "asoiaf-v4-2-recovery-operator-v1.tar.zst",
      bytes: 10686,
      sha256: "76e55f765d05203256fc0111e54a20e809048ac57650b1f2b2f86f76d45edc67",
      gitBlobSha1: "dccaa0dd1e8c0ae49b297bc391591a5a739bc83a",
      repositoryReachable: false,
      materializationClaimed: false,
    });
    expect(existsSync(resolve(root, admission.qualifiedLocalPackage.filename))).toBe(false);
  });

  it("allows verification and receipt emission while refusing mutation and integration", () => {
    expect(contract.allowedOperations).toEqual([
      "stat-candidate-file",
      "stream-sha256-candidate-file",
      "emit-json-verification-receipt",
    ]);
    for (const operation of [
      "copy-input",
      "move-input",
      "rename-input",
      "extract-input",
      "mount-input",
      "reconstruct-input",
      "substitute-input",
      "rewrite-input",
      "integrate-private-estate",
      "build-v4.2",
      "claim-v4.2",
      "promote-canon",
      "mutate-graph",
    ]) {
      expect(contract.forbiddenOperations).toContain(operation);
    }
    expect(contract.states.HOLD_EXACT_ARCHIVES_UNAVAILABLE.exitCode).toBe(10);
    expect(contract.states.REFUSE_SIZE_MISMATCH.exitCode).toBe(20);
    expect(contract.states.REFUSE_DIGEST_MISMATCH.exitCode).toBe(21);
    expect(contract.states.REFUSE_IO_ERROR.exitCode).toBe(30);
    expect(contract.states.READY_EXACT_ARCHIVES_VERIFIED.exitCode).toBe(0);

    for (const forbiddenToken of [
      "import tarfile",
      "import zipfile",
      "import shutil",
      "import subprocess",
      ".extract(",
      ".extractall(",
      "unpack_archive",
      "copy2(",
    ]) {
      expect(operatorSource).not.toContain(forbiddenToken);
    }
  });

  it("passes the bounded adversarial verifier", () => {
    const result = spawnSync("python", [resolve(root, "verify.py")], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(result.stdout) as {
      status: string;
      checks: { passed: number; total: number };
      automaticCanonPromotions: number;
      automaticGraphMutations: number;
      v4_2Built: boolean;
      v4_2Claimed: boolean;
    };
    expect(receipt.status).toBe("PASS");
    expect(receipt.checks.passed).toBe(receipt.checks.total);
    expect(receipt.checks.total).toBeGreaterThanOrEqual(12);
    expect(receipt.automaticCanonPromotions).toBe(0);
    expect(receipt.automaticGraphMutations).toBe(0);
    expect(receipt.v4_2Built).toBe(false);
    expect(receipt.v4_2Claimed).toBe(false);
  });

  it("cannot acquire canon, graph, private-estate, build, or claim authority", () => {
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.automaticGraphMutations).toBe(0);
    expect(admission.v4_2Built).toBe(false);
    expect(admission.v4_2Claimed).toBe(false);
    expect(admission.currentExecution.integrationAuthorized).toBe(false);
    expect(admission.currentExecution.v4_2Built).toBe(false);
    expect(admission.currentExecution.v4_2Claimed).toBe(false);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.authorityBoundary.privatePayloadPresent).toBe(false);
    expect(currentHold.effects.privateEstateMutated).toBe(false);
    expect(currentHold.effects.v4_2Built).toBe(false);
    expect(currentHold.effects.v4_2Claimed).toBe(false);
  });
});
