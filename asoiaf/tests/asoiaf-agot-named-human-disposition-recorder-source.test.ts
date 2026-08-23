import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-named-human-disposition-recorder-v1",
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

describe("AGOT named-human disposition recorder repository source", () => {
  it("binds the admitted local review workstation and retains the next-effect hold", () => {
    expect(contract).toMatchObject({
      schema: "axm-asoiaf-agot-named-human-disposition-recorder-contract/1",
      componentId: "asoiaf-agot-named-human-disposition-recorder-v1",
      upstream: {
        componentId: "asoiaf-agot-local-human-review-workstation-v1",
        admissionCommit: "85b6ad80a7e115bb867d729ec8fccb8a9b76b79e",
        requiredValidationStatus: "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR",
      },
      nextAuthorityHolds: {
        ADMIT_EXACT_PROPOSITION: "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD",
        REJECT_EXACT_PROPOSITION: "CLOSE_INTAKE_WITHHELD",
        RETURN_FOR_CORRECTION: "CORRECTED_INTAKE_WITHHELD",
        DEFER_PENDING_EVIDENCE: "ADDITIONAL_EVIDENCE_WITHHELD",
      },
    });
  });

  it("replays exactly 52 static qualification checks under warnings-as-errors", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "verify.py")],
      { encoding: "utf8", env: environment },
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 52,
      total: 52,
      realPrivateParagraphsConsumed: 0,
      realValidatedIntakesConsumed: 0,
      realNamedHumanDispositionsConsumed: 0,
      realPropositionAdmissions: 0,
      realLocalFeatureMaterializationRequests: 0,
      realLocalFeaturesMaterialized: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      privateSourceTextUsed: false,
      privatePayloadUsed: false,
    });
  });

  it("replays exactly 20 noncopyrighted adversarial cases", () => {
    const completed = spawnSync(
      python(),
      ["-W", "error", "-S", resolve(root, "synthetic_campaign.py")],
      { encoding: "utf8", env: environment, timeout: 180_000 },
    );
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 20,
      total: 20,
      noncopyrightedFixtureOnly: true,
      privateSourceTextUsed: false,
      realNamedHumanDispositionsConsumed: 0,
      realLocalFeatureMaterializationRequests: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("preserves a zero-effect substantive census", () => {
    expect(standing.status).toBe(
      "REPOSITORY_SOURCE_CANDIDATE_REAL_DISPOSITION_WITHHELD",
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
