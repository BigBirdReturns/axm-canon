import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/continuation/2026-08-19-multilingual-reception-route-atlas-v1");
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const registry = JSON.parse(readFileSync(resolve(root, "REGISTRY.json"), "utf8"));
const objectPath = resolve(root, admission.package.filename);
const objectBytes = readFileSync(objectPath);
const objectSha256 = createHash("sha256").update(objectBytes).digest("hex");

describe("multilingual reception route atlas corrupt transport hold", () => {
  it("preserves the exact corrupt transport object without claiming package custody", () => {
    expect(admission.componentId).toBe("asoiaf-multilingual-reception-route-atlas-v1");
    expect(admission.standing).toBe("corrupt-repository-transport-object-preserved-exact-package-held");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.expectedBytes).toBe(13645);
    expect(admission.package.expectedSha256).toBe("cb0b7f803e66f41f15c745fd21e06e04786fc079a4a7bff0601c144ebbb1e9d1");
    expect(statSync(objectPath).size).toBe(13641);
    expect(objectSha256).toBe("4330ebb75955abdf3ad45891e8fe654e767f53f544c6dce180e719c3e5b06978");
    expect(admission.package.repositoryTransportObject).toMatchObject({ materialized: true, transportCorrupt: true, zstdIntegrity: "failed", extractionAuthorized: false, exactPackageIdentityClaimed: false });
  });

  it("retains the registry census and dependency without archive replay claims", () => {
    expect(registry.componentId).toBe(admission.componentId);
    expect(registry.counts).toEqual(admission.counts);
    expect(admission.counts).toEqual({ languages: 8, sourceRoutes: 10, evidenceRecords: 14, provenanceRelations: 11, openGaps: 12, continuityTasks: 9, termAuditTasks: 18, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    expect(admission.qualification.historicalLocalSource.liveChecks).toEqual({ passed: 34, total: 34 });
    expect(admission.qualification.historicalLocalSource.archiveReplayChecks).toEqual({ passed: 34, total: 34 });
    expect(admission.qualification.repositoryTransportHold).toEqual({ exactByteIdentityVerified: true, zstdIntegrityFailureVerified: true, archiveReplayAuthorized: false, validPackageMaterialized: false });
    expect(admission.termControlDependency).toEqual({ componentId: "asoiaf-multilingual-term-distinction-registry-v1", commit: "2e756380fe3b64122d66e2c3867c8b15bab93135", exactPackageIdentityInherited: false, taskCount: 18 });
  });

  it("preserves every source, predecessor, canon, and graph boundary", () => {
    expect(admission.parentArchive).toMatchObject({ bytes: 21080, sha256: "2d0659281fc1432ff86d7d9f07a69c600350dccddaf74354035ca67e218ac911", materialized: false, exactIdentityClaimed: false, byteReproductionClaimed: false, countCompatibilityProvesRecordEquivalence: false });
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.automaticGraphMutations).toBe(0);
    expect(admission.authorityBoundary).toMatchObject({ automaticCanonEffect: "none", automaticGraphEffect: "none", sourceTextPresent: false, wikiDumpPresent: false, forumBulkTextPresent: false, podcastAudioPresent: false, publisherTranslationAuthorityClaimed: false, humanLanguageReviewRequired: true, corruptTransportObjectDoesNotEstablishPackageCustody: true });
  });
});
