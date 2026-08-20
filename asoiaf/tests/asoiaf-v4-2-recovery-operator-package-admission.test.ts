import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-19-v4-2-recovery-operator-v1",
);
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8")) as {
  componentId: string;
  standing: string;
  package: {
    filename: string;
    bytes: number;
    sha256: string;
    gitBlobSha1: string;
    materializedInRepository: boolean;
    expandedFileCount: number;
    expandedFilesMaterializedIndividually: boolean;
  };
  qualification: {
    liveChecks: { passed: number; total: number };
    archiveReplayChecks: { passed: number; total: number };
    selfTests: { passed: number; total: number };
  };
  currentExecution: {
    status: string;
    exitCode: number;
    allExactInputsVerified: boolean;
    v4_2Built: boolean;
    v4_2Claimed: boolean;
  };
  parentArchive: {
    filename: string;
    bytes: number;
    sha256: string;
    materialized: boolean;
    exactIdentityClaimed: boolean;
    byteReproductionClaimed: boolean;
  };
  requiredInputs: Array<{
    filename: string;
    bytes: number;
    sha256: string;
    materialized: boolean;
    reconstructionAllowed: boolean;
    substitutionAllowed: boolean;
  }>;
  authorityBoundary: Record<string, boolean | string>;
  counts: Record<string, number>;
  automaticCanonPromotions: number;
  automaticGraphMutations: number;
  v4_2Built: boolean;
  v4_2Claimed: boolean;
};
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8")) as {
  componentId: string;
  operatorStates: string[];
  requiredInputs: Array<{ filename: string; bytes: number; sha256: string }>;
};
const current = JSON.parse(readFileSync(resolve(root, "CURRENT_HOLD.json"), "utf8")) as {
  status: string;
  exitCode: number;
  inputs: Array<{ status: string; exactIdentityVerified: boolean }>;
  copiedInputs: boolean;
  extractedInputs: boolean;
  reconstructedInputs: boolean;
  v4_2Built: boolean;
  v4_2Claimed: boolean;
};
const replay = JSON.parse(readFileSync(resolve(root, "ARCHIVE_REPLAY.json"), "utf8")) as {
  status: string;
  archive: { bytes: number; sha256: string };
  verification: { status: string; passed: number; failed: number };
};
const packagePath = resolve(root, admission.package.filename);
const packageBytes = readFileSync(packagePath);
const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");
const gitBlobSha1 = createHash("sha1")
  .update(Buffer.from(`blob ${packageBytes.length}\0`, "utf8"))
  .update(packageBytes)
  .digest("hex");

describe("v4.2 recovery operator package admission", () => {
  it("materializes the exact qualified public successor archive", () => {
    expect(admission.componentId).toBe("asoiaf-v4-2-recovery-operator-v1");
    expect(contract.componentId).toBe(admission.componentId);
    expect(admission.standing).toBe(
      "exact-public-recovery-successor-archive-materialized-private-inputs-held",
    );
    expect(admission.package.materializedInRepository).toBe(true);
    expect(admission.package.expandedFilesMaterializedIndividually).toBe(false);
    expect(admission.package.expandedFileCount).toBe(11);
    expect(statSync(packagePath).size).toBe(admission.package.bytes);
    expect(packageSha256).toBe(admission.package.sha256);
    expect(gitBlobSha1).toBe(admission.package.gitBlobSha1);
    expect(replay.archive.bytes).toBe(admission.package.bytes);
    expect(replay.archive.sha256).toBe(admission.package.sha256);
    expect(replay.status).toBe("PASS");
    expect(replay.verification).toEqual({
      status: "PASS",
      passed: 52,
      failed: 0,
      failures: [],
      componentId: "asoiaf-v4-2-recovery-operator-v1",
      schema: "axm-asoiaf-v4-2-recovery-operator-verification/1",
    });
  });

  it("binds both exact prerequisite identities and the current transport hold", () => {
    expect(contract.operatorStates).toEqual([
      "HOLD_EXACT_ARCHIVES_UNAVAILABLE",
      "REFUSE_INPUT_IDENTITY_MISMATCH",
      "READY_EXACT_INPUTS_VERIFIED_NOT_INTEGRATED",
    ]);
    expect(
      contract.requiredInputs.map(({ filename, bytes, sha256 }) => ({ filename, bytes, sha256 })),
    ).toEqual(admission.requiredInputs.map(({ filename, bytes, sha256 }) => ({ filename, bytes, sha256 })));
    expect(admission.requiredInputs).toEqual([
      {
        filename: "asoiaf-private-world-estate-v4.1.tar.zst",
        bytes: 244436743,
        sha256: "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
        materialized: false,
        privatePayload: true,
        reconstructionAllowed: false,
        substitutionAllowed: false,
      },
      {
        filename: "asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst",
        bytes: 249906,
        sha256: "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02",
        materialized: false,
        privatePayload: false,
        reconstructionAllowed: false,
        substitutionAllowed: false,
      },
    ]);
    expect(current.status).toBe("HOLD_EXACT_ARCHIVES_UNAVAILABLE");
    expect(current.exitCode).toBe(10);
    expect(current.inputs.map((input) => input.status)).toEqual(["MISSING", "MISSING"]);
    expect(current.inputs.every((input) => input.exactIdentityVerified === false)).toBe(true);
    expect(current.copiedInputs).toBe(false);
    expect(current.extractedInputs).toBe(false);
    expect(current.reconstructedInputs).toBe(false);
    expect(current.v4_2Built).toBe(false);
    expect(current.v4_2Claimed).toBe(false);
    expect(admission.currentExecution).toEqual({
      filename: "CURRENT_HOLD.json",
      sha256: "167baa3f15aa191581fcb6bfb7735deb97b1bf9094976f7a1f940b33194b958e",
      status: "HOLD_EXACT_ARCHIVES_UNAVAILABLE",
      exitCode: 10,
      allExactInputsVerified: false,
      v4_2Built: false,
      v4_2Claimed: false,
    });
  });

  it("preserves the predecessor, private-estate, canon, graph, and integration boundaries", () => {
    expect(admission.parentArchive.filename).toBe("asoiaf-v4.2-recovery-kit-v0.1.tar.zst");
    expect(admission.parentArchive.bytes).toBe(23112);
    expect(admission.parentArchive.sha256).toBe(
      "538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75",
    );
    expect(admission.parentArchive.materialized).toBe(false);
    expect(admission.parentArchive.exactIdentityClaimed).toBe(false);
    expect(admission.parentArchive.byteReproductionClaimed).toBe(false);
    expect(admission.qualification.liveChecks).toEqual({ passed: 52, total: 52 });
    expect(admission.qualification.archiveReplayChecks).toEqual({ passed: 52, total: 52 });
    expect(admission.qualification.selfTests).toEqual({ passed: 8, total: 8 });
    expect(admission.counts).toEqual({
      requiredExactInputs: 2,
      sealedPredecessorHolds: 1,
      openHolds: 4,
      searchVenues: 4,
      operatorStates: 3,
      selfTests: 8,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.authorityBoundary.operatorMayCopyInputs).toBe(false);
    expect(admission.authorityBoundary.operatorMayExtractInputs).toBe(false);
    expect(admission.authorityBoundary.operatorMayReconstructInputs).toBe(false);
    expect(admission.authorityBoundary.operatorMaySubstituteInputs).toBe(false);
    expect(admission.authorityBoundary.operatorMayBuildV4_2).toBe(false);
    expect(admission.authorityBoundary.operatorMayClaimV4_2).toBe(false);
    expect(admission.authorityBoundary.packageContainsPrivatePayload).toBe(false);
    expect(admission.authorityBoundary.packageContainsSourceText).toBe(false);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.automaticGraphMutations).toBe(0);
    expect(admission.v4_2Built).toBe(false);
    expect(admission.v4_2Claimed).toBe(false);
  });
});
