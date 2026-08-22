import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-19-multilingual-reception-route-atlas-v1",
);
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8")) as {
  componentId: string;
  standing: string;
  package: {
    filename: string;
    bytes: number;
    sha256: string;
    materializedInRepository: boolean;
    expandedFileCount: number;
    expandedFilesMaterializedIndividually: boolean;
  };
  qualification: {
    liveChecks: { passed: number; total: number };
    archiveReplayChecks: { passed: number; total: number };
  };
  counts: Record<string, number>;
  parentArchive: {
    bytes: number;
    sha256: string;
    materialized: boolean;
    exactIdentityClaimed: boolean;
    byteReproductionClaimed: boolean;
    countCompatibilityProvesRecordEquivalence: boolean;
  };
  termControlDependency: {
    componentId: string;
    commit: string;
    taskCount: number;
    exactPackageIdentityInherited: boolean;
  };
  authorityBoundary: Record<string, boolean | string | number>;
  automaticCanonPromotions: number;
  automaticGraphMutations: number;
};
const registry = JSON.parse(readFileSync(resolve(root, "REGISTRY.json"), "utf8")) as {
  componentId: string;
  baseCommit: string;
  counts: Record<string, number>;
};
const packagePath = resolve(root, admission.package.filename);
const packageBytes = readFileSync(packagePath);
const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");

describe("multilingual reception route atlas exact package admission", () => {
  it("materializes the exact qualified public package", () => {
    expect(admission.componentId).toBe("asoiaf-multilingual-reception-route-atlas-v1");
    expect(admission.standing).toBe(
      "exact-public-derivative-archive-materialized-expanded-files-package-bound",
    );
    expect(admission.package.materializedInRepository).toBe(true);
    expect(admission.package.expandedFilesMaterializedIndividually).toBe(false);
    expect(admission.package.expandedFileCount).toBe(13);
    expect(statSync(packagePath).size).toBe(13641);
    expect(admission.package.bytes).toBe(13641);
    expect(packageSha256).toBe(
      "cb0b7f803e66f41f15c745fd21e06e04786fc079a4a7bff0601c144ebbb1e9d1",
    );
    expect(packageSha256).toBe(admission.package.sha256);
  });

  it("binds the exact census, dependency, and both verifier passes", () => {
    expect(registry.componentId).toBe(admission.componentId);
    expect(registry.baseCommit).toBe("2e756380fe3b64122d66e2c3867c8b15bab93135");
    expect(registry.counts).toEqual(admission.counts);
    expect(admission.counts).toEqual({
      languages: 8,
      sourceRoutes: 10,
      evidenceRecords: 14,
      provenanceRelations: 11,
      openGaps: 12,
      continuityTasks: 9,
      termAuditTasks: 18,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.qualification.liveChecks).toEqual({ passed: 34, total: 34 });
    expect(admission.qualification.archiveReplayChecks).toEqual({ passed: 34, total: 34 });
    expect(admission.termControlDependency).toEqual({
      componentId: "asoiaf-multilingual-term-distinction-registry-v1",
      commit: "2e756380fe3b64122d66e2c3867c8b15bab93135",
      exactPackageIdentityInherited: false,
      taskCount: 18,
    });
  });

  it("preserves the predecessor and authority boundaries", () => {
    expect(admission.parentArchive.bytes).toBe(21080);
    expect(admission.parentArchive.sha256).toBe(
      "2d0659281fc1432ff86d7d9f07a69c600350dccddaf74354035ca67e218ac911",
    );
    expect(admission.parentArchive.materialized).toBe(false);
    expect(admission.parentArchive.exactIdentityClaimed).toBe(false);
    expect(admission.parentArchive.byteReproductionClaimed).toBe(false);
    expect(admission.parentArchive.countCompatibilityProvesRecordEquivalence).toBe(false);
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.automaticGraphMutations).toBe(0);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.authorityBoundary.sourceTextPresent).toBe(false);
    expect(admission.authorityBoundary.wikiDumpPresent).toBe(false);
    expect(admission.authorityBoundary.forumBulkTextPresent).toBe(false);
    expect(admission.authorityBoundary.podcastAudioPresent).toBe(false);
    expect(admission.authorityBoundary.publisherTranslationAuthorityClaimed).toBe(false);
    expect(admission.authorityBoundary.humanLanguageReviewRequired).toBe(true);
  });
});
