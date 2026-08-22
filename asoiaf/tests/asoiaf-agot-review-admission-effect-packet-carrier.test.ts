import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-review-admission-effect-packet-v1");
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
function sha256(data: Buffer | string): string { return createHash("sha256").update(data).digest("hex"); }
function gitBlobSha1(data: Buffer): string { return createHash("sha1").update(Buffer.from(`blob ${data.length}\0`, "utf8")).update(data).digest("hex"); }
function python(): string { return process.platform === "win32" ? "python" : "python3"; }

describe("AGOT review admission and effect packet exact carrier", () => {
  it("reconstructs the current source-rebuilt ZIP from ordered chunks", () => {
    expect(carrier.chunkCount).toBe(6);
    expect(carrier.base64Characters).toBe(26484);
    const parts = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((row: any) => row.path));
    const encoded = parts.join("");
    expect(encoded.length).toBe(26484);
    expect(sha256(encoded)).toBe("3f0181cb476e38bc49d5e1d694730507af4117f7bbb9b475c0368f6e73efd165");
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(19862);
    expect(sha256(archive)).toBe("28d454b5d94c3a5df011c92e9a9b46a2b8f4e25be72edfecfdb1a51d3f320389");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
    expect(admission.sourceReconstruction.predecessorArchiveExactIdentityClaimed).toBe(false);
  });

  it("extracts safely and replays all static and six-action checks", () => {
    const encoded = carrier.chunks.map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii")).join("");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-admission-effect-"));
    const archivePath = join(tempRoot, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encoded, "base64"));
      const inspect = spawnSync(python(), ["-S", "-c", [
        "import pathlib,sys,zipfile",
        "p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
        "z=zipfile.ZipFile(p); infos=z.infolist()",
        "assert len(infos)==16",
        "assert all(not pathlib.PurePosixPath(i.filename).is_absolute() for i in infos)",
        "assert all('..' not in pathlib.PurePosixPath(i.filename).parts for i in infos)",
        "assert all('\\\\' not in i.filename for i in infos)",
        "z.extractall(out)",
      ].join(";"), archivePath, tempRoot], { encoding: "utf8" });
      expect(inspect.status, inspect.stderr).toBe(0);
      const component = resolve(tempRoot, "asoiaf-agot-review-admission-effect-packet-v1");
      const verify = spawnSync(python(), ["-S", resolve(component, "verify.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" } });
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({ passed: 48, total: 48, status: "PASS", realTransactionsAdmitted: 0, realEffectPacketsSealed: 0, repositoryMutationsExecuted: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
      const campaign = spawnSync(python(), ["-S", resolve(component, "synthetic_campaign.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" }, timeout: 180_000 });
      expect(campaign.status, campaign.stderr).toBe(0);
      expect(JSON.parse(campaign.stdout)).toMatchObject({ passed: 38, total: 38, status: "PASS", fixtureSourceTextOnly: true, realPrivateSourceUsed: false, realTransactionsAdmitted: 0, realEffectPacketsSealed: 0, repositoryMutationsExecuted: 0 });
    } finally { rmSync(tempRoot, { recursive: true, force: true }); }
  });

  it("retains the upstream and every no-effect authority boundary", () => {
    expect(admission.upstream).toMatchObject({ componentId: "asoiaf-agot-review-decision-projection-planner-v1", admissionCommit: "61f15a4e63f2704a25e09dafa46c8d03353811e0", packageSha256: "89822cb134d14c736b9c41fa4f2e16824bbaf3096a8ed9b817b97dfc95b4500b", projectionStanding: "PASS_PROJECTION_PLAN_SEALED_NO_EFFECT_EXECUTED" });
    expect(admission.counts).toEqual({ realValidatedHumanIntakesConsumed: 0, realTransactionCandidatesAdmitted: 0, realEffectPacketsSealed: 0, repositoryMutationsExecuted: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    expect(admission.authorityBoundary).toMatchObject({ privateSourceTextPresent: false, privatePayloadPresent: false, ledgerAdmissionIsNotRepositoryMerge: true, effectPacketIsNotEffectExecution: true, repositoryMutationExecuted: false, canonEffect: "none", graphEffect: "none" });
  });
});
