import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  intakeAsoiafLocalEdition,
  localEditionPaths,
} from "../tools/lib/asoiaf-local-edition-intake.js";
import {
  compileAsoiafPrivateResearchIndex,
  privateResearchPaths,
  readAsoiafPrivateResearchIndex,
  searchAsoiafPrivateResearchIndex,
  verifyAsoiafPrivateResearchIndex,
  writeAsoiafPrivateResearchIndex,
  writeAsoiafPrivateResearchReceipt,
} from "../tools/lib/asoiaf-private-research-index.js";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asoiaf-private-search-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

function writeSource(root: string, name: string, content: string): string {
  const directory = path.join(root, "holder-input");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, name);
  fs.writeFileSync(target, content, "utf8");
  return target;
}

const AGOT_TEXT = `PROLOGUE
The cold opened beyond the Wall, and the dead walked beneath moonlight.

A ranger listened while the weirwood silence gathered.

BRAN
The boy watched a king pass judgment beneath the old trees.

The direwolf waited beside the snow.

CATELYN
The household counted grain, guards, ravens, and uncertain loyalties.`;

const ACOK_TEXT = `PROLOGUE
A red comet burned above Dragonstone while a maester watched the sky.

DAVOS
The red priestess spoke of shadow, sacrifice, and a king's blood.

TYRION
The city measured wildfire, bread, gates, and the price of siege.`;

async function ingestEdition(input: {
  root: string;
  sourceId: "local-agot" | "local-acok";
  editionId: string;
  content: string;
  retainPrivateText?: boolean;
  at: string;
}) {
  const filePath = writeSource(
    input.root,
    `${input.sourceId}-${input.editionId.replace(/\s+/g, "-")}.txt`,
    input.content,
  );
  return intakeAsoiafLocalEdition({
    root: input.root,
    sourceId: input.sourceId,
    editionId: input.editionId,
    filePath,
    ingestedAt: input.at,
    retainPrivateText: input.retainPrivateText,
  });
}

async function buildTwoEditionEstate(root: string) {
  const agot = await ingestEdition({
    root,
    sourceId: "local-agot",
    editionId: "AGOT private search fixture",
    content: AGOT_TEXT,
    at: "2026-08-04T10:00:00.000Z",
  });
  const acok = await ingestEdition({
    root,
    sourceId: "local-acok",
    editionId: "ACOK private search fixture",
    content: ACOK_TEXT,
    at: "2026-08-04T10:01:00.000Z",
  });
  const index = writeAsoiafPrivateResearchIndex({
    root,
    generatedAt: "2026-08-04T11:00:00.000Z",
  });
  return { agot, acok, index };
}

describe("ASOIAF private research index", () => {
  it("builds a deterministic locator index without graph or canon authority", async () => {
    const root = temporaryRoot();
    const { index } = await buildTwoEditionEstate(root);

    expect(index.editionBindings).toHaveLength(2);
    expect(index.skippedEditions).toEqual([]);
    expect(index.documentCount).toBeGreaterThanOrEqual(7);
    expect(index.termCount).toBeGreaterThan(20);
    expect(index.totalTokenCount).toBeGreaterThan(40);
    expect(index.graphEffect).toBe("none");
    expect(index.canonEffect).toBe("none");
    expect(
      index.documents.every(
        (document) =>
          document.graphEffect === "none"
          && document.canonEffect === "none"
          && /^sha256:[a-f0-9]{64}$/.test(document.locator.contentDigest)
          && /^sha256:[a-f0-9]{64}$/.test(document.textDigest),
      ),
    ).toBe(true);
    expect(verifyAsoiafPrivateResearchIndex(root)).toEqual([]);

    const rebuilt = compileAsoiafPrivateResearchIndex({
      root,
      generatedAt: index.generatedAt,
    });
    expect(rebuilt).toEqual(index);
    expect(readAsoiafPrivateResearchIndex(root)).toEqual(index);
  });

  it("returns exact source, edition, unit, segment, and locator identity without text by default", async () => {
    const root = temporaryRoot();
    const { agot } = await buildTwoEditionEstate(root);
    const receipt = searchAsoiafPrivateResearchIndex(root, {
      text: "weirwood silence",
      mode: "all",
    });

    expect(receipt.returnedCount).toBe(1);
    expect(receipt.includeText).toBe(false);
    expect(receipt.graphEffect).toBe("none");
    expect(receipt.canonEffect).toBe("none");
    expect(receipt.matches[0]).toEqual(
      expect.objectContaining({
        sourceId: "local-agot",
        editionKey: agot.manifest.editionKey,
        unitLabel: "PROLOGUE",
        matchedTerms: ["silence", "weirwood"],
        snippet: null,
        snippetDigest: null,
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
    expect(receipt.matches[0]?.locator.contentDigest).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(receipt)).not.toContain("A ranger listened");
  });

  it("reveals a bounded private snippet only through explicit include-text", async () => {
    const root = temporaryRoot();
    await buildTwoEditionEstate(root);
    const hidden = searchAsoiafPrivateResearchIndex(root, {
      text: "red priestess",
      mode: "phrase",
    });
    expect(hidden.matches[0]?.snippet).toBeNull();

    const visible = searchAsoiafPrivateResearchIndex(root, {
      text: "red priestess",
      mode: "phrase",
      includeText: true,
      contextCharacters: 45,
    });
    expect(visible.returnedCount).toBe(1);
    expect(visible.matches[0]?.snippet).toContain("red priestess spoke");
    expect(visible.matches[0]?.snippetDigest).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    expect(visible.queryTextDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("implements any, all, and phrase semantics deterministically", async () => {
    const root = temporaryRoot();
    await buildTwoEditionEstate(root);

    const any = searchAsoiafPrivateResearchIndex(root, {
      text: "wildfire weirwood",
      mode: "any",
      limit: 20,
    });
    expect(any.returnedCount).toBeGreaterThanOrEqual(2);
    expect(new Set(any.matches.map((match) => match.sourceId))).toEqual(
      new Set(["local-agot", "local-acok"]),
    );

    const all = searchAsoiafPrivateResearchIndex(root, {
      text: "wildfire weirwood",
      mode: "all",
    });
    expect(all.returnedCount).toBe(0);

    const exact = searchAsoiafPrivateResearchIndex(root, {
      text: "king pass judgment",
      mode: "phrase",
    });
    expect(exact.returnedCount).toBe(1);
    expect(exact.matches[0]?.unitLabel).toBe("BRAN");

    const notPhrase = searchAsoiafPrivateResearchIndex(root, {
      text: "judgment king",
      mode: "phrase",
    });
    expect(notPhrase.returnedCount).toBe(0);
  });

  it("filters by source, edition, and continuity without blending holder copies", async () => {
    const root = temporaryRoot();
    const { agot, acok } = await buildTwoEditionEstate(root);

    const sourceFiltered = searchAsoiafPrivateResearchIndex(root, {
      text: "king",
      mode: "any",
      sourceIds: ["local-acok"],
    });
    expect(sourceFiltered.matches.every((match) => match.sourceId === "local-acok")).toBe(true);

    const editionFiltered = searchAsoiafPrivateResearchIndex(root, {
      text: "king",
      mode: "any",
      editionKeys: [agot.manifest.editionKey],
    });
    expect(
      editionFiltered.matches.every(
        (match) => match.editionKey === agot.manifest.editionKey,
      ),
    ).toBe(true);
    expect(
      editionFiltered.matches.some(
        (match) => match.editionKey === acok.manifest.editionKey,
      ),
    ).toBe(false);

    const continuityFiltered = searchAsoiafPrivateResearchIndex(root, {
      text: "king",
      mode: "any",
      continuityIds: ["hbo-got"],
    });
    expect(continuityFiltered.returnedCount).toBe(0);
  });

  it("skips digest-only editions while retaining an honest index ledger", async () => {
    const root = temporaryRoot();
    await ingestEdition({
      root,
      sourceId: "local-agot",
      editionId: "AGOT searchable edition",
      content: AGOT_TEXT,
      at: "2026-08-04T12:00:00.000Z",
    });
    const digestOnly = await ingestEdition({
      root,
      sourceId: "local-acok",
      editionId: "ACOK digest-only edition",
      content: ACOK_TEXT,
      retainPrivateText: false,
      at: "2026-08-04T12:01:00.000Z",
    });
    const index = writeAsoiafPrivateResearchIndex({
      root,
      generatedAt: "2026-08-04T12:30:00.000Z",
    });
    expect(index.editionBindings).toHaveLength(1);
    expect(index.skippedEditions).toEqual([
      expect.objectContaining({
        sourceId: "local-acok",
        editionKey: digestOnly.manifest.editionKey,
        reason: "private normalized text is not retained",
      }),
    ]);
    expect(verifyAsoiafPrivateResearchIndex(root)).toEqual([]);
  });

  it("detects private-text drift and refuses to treat a stale index as valid", async () => {
    const root = temporaryRoot();
    const { agot } = await buildTwoEditionEstate(root);
    const paths = localEditionPaths(
      root,
      agot.manifest.sourceId,
      agot.manifest.editionId,
    );
    const privateIndex = JSON.parse(
      fs.readFileSync(paths.privateIndex, "utf8"),
    ) as { entries: Array<{ relativeUri: string }> };
    fs.appendFileSync(
      path.join(paths.editionRoot, privateIndex.entries[0]!.relativeUri),
      "\nInjected private drift.",
      "utf8",
    );
    const errors = verifyAsoiafPrivateResearchIndex(root);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some((error) =>
        /manifest fingerprint mismatch|failed digest or size custody|private-research index no longer matches/.test(
error,
        ),
      ),
    ).toBe(true);
  });

  it("emits deterministic index receipts without revealing query text or source text", async () => {
    const root = temporaryRoot();
    await buildTwoEditionEstate(root);
    const first = writeAsoiafPrivateResearchReceipt(
      root,
      "2026-08-04T13:00:00.000Z",
    );
    const second = writeAsoiafPrivateResearchReceipt(
      root,
      "2026-08-04T13:00:00.000Z",
    );
    expect(first).toEqual(second);
    expect(first.passed).toBe(true);
    expect(first.graphEffect).toBe("none");
    expect(first.canonEffect).toBe("none");
    expect(JSON.stringify(first)).not.toContain("weirwood");
    expect(fs.existsSync(privateResearchPaths(root).receipt)).toBe(true);
  });

  it("refuses empty queries and unverified edition custody", async () => {
    const root = temporaryRoot();
    const { agot } = await buildTwoEditionEstate(root);
    expect(() =>
      searchAsoiafPrivateResearchIndex(root, { text: "    " }),
    ).toThrow("no searchable terms");

    const paths = localEditionPaths(
      root,
      agot.manifest.sourceId,
      agot.manifest.editionId,
    );
    fs.rmSync(paths.privateIndex);
    expect(() =>
      compileAsoiafPrivateResearchIndex({
        root,
        generatedAt: "2026-08-04T14:00:00.000Z",
      }),
    ).toThrow("failed edition verification");
  });
});
