import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAsoiafStructuredRequestPlan,
  commitAsoiafStructuredPayload,
  normalizeAsoiafStructuredPayload,
} from "../tools/lib/asoiaf-structured-public-adapters.js";
import {
  collectorEstatePaths,
  collectorStatus,
  readJson,
  readNdjson,
  verifyCollectorEstate,
  type CollectorObservationRecord,
} from "../tools/lib/asoiaf-external-estate.js";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asoiaf-structured-adapter-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

const wikidataFixture = {
  head: { vars: ["item", "itemLabel", "publicationDate"] },
  results: {
    bindings: [
      {
        item: {
          type: "uri",
          value: "http://www.wikidata.org/entity/Q1000001",
        },
        itemLabel: {
          type: "literal",
          value: "A Game of Thrones",
          "xml:lang": "en",
        },
        publicationDate: {
          type: "literal",
          value: "1996-08-06T00:00:00Z",
          datatype: "http://www.w3.org/2001/XMLSchema#dateTime",
        },
      },
    ],
  },
};

const openLibraryFixture = {
  numFound: 1,
  docs: [
    {
      key: "/works/OL82563W",
      title: "A Game of Thrones",
      author_name: ["George R. R. Martin"],
      author_key: ["OL234664A"],
      first_publish_year: 1996,
      publish_date: ["1996", "2011"],
      publisher: ["Bantam Books"],
      language: ["eng"],
      subject: ["Fantasy fiction", "Kings and rulers"],
      isbn_10: ["0553103547"],
      isbn_13: ["9780553103540"],
      edition_key: ["OL7353617M"],
      description: "This intentionally unretained description may be copyrighted.",
    },
  ],
};

const crossrefFixture = {
  status: "ok",
  message: {
    items: [
      {
        DOI: "10.1234/asoiaf.test",
        type: "journal-article",
        title: ["Dynastic Legitimacy in Imagined Medieval Polities"],
        author: [
          {
            given: "Ada",
            family: "Scholar",
            ORCID: "https://orcid.org/0000-0002-1825-0097",
            sequence: "first",
            affiliation: [
              {
                name: "Institution, 100 Test Street, example@example.org",
              },
            ],
          },
        ],
        publisher: "Example Press",
        issued: { "date-parts": [[2024, 5, 3]] },
        indexed: { "date-time": "2026-08-01T00:00:00Z" },
        ISBN: ["9780000000002"],
        URL: "https://doi.org/10.1234/asoiaf.test",
        abstract: "Copyrighted abstract with contact@example.org that must not survive normalization.",
        "reference-count": 12,
        "is-referenced-by-count": 4,
      },
    ],
  },
};

const awoiafFixture = {
  batchcomplete: true,
  query: {
    pages: [
      {
        pageid: 123,
        ns: 0,
        title: "Varys",
        touched: "2026-07-31T22:00:00Z",
        lastrevid: 456,
        length: 12000,
        canonicalurl: "https://awoiaf.westeros.org/index.php/Varys",
        categories: [
          { ns: 14, title: "Category:Characters" },
          { ns: 14, title: "Category:Spymasters" },
        ],
        links: [
          { ns: 0, title: "Aerys II Targaryen" },
          { ns: 6, title: "File:Varys.jpg" },
        ],
        revisions: [
          {
            revid: 456,
            parentid: 455,
            timestamp: "2026-07-31T21:58:00Z",
            slots: {
              main: {
                content: "Varys is described here in bounded CC BY-SA wiki text.",
              },
            },
          },
        ],
      },
    ],
  },
};

describe("ASOIAF structured public adapters", () => {
  it("builds bounded official-API request plans without performing acquisition", () => {
    const wikidata = buildAsoiafStructuredRequestPlan({
      adapterId: "wikidata-sparql",
      requestId: "wikidata:asoiaf-books",
      query: "SELECT ?item ?itemLabel WHERE { ?item wdt:P31 wd:Q7725634. } LIMIT 25",
    });
    expect(wikidata.sourceId).toBe("structured-wikidata");
    expect(wikidata.url).toContain("query.wikidata.org");
    expect(wikidata.headers.Accept).toBe("application/sparql-results+json");
    expect(wikidata.graphEffect).toBe("none");
    expect(wikidata.canonEffect).toBe("none");

    const openLibrary = buildAsoiafStructuredRequestPlan({
      adapterId: "openlibrary-catalog",
      requestId: "openlibrary:agot",
      search: "A Game of Thrones George R. R. Martin",
      recordLimit: 10,
    });
    expect(openLibrary.url).toContain("openlibrary.org/search.json");
    expect(openLibrary.url).toContain("limit=10");

    const crossref = buildAsoiafStructuredRequestPlan({
      adapterId: "crossref-works",
      requestId: "crossref:dynastic-legitimacy",
      query: "dynastic legitimacy medieval literature",
    });
    expect(crossref.url).toContain("api.crossref.org/works");
    expect(crossref.url).toContain("mailto=");

    const awoiaf = buildAsoiafStructuredRequestPlan({
      adapterId: "awoiaf-mediawiki",
      requestId: "awoiaf:varys",
      titles: ["Varys"],
      includeText: false,
    });
    expect(awoiaf.url).toContain("awoiaf.westeros.org/api.php");
    expect(awoiaf.url).toContain("formatversion=2");
    expect(awoiaf.url).not.toContain("rvslots=main");
  });

  it("normalizes Wikidata bindings under CC0 without assigning fictional authority", () => {
    const result = normalizeAsoiafStructuredPayload({
      adapterId: "wikidata-sparql",
      sourceId: "structured-wikidata",
      requestId: "wikidata:asoiaf-books",
      sourceUri: "https://query.wikidata.org/sparql?query=bounded",
      payload: wikidataFixture,
    });
    expect(result.rejected).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        sourceRecordId: expect.stringContaining("wikidata:Q1000001"),
        title: "A Game of Thrones",
        recordType: "wikidata-sparql-binding",
        attribution: null,
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
  });

  it("retains Open Library bibliographic facts while excluding descriptions", () => {
    const result = normalizeAsoiafStructuredPayload({
      adapterId: "openlibrary-catalog",
      sourceId: "structured-openlibrary-api",
      requestId: "openlibrary:agot",
      sourceUri: "https://openlibrary.org/search.json?q=agot",
      payload: openLibraryFixture,
    });
    expect(result.records).toHaveLength(1);
    const serialized = JSON.stringify(result.records[0]);
    expect(serialized).toContain("OL82563W");
    expect(serialized).toContain("9780553103540");
    expect(serialized).not.toContain("unretained description");
    expect(result.records[0]?.attribution).toBeNull();
  });

  it("retains Crossref bibliographic metadata while refusing abstracts and affiliations", () => {
    const result = normalizeAsoiafStructuredPayload({
      adapterId: "crossref-works",
      sourceId: "structured-crossref-api",
      requestId: "crossref:asoiaf-test",
      sourceUri: "https://api.crossref.org/works?query=bounded",
      payload: crossrefFixture,
    });
    expect(result.rejected).toEqual([]);
    expect(result.records).toHaveLength(1);
    const serialized = JSON.stringify(result.records[0]);
    expect(serialized).toContain("10.1234/asoiaf.test");
    expect(serialized).toContain("abstractRetained");
    expect(serialized).not.toContain("Copyrighted abstract");
    expect(serialized).not.toContain("100 Test Street");
    expect(serialized).not.toContain("example@example.org");
  });

  it("keeps AWOIAF text opt-in, removes media-file routes, and emits CC BY-SA attribution", () => {
    const metadataOnly = normalizeAsoiafStructuredPayload({
      adapterId: "awoiaf-mediawiki",
      sourceId: "structured-awoiaf-api",
      requestId: "awoiaf:varys",
      sourceUri: "https://awoiaf.westeros.org/api.php?bounded=1",
      payload: awoiafFixture,
    });
    expect(metadataOnly.records).toHaveLength(1);
    expect(JSON.stringify(metadataOnly.records[0])).not.toContain("bounded CC BY-SA wiki text");
    expect(JSON.stringify(metadataOnly.records[0])).not.toContain("File:Varys.jpg");
    expect(metadataOnly.records[0]?.attribution).toEqual(
      expect.objectContaining({
        author: "A Wiki of Ice and Fire contributors",
        license: "CC-BY-SA",
        sourceUri: expect.stringContaining("oldid=456"),
      }),
    );

    const withText = normalizeAsoiafStructuredPayload({
      adapterId: "awoiaf-mediawiki",
      sourceId: "structured-awoiaf-api",
      requestId: "awoiaf:varys:text",
      sourceUri: "https://awoiaf.westeros.org/api.php?bounded=1",
      payload: awoiafFixture,
      includeText: true,
      maxTextCharacters: 30,
    });
    expect(JSON.stringify(withText.records[0])).toContain("Varys is described here in bo");
    expect(JSON.stringify(withText.records[0])).not.toContain("wiki text.");
  });

  it("commits normalized records through the collector and exposes only required public credit", () => {
    const root = temporaryRoot();
    const wikidata = commitAsoiafStructuredPayload({
      root,
      adapterId: "wikidata-sparql",
      sourceId: "structured-wikidata",
      requestId: "wikidata:asoiaf-books",
      sourceUri: "https://query.wikidata.org/sparql?query=bounded",
      payload: wikidataFixture,
      retrievedAt: "2026-08-04T15:00:00.000Z",
    });
    const awoiaf = commitAsoiafStructuredPayload({
      root,
      adapterId: "awoiaf-mediawiki",
      sourceId: "structured-awoiaf-api",
      requestId: "awoiaf:varys",
      sourceUri: "https://awoiaf.westeros.org/api.php?bounded=1",
      payload: awoiafFixture,
      retrievedAt: "2026-08-04T15:01:00.000Z",
    });
    expect(wikidata.receipt.outcome).toBe("observed");
    expect(awoiaf.receipt.outcome).toBe("observed");
    expect(wikidata.observations[0]?.authorityClass).toBe("structured-dataset");
    expect(awoiaf.observations[0]?.authorityClass).toBe("structured-dataset");
    expect(wikidata.observations[0]?.canonEffect).toBe("none");
    expect(awoiaf.observations[0]?.canonEffect).toBe("none");
    expect(
      readNdjson<CollectorObservationRecord>(
        collectorEstatePaths(root).observations,
      ),
    ).toHaveLength(2);
    const credits = readJson<{
      records: Array<{ sourceId: string; observationId: string }>;
    }>(collectorEstatePaths(root).creditsJson, { records: [] });
    expect(credits.records).toHaveLength(1);
    expect(credits.records[0]?.sourceId).toBe("structured-awoiaf-api");
    expect(credits.records[0]?.observationId).toBe(
      awoiaf.observations[0]?.observationId,
    );
    expect(collectorStatus(root).creditRecordCount).toBe(1);
    expect(verifyCollectorEstate(root)).toEqual([]);
  });

  it("appends normalized revisions to one stable source-record candidate", () => {
    const root = temporaryRoot();
    const first = commitAsoiafStructuredPayload({
      root,
      adapterId: "openlibrary-catalog",
      sourceId: "structured-openlibrary-api",
      requestId: "openlibrary:agot:first",
      sourceUri: "https://openlibrary.org/works/OL82563W.json",
      payload: openLibraryFixture,
      retrievedAt: "2026-08-04T16:00:00.000Z",
    });
    const revised = structuredClone(openLibraryFixture);
    revised.docs[0]!.publisher.push("Revised Publisher");
    const second = commitAsoiafStructuredPayload({
      root,
      adapterId: "openlibrary-catalog",
      sourceId: "structured-openlibrary-api",
      requestId: "openlibrary:agot:second",
      sourceUri: "https://openlibrary.org/works/OL82563W.json",
      payload: revised,
      retrievedAt: "2026-08-05T16:00:00.000Z",
    });
    expect(first.observations[0]?.candidateId).toBe(
      second.observations[0]?.candidateId,
    );
    expect(first.observations[0]?.observationId).not.toBe(
      second.observations[0]?.observationId,
    );
    expect(collectorStatus(root).currentCandidateCount).toBe(1);
    expect(collectorStatus(root).observationCount).toBe(2);
  });

  it("refuses source-adapter mismatch, unbounded Wikidata plans, and oversized payloads", () => {
    expect(() =>
      normalizeAsoiafStructuredPayload({
        adapterId: "wikidata-sparql",
        sourceId: "structured-crossref-api",
        requestId: "mismatch",
        sourceUri: "https://example.test/",
        payload: wikidataFixture,
      }),
    ).toThrow("not registered for adapter");
    expect(() =>
      buildAsoiafStructuredRequestPlan({
        adapterId: "wikidata-sparql",
        requestId: "missing-limit",
        query: "SELECT ?item WHERE { ?item wdt:P31 wd:Q7725634. }",
      }),
    ).toThrow("explicit LIMIT");

    const root = temporaryRoot();
    const result = commitAsoiafStructuredPayload({
      root,
      adapterId: "wikidata-sparql",
      sourceId: "structured-wikidata",
      requestId: "oversize",
      sourceUri: "https://query.wikidata.org/sparql?query=oversize",
      payload: { value: "x".repeat(8_100_000) },
      retrievedAt: "2026-08-04T17:00:00.000Z",
    });
    expect(result.receipt.outcome).toBe("refused");
    expect(result.gap?.status).toBe("rejected-oversize");
    expect(result.observations).toEqual([]);
  });
});
