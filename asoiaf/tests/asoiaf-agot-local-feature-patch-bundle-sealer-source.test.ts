import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-local-feature-patch-bundle-sealer-v1",
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

describe("AGOT local-feature patch-bundle sealer repository source", () => {
  it("binds the admitted materializer and retains compatibility as a separate hold", () => {
    expect(contract).toMatchObject({
      schema: "axm-asoiaf-agot-local-feature-patch-bundle-sealer-contract/1",
      componentId: "asoiaf-agot-local-feature-patch-bundle-sealer-v1",
      upstream: {
        componentId: "asoiaf-agot-local-feature-postimage-materializer-v1",
        admissionCommit: "ca74f4a51a18a754f21bfdbab8ca2782d3c5665b",
        requiredStatus:
          "PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD",
        requiredNextAuthorityHold: "LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD",
      },
      successStatus:
        "PASS_LOCAL_FEATURE_PATCH_BUNDLE_SEALED_WORKTREE_EXECUTOR_COMPATIBILITY_WITHHELD",
      nextAuthorityHold: "WORKTREE_EXECUTOR_COMPATIBILITY_VALIDATION_WITHHELD",
    });
  });

  it("replays the complete static qualification under warnings-as-errors", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "verify.py")],
      { encoding: "utf8", env: environment },
    );
    expect(completed.status, completed.stderr).toBe(0);
    const result = JSON.parse(completed.stdout);
    expect(result.status).toBe("PASS");
    expect(result.passed).toBe(result.total);
    expect(result.total).toBeGreaterThanOrEqual(100);
    expect(result).toMatchObject({
      realMaterializationReceiptsConsumed: 0,
      realPatchBundlesSealed: 0,
      realWorktreesModified: 0,
      realLiveIndexesModified: 0,
      realCommitsCreated: 0,
      realReferencesUpdated: 0,
      realRemotePushes: 0,
      realPullRequestsOpened: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      privateSourceTextUsed: false,
      privatePayloadUsed: false,
    });
  });

  it("replays the noncopyrighted adversarial campaign", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "synthetic_campaign.py")],
      { encoding: "utf8", env: environment, timeout: 180_000 },
    );
    expect(completed.status, completed.stderr).toBe(0);
    const result = JSON.parse(completed.stdout);
    expect(result.status).toBe("PASS");
    expect(result.passed).toBe(result.total);
    expect(result.total).toBeGreaterThanOrEqual(40);
    expect(result).toMatchObject({
      noncopyrightedFixtureOnly: true,
      privateSourceTextUsed: false,
      privatePayloadUsed: false,
      realMaterializationReceiptsConsumed: 0,
      realPatchBundlesSealed: 0,
      realWorktreesModified: 0,
      realLiveIndexesModified: 0,
      realCommitsCreated: 0,
      realReferencesUpdated: 0,
      realRemotePushes: 0,
      realPullRequestsOpened: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("preserves a zero-effect substantive census", () => {
    expect(standing.status).toBe(
      "REPOSITORY_SOURCE_CANDIDATE_REAL_PATCH_BUNDLE_WITHHELD",
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
