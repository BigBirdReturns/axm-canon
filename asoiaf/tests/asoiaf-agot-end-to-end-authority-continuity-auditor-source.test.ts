import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const root = resolve(
  repositoryRoot,
  "asoiaf/public/review/agot-end-to-end-authority-continuity-auditor-v1",
);
const python = () => (process.platform === "win32" ? "python" : "python3");
const environment = {
  ...process.env,
  PYTHONWARNINGS: "error",
  PYTHONSAFEPATH: "1",
  GIT_OPTIONAL_LOCKS: "0",
};
const run = (args: string[], cwd = repositoryRoot) =>
  spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    env: environment,
    timeout: 240_000,
  });

describe("AGOT end-to-end authority-continuity auditor repository source", () => {
  it("declares a sixteen-step public-metadata audit with every runtime effect withheld", () => {
    const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
    const standing = JSON.parse(
      readFileSync(resolve(root, "CURRENT_STANDING.json"), "utf8"),
    );
    expect(contract).toMatchObject({
      schema: "axm-asoiaf-agot-end-to-end-authority-continuity-auditor-contract/1",
      componentId: "asoiaf-agot-end-to-end-authority-continuity-auditor-v1",
      scope: {
        expectedStepCount: 16,
        orderedComponentIdentityRequired: true,
        orderedStatusBoundaryRequired: true,
        orderedAuthorityHoldRequired: true,
      },
      success: {
        status:
          "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD",
        nextAuthorityHold: "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD",
      },
      authorityBoundary: {
        repositoryFilesWrittenByRuntime: 0,
        worktreesModifiedByRuntime: 0,
        liveIndexesModifiedByRuntime: 0,
        commitsCreatedByRuntime: 0,
        referencesUpdatedByRuntime: 0,
        remotePushesByRuntime: 0,
        pullRequestsOpenedByRuntime: 0,
        automaticCanonEffect: "none",
        automaticGraphEffect: "none",
      },
    });
    expect(Object.values(standing.counts)).toEqual(
      Object.values(standing.counts).map(() => 0),
    );
  });

  it("replays exactly 133 static checks under warnings-as-errors", () => {
    const completed = run([
      python(),
      "-W",
      "error",
      "-S",
      resolve(root, "verify.py"),
    ]);
    expect(completed.status, completed.stderr || completed.stdout).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 133,
      total: 133,
      realPrivateParagraphsConsumed: 0,
      realNamedHumanTransactionsConsumed: 0,
      componentRuntimesExecuted: 0,
      repositoryFilesWrittenByRuntime: 0,
      worktreesModifiedByRuntime: 0,
      liveIndexesModifiedByRuntime: 0,
      commitsCreatedByRuntime: 0,
      referencesUpdatedByRuntime: 0,
      remotePushesByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      privateSourceTextUsed: false,
      privatePayloadUsed: false,
    });
  });

  it("replays exactly 35 noncopyrighted adversarial cases", () => {
    const completed = run([
      python(),
      "-W",
      "error",
      "-S",
      resolve(root, "synthetic_campaign.py"),
    ]);
    expect(completed.status, completed.stderr || completed.stdout).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "PASS",
      passed: 35,
      total: 35,
      noncopyrightedFixtureOnly: true,
      privateSourceTextUsed: false,
      privatePayloadUsed: false,
      realPrivateParagraphsConsumed: 0,
      realNamedHumanTransactionsConsumed: 0,
      componentRuntimesExecuted: 0,
      repositoryFilesWrittenByRuntime: 0,
      worktreesModifiedByRuntime: 0,
      liveIndexesModifiedByRuntime: 0,
      commitsCreatedByRuntime: 0,
      referencesUpdatedByRuntime: 0,
      remotePushesByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("audits and independently validates the current repository lane without changing it", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-lane-audit-"));
    const receipt = resolve(temporary, "CONTINUITY_RECEIPT.json");
    try {
      const beforeHead = run(["git", "rev-parse", "HEAD"]).stdout.trim();
      const beforeTree = run(["git", "rev-parse", "HEAD^{tree}"]).stdout.trim();
      const beforeStatus = run([
        "git",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]).stdout;

      const audited = run([
        python(),
        "-W",
        "error",
        "-S",
        resolve(root, "audit_lane.py"),
        "--repository-root",
        repositoryRoot,
        "--output",
        receipt,
      ]);
      expect(audited.status, audited.stderr || audited.stdout).toBe(0);
      const auditReceipt = JSON.parse(audited.stdout);
      expect(auditReceipt).toMatchObject({
        status:
          "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD",
        nextAuthorityHold: "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD",
        lane: {
          stepCount: 16,
          firstComponent: "asoiaf-agot-local-human-review-workstation-v1",
          lastComponent: "asoiaf-agot-post-merge-admission-verifier-v1",
        },
        authorityBoundary: {
          auditIsNotHumanReview: true,
          auditIsNotTransactionExecution: true,
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
        },
      });

      const validated = run([
        python(),
        "-W",
        "error",
        "-S",
        resolve(root, "validate_receipt.py"),
        "--receipt",
        receipt,
      ]);
      expect(validated.status, validated.stderr || validated.stdout).toBe(0);
      expect(JSON.parse(validated.stdout)).toMatchObject({
        status: "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_RECEIPT_VALID",
        stepCount: 16,
        repositoryFilesWrittenByRuntime: 0,
        worktreesModifiedByRuntime: 0,
        liveIndexesModifiedByRuntime: 0,
        commitsCreatedByRuntime: 0,
        referencesUpdatedByRuntime: 0,
        remotePushesByRuntime: 0,
        pullRequestsOpenedByRuntime: 0,
        canonEffect: "none",
        graphEffect: "none",
      });

      expect(run(["git", "rev-parse", "HEAD"]).stdout.trim()).toBe(beforeHead);
      expect(run(["git", "rev-parse", "HEAD^{tree}"]).stdout.trim()).toBe(beforeTree);
      expect(
        run(["git", "status", "--porcelain=v1", "--untracked-files=all"]).stdout,
      ).toBe(beforeStatus);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
