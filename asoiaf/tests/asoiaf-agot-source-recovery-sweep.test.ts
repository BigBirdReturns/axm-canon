import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recovery = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "asoiaf/public/review/agot-source-recovery-sweep-v1/RECOVERY.json",
    ),
    "utf8",
  ),
);

describe("AGOT private-source recovery sweep", () => {
  it("binds the exact missing private-source identities", () => {
    expect(recovery.componentId).toBe("asoiaf-agot-source-recovery-sweep-v1");
    expect(recovery.baseCommit).toBe("823ee413b846ceb8089390911c54b8681557d4a9");
    expect(recovery.targets.agotEdition).toMatchObject({
      bytes: 1365577,
      sha256: "4f1966c377e3f92f15f912ee5129b3a08d0f71133adf09daa61c573f916417c0",
      unitCount: 89,
      paragraphLocators: 7100,
      wordCount: 296417,
      materialized: false,
    });
    expect(recovery.targets.sourceVault).toMatchObject({
      bytes: 8028251,
      sha256: "099f26d58f674a4dd353c15f162cda64c352d7e40d1fb02a1d09163fee76404e",
      sourceEditionCount: 6,
      materialized: false,
      substitutionAllowed: false,
      reconstructionAllowed: false,
    });
    expect(recovery.targets.privateEstateV1).toMatchObject({
      bytes: 229297511,
      sha256: "f3e6dba3875ec0e115a409d315ff7e7ff63e3e01ac56f37734fad46446b7d92d",
      materialized: false,
      substitutionAllowed: false,
      reconstructionAllowed: false,
    });
  });

  it("records connected-venue exhaustion without turning no-result into global absence", () => {
    expect(recovery.venues.fileLibrary).toMatchObject({
      queryCount: 7,
      exactPayloadObjectsReturned: 0,
      standing: "receipts-checksums-registries-and-cleanup-records-only",
    });
    expect(recovery.venues.googleDrive).toMatchObject({
      queryCount: 3,
      resultCount: 0,
      standing: "no-exact-filename-digest-or-title-result",
    });
    expect(recovery.venues.gmail).toMatchObject({
      queryCount: 4,
      exactTargetResultCount: 0,
      historicalTransportMessagesInspected: 3,
      standing: "historical-public-safe-carriers-survive-private-source-does-not",
    });
    expect(recovery.venues.gmail.historicalTransports).toHaveLength(3);
    expect(
      recovery.venues.gmail.historicalTransports.every(
        (transport: { sourcePayloadPresent: boolean }) => transport.sourcePayloadPresent === false,
      ),
    ).toBe(true);
    expect(recovery.venues.activeArtifactWorkspace.exactTargetMatches).toBe(0);
    expect(recovery.authorityBoundary.noResultDoesNotProveGlobalAbsence).toBe(true);
  });

  it("leaves review blocked and every authority counter at zero", () => {
    expect(recovery.recoveryClassification.status).toBe("PHYSICAL_LOCAL_RECOVERY_REQUIRED");
    expect(recovery.recoveryClassification.reviewMayProceed).toBe(false);
    expect(recovery.recoveryClassification.humanTransactionsMayExecute).toBe(false);
    expect(recovery.counts).toEqual({
      venuesSearched: 4,
      connectedServicesSearched: 3,
      historicalTransportMessagesInspected: 3,
      materializableExactPayloadsRecovered: 0,
      blockedSourceRequests: 45,
      incompleteTransactionIntakes: 45,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(recovery.authorityBoundary).toMatchObject({
      searchReceiptIsNotSourceCustody: true,
      receiptDoesNotProvePayloadAvailability: true,
      historicalPathDoesNotProveCurrentMaterialization: true,
      publicSafeCarrierCannotSupplyPrivateSource: true,
      assistantCannotServeAsNamedHumanReviewer: true,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
    });
  });
});
