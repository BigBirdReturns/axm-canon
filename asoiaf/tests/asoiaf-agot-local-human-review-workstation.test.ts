import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-local-human-review-workstation-v1",
);
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
const source = JSON.parse(readFileSync(resolve(root, "CANDIDATE_SOURCE.json"), "utf8"));
const server = readFileSync(resolve(root, "review_server.py"), "utf8");
const validator = readFileSync(resolve(root, "validate_intakes.py"), "utf8");

function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("AGOT local named-human review workstation", () => {
  it("passes its 40-check source verifier under warnings-as-errors", () => {
    const run = spawnSync(python(), [resolve(root, "verify.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      componentId: "asoiaf-agot-local-human-review-workstation-v1",
      passed: 40,
      total: 40,
      failed: 0,
      status: "PASS",
      warningsAsErrors: true,
      candidateCount: 45,
      locatorCount: 31,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      savedRealReviewIntakes: 0,
      validatedRealReviewIntakes: 0,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("passes the noncopyrighted twelve-check loopback campaign", () => {
    const run = spawnSync(python(), [resolve(root, "synthetic_campaign.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
      timeout: 120_000,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      componentId: "asoiaf-agot-local-human-review-workstation-v1",
      passed: 12,
      total: 12,
      failed: 0,
      status: "PASS",
      warningsAsErrors: true,
      fixtureSourceTextOnly: true,
      realPrivateSourceUsed: false,
      realReviewIntakesSaved: 0,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("binds only the exact private database and public-safe candidate source", () => {
    expect(contract.requiredPrivateDatabase).toEqual({
      filename: "ASOIAF-PRIVATE-CORPUS.sqlite3",
      bytes: 106151936,
      sha256: "71cf5fe7b22ee33e5deb21440acce40dd2102771edaddff2d3e4853fc5d50843",
      repositoryEligible: false,
      sourceTextPresent: false,
    });
    expect(contract.candidateInput).toEqual({
      filename: "CANDIDATES.json",
      atomicCandidates: 45,
      exactPrivateLocators: 31,
      sourceTextPresent: false,
    });
    expect(source.counts).toEqual({ atomicCandidates: 45, exactPrivateLocators: 31 });
    expect(source.sourceTextPresent).toBe(false);
    expect(source.privatePayloadPresent).toBe(false);
  });

  it("enforces loopback, read-only SQLite, CSRF, no source persistence, and zero execution", () => {
    expect(contract.networkBoundary).toMatchObject({
      nonLoopbackBindingForbidden: true,
      externalRequestsRequired: false,
    });
    expect(contract.databaseBoundary).toEqual({
      sqliteUriMode: "ro",
      immutable: true,
      queryOnly: true,
      copyAllowed: false,
      modifyAllowed: false,
    });
    expect(contract.reviewBoundary).toMatchObject({
      namedReviewerRequired: true,
      oneCandidateAtATime: true,
      csrfRequired: true,
      sourceTextMayBePersisted: false,
      sourceExcerptSha256Required: true,
      validatorMayExecuteTransaction: false,
    });
    expect(server).toContain("mode=ro&immutable=1");
    expect(server).toContain("PRAGMA query_only=ON");
    expect(server).toContain("non-loopback binding is forbidden");
    expect(server).toContain("CSRF refused");
    expect(server).toContain('"executed": False');
    expect(validator).not.toContain('paragraph["text"]');
    expect(validator).toContain("PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR");
  });
});
