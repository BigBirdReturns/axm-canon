import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-named-human-worktree-diff-review-recorder-v1";
const repositoryDirectory = "agot-named-human-worktree-diff-review-recorder-v1";
const root = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
const standing = JSON.parse(readFileSync(resolve(root, "CURRENT_STANDING.json"), "utf8"));
const python = () => process.platform === "win32" ? "python" : "python3";
const environment = { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" };
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function reconstructZip(component: string, temporary: string): string {
  const componentRoot = resolve(process.cwd(), "asoiaf/public/review", component);
  const carrier = JSON.parse(readFileSync(resolve(componentRoot, "CARRIER.json"), "utf8"));
  const encoded = Buffer.concat(carrier.concatenationOrder.map((path: string) => readFileSync(resolve(componentRoot, path))));
  expect(encoded.length).toBe(carrier.base64Characters);
  expect(sha256(encoded)).toBe(carrier.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(carrier.decodedObject.bytes);
  expect(sha256(archive)).toBe(carrier.decodedObject.sha256);
  const archivePath = resolve(temporary, carrier.decodedObject.filename);
  writeFileSync(archivePath, archive);
  const output = resolve(temporary, `${component}-extracted`);
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", [
    "import pathlib,stat,sys,zipfile",
    "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
    "with zipfile.ZipFile(p) as a:",
    " i=a.infolist();assert a.testzip() is None",
    " assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
    " assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
    " assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
    " a.extractall(o)",
  ].join("\n"), archivePath, output], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr).toBe(0);
  return resolve(output, component);
}

describe("AGOT named-human worktree diff-review recorder repository source", () => {
  it("binds the exact admitted upstream and downstream schemas", () => {
    expect(contract).toMatchObject({
      schema: "axm-asoiaf-agot-named-human-worktree-diff-review-recorder-contract/1",
      componentId,
      upstream: {
        componentId: "asoiaf-agot-repository-patch-worktree-executor-v1",
        admissionCommit: "d558a4d2304f9dc41c73e25092dc381d5e7e0498",
        requiredReceiptStatus: "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",
      },
      downstream: {
        componentId: "asoiaf-agot-local-feature-commit-object-sealer-v1",
        admissionCommit: "70da97f7f92e792eaad32fdc7a456c598347bd78",
        requiredAuthorizationSchema: "axm-asoiaf-human-diff-review-authorization/2",
        requiredApprovalDecision: "approve-local-commit-object",
      },
      successStatus: "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD",
    });
  });

  it("replays exactly 158 static qualification checks", () => {
    const completed = spawnSync(python(), ["-W", "error", "-S", resolve(root, "verify.py")], { encoding: "utf8", env: environment });
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 158,
      total: 158,
      realWorktreeApplicationReceiptsConsumed: 0,
      realHumanDiffReviewsConsumed: 0,
      realDiffReviewAuthorizationsSealed: 0,
      realCommitObjectsCreated: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("replays exactly 98 noncopyrighted adversarial cases", () => {
    const completed = spawnSync(python(), ["-W", "error", "-S", resolve(root, "synthetic_campaign.py")], { encoding: "utf8", env: environment, timeout: 180_000 });
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 98,
      total: 98,
      noncopyrightedFixtureOnly: true,
      privateSourceTextUsed: false,
      realHumanDiffReviewsConsumed: 0,
      realDiffReviewAuthorizationsSealed: 0,
      realCommitObjectsCreated: 0,
    });
  });

  it("feeds the exact admitted commit-object sealer after the exact worktree executor", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-diff-review-compat-"));
    try {
      const worktreeExecutor = reconstructZip("asoiaf-agot-repository-patch-worktree-executor-v1", temporary);
      const commitSealer = reconstructZip("asoiaf-agot-local-feature-commit-object-sealer-v1", temporary);
      const completed = spawnSync(python(), [
        "-W", "error", "-S", resolve(root, "compatibility_campaign.py"),
        "--worktree-executor", worktreeExecutor,
        "--commit-sealer", commitSealer,
      ], { encoding: "utf8", env: environment, timeout: 180_000 });
      expect(completed.status, completed.stderr).toBe(0);
      expect(JSON.parse(completed.stdout)).toMatchObject({
        status: "PASS",
        passed: 31,
        total: 31,
        worktreeExecutorCompatibility: "PASS",
        commitObjectSealerCompatibility: "PASS",
        noncopyrightedFixtureOnly: true,
        realWorktreePatchesApplied: 0,
        realHumanDiffReviewsConsumed: 0,
        realCommitObjectsCreated: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect substantive census", () => {
    expect(standing.status).toBe("REPOSITORY_SOURCE_CANDIDATE_REAL_WORKTREE_DIFF_REVIEW_WITHHELD");
    expect(Object.values(standing.counts)).toEqual(Object.values(standing.counts).map(() => 0));
    expect(standing).toMatchObject({
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      runtimeRepositoryEffect: "none",
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
