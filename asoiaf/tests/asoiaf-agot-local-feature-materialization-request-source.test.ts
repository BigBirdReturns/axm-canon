import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-local-feature-materialization-request-v1",
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

describe("AGOT local-feature materialization request repository source", () => {
  it("binds the admitted disposition recorder and exact two-ledger target", () => {
    expect(contract).toMatchObject({
      schema: "axm-asoiaf-agot-local-feature-materialization-request-contract/1",
      componentId: "asoiaf-agot-local-feature-materialization-request-v1",
      upstream: {
        componentId: "asoiaf-agot-named-human-disposition-recorder-v1",
        admissionCommit: "d5898d092ec4091395612ac0f4c555334acec21e",
        requiredReceiptStatus:
          "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD",
        requiredDecision: "ADMIT_EXACT_PROPOSITION",
        requiredNextAuthorityHold:
          "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD",
      },
      successStatus:
        "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD",
      nextAuthorityHold: "LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD",
      repositoryTarget: {
        repository: "BigBirdReturns/axm-canon",
        baseBranch: "main",
        featureBranchPrefix: "feature/asoiaf-agot/",
        governedPaths: [
          "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
          "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
        ],
      },
    });
  });

  it("replays exactly 86 static checks under warnings-as-errors", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "verify.py")],
      { encoding: "utf8", env: environment },
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 86,
      total: 86,
      realDispositionReceiptsConsumed: 0,
      realAdmittedPropositionsConsumed: 0,
      realMaterializationPlansConsumed: 0,
      realMaterializationRequestsSealed: 0,
      realPostimagesMaterialized: 0,
      realRepositoryFilesWritten: 0,
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

  it("replays exactly 36 noncopyrighted adversarial cases", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "synthetic_campaign.py")],
      { encoding: "utf8", env: environment, timeout: 180_000 },
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 36,
      total: 36,
      noncopyrightedFixtureOnly: true,
      privateSourceTextUsed: false,
      privatePayloadUsed: false,
      realDispositionReceiptsConsumed: 0,
      realAdmittedPropositionsConsumed: 0,
      realMaterializationPlansConsumed: 0,
      realMaterializationRequestsSealed: 0,
      realPostimagesMaterialized: 0,
      realRepositoryFilesWritten: 0,
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
      "REPOSITORY_SOURCE_CANDIDATE_REAL_MATERIALIZATION_REQUEST_WITHHELD",
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
