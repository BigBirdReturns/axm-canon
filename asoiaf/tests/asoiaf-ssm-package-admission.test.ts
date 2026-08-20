import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-19-ssm-bounded-proposition-registry-v1",
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
  };
  authorityBoundary: Record<string, boolean | string | number>;
  automaticCanonPromotions: number;
};
const registry = JSON.parse(readFileSync(resolve(root, "REGISTRY.json"), "utf8")) as {
  componentId: string;
  counts: Record<string, number>;
};
const packagePath = resolve(root, admission.package.filename);
const packageBytes = readFileSync(packagePath);
const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");

describe("SSM exact derivative package admission", () => {
  it("materializes the exact qualified public package", () => {
    expect(admission.componentId).toBe("asoiaf-ssm-bounded-proposition-registry-v1");
    expect(admission.standing).toBe(
      "exact-public-derivative-archive-materialized-expanded-files-package-bound",
    );
    expect(admission.package.materializedInRepository).toBe(true);
    expect(admission.package.expandedFilesMaterializedIndividually).toBe(false);
    expect(admission.package.expandedFileCount).toBe(11);
    expect(statSync(packagePath).size).toBe(admission.package.bytes);
    expect(packageSha256).toBe(admission.package.sha256);
  });

  it("binds the exact registry census and both verifier passes", () => {
    expect(registry.componentId).toBe(admission.componentId);
    expect(registry.counts).toEqual(admission.counts);
    expect(admission.counts).toEqual({
      items: 10,
      boundedPropositions: 23,
      sourceRoutes: 10,
      provenanceAndControlRelations: 28,
      openGaps: 7,
      automaticCanonPromotions: 0,
    });
    expect(admission.qualification.liveChecks).toEqual({ passed: 26, total: 26 });
    expect(admission.qualification.archiveReplayChecks).toEqual({ passed: 26, total: 26 });
  });

  it("does not let the package impersonate the sealed predecessor or acquire authority", () => {
    expect(admission.parentArchive.bytes).toBe(17874);
    expect(admission.parentArchive.sha256).toBe(
      "2adc9a9a0818a1885a180569ff80ef6eaec08af74c82c4ca075024bb2e5ebb01",
    );
    expect(admission.parentArchive.materialized).toBe(false);
    expect(admission.parentArchive.exactIdentityClaimed).toBe(false);
    expect(admission.parentArchive.byteReproductionClaimed).toBe(false);
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.authorityBoundary.sourceTranscriptPresent).toBe(false);
    expect(admission.authorityBoundary.longQuotationPresent).toBe(false);
    expect(admission.authorityBoundary.contributorTextPresent).toBe(false);
  });
});
