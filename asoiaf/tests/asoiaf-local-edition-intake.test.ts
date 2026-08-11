import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  intakeAsoiafLocalEdition,
  listAsoiafLocalEditions,
  localEditionPaths,
  locateAsoiafLocalEditionText,
  verifyAsoiafLocalEdition,
  writeAsoiafLocalEditionReceipt,
} from "../tools/lib/asoiaf-local-edition-intake.js";
import {
  collectorEstatePaths,
  readNdjson,
  type CollectorObservationRecord,
} from "../tools/lib/asoiaf-external-estate.js";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asoiaf-local-edition-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

function writeSource(root: string, name: string, content: string | Buffer): string {
  const directory = path.join(root, "holder-input");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, name);
  fs.writeFileSync(target, content);
  return target;
}

function plainBook(version = 1): string {
  return `PROLOGUE
The cold opened the private holder copy version ${version}.

A second paragraph establishes a stable locator.

BRAN
The boy watched from a bounded chapter.

The direwolf waited.

CATELYN
The household state changed without publishing the source file.`;
}

function storedZip(entries: Array<{ name: string; content: string | Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + content.length;
  }
  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralBytes, end]);
}

function syntheticEpub(): Buffer {
  return storedZip([
    { name: "mimetype", content: "application/epub+zip" },
    {
      name: "META-INF/container.xml",
      content: `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
    },
    {
      name: "OEBPS/content.opf",
      content: `<package xmlns:dc="http://purl.org/dc/elements/1.1/">
<metadata><dc:title>A Game of Thrones Test Edition</dc:title><dc:language>en</dc:language><dc:publisher>Holder Test Press</dc:publisher><dc:identifier>urn:isbn:9780000000001</dc:identifier></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="prologue" href="text/prologue.xhtml" media-type="application/xhtml+xml"/><item id="bran" href="text/bran.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="prologue"/><itemref idref="bran"/></spine></package>`,
    },
    {
      name: "OEBPS/nav.xhtml",
      content: `<html><body><nav><a href="text/prologue.xhtml">Prologue</a><a href="text/bran.xhtml">Bran</a></nav></body></html>`,
    },
    {
      name: "OEBPS/text/prologue.xhtml",
      content: `<html><body><h1>PROLOGUE</h1><p>The cold opened the test.</p><p>A second bounded paragraph followed.</p></body></html>`,
    },
    {
      name: "OEBPS/text/bran.xhtml",
      content: `<html><body><h1>BRAN</h1><p>The boy watched from the exact holder edition.</p></body></html>`,
    },
  ]);
}

async function ingestPlain(root: string, version = 1) {
  const filePath = writeSource(
    root,
    `Jonathan-private-AGOT-source-${version}.txt`,
    plainBook(version),
  );
  const result = await intakeAsoiafLocalEdition({
    root,
    sourceId: "local-agot",
    editionId: "AGOT holder paperback test",
    filePath,
    ingestedAt: `2026-08-04T1${version}:00:00.000Z`,
    refresh: version > 1,
  });
  return { filePath, ...result };
}

describe("ASOIAF local-edition intake", () => {
  it("segments a private text copy and retains neither source path, filename, nor text in public projections", async () => {
    const root = temporaryRoot();
    const result = await ingestPlain(root);
    expect(result.manifest).toEqual(
      expect.objectContaining({
        sourceId: "local-agot",
        continuityId: "book-main",
        inputFormat: "plain-text",
        sourcePathRetained: false,
        sourceFilenameRetained: false,
        privateTextRetained: true,
        unitCount: 3,
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
    expect(result.units.map((unit) => unit.label)).toEqual([
      "PROLOGUE",
      "BRAN",
      "CATELYN",
    ]);
    expect(result.segments.length).toBeGreaterThanOrEqual(5);
    expect(
      verifyAsoiafLocalEdition(
        root,
        result.manifest.sourceId,
        result.manifest.editionId,
      ),
    ).toEqual([]);

    const paths = localEditionPaths(
      root,
      result.manifest.sourceId,
      result.manifest.editionId,
    );
    const publicProjection = [
      fs.readFileSync(paths.manifest, "utf8"),
      fs.readFileSync(paths.units, "utf8"),
      fs.readFileSync(paths.segments, "utf8"),
      fs.readFileSync(paths.privateIndex, "utf8"),
    ].join("\n");
    expect(publicProjection).not.toContain(result.filePath);
    expect(publicProjection).not.toContain(path.basename(result.filePath));
    expect(publicProjection).not.toContain("The cold opened the private holder copy");

    const observations = readNdjson<CollectorObservationRecord>(
      collectorEstatePaths(root).observations,
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]).toEqual(
      expect.objectContaining({
        sourceId: "local-agot",
        sourceRecordId: result.manifest.sourceRecordId,
        contentDigest: result.manifest.sourceDigest,
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
  });

  it("parses bounded EPUB metadata, spine order, navigation labels, and heading-bearing paragraph locators", async () => {
    const root = temporaryRoot();
    const filePath = writeSource(root, "private-holder-copy.epub", syntheticEpub());
    const result = await intakeAsoiafLocalEdition({
      root,
      sourceId: "local-agot",
      editionId: "AGOT synthetic EPUB test",
      filePath,
      ingestedAt: "2026-08-04T12:05:00.000Z",
    });
    expect(result.manifest.inputFormat).toBe("epub");
    expect(result.manifest.metadata).toEqual({
      title: "A Game of Thrones Test Edition",
      language: "en",
      publisher: "Holder Test Press",
      identifiers: ["urn:isbn:9780000000001"],
    });
    expect(result.units.map((unit) => unit.label)).toEqual(["Prologue", "Bran"]);
    expect(result.units.map((unit) => unit.sourcePart)).toEqual([
      "OEBPS/text/prologue.xhtml",
      "OEBPS/text/bran.xhtml",
    ]);
    expect(result.segments).toHaveLength(5);
    expect(
      verifyAsoiafLocalEdition(
        root,
        result.manifest.sourceId,
        result.manifest.editionId,
      ),
    ).toEqual([]);
  });

  it("supports digest-and-locator custody without private extracted text", async () => {
    const root = temporaryRoot();
    const filePath = writeSource(root, "digest-only.txt", plainBook());
    const result = await intakeAsoiafLocalEdition({
      root,
      sourceId: "local-agot",
      editionId: "AGOT digest-only edition",
      filePath,
      ingestedAt: "2026-08-04T12:10:00.000Z",
      retainPrivateText: false,
    });
    expect(result.manifest.privateTextRetained).toBe(false);
    expect(result.manifest.files.privateIndex).toBeNull();
    expect(fs.existsSync(result.paths.privateRoot)).toBe(false);
    expect(
      verifyAsoiafLocalEdition(
        root,
        result.manifest.sourceId,
        result.manifest.editionId,
      ),
    ).toEqual([]);
  });

  it("appends revised bytes to one durable edition candidate", async () => {
    const root = temporaryRoot();
    const first = await ingestPlain(root, 1);
    const second = await ingestPlain(root, 2);
    expect(second.manifest.sourceRecordId).toBe(first.manifest.sourceRecordId);
    expect(second.manifest.collectorCandidateId).toBe(
      first.manifest.collectorCandidateId,
    );
    expect(second.manifest.collectorObservationId).not.toBe(
      first.manifest.collectorObservationId,
    );
    expect(listAsoiafLocalEditions(root)).toHaveLength(1);
    expect(
      readNdjson<CollectorObservationRecord>(
        collectorEstatePaths(root).observations,
      ),
    ).toHaveLength(2);
  });

  it("detects private-text tampering and reveals text only through an explicit transaction", async () => {
    const root = temporaryRoot();
    const result = await ingestPlain(root);
    const unit = result.units[0]!;
    const segment = result.segments.find((entry) => entry.unitId === unit.unitId)!;
    expect(
      locateAsoiafLocalEditionText({
        root,
        sourceId: result.manifest.sourceId,
        editionId: result.manifest.editionId,
        unitId: unit.unitId,
        segmentId: segment.segmentId,
      }).text,
    ).toBeNull();
    expect(
      locateAsoiafLocalEditionText({
        root,
        sourceId: result.manifest.sourceId,
        editionId: result.manifest.editionId,
        unitId: unit.unitId,
        segmentId: segment.segmentId,
        includeText: true,
      }).text,
    ).toContain("The cold opened");

    const index = JSON.parse(
      fs.readFileSync(result.paths.privateIndex, "utf8"),
    ) as { entries: Array<{ relativeUri: string }> };
    fs.appendFileSync(
      path.join(result.paths.editionRoot, index.entries[0]!.relativeUri),
      "\nInjected drift.",
      "utf8",
    );
    expect(
      verifyAsoiafLocalEdition(
        root,
        result.manifest.sourceId,
        result.manifest.editionId,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("failed digest or size custody"),
      ]),
    );
  });

  it("emits deterministic verification receipts", async () => {
    const root = temporaryRoot();
    const result = await ingestPlain(root);
    const first = writeAsoiafLocalEditionReceipt(
      root,
      result.manifest.sourceId,
      result.manifest.editionId,
      "2026-08-04T14:00:00.000Z",
    );
    const second = writeAsoiafLocalEditionReceipt(
      root,
      result.manifest.sourceId,
      result.manifest.editionId,
      "2026-08-04T14:00:00.000Z",
    );
    expect(first).toEqual(second);
    expect(first.passed).toBe(true);
    expect(JSON.stringify(first)).not.toContain(path.basename(result.filePath));
  });

  it("refuses public sources, source-size violations, and EPUB traversal", async () => {
    const root = temporaryRoot();
    const textPath = writeSource(root, "small.txt", plainBook());
    await expect(
      intakeAsoiafLocalEdition({
        root,
        sourceId: "grrm-home",
        editionId: "invalid public source",
        filePath: textPath,
      }),
    ).rejects.toThrow("not a holder-controlled local source");
    await expect(
      intakeAsoiafLocalEdition({
        root,
        sourceId: "local-agot",
        editionId: "oversize fixture",
        filePath: textPath,
        maxSourceBytes: 8,
      }),
    ).rejects.toThrow("exceeds bounded intake policy");

    const malicious = storedZip([
      {
        name: "META-INF/container.xml",
        content: `<container><rootfile full-path="../book.opf"/></container>`,
      },
      { name: "../book.opf", content: "<package/>" },
    ]);
    const epubPath = writeSource(root, "unsafe.epub", malicious);
    await expect(
      intakeAsoiafLocalEdition({
        root,
        sourceId: "local-agot",
        editionId: "unsafe EPUB fixture",
        filePath: epubPath,
      }),
    ).rejects.toThrow("unsafe ZIP member");
  });
});
