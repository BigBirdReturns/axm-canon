import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-review-admission-effect-gate-v2");
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
function python(): string { return process.platform === "win32" ? "python" : "python3"; }

describe("AGOT review admission and effect gate v2", () => {
  it("passes repository-native verification", () => {
    const result = spawnSync(python(), [resolve(root, "verify.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" } });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: 24, total: 24, status: "PASS", realTransactionsAdmitted: 0, realEffectPacketsSealed: 0, repositoryMutationsExecuted: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
  });
  it("exercises all six actions without private source or effects", () => {
    const result = spawnSync(python(), [resolve(root, "admission_gate.py"), "self-test"], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error" }, timeout: 180000 });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ passed: 10, total: 10, status: "PASS", fixtureSourceTextOnly: true, realPrivateSourceUsed: false, realTransactionsAdmitted: 0, realEffectPacketsSealed: 0, repositoryMutationsExecuted: 0 });
  });
  it("retains the source-successor and authority boundaries", () => {
    expect(admission.standing).toBe("repository-native-source-successor-candidate-real-inputs-absent");
    expect(admission.predecessorArchive).toEqual({ componentId: "asoiaf-agot-review-admission-effect-packet-v1", exactArchiveMaterialized: false, byteEquivalenceClaimed: false });
    expect(admission.counts).toEqual({ realValidatedHumanIntakesConsumed: 0, realTransactionsAdmitted: 0, realEffectPacketsSealed: 0, repositoryEffectsExecuted: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    expect(admission.authorityBoundary).toMatchObject({ privateSourceTextPresent: false, privatePayloadPresent: false, repositoryMutationExecuted: false, canonMutationExecuted: false, graphMutationExecuted: false });
  });
});
