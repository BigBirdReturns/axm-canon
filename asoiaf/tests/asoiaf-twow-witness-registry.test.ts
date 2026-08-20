import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/continuation/2026-08-19-twow-witness-registry-v1",
);

const registry = JSON.parse(readFileSync(resolve(root, "REGISTRY.json"), "utf8")) as {
  componentId: string;
  standing: string;
  parent: {
    archiveBytes: number;
    archiveSha256: string;
    exactArchiveMaterialized: boolean;
    derivativeClaimsExactParentIdentity: boolean;
    derivativeClaimsParentByteReproduction: boolean;
  };
  counts: {
    chapters: number;
    releaseEvents: number;
    sourceRoutes: number;
    versionAndProvenanceRelations: number;
    acquisitionHolds: number;
    automaticCanonPromotions: number;
  };
  scope: {
    chapterTextPresent: boolean;
    eventTranscriptPresent: boolean;
    attendeeReconstructionPresent: boolean;
    sourcePageMirrorPresent: boolean;
  };
  authorityBoundary: {
    releasedFutureMaterialStanding: string;
    automaticCanonEffect: string;
    automaticGraphEffect: string;
    exactWitnessRequiredForTextCustody: boolean;
    attendeeNotesCannotImpersonateAuthorText: boolean;
    parentReceiptDoesNotMaterializeParentArchive: boolean;
  };
};

const readNdjson = (name: string): Array<Record<string, unknown>> =>
  readFileSync(resolve(root, name), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const chapters = readNdjson("CHAPTERS.ndjson");
const events = readNdjson("EVENTS.ndjson");
const sources = readNdjson("SOURCES.ndjson");
const relations = readNdjson("RELATIONS.ndjson");
const holds = readNdjson("ACQUISITION_HOLDS.ndjson");

describe("repository-native TWOW witness registry", () => {
  it("admits the exact public metadata census under a new component identity", () => {
    expect(registry.componentId).toBe("asoiaf-twow-witness-registry-v1");
    expect(registry.standing).toBe("repo-native-public-metadata-derivative");
    expect(registry.counts).toEqual({
      chapters: 11,
      releaseEvents: 16,
      sourceRoutes: 17,
      versionAndProvenanceRelations: 47,
      acquisitionHolds: 14,
      automaticCanonPromotions: 0,
    });
    expect([chapters.length, events.length, sources.length, relations.length, holds.length]).toEqual([
      11,
      16,
      17,
      47,
      14,
    ]);
  });

  it("does not impersonate the sealed predecessor or include protected prose", () => {
    expect(registry.parent.archiveBytes).toBe(18639);
    expect(registry.parent.archiveSha256).toBe(
      "ac93ef471f05beb7e4ac1469baba4baca2d1550b246eb3b33ab50035c79333d0",
    );
    expect(registry.parent.exactArchiveMaterialized).toBe(false);
    expect(registry.parent.derivativeClaimsExactParentIdentity).toBe(false);
    expect(registry.parent.derivativeClaimsParentByteReproduction).toBe(false);
    expect(registry.scope.chapterTextPresent).toBe(false);
    expect(registry.scope.eventTranscriptPresent).toBe(false);
    expect(registry.scope.attendeeReconstructionPresent).toBe(false);
    expect(registry.scope.sourcePageMirrorPresent).toBe(false);
  });

  it("keeps mutable released-future material outside canon and graph authority", () => {
    expect(registry.authorityBoundary.releasedFutureMaterialStanding).toBe(
      "mutable-witness-specific-nonfinal",
    );
    expect(registry.authorityBoundary.automaticCanonEffect).toBe("none");
    expect(registry.authorityBoundary.automaticGraphEffect).toBe("none");
    expect(registry.authorityBoundary.exactWitnessRequiredForTextCustody).toBe(true);
    expect(registry.authorityBoundary.attendeeNotesCannotImpersonateAuthorText).toBe(true);
    expect(registry.authorityBoundary.parentReceiptDoesNotMaterializeParentArchive).toBe(true);
    for (const row of [...chapters, ...events, ...sources, ...relations, ...holds]) {
      expect(row.canonEffect).toBe("none");
      expect(row.graphEffect).toBe("none");
    }
  });

  it("preserves repeated POV chapters as distinct objects and fixes event-date drift", () => {
    const chapterIds = new Set(chapters.map((row) => row.chapterId));
    expect(chapterIds).toEqual(
      new Set([
        "twow:theon-i",
        "twow:victarion-i",
        "twow:tyrion-i",
        "twow:arianne-i",
        "twow:barristan-i",
        "twow:barristan-ii",
        "twow:tyrion-ii",
        "twow:mercy",
        "twow:alayne-i",
        "twow:arianne-ii",
        "twow:the-forsaken",
      ]),
    );
    const tiff = events.find((row) => row.eventId === "event:victarion-tiff-2012-03-12");
    expect(tiff?.date).toBe("2012-03-12");
    expect(tiff?.publicRouteDate).toBe("2012-03-17");
    const miscon = events.filter((row) =>
      ["event:victarion-miscon-2012", "event:tyrion-i-miscon-2012"].includes(
        String(row.eventId),
      ),
    );
    expect(miscon).toHaveLength(2);
    expect(miscon.every((row) => row.date === "2012-05-25/2012-05-28")).toBe(true);
    expect(miscon.every((row) => row.publicRouteDate === "2012-06-03")).toBe(true);
  });

  it("keeps all fourteen exact-witness holds fail closed", () => {
    expect(
      holds.every(
        (row) =>
          row.status === "unacquired-exact-witness" &&
          row.substitutionAllowed === false &&
          row.transcriptImpersonationAllowed === false,
      ),
    ).toBe(true);
  });
});
