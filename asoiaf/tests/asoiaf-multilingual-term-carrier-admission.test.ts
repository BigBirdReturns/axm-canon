import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-19-multilingual-term-distinction-registry-v1",
);
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const registry = JSON.parse(readFileSync(resolve(root, "REGISTRY.json"), "utf8"));
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

const orderedChunks = carrier.chunks.map((chunk: { filename: string; sha256: string }) => {
  const bytes = readFileSync(resolve(root, chunk.filename));
  expect(hash(bytes)).toBe(chunk.sha256);
  return bytes.toString("ascii").trim();
});
const base64 = orderedChunks.join("");
const archive = Buffer.from(base64, "base64");

describe("multilingual term distinction exact carrier admission", () => {
  it("reconstructs the exact qualified public archive", () => {
    expect(admission.componentId).toBe("asoiaf-multilingual-term-distinction-registry-v1");
    expect(admission.standing).toBe(
      "exact-public-derivative-archive-carrier-materialized-and-byte-reconstructable",
    );
    expect(admission.carrier.materializedInRepository).toBe(true);
    expect(admission.carrier.chunkCount).toBe(3);
    expect(base64.length).toBe(22704);
    expect(carrier.archive.base64Characters).toBe(22704);
    expect(archive.length).toBe(17026);
    expect(admission.package.bytes).toBe(17026);
    expect(hash(archive)).toBe(
      "9e36b6fe0701c596501d183f522b8daafe8e7129942df4a0b17042b29d923744",
    );
    expect(hash(archive)).toBe(admission.package.sha256);
    expect(admission.package.materializedAsBinaryPath).toBe(false);
    expect(admission.package.exactArchiveReconstructable).toBe(true);
  });

  it("binds the exact census, language pairs, and both verifier passes", () => {
    expect(registry.componentId).toBe(admission.componentId);
    expect(registry.counts).toEqual(admission.counts);
    expect(admission.counts).toEqual({
      concepts: 2,
      languages: 8,
      termForms: 16,
      distinctionRows: 8,
      sourceRoutes: 12,
      evidenceRecords: 21,
      exactWitnessHolds: 16,
      provenanceRelations: 56,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(registry.termPairs).toEqual([
      { language: "Spanish", others: "Otros", wights: "Espectros" },
      { language: "Persian", others: "آدرها", wights: "وایت ها" },
      { language: "French", others: "Autres", wights: "Spectres" },
      { language: "Italian", others: "Estranei", wights: "Non-morti" },
      { language: "Portuguese", others: "Outros", wights: "Criaturas" },
      { language: "Russian", others: "Иные", wights: "Упыри" },
      { language: "Turkish", others: "Ötekiler", wights: "Wightlar" },
      { language: "Chinese", others: "异鬼", wights: "尸鬼" },
    ]);
    expect(admission.qualification.liveChecks).toEqual({ passed: 29, total: 29 });
    expect(admission.qualification.archiveReplayChecks).toEqual({ passed: 29, total: 29 });
  });

  it("preserves source-quality, parent, canon, graph, and carrier boundaries", () => {
    expect(admission.parentArchive.bytes).toBe(21839);
    expect(admission.parentArchive.sha256).toBe(
      "161a2cb7267b431cb47aaa469bec71bc15cc00cb0e5e94d3058e22806516cab9",
    );
    expect(admission.parentArchive.materialized).toBe(false);
    expect(admission.parentArchive.exactIdentityClaimed).toBe(false);
    expect(admission.parentArchive.byteReproductionClaimed).toBe(false);
    expect(admission.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(admission.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(admission.authorityBoundary.publisherTranslationAuthorityClaimed).toBe(false);
    expect(admission.authorityBoundary.crossLanguageEquivalenceAutomaticallyGranted).toBe(false);
    expect(admission.authorityBoundary.carrierDoesNotImpersonateArchivePath).toBe(true);
    expect(admission.sourceControls.russianPrimaryCommunityChainMaterialized).toBe(false);
    expect(admission.sourceControls.chineseWightDedicatedCommunityPageMaterialized).toBe(false);
    expect(admission.sourceControls.italianDedicatedWightPageMaterialized).toBe(false);
    expect(admission.sourceControls.allSixteenLicensedEditionLocatorsAcquired).toBe(false);
  });
});
