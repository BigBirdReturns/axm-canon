import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const components = [
  { repositoryDir: "agot-pull-request-merge-executor-v1", componentId: "asoiaf-agot-pull-request-merge-executor-v1", verify: 36, campaign: 15 },
  { repositoryDir: "agot-post-merge-admission-verifier-v1", componentId: "asoiaf-agot-post-merge-admission-verifier-v1", verify: 35, campaign: 14 },
];

function sha256(data: Buffer | string): string { return createHash("sha256").update(data).digest("hex"); }
function gitBlobSha1(data: Buffer): string { return createHash("sha1").update(Buffer.from(`blob ${data.length}\0`, "utf8")).update(data).digest("hex"); }
function python(): string { return process.platform === "win32" ? "python" : "python3"; }

describe("AGOT merge and post-merge exact carriers", () => {
  for (const spec of components) {
    const root = resolve(process.cwd(), "asoiaf/public/review", spec.repositoryDir);
    const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
    const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));

    it(`${spec.componentId} reconstructs and replays`, () => {
      expect(carrier.chunkCount).toBe(carrier.chunks.length);
      const encodedParts = carrier.chunks.map((chunk: any) => {
        const data = readFileSync(resolve(root, chunk.path));
        expect(data.length).toBe(chunk.characters);
        expect(sha256(data)).toBe(chunk.sha256);
        expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
        return data.toString("ascii");
      });
      expect(carrier.concatenationOrder).toEqual(
        carrier.chunks.map((chunk: any) => chunk.path),
      );
      const encoded = encodedParts.join("");
      expect(encoded.length).toBe(carrier.base64Characters);
      expect(sha256(encoded)).toBe(carrier.base64Sha256);
      const archive = Buffer.from(encoded, "base64");
      expect(archive.length).toBe(carrier.decodedObject.bytes);
      expect(sha256(archive)).toBe(carrier.decodedObject.sha256);
      expect(admission.package.materializedInRepository).toBe(false);
      expect(admission.package.reconstructableFromCarrier).toBe(true);

      const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-merge-terminal-"));
      const archivePath = join(tempRoot, admission.package.filename);
      try {
        writeFileSync(archivePath, archive);
        const inspect = spawnSync(python(), ["-c", [
          "import pathlib,sys,zipfile",
          "p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
          "z=zipfile.ZipFile(p); infos=z.infolist()",
          `assert len(infos)==${carrier.decodedObject.expandedFileCount}`,
          "assert all(not pathlib.PurePosixPath(i.filename).is_absolute() for i in infos)",
          "assert all('..' not in pathlib.PurePosixPath(i.filename).parts for i in infos)",
          "assert all('\\\\' not in i.filename for i in infos)",
          "z.extractall(out)",
        ].join(";"), archivePath, tempRoot], { encoding: "utf8" });
        expect(inspect.status, inspect.stderr).toBe(0);
        const component = resolve(tempRoot, spec.componentId);
        const verify = spawnSync(python(), [resolve(component, "verify.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" } });
        expect(verify.status, verify.stderr).toBe(0);
        expect(JSON.parse(verify.stdout)).toMatchObject({ passed: spec.verify, total: spec.verify, status: "PASS" });
        const campaign = spawnSync(python(), [resolve(component, "synthetic_campaign.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" }, timeout: 180_000 });
        expect(campaign.status, campaign.stderr).toBe(0);
        expect(JSON.parse(campaign.stdout)).toMatchObject({ passed: spec.campaign, total: spec.campaign, status: "PASS", fakeGhUsed: true });
      } finally { rmSync(tempRoot, { recursive: true, force: true }); }
    });
  }

  it("retains all upstream holds and effect boundaries", () => {
    const mergeAdmission = JSON.parse(readFileSync(resolve(process.cwd(), "asoiaf/public/review/agot-pull-request-merge-executor-v1/ADMISSION.json"), "utf8"));
    const postAdmission = JSON.parse(readFileSync(resolve(process.cwd(), "asoiaf/public/review/agot-post-merge-admission-verifier-v1/ADMISSION.json"), "utf8"));
    expect(mergeAdmission.counts).toEqual({ automaticCanonPromotions: 0, automaticGraphMutations: 0, postMergeAdmissionsVerified: 0, realPullRequestsMerged: 0, realValidatedMergeRequestsConsumed: 0 });
    expect(mergeAdmission.authorityBoundary).toMatchObject({ carrierReconstructionIsNotMergeAuthorization: true, mergeReceiptIsNotPostMergeAdmission: true, postMergeAdmissionVerified: false, canonEffect: "none", graphEffect: "none" });
    expect(postAdmission.upstream).toMatchObject({ componentId: "asoiaf-agot-pull-request-merge-executor-v1", packageBytes: 14981, packageSha256: "7d9ac9f7e63ea603ae14dc37aca972233c10e190a2fc8665652c0d9891bfae8b" });
    expect(postAdmission.authorityBoundary).toMatchObject({ carrierReconstructionIsNotPostMergeVerification: true, repositoryAdmissionVerified: false, canonEffectActivated: false, graphEffectActivated: false, remoteMutationExecuted: false });
  });
});
