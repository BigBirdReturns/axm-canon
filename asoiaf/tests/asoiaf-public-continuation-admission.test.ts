import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const admission = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "asoiaf/public/continuation/2026-08-18-v3/ADMISSION.json"),
    "utf8",
  ),
) as {
  standing: string;
  sourceArchive: { sha256: string; payloadMaterializedInRepository: boolean };
  receipts: { deliveryLedger: { fileCount: number } };
  qualification: {
    componentCount: number;
    liveChecks: { passed: number; total: number };
    archiveReplayChecks: { passed: number; total: number };
    automaticCanonPromotions: number;
  };
  components: Array<{ payloadMaterialized: boolean }>;
  authorityBoundary: {
    sourceTextPresent: boolean;
    holderControlledPayloadPresent: boolean;
    automaticCanonEffect: string;
    automaticGraphEffect: string;
    manifestDoesNotSubstituteForArchive: boolean;
    archiveHashDoesNotProveRepositoryMaterialization: boolean;
  };
  privateIntegrationHold: {
    requiredBytes: number;
    requiredSha256: string;
    materialized: boolean;
    v4_2Built: boolean;
    v4_2Claimed: boolean;
    substitutionAllowed: boolean;
    reconstructionAllowed: boolean;
  };
};

describe("ASOIAF continuation v3 custody admission", () => {
  it("admits the exact wave identity and qualification counts", () => {
    expect(admission.standing).toBe("manifest-and-custody-admitted");
    expect(admission.sourceArchive.sha256).toBe(
      "0e999b7f8c921e7e81d439fc4c2fc1fd004a2b4a2adb375f0df3b99aefe92ab9",
    );
    expect(admission.receipts.deliveryLedger.fileCount).toBe(19);
    expect(admission.qualification.componentCount).toBe(7);
    expect(admission.qualification.liveChecks).toEqual({ passed: 9, total: 9 });
    expect(admission.qualification.archiveReplayChecks).toEqual({ passed: 9, total: 9 });
    expect(admission.qualification.automaticCanonPromotions).toBe(0);
  });

  it("does not let a manifest impersonate materialized payload", () => {
    expect(admission.sourceArchive.payloadMaterializedInRepository).toBe(false);
    expect(admission.components.every((component) => component.payloadMaterialized === false)).toBe(true);
    expect(admission.authorityBoundary.sourceTextPresent).toBe(false);
    expect(admission.authorityBoundary.holderControlledPayloadPresent).toBe(false);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.authorityBoundary.manifestDoesNotSubstituteForArchive).toBe(true);
    expect(admission.authorityBoundary.archiveHashDoesNotProveRepositoryMaterialization).toBe(true);
  });

  it("preserves the exact fail-closed v4.1 integration hold", () => {
    expect(admission.privateIntegrationHold.requiredBytes).toBe(244436743);
    expect(admission.privateIntegrationHold.requiredSha256).toBe(
      "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
    );
    expect(admission.privateIntegrationHold.materialized).toBe(false);
    expect(admission.privateIntegrationHold.v4_2Built).toBe(false);
    expect(admission.privateIntegrationHold.v4_2Claimed).toBe(false);
    expect(admission.privateIntegrationHold.substitutionAllowed).toBe(false);
    expect(admission.privateIntegrationHold.reconstructionAllowed).toBe(false);
  });
});
