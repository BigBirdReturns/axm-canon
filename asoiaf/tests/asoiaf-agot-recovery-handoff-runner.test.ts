import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-recovery-handoff-runner-v1");
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
function python(): string { return process.platform === "win32" ? "python" : "python3"; }

describe("AGOT admitted recovery-handoff runner", () => {
  it("reconstructs and safely extracts the exact admitted handoff", () => {
    const run = spawnSync(python(), [resolve(root, "verify.py")], {
      encoding: "utf8",
      env: { ...process.env, PYTHONWARNINGS: "error", PYTHONDONTWRITEBYTECODE: "1" },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      componentId: "asoiaf-agot-recovery-handoff-runner-v1",
      status: "PASS",
      passed: 19,
      total: 19,
      warningsAsErrors: true,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      reviewTransactionsExecuted: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });
  it("preserves the source and authority boundary", () => {
    expect(contract.sourceCarrier).toMatchObject({
      decodedBytes: 107565,
      decodedSha256: "dd70c8c9d5de23db7014d8e4d89b73a52d24ecedc8986c4e42812e7820a390d9",
      expandedFileCount: 45,
    });
    expect(contract.authorityBoundary).toMatchObject({
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
