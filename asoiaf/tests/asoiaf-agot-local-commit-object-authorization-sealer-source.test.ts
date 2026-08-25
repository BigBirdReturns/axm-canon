import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-local-commit-object-authorization-sealer-v1";
const repositoryDirectory = "agot-local-commit-object-authorization-sealer-v1";
const root = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const reviewRecorder = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-named-human-worktree-diff-review-recorder-v1",
);
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
const standing = JSON.parse(
  readFileSync(resolve(root, "CURRENT_STANDING.json"), "utf8"),
);
const python = () => (process.platform === "win32" ? "python" : "python3");
const environment = {
  ...process.env,
  PYTHONWARNINGS: "error",
  PYTHONSAFEPATH: "1",
};
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

function reconstructZip(component: string, temporary: string): string {
  const repositoryComponent = component.startsWith("asoiaf-")
    ? component.slice("asoiaf-".length)
    : component;
  const componentRoot = resolve(
    process.cwd(),
    "asoiaf/public/review",
    repositoryComponent,
  );
  const carrier = JSON.parse(
    readFileSync(resolve(componentRoot, "CARRIER.json"), "utf8"),
  );
  const encoded = Buffer.concat(
    carrier.concatenationOrder.map((path: string) =>
      readFileSync(resolve(componentRoot, path)),
    ),
  );
  expect(encoded.length).toBe(carrier.base64Characters);
  expect(sha256(encoded)).toBe(carrier.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(carrier.decodedObject.bytes);
  expect(sha256(archive)).toBe(carrier.decodedObject.sha256);
  const archivePath = resolve(temporary, carrier.decodedObject.filename);
  writeFileSync(archivePath, archive);
  const output = resolve(temporary, `${component}-extracted`);
  const completed = spawnSync(
    python(),
    [
      "-W",
      "error",
      "-S",
      "-c",
      [
        "import pathlib,stat,sys,zipfile",
        "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
        "with zipfile.ZipFile(p) as a:",
        " i=a.infolist();assert a.testzip() is None",
        " assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
        " assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
        " assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
        " a.extractall(o)",
      ].join("\n"),
      archivePath,
      output,
    ],
    { encoding: "utf8", env: environment },
  );
  expect(completed.status, completed.stderr).toBe(0);
  return resolve(output, component);
}

describe("AGOT local commit-object authorization sealer repository source", () => {
  it("binds the exact admitted review recorder and commit-object sealer", () => {
    expect(contract).toMatchObject({
      schema:
        "axm-asoiaf-agot-local-commit-object-authorization-sealer-contract/1",
      componentId,
      upstream: {
        componentId:
          "asoiaf-agot-named-human-worktree-diff-review-recorder-v1",
        admissionCommit: "566200a79ad132af9e2c31799863c3216e53872e",
        requiredAuthorizationSchema:
          "axm-asoiaf-human-diff-review-authorization/2",
        requiredValidationStatus:
          "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR",
      },
      downstream: {
        componentId: "asoiaf-agot-local-feature-commit-object-sealer-v1",
        admissionCommit: "70da97f7f92e792eaad32fdc7a456c598347bd78",
        requiredAuthorizationSchema:
          "axm-asoiaf-commit-object-authorization/2",
        requiredAuthorizationDecision: "create-unreferenced-commit-object",
      },
      successStatus:
        "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_SEALED_OBJECT_CREATION_WITHHELD",
      nextAuthorityHold: "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD",
    });
  });

  it("replays exactly 140 static qualification checks", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "verify.py")],
      { encoding: "utf8", env: environment },
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 140,
      total: 140,
      realDiffReviewAuthorizationsConsumed: 0,
      realReviewReceiptsConsumed: 0,
      realReviewValidationsConsumed: 0,
      realCommitObjectPlansConsumed: 0,
      realCommitObjectAuthorizationsSealed: 0,
      realCommitObjectsCreated: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("replays exactly 76 noncopyrighted adversarial cases", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "synthetic_campaign.py")],
      { encoding: "utf8", env: environment, timeout: 180_000 },
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 76,
      total: 76,
      noncopyrightedFixtureOnly: true,
      privateSourceTextUsed: false,
      realDiffReviewAuthorizationsConsumed: 0,
      realCommitObjectAuthorizationsSealed: 0,
      realCommitObjectsCreated: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("feeds the exact admitted commit-object sealer from the exact review recorder", () => {
    const temporary = mkdtempSync(
      resolve(tmpdir(), "axm-agot-commit-auth-compat-"),
    );
    try {
      const commitSealer = reconstructZip(
        "asoiaf-agot-local-feature-commit-object-sealer-v1",
        temporary,
      );
      const completed = spawnSync(
        python(),
        [
          "-W",
          "error",
          "-S",
          resolve(root, "compatibility_campaign.py"),
          "--review-recorder",
          reviewRecorder,
          "--commit-sealer",
          commitSealer,
        ],
        { encoding: "utf8", env: environment, timeout: 180_000 },
      );
      expect(completed.status, completed.stderr).toBe(0);
      expect(JSON.parse(completed.stdout)).toMatchObject({
        status: "PASS",
        passed: 38,
        total: 38,
        reviewRecorderCompatibility: "PASS",
        commitObjectSealerCompatibility: "PASS",
        noncopyrightedFixtureOnly: true,
        realHumanDiffReviewsConsumed: 0,
        realCommitObjectAuthorizationsSealed: 0,
        realCommitObjectsCreated: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect substantive census", () => {
    expect(standing.status).toBe(
      "REPOSITORY_SOURCE_CANDIDATE_REAL_COMMIT_OBJECT_AUTHORIZATION_WITHHELD",
    );
    expect(Object.values(standing.counts)).toEqual(
      Object.values(standing.counts).map(() => 0),
    );
    expect(standing).toMatchObject({
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      runtimeRepositoryEffect: "none",
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
