import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-review-transaction-stager-v1",
);
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
function gitBlobSha1(data: Buffer): string {
  return createHash("sha1")
    .update(Buffer.from(`blob ${data.length}\0`, "utf8"))
    .update(data)
    .digest("hex");
}
function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("AGOT review transaction stager exact carrier", () => {
  it("reconstructs the exact public-safe ZIP from sixteen ordered chunks", () => {
    expect(carrier.chunkCount).toBe(16);
    expect(carrier.base64Characters).toBe(25340);
    const parts = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((row: any) => row.path));
    const encoded = parts.join("");
    expect(encoded.length).toBe(25340);
    expect(sha256(encoded)).toBe(carrier.base64Sha256);
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(19005);
    expect(sha256(archive)).toBe("e07f0a31f7f87907b5a59af3ea49138de286c66134fb945ee8bb54488443d8e5");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
  });

  it("extracts safely and replays the verifier and adversarial campaign", () => {
    const encoded = carrier.chunks
      .map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii"))
      .join("");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-stager-"));
    const archivePath = join(tempRoot, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encoded, "base64"));
      const inspect = spawnSync(
        python(),
        [
          "-c",
          [
            "import pathlib,sys,zipfile",
            "p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
            "z=zipfile.ZipFile(p)",
            "infos=z.infolist()",
            "assert len(infos)==13",
            "assert all(not pathlib.PurePosixPath(i.filename).is_absolute() for i in infos)",
            "assert all('..' not in pathlib.PurePosixPath(i.filename).parts for i in infos)",
            "assert all('\\\\' not in i.filename for i in infos)",
            "z.extractall(out)",
          ].join(";"),
          archivePath,
          tempRoot,
        ],
        { encoding: "utf8" },
      );
      expect(inspect.status, inspect.stderr).toBe(0);
      const component = resolve(tempRoot, "asoiaf-agot-review-transaction-stager-v1");
      const verify = spawnSync(python(), [resolve(component, "verify.py")], {
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "error" },
      });
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({
        passed: 46,
        total: 46,
        status: "PASS",
        realTransactionCandidatesSealed: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
      const campaign = spawnSync(python(), [resolve(component, "synthetic_campaign.py")], {
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "error" },
        timeout: 180_000,
      });
      expect(campaign.status, campaign.stderr).toBe(0);
      expect(JSON.parse(campaign.stdout)).toMatchObject({
        passed: 16,
        total: 16,
        status: "PASS",
        fixtureSourceTextOnly: true,
        realPrivateSourceUsed: false,
        realTransactionCandidatesSealed: 0,
        executedHumanTransactions: 0,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("preserves the upstream and zero-effect authority boundaries", () => {
    expect(admission.upstream).toMatchObject({
      componentId: "asoiaf-agot-local-human-review-workstation-v1",
      mainCommit: "85b6ad80a7e115bb867d729ec8fccb8a9b76b79e",
      validatorGitBlobSha1: "08327ef1b256ec1d9c0265ad3ede8b531eba0213",
      validationPassState: "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR",
    });
    expect(admission.counts).toEqual({
      realValidatedIntakesConsumed: 0,
      realTransactionCandidatesSealed: 0,
      repositoryTransactionsAdmitted: 0,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.authorityBoundary).toMatchObject({
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      transactionCandidateIsNotRepositoryAdmission: true,
      repositoryAdmissionIsNotCanonExecution: true,
      transactionExecuted: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
