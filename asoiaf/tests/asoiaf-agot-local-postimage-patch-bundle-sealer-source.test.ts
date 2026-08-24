import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const componentId = "asoiaf-agot-local-postimage-patch-bundle-sealer-v1";
const componentRoot = resolve(
  repositoryRoot,
  "asoiaf/public/review/agot-local-postimage-patch-bundle-sealer-v1",
);
const carrier = JSON.parse(
  readFileSync(resolve(componentRoot, "CARRIER.json"), "utf8"),
);
const admission = JSON.parse(
  readFileSync(resolve(componentRoot, "ADMISSION.json"), "utf8"),
);
const worktreeRoot = resolve(
  repositoryRoot,
  "asoiaf/public/review/agot-repository-patch-worktree-executor-v1",
);
const worktreeCarrier = JSON.parse(
  readFileSync(resolve(worktreeRoot, "CARRIER.json"), "utf8"),
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

function run(
  command: string,
  args: string[],
  cwd: string,
  timeout = 240_000,
) {
  const completed = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: environment,
    timeout,
  });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return completed;
}

function reconstructCarrier(root: string, manifest: any): Buffer {
  const chunks = manifest.concatenationOrder.map((relative: string) =>
    readFileSync(resolve(root, relative)),
  );
  for (const entry of manifest.chunks) {
    const value = readFileSync(resolve(root, entry.path));
    expect(value.length).toBe(entry.characters);
    expect(sha256(value)).toBe(entry.sha256);
    expect(gitBlob(value)).toBe(entry.gitBlobSha1);
  }
  const encoded = Buffer.concat(chunks);
  expect(encoded.length).toBe(manifest.base64Characters);
  expect(sha256(encoded)).toBe(manifest.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(manifest.decodedObject.bytes);
  expect(sha256(archive)).toBe(manifest.decodedObject.sha256);
  return archive;
}

function safeExtractTarGz(archive: string, output: string) {
  run(
    python(),
    [
      "-W",
      "error",
      "-S",
      "-c",
      [
        "import pathlib,sys,tarfile",
        "a=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2])",
        "with tarfile.open(a,'r:gz') as t:",
        " m=t.getmembers()",
        " assert all(not pathlib.PurePosixPath(x.name).is_absolute() for x in m)",
        " assert all('..' not in pathlib.PurePosixPath(x.name).parts for x in m)",
        " assert all('\\\\' not in x.name for x in m)",
        " assert all(not (x.issym() or x.islnk() or x.isdev() or x.isfifo()) for x in m)",
        " t.extractall(o,filter='data')",
      ].join("\n"),
      archive,
      output,
    ],
    repositoryRoot,
  );
}

function safeExtractZip(archive: string, output: string) {
  run(
    python(),
    [
      "-W",
      "error",
      "-S",
      "-c",
      [
        "import pathlib,stat,sys,zipfile",
        "a=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2])",
        "z=zipfile.ZipFile(a);m=z.infolist()",
        "assert all(not pathlib.PurePosixPath(x.filename).is_absolute() for x in m)",
        "assert all('..' not in pathlib.PurePosixPath(x.filename).parts for x in m)",
        "assert all('\\\\' not in x.filename for x in m)",
        "assert all(stat.S_IFMT(x.external_attr>>16)!=stat.S_IFLNK for x in m)",
        "assert z.testzip() is None",
        "z.extractall(o)",
      ].join(";"),
      archive,
      output,
    ],
    repositoryRoot,
  );
}

describe("AGOT local-postimage patch-bundle sealer exact carrier", () => {
  it("reconstructs and qualifies the exact public-safe source package", () => {
    expect(carrier.componentId).toBe(componentId);
    expect(carrier.encoding).toBe("RFC4648-base64-no-whitespace");
    const temporary = mkdtempSync(join(tmpdir(), "axm-patch-bundle-source-"));
    try {
      const archive = reconstructCarrier(componentRoot, carrier);
      const archivePath = join(temporary, carrier.decodedObject.filename);
      writeFileSync(archivePath, archive);
      const extracted = join(temporary, "extracted");
      safeExtractTarGz(archivePath, extracted);
      const sourceRoot = resolve(
        extracted,
        "asoiaf/public/review/agot-local-postimage-patch-bundle-sealer-v1",
      );
      const verify = run(
        python(),
        ["-W", "error", "-S", resolve(sourceRoot, "verify.py")],
        sourceRoot,
      );
      expect(JSON.parse(verify.stdout)).toMatchObject({
        status: "PASS",
        passed: 199,
        total: 199,
        realPatchBundlesSealed: 0,
        realWorktreesModified: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
      const synthetic = run(
        python(),
        ["-W", "error", "-S", resolve(sourceRoot, "synthetic_campaign.py")],
        sourceRoot,
      );
      expect(JSON.parse(synthetic.stdout)).toMatchObject({
        status: "PASS",
        passed: 62,
        total: 62,
        noncopyrightedFixtureOnly: true,
        privateSourceTextUsed: false,
        realPatchBundlesSealed: 0,
        realWorktreesModified: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
      expect(admission.qualification).toMatchObject({
        componentVerifier: { passed: 199, total: 199, warningsAsErrors: true },
        syntheticCampaign: {
          passed: 62,
          total: 62,
          noncopyrightedFixtureOnly: true,
        },
        tarGzipArchiveReplay: true,
        worktreeExecutorCompatibilityReplay: true,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("feeds the admitted clean-worktree executor without reopening interpretation", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-patch-bundle-compat-"));
    try {
      const componentArchive = reconstructCarrier(componentRoot, carrier);
      const componentArchivePath = join(temporary, carrier.decodedObject.filename);
      writeFileSync(componentArchivePath, componentArchive);
      const componentExtracted = join(temporary, "component");
      safeExtractTarGz(componentArchivePath, componentExtracted);
      const sourceRoot = resolve(
        componentExtracted,
        "asoiaf/public/review/agot-local-postimage-patch-bundle-sealer-v1",
      );

      const executorArchive = reconstructCarrier(worktreeRoot, worktreeCarrier);
      const executorArchivePath = join(
        temporary,
        worktreeCarrier.decodedObject.filename,
      );
      writeFileSync(executorArchivePath, executorArchive);
      const executorExtracted = join(temporary, "executor");
      safeExtractZip(executorArchivePath, executorExtracted);
      const executorRoot = resolve(
        executorExtracted,
        "asoiaf-agot-repository-patch-worktree-executor-v1",
      );

      const repository = join(temporary, "repository");
      run("git", ["init", "-q", repository], temporary);
      run("git", ["config", "user.name", "Fixture Git Actor"], repository);
      run(
        "git",
        ["config", "user.email", "fixture@example.invalid"],
        repository,
      );
      run(
        "git",
        ["remote", "add", "origin", "BigBirdReturns/axm-canon"],
        repository,
      );
      run("git", ["commit", "--allow-empty", "-q", "-m", "fixture base"], repository);
      const base = run("git", ["rev-parse", "HEAD"], repository).stdout.trim();
      const branch = "feature/asoiaf-agot/patch-bundle-compatibility-001";
      run("git", ["checkout", "-q", "-b", branch], repository);

      const fixture = join(temporary, "fixture");
      const campaign = run(
        python(),
        [
          "-W",
          "error",
          "-S",
          resolve(sourceRoot, "synthetic_campaign.py"),
          "--emit-compatibility-fixture",
          fixture,
          "--expected-base-commit",
          base,
          "--feature-branch",
          branch,
          "--repository-identity",
          "BigBirdReturns/axm-canon",
        ],
        sourceRoot,
      );
      expect(JSON.parse(campaign.stdout)).toMatchObject({
        status: "PASS",
        passed: 62,
        total: 62,
        compatibilityFixture: {
          status: "PASS_COMPATIBILITY_FIXTURE_EMITTED",
          expectedBaseCommit: base,
          featureBranch: branch,
          repositoryIdentity: "BigBirdReturns/axm-canon",
          realRepositoryEffect: "none",
          canonEffect: "none",
          graphEffect: "none",
        },
      });

      const bundle = resolve(fixture, "inputs/bundle");
      const validation = resolve(fixture, "inputs/bundle-validation.json");
      const authorization = resolve(fixture, "worktree-authorization.json");
      const preflightReceipt = resolve(temporary, "preflight-receipt.json");
      const preflight = run(
        python(),
        [
          "-W",
          "error",
          "-S",
          resolve(executorRoot, "execute_worktree.py"),
          "preflight",
          "--repo",
          repository,
          "--bundle",
          bundle,
          "--validation",
          validation,
          "--authorization",
          authorization,
          "--receipt",
          preflightReceipt,
        ],
        executorRoot,
      );
      expect(JSON.parse(preflight.stdout)).toMatchObject({
        status: "PASS_LOCAL_FEATURE_WORKTREE_READY_FOR_EXPLICIT_APPLY",
        headCommit: base,
        branch,
        targetPaths: [
          "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
          "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
        ],
        preimagesVerified: true,
        gitIndexModified: false,
        gitCommitCreated: false,
        localReferenceUpdated: false,
        remoteEffect: "none",
        canonEffect: "none",
        graphEffect: "none",
      });

      const applyReceipt = resolve(temporary, "apply-receipt.json");
      const apply = run(
        python(),
        [
          "-W",
          "error",
          "-S",
          resolve(executorRoot, "execute_worktree.py"),
          "apply",
          "--repo",
          repository,
          "--bundle",
          bundle,
          "--validation",
          validation,
          "--authorization",
          authorization,
          "--receipt",
          applyReceipt,
          "--apply",
        ],
        executorRoot,
      );
      expect(JSON.parse(apply.stdout)).toMatchObject({
        status:
          "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",
        headCommitUnchanged: base,
        branch,
        changedPaths: [
          "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
          "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
        ],
        gitIndexModified: false,
        gitCommitCreated: false,
        localReferenceUpdated: false,
        remotePushExecuted: false,
        pullRequestOpened: false,
        canonEffect: "none",
        graphEffect: "none",
      });
      expect(run("git", ["rev-parse", "HEAD"], repository).stdout.trim()).toBe(
        base,
      );
      expect(
        run("git", ["diff", "--cached", "--name-only"], repository).stdout.trim(),
      ).toBe("");
      expect(
        run("git", ["symbolic-ref", "--short", "HEAD"], repository).stdout.trim(),
      ).toBe(branch);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
