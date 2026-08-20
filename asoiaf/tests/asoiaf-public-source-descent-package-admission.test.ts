import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/continuation/2026-08-19-public-source-descent-registry-v1");
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const registry = JSON.parse(readFileSync(resolve(root, "REGISTRY.json"), "utf8"));
const packagePath = resolve(root, admission.package.filename);
const packageBytes = readFileSync(packagePath);
const packageSha256 = createHash("sha256").update(packageBytes).digest("hex");

describe("public source descent exact derivative package admission", () => {
  it("materializes the exact qualified public package", () => {
    expect(admission.componentId).toBe("asoiaf-public-source-descent-registry-v1");
    expect(admission.standing).toBe("exact-public-derivative-archive-materialized-expanded-files-package-bound");
    expect(admission.package.materializedInRepository).toBe(true);
    expect(admission.package.expandedFilesMaterializedIndividually).toBe(false);
    expect(admission.package.expandedFileCount).toBe(11);
    expect(statSync(packagePath).size).toBe(admission.package.bytes);
    expect(packageSha256).toBe(admission.package.sha256);
  });
  it("binds the source census and both verifier passes", () => {
    expect(registry.componentId).toBe(admission.componentId);
    expect(registry.counts).toEqual(admission.counts);
    expect(admission.counts).toEqual({"sourceRecords":12,"sourceRelations":10,"openGaps":13,"releasedFutureMaterialRoutes":9,"ssmRoutes":6,"archivalAccessRoutes":1,"automaticCanonPromotions":0,"automaticGraphMutations":0});
    expect(admission.qualification.liveChecks).toEqual({ passed: 37, total: 37 });
    expect(admission.qualification.archiveReplayChecks).toEqual({ passed: 37, total: 37 });
  });
  it("preserves dependency, archival, parent, canon, and graph boundaries", () => {
    expect(admission.parentArchive.bytes).toBe(22011);
    expect(admission.parentArchive.sha256).toBe("db3a3c0073a742cf4bd6137e40fd3f7a403a74f415c015aecf68c1f0d052ed2e");
    expect(admission.parentArchive.materialized).toBe(false);
    expect(admission.parentArchive.exactIdentityClaimed).toBe(false);
    expect(admission.parentArchive.byteReproductionClaimed).toBe(false);
    expect(admission.dependencies.every((d: any) => d.sourceAuthorityInherited === false && d.canonAuthorityInherited === false && d.graphAuthorityInherited === false)).toBe(true);
    expect(admission.authorityBoundary.sourceTextPresent).toBe(false);
    expect(admission.authorityBoundary.transcriptPresent).toBe(false);
    expect(admission.authorityBoundary.archiveAccessDoesNotProveCapture).toBe(true);
    expect(admission.authorityBoundary.attendeeReportDoesNotImpersonateAuthorText).toBe(true);
    expect(admission.automaticCanonPromotions).toBe(0);
    expect(admission.automaticGraphMutations).toBe(0);
  });
});
