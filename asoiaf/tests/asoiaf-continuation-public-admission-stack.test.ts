import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/continuation/2026-08-19-public-admission-stack-v1");
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const stack = JSON.parse(readFileSync(resolve(root, "STACK.json"), "utf8"));
const carrier = JSON.parse(readFileSync(resolve(root, admission.carrier.manifest), "utf8"));
const base64 = carrier.concatenationOrder
  .map((path: string) => readFileSync(resolve(root, path), "utf8"))
  .join("");
const packageBytes = Buffer.from(base64, "base64");
const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");
const base64Sha256 = createHash("sha256").update(base64).digest("hex");

describe("ASOIAF continuation public admission stack", () => {
  it("reconstructs the exact qualified reconciliation archive from its carrier", () => {
    expect(admission.componentId).toBe("asoiaf-continuation-public-admission-stack-v1");
    expect(admission.standing).toBe("exact-public-stack-reconciliation-archive-carrier-materialized-and-byte-reconstructable");
    expect(admission.package.materializedAsBinaryPath).toBe(false);
    expect(admission.package.exactArchiveReconstructable).toBe(true);
    expect(admission.package.expandedFileCount).toBe(8);
    expect(admission.carrier.materializedInRepository).toBe(true);
    expect(admission.carrier.chunkCount).toBe(17);
    expect(carrier.chunks).toHaveLength(admission.carrier.chunkCount);
    expect(base64.length).toBe(admission.carrier.base64Characters);
    expect(base64Sha256).toBe(admission.carrier.base64Sha256);
    expect(packageBytes.length).toBe(admission.package.bytes);
    expect(packageSha256).toBe(admission.package.sha256);
    expect(carrier.archive).toEqual({
      base64Characters: admission.carrier.base64Characters,
      base64Sha256: admission.carrier.base64Sha256,
      bytes: admission.package.bytes,
      exactArchiveReconstructable: true,
      filename: admission.package.filename,
      materializedAsBinaryPath: false,
      sha256: admission.package.sha256,
    });
    for (const chunk of carrier.chunks) {
      const text = readFileSync(resolve(root, chunk.path), "utf8");
      expect(text.length).toBe(chunk.characters);
      expect(createHash("sha256").update(text).digest("hex")).toBe(chunk.sha256);
    }
    expect(admission.qualification.liveChecks.passed).toBe(admission.qualification.liveChecks.total);
    expect(admission.qualification.archiveReplayChecks.passed).toBe(admission.qualification.archiveReplayChecks.total);
  });
  it("binds the exact five-merge public successor chain", () => {
    expect(stack.baseMainCommit).toBe("6a045966c70e32af4e125006b22b397c8a4b0949");
    expect(stack.headMainCommit).toBe("a5092531a622965abb41514bd7c12b37b770c8ee");
    expect(stack.components).toHaveLength(5);
    expect(stack.components.map((c: any) => c.pullRequest)).toEqual([6, 7, 8, 9, 10]);
    expect(stack.components.map((c: any) => c.mergeCommit)).toEqual([
      "a9ce9c699c9091defb6535e30ed82c79fa6b1bcd",
      "0fe5dc36393832d11a78508e5d79af4ff258dfc8",
      "9d3bcd8102d56d8c2c39146a1f174c57855034d1",
      "983dc9807bdd7328daf4d4cb97657c178c12733b",
      "a5092531a622965abb41514bd7c12b37b770c8ee",
    ]);
    expect(stack.components.map((c: any) => c.qualificationRun)).toEqual([
      32295189590,
      32301725791,
      32304421074,
      32319946334,
      32325339589,
    ]);
    expect(stack.components.every((c: any) => c.qualificationConclusion === "success")).toBe(true);
  });
  it("keeps every predecessor and private integration hold fail closed", () => {
    expect(stack.components.every((c: any) => c.parentArchive.materialized === false)).toBe(true);
    expect(stack.waveV3.materializedInRepository).toBe(false);
    expect(stack.waveV3.successorComponentsAreNewIdentities).toBe(true);
    expect(stack.waveV3.successorAdmissionDoesNotFlipPredecessorPayloadMaterializedFlags).toBe(true);
    expect(stack.privateV4_1Hold.bytes).toBe(244436743);
    expect(stack.privateV4_1Hold.sha256).toBe("48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7");
    expect(stack.privateV4_1Hold.materialized).toBe(false);
    expect(stack.privateV4_1Hold.v4_2Built).toBe(false);
    expect(stack.privateV4_1Hold.v4_2Claimed).toBe(false);
  });
  it("locates all admitted repository surfaces and preserves zero authority effects", () => {
    for (const component of stack.components) {
      expect(existsSync(resolve(process.cwd(), component.repositoryPath))).toBe(true);
    }
    expect(stack.counts.automaticCanonPromotions).toBe(0);
    expect(stack.counts.automaticGraphMutations).toBe(0);
    expect(stack.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(stack.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.authorityBoundary.carrierDoesNotImpersonateArchivePath).toBe(true);
    expect(stack.priorTerminal.observedStatus).toBe("HOLD");
    expect(stack.priorTerminal.evidentiaryFailure).toBe(false);
    expect(stack.priorTerminal.supersededOperationallyByThisRepositoryStack).toBe(true);
  });
});
