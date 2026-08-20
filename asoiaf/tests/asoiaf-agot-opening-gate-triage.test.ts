import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentRoot = resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-v1");
const sourcePath = resolve(process.cwd(), "asoiaf/public/corpus-v1/OPENING_GATE.json");
const triage = JSON.parse(readFileSync(resolve(componentRoot, "TRIAGE.json"), "utf8"));
const templates = JSON.parse(
  readFileSync(resolve(componentRoot, "DECISION_TEMPLATES.json"), "utf8"),
);
const sourceBytes = readFileSync(sourcePath);

function gitBlobSha1(data: Buffer): string {
  return createHash("sha1")
    .update(Buffer.from(`blob ${data.length}\0`, "utf8"))
    .update(data)
    .digest("hex");
}
function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("AGOT opening-gate structural triage", () => {
  it("binds the exact 31-record public source object", () => {
    const source = JSON.parse(sourceBytes.toString("utf8"));
    expect(gitBlobSha1(sourceBytes)).toBe("01624a17e21eb0c31d8273f3bf1063402b112fae");
    expect(source).toMatchObject({
      format: "axm-asoiaf-opening-gate/1",
      gateFingerprint:
        "sha256:b8a8cadc1f5a49f0704f1dbe4b38358d86a52ac27520fc193657c0ffb949cda4",
      recordCount: 31,
      humanReviewRequired: true,
      promotionCount: 0,
      canonEffect: "none",
      graphEffect: "none",
      sourceTextPresent: false,
    });
    expect(source.records).toHaveLength(31);
  });

  it("passes its 62-check verifier under warnings-as-errors", () => {
    const run = spawnSync(python(), [resolve(componentRoot, "verify.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error" },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      componentId: "asoiaf-agot-opening-gate-triage-v1",
      passed: 62,
      total: 62,
      status: "PASS",
      warningsAsErrors: true,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("routes all 31 records without executing a decision", () => {
    expect(triage.counts).toEqual({
      sourceRecords: 31,
      reviewAsIs: 14,
      splitBeforeReview: 10,
      rewriteBeforeReview: 7,
      decisionTemplates: 31,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(triage.queue).toHaveLength(31);
    expect(templates.rows).toHaveLength(31);
    const fields = templates.rowSchema;
    for (const raw of templates.rows) {
      const row = Object.fromEntries(fields.map((field: string, index: number) => [field, raw[index]]));
      expect(row).toMatchObject({
        action: null,
        reviewer: null,
        reviewedAt: null,
        transactionId: null,
        evidenceLocators: [],
        correctedSummary: null,
        splitChildren: [],
        mergeTargets: [],
        rationale: null,
        executed: false,
        sourceRecordHashMustMatch: true,
        humanReviewRequired: true,
        canonEffect: "none",
        graphEffect: "none",
      });
    }
  });
});
