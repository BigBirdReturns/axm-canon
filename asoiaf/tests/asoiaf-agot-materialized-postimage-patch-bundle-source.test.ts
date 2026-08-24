import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-materialized-postimage-patch-bundle-v1";
const repositoryDirectory = "agot-materialized-postimage-patch-bundle-v1";
const root = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const executorRoot = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-repository-patch-worktree-executor-v1",
);
const executorCarrier = JSON.parse(
  readFileSync(resolve(executorRoot, "CARRIER.json"), "utf8"),
);
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const gitBlob = (value: Buffer) =>
  createHash("sha1")
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest("hex");
const python = () => (process.platform === "win32" ? "python" : "python3");
const environment = {
  ...process.env,
  PYTHONWARNINGS: "error",
  PYTHONSAFEPATH: "1",
};

function reconstruct(carrierRoot: string, manifest: any): Buffer {
  expect(manifest.encoding).toBe("RFC4648-base64-no-whitespace");
  expect(manifest.chunks).toHaveLength(manifest.chunkCount);
  expect(manifest.chunks.map((entry: any) => entry.path)).toEqual(
    manifest.concatenationOrder,
  );
  const chunks = manifest.chunks.map((entry: any) => {
    const value = readFileSync(resolve(carrierRoot, entry.path));
    expect(value.length).toBe(entry.characters);
    expect(sha256(value)).toBe(entry.sha256);
    expect(gitBlob(value)).toBe(entry.gitBlobSha1);
    expect(value.toString("ascii")).not.toMatch(/\s/);
    return value;
  });
  const encoded = Buffer.concat(chunks);
  expect(encoded.length).toBe(manifest.base64Characters);
  expect(sha256(encoded)).toBe(manifest.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(manifest.decodedObject.bytes);
  expect(sha256(archive)).toBe(manifest.decodedObject.sha256);
  return archive;
}

function extract(archive: string, output: string, format: "tar.gz" | "zip"): void {
  const script = [
    "import pathlib,stat,sys,tarfile,zipfile",
    "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);f=sys.argv[3]",
    "o.mkdir(parents=True,exist_ok=False)",
    "def safe(n): q=pathlib.PurePosixPath(n); return (not q.is_absolute()) and ('..' not in q.parts) and ('\\\\' not in n)",
    "if f=='tar.gz':",
    " z=tarfile.open(p,'r:gz');m=z.getmembers()",
    " assert all(safe(x.name) for x in m)",
    " assert all(not (x.issym() or x.islnk() or x.isdev() or x.isfifo()) for x in m)",
    " z.extractall(o)",
    "else:",
    " z=zipfile.ZipFile(p);m=z.infolist()",
    " assert all(safe(x.filename) for x in m)",
    " assert all(stat.S_IFMT(x.external_attr>>16)!=stat.S_IFLNK for x in m)",
    " assert z.testzip() is None",
    " z.extractall(o)",
  ].join("\n");
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", script, archive, output, format], {
    encoding: "utf8",
    env: environment,
  });
  expect(completed.status, completed.stderr).toBe(0);
}

function filesBelow(rootPath: string): string[] {
  const results: string[] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) visit(path);
      else results.push(relative(rootPath, path).replaceAll("\\", "/"));
    }
  };
  visit(rootPath);
  return results.sort();
}

describe("AGOT materialized-postimage patch-bundle exact carrier", () => {
  it("reconstructs and safely extracts the exact source package", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-agot-postimage-handoff-"));
    try {
      const archiveBytes = reconstruct(root, carrier);
      const archivePath = resolve(temporary, carrier.decodedObject.filename);
      writeFileSync(archivePath, archiveBytes);
      const extracted = resolve(temporary, "extracted");
      extract(archivePath, extracted, "tar.gz");
      expect(filesBelow(extracted)).toEqual([...carrier.expandedPaths].sort());
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("replays exactly 174 static checks and 30 adversarial cases", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-agot-postimage-handoff-"));
    try {
      const archivePath = resolve(temporary, carrier.decodedObject.filename);
      writeFileSync(archivePath, reconstruct(root, carrier));
      const extracted = resolve(temporary, "extracted");
      extract(archivePath, extracted, "tar.gz");
      const source = resolve(
        extracted,
        "asoiaf/public/review",
        repositoryDirectory,
      );
      const verify = spawnSync(
        python(),
        ["-W", "error", "-S", resolve(source, "verify.py")],
        { encoding: "utf8", env: environment },
      );
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({
        status: "PASS",
        passed: 174,
        total: 174,
        realMaterializationReceiptsConsumed: 0,
        realPostimagePairsConsumed: 0,
        realPatchBundlesSealed: 0,
        realWorktreeApplications: 0,
        realRepositoryFilesWritten: 0,
        realLiveIndexesModified: 0,
        realCommitsCreated: 0,
        realReferencesUpdated: 0,
        realRemotePushes: 0,
        realPullRequestsOpened: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
      const synthetic = spawnSync(
        python(),
        ["-W", "error", "-S", resolve(source, "synthetic_campaign.py")],
        { encoding: "utf8", env: environment, timeout: 180_000 },
      );
      expect(synthetic.status, synthetic.stderr).toBe(0);
      expect(JSON.parse(synthetic.stdout)).toMatchObject({
        status: "PASS",
        passed: 30,
        total: 30,
        noncopyrightedFixtureOnly: true,
        privateSourceTextUsed: false,
        realMaterializationReceiptsConsumed: 0,
        realPostimagePairsConsumed: 0,
        realPatchBundlesSealed: 0,
        realWorktreeApplications: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("passes the actual admitted worktree executor without moving Git authority", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-agot-postimage-handoff-"));
    try {
      const newArchive = resolve(temporary, carrier.decodedObject.filename);
      writeFileSync(newArchive, reconstruct(root, carrier));
      const newExtracted = resolve(temporary, "new-extracted");
      extract(newArchive, newExtracted, "tar.gz");
      const source = resolve(
        newExtracted,
        "asoiaf/public/review",
        repositoryDirectory,
      );

      const oldArchive = resolve(temporary, executorCarrier.decodedObject.filename);
      writeFileSync(oldArchive, reconstruct(executorRoot, executorCarrier));
      const oldExtracted = resolve(temporary, "old-extracted");
      extract(oldArchive, oldExtracted, "zip");
      const executorSource = resolve(
        oldExtracted,
        "asoiaf-agot-repository-patch-worktree-executor-v1/execute_worktree.py",
      );
      const compatibility = spawnSync(
        python(),
        [
          "-W",
          "error",
          "-S",
          resolve(source, "compatibility_test.py"),
          "--executor-source",
          executorSource,
        ],
        { encoding: "utf8", env: environment, timeout: 180_000 },
      );
      expect(compatibility.status, compatibility.stderr).toBe(0);
      expect(JSON.parse(compatibility.stdout)).toMatchObject({
        status: "PASS",
        executorComponentId: "asoiaf-agot-repository-patch-worktree-executor-v1",
        applicationStanding:
          "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",
        liveIndexUnchanged: true,
        gitIndexModified: false,
        gitCommitCreated: false,
        localReferenceUpdated: false,
        remotePushExecuted: false,
        pullRequestOpened: false,
        canonEffect: "none",
        graphEffect: "none",
        privateSourceTextUsed: false,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("binds both admitted endpoints and preserves a zero-effect census", () => {
    expect(admission).toMatchObject({
      schema:
        "axm-asoiaf-agot-materialized-postimage-patch-bundle-carrier-admission/1",
      componentId,
      baseMainCommit: "ca74f4a51a18a754f21bfdbab8ca2782d3c5665b",
      upstream: {
        componentId: "asoiaf-agot-local-feature-postimage-materializer-v1",
        admissionCommit: "ca74f4a51a18a754f21bfdbab8ca2782d3c5665b",
        requiredReceiptStatus:
          "PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD",
      },
      downstreamCompatibility: {
        componentId: "asoiaf-agot-repository-patch-worktree-executor-v1",
        admissionCommit: "d558a4d2304f9dc41c73e25092dc381d5e7e0498",
        packageSha256:
          "02abfe23c19170796cda38750e80efa69cf090370dfb8f568f12e766ec704ff8",
      },
      qualification: {
        componentVerifier: { passed: 174, total: 174, warningsAsErrors: true },
        syntheticCampaign: {
          passed: 30,
          total: 30,
          noncopyrightedFixtureOnly: true,
        },
        admittedExecutorCompatibility: true,
      },
    });
    expect(Object.values(admission.counts)).toEqual(
      Object.values(admission.counts).map(() => 0),
    );
    expect(admission.authorityBoundary).toMatchObject({
      carrierReconstructionIsNotBundleExecution: true,
      bundleConstructionIsNotWorktreeApplication: true,
      repositoryFilesWrittenByRuntime: 0,
      worktreesModifiedByRuntime: 0,
      liveIndexesModifiedByRuntime: 0,
      commitsCreatedByRuntime: 0,
      referencesUpdatedByRuntime: 0,
      remotePushesByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
