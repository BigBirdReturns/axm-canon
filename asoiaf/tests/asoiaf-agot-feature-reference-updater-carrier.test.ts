import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-feature-reference-updater-v1");
const upstreamRoot = resolve(process.cwd(), "asoiaf/public/review/agot-local-feature-commit-object-sealer-v1");
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const upstream = JSON.parse(readFileSync(resolve(upstreamRoot, "ADMISSION.json"), "utf8"));
function sha256(data: Buffer | string): string { return createHash("sha256").update(data).digest("hex"); }
function gitBlobSha1(data: Buffer): string { return createHash("sha1").update(Buffer.from(`blob ${data.length}\0`, "utf8")).update(data).digest("hex"); }
function python(): string { return process.platform === "win32" ? "python" : "python3"; }

describe("AGOT local feature-reference updater exact carrier", () => {
  it("reconstructs the exact qualified ZIP from manifest-declared chunks", () => {
    expect(carrier.chunkCount).toBe(6);
    expect(carrier.base64Characters).toBe(25924);
    const parts = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((row: any) => row.path));
    const encoded = parts.join("");
    expect(encoded.length).toBe(25924);
    expect(sha256(encoded)).toBe("b5ae022129253d263d0357414278c6c0f43e6e7cc6cf6f264b9d023ee109bb7b");
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(19441);
    expect(sha256(archive)).toBe("eacc45d23dece6763fd13a1ca39e190220a266df673e4a39ae5b9afed4cae2c8");
    expect(admission.package).toMatchObject({ materializedInRepository: false, reconstructableFromCarrier: true, expandedFileCount: 13 });
  });

  it("extracts safely and replays all static and synthetic checks", () => {
    const encoded = carrier.chunks.map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii")).join("");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-feature-ref-"));
    const archivePath = join(tempRoot, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encoded, "base64"));
      const inspect = spawnSync(python(), ["-S", "-c", [
        "import pathlib,sys,zipfile",
        "p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
        "z=zipfile.ZipFile(p); infos=z.infolist()",
        "assert len(infos)==13",
        "assert all(not pathlib.PurePosixPath(i.filename).is_absolute() for i in infos)",
        "assert all('..' not in pathlib.PurePosixPath(i.filename).parts for i in infos)",
        "assert all('\\\\' not in i.filename for i in infos)",
        "z.extractall(out)",
      ].join(";"), archivePath, tempRoot], { encoding: "utf8" });
      expect(inspect.status, inspect.stderr).toBe(0);
      const component = resolve(tempRoot, "asoiaf-agot-feature-reference-updater-v1");
      const verify = spawnSync(python(), ["-S", resolve(component, "verify.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" } });
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({ passed: 66, total: 66, status: "PASS", realFeatureReferenceUpdates: 0, worktreeMutations: 0, liveIndexMutations: 0, remotePushes: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
      const campaign = spawnSync(python(), ["-S", resolve(component, "synthetic_campaign.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" }, timeout: 240_000 });
      expect(campaign.status, campaign.stderr).toBe(0);
      expect(JSON.parse(campaign.stdout)).toMatchObject({ passed: 22, total: 22, status: "PASS", fixtureSourceTextOnly: true, realRepositoryUsed: false, realCommitObjectReceiptsConsumed: 0, realFeatureReferenceUpdates: 0, worktreeMutations: 0, liveIndexMutations: 0, remotePushes: 0 });
    } finally { rmSync(tempRoot, { recursive: true, force: true }); }
  });

  it("binds the admitted commit-object sealer and preserves every no-effect boundary", () => {
    expect(upstream.package).toMatchObject({ bytes: 15001, sha256: "05a5f2c30eba04718d5bde8048a52f0028732dfea9588b855a87abafa4167b79" });
    expect(admission.upstream).toMatchObject({ componentId: "asoiaf-agot-local-feature-commit-object-sealer-v1", admissionCommit: "70da97f7f92e792eaad32fdc7a456c598347bd78", packageSha256: "05a5f2c30eba04718d5bde8048a52f0028732dfea9588b855a87abafa4167b79", commitObjectStanding: "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD" });
    expect(admission.counts).toEqual({ realCommitObjectReceiptsConsumed: 0, realFeatureReferenceUpdates: 0, worktreeMutations: 0, liveIndexMutations: 0, remotePushes: 0, pullRequestsOpened: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    expect(admission.authorityBoundary).toMatchObject({ privateSourceTextPresent: false, privatePayloadPresent: false, carrierReconstructionDoesNotUpdateLocalReference: true, localReferenceUpdateIsNotRemotePush: true, worktreeModified: false, liveIndexModified: false, remotePushExecuted: false, canonEffect: "none", graphEffect: "none" });
  });
});
