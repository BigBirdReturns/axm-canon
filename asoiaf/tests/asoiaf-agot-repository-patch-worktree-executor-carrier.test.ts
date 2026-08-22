import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-repository-patch-worktree-executor-v1");
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
function sha256(data: Buffer | string): string { return createHash("sha256").update(data).digest("hex"); }
function gitBlobSha1(data: Buffer): string { return createHash("sha1").update(Buffer.from(`blob ${data.length}\0`, "utf8")).update(data).digest("hex"); }
function python(): string { return process.platform === "win32" ? "python" : "python3"; }

describe("AGOT repository patch worktree executor exact carrier", () => {
  it("reconstructs the exact source-rebuilt ZIP", () => {
    expect(carrier.chunkCount).toBe(5);
    const parts = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((row: any) => row.path));
    const encoded = parts.join("");
    expect(encoded.length).toBe(21644);
    expect(sha256(encoded)).toBe("703a7a415ebcfc5df8c4f6c5a71dec3418def799cd7b2a4f872b7befca84860e");
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(16232);
    expect(sha256(archive)).toBe("02abfe23c19170796cda38750e80efa69cf090370dfb8f568f12e766ec704ff8");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
  });

  it("extracts safely and replays every static and synthetic check", () => {
    const encoded = carrier.chunks.map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii")).join("");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-worktree-executor-"));
    const archivePath = join(tempRoot, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encoded, "base64"));
      const inspect = spawnSync(python(), ["-S", "-c", [
        "import pathlib,sys,zipfile",
        "p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
        "z=zipfile.ZipFile(p); infos=z.infolist()",
        "assert len(infos)==12",
        "assert all(not pathlib.PurePosixPath(i.filename).is_absolute() for i in infos)",
        "assert all('..' not in pathlib.PurePosixPath(i.filename).parts for i in infos)",
        "assert all('\\\\' not in i.filename for i in infos)",
        "z.extractall(out)",
      ].join(";"), archivePath, tempRoot], { encoding: "utf8" });
      expect(inspect.status, inspect.stderr).toBe(0);
      const component = resolve(tempRoot, "asoiaf-agot-repository-patch-worktree-executor-v1");
      const verify = spawnSync(python(), ["-S", resolve(component, "verify.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" } });
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({ passed: 54, total: 54, status: "PASS", realWorktreePatchesApplied: 0, gitIndexMutations: 0, gitCommitsCreated: 0, localReferenceUpdates: 0, remotePushes: 0 });
      const campaign = spawnSync(python(), ["-S", resolve(component, "synthetic_campaign.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" }, timeout: 180_000 });
      expect(campaign.status, campaign.stderr).toBe(0);
      expect(JSON.parse(campaign.stdout)).toMatchObject({ passed: 17, total: 17, status: "PASS", fixtureSourceTextOnly: true, realRepositoryUsed: false, realPatchBundlesConsumed: 0, realWorktreePatchesApplied: 0, gitIndexMutations: 0, gitCommitsCreated: 0, localReferenceUpdates: 0, remotePushes: 0 });
    } finally { rmSync(tempRoot, { recursive: true, force: true }); }
  });

  it("retains the upstream identity and every no-effect boundary", () => {
    expect(admission.upstream).toMatchObject({ componentId: "asoiaf-agot-repository-effect-patch-builder-v1", admissionCommit: "956690221c709aab76d4e12b1ed7d6683e339305", packageSha256: "fa50113c028738cb61806832d4fdf4e823ec5da12ec99d557315b9a5fd5a41fa", patchStanding: "PASS_REPOSITORY_PATCH_MATERIALIZED_PENDING_HUMAN_PR_REVIEW" });
    expect(admission.counts).toEqual({ realPatchBundlesConsumed: 0, realWorktreePatchesApplied: 0, liveIndexMutations: 0, gitCommitsCreated: 0, localReferenceUpdates: 0, remotePushes: 0, pullRequestsOpened: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    expect(admission.authorityBoundary).toMatchObject({ privateSourceTextPresent: false, privatePayloadPresent: false, liveIndexModified: false, gitCommitCreated: false, localReferenceUpdated: false, remoteEffect: "none", canonEffect: "none", graphEffect: "none" });
  });
});
