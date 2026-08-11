import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSourceHealthPlan,
  buildSourceHealthSnapshot,
  initializeSourceHealth,
  recordSourceHealthObservation,
  verifySourceHealth,
  writeSourceHealthReports,
} from "../tools/lib/asoiaf-external-source-health.js";
import {
  collectorEstatePaths,
  commitObservation,
  initializeCollectorEstate,
  loadSourceLedger,
  recordAttempt,
  recordGap,
  upsertCacheIndex,
  writeJsonAtomic,
} from "../tools/lib/asoiaf-external-estate.js";

const roots: string[] = [];
const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
const DIGEST_B = `sha256:${"b".repeat(64)}` as const;

function estateRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asoiaf-source-health-"));
  roots.push(root);
  return root;
}

function commitMetadataObservation(input: {
  root: string;
  sourceId: string;
  sourceRecordId: string;
  at: string;
  digest?: `sha256:${string}`;
  credit?: {
    title: string;
    author: string;
    license: string;
    sourceUri: string;
  } | null;
}) {
  const committed = commitObservation({
    root: input.root,
    sourceId: input.sourceId,
    sourceRecordId: input.sourceRecordId,
    retrievedAt: input.at,
    contentDigest: input.digest ?? DIGEST_A,
    recordType: "synthetic-health-fixture",
    title: `Fixture ${input.sourceRecordId}`,
    summary: "Synthetic source-health fixture.",
    mediaType: "application/json",
    responseBytes: 128,
    retainedFields: ["id", "title"],
    retention: "metadata-only",
    sourceUri: `https://example.test/${encodeURIComponent(input.sourceRecordId)}`,
    credit: input.credit ?? null,
    retainedValue: { id: input.sourceRecordId, title: "Fixture" },
    requestCount: 1,
    cacheHit: false,
  });
  recordAttempt({
    root: input.root,
    sourceId: input.sourceId,
    sourceRecordId: input.sourceRecordId,
    startedAt: input.at,
    completedAt: input.at,
    outcome: "observed",
    requestCount: 1,
    cacheHit: false,
    receiptUri: committed.observation.receiptUri,
    observationId: committed.observation.observationId,
    gapId: null,
  });
  return committed;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("ASOIAF external source health", () => {
  it("audits the pristine 219-source estate without inventing collection success", () => {
    const root = estateRoot();
    initializeSourceHealth(root, "2026-08-04T00:00:00.000Z");
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-04T00:00:00.000Z",
    );
    expect(snapshot.sourceCount).toBe(219);
    expect(snapshot.errorCount).toBe(0);
    expect(snapshot.countsByTerminalStatus["never-attempted"]).toBe(219);
    expect(snapshot.countsByStatus["never-attempted"]).toBeGreaterThan(0);
    expect(snapshot.rightsReviewCount).toBeGreaterThan(0);
    expect(verifySourceHealth(root, snapshot.generatedAt)).toEqual([]);
  });

  it("keeps a collected source fresh until its source-specific refresh cadence expires", () => {
    const root = estateRoot();
    commitMetadataObservation({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q1",
      at: "2026-08-04T00:00:00.000Z",
    });
    const fresh = buildSourceHealthSnapshot(
      root,
      "2026-08-10T00:00:00.000Z",
    ).records.find((record) => record.sourceId === "structured-wikidata");
    expect(fresh?.status).toBe("fresh");
    expect(fresh?.dueAt).toBe("2026-09-03T00:00:00.000Z");

    const due = buildSourceHealthSnapshot(
      root,
      "2026-09-04T00:00:00.000Z",
    ).records.find((record) => record.sourceId === "structured-wikidata");
    expect(due?.status).toBe("due");
    expect(
      buildSourceHealthPlan(root, "2026-09-04T00:00:00.000Z", 300).tasks,
    ).toContainEqual(
      expect.objectContaining({
        sourceId: "structured-wikidata",
        taskType: "collect",
      }),
    );
  });

  it("gives route-only terminals a slow refresh cadence instead of hammering them", () => {
    const root = estateRoot();
    recordGap({
      root,
      sourceId: "discussion-reddit-asoiaf",
      sourceRecordId: "https://www.reddit.com/r/asoiaf/",
      attemptedAt: "2026-08-04T00:00:00.000Z",
      status: "route-only",
      reason: "link-only route retained without collection",
    });
    const early = buildSourceHealthSnapshot(
      root,
      "2026-09-01T00:00:00.000Z",
    ).records.find((record) => record.sourceId === "discussion-reddit-asoiaf");
    expect(early?.status).toBe("fresh");
    expect(early?.cadenceDays).toBe(180);

    const late = buildSourceHealthSnapshot(
      root,
      "2027-02-01T00:00:00.000Z",
    ).records.find((record) => record.sourceId === "discussion-reddit-asoiaf");
    expect(late?.status).toBe("due");
  });

  it("routes unresolved source rights into a named review queue", () => {
    const root = estateRoot();
    initializeSourceHealth(root, "2026-08-04T00:00:00.000Z");
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-04T00:00:00.000Z",
    );
    const source = snapshot.records.find(
      (record) => record.sourceId === "structured-google-books-api",
    );
    expect(source?.status).toBe("rights-review");
    expect(source?.rightsReviewRequired).toBe(true);
    expect(
      buildSourceHealthPlan(root, snapshot.generatedAt, 300).tasks,
    ).toContainEqual(
      expect.objectContaining({
        sourceId: "structured-google-books-api",
        taskType: "review-rights",
      }),
    );
  });

  it("detects a cache index entry whose retained file is missing", () => {
    const root = estateRoot();
    const committed = commitMetadataObservation({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q2",
      at: "2026-08-04T01:00:00.000Z",
    });
    upsertCacheIndex(root, {
      cacheKey: "asoiaf-external-cache:missing-file",
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q2",
      contentDigest: committed.observation.contentDigest,
      observationId: committed.observation.observationId,
      cacheUri: "cache/structured-wikidata/missing.json",
      storedAt: "2026-08-04T01:00:00.000Z",
    });
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-04T02:00:00.000Z",
    );
    expect(snapshot.findings.map((entry) => entry.code)).toContain(
      "missing-cache-file",
    );
    expect(
      buildSourceHealthPlan(root, snapshot.generatedAt, 300).tasks,
    ).toContainEqual(
      expect.objectContaining({
        sourceId: "structured-wikidata",
        taskType: "repair-cache",
      }),
    );
  });

  it("detects cache files that have no cache-index custody", () => {
    const root = estateRoot();
    initializeCollectorEstate(root, "2026-08-04T00:00:00.000Z");
    const orphan = path.join(
      collectorEstatePaths(root).cache,
      "orphan-source",
      "orphan.bin",
    );
    fs.mkdirSync(path.dirname(orphan), { recursive: true });
    fs.writeFileSync(orphan, "orphan cache bytes", "utf8");
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-04T00:00:00.000Z",
    );
    expect(snapshot.errorCount).toBe(0);
    expect(snapshot.findings.map((entry) => entry.code)).toContain(
      "orphan-cache-file",
    );
  });

  it("detects missing required attribution at both observation and public-credit surfaces", () => {
    const root = estateRoot();
    const committed = commitMetadataObservation({
      root,
      sourceId: "structured-awoiaf-api",
      sourceRecordId: "awoiaf:pageid:123",
      at: "2026-08-04T03:00:00.000Z",
      credit: null,
    });
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-04T04:00:00.000Z",
    );
    expect(snapshot.findings.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "missing-observation-credit",
        "missing-public-credit",
      ]),
    );
    expect(
      buildSourceHealthPlan(root, snapshot.generatedAt, 300).tasks,
    ).toContainEqual(
      expect.objectContaining({
        sourceId: committed.observation.sourceId,
        taskType: "repair-credit",
      }),
    );
  });

  it("detects public-credit overreach for a source whose license requires no visible credit", () => {
    const root = estateRoot();
    const committed = commitMetadataObservation({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q3",
      at: "2026-08-04T05:00:00.000Z",
    });
    const paths = collectorEstatePaths(root);
    writeJsonAtomic(paths.creditsJson, {
      format: "axm-asoiaf-external-credits/1",
      atlasFingerprint: "fixture",
      recordCount: 1,
      records: [
        {
          observationId: committed.observation.observationId,
          sourceId: "structured-wikidata",
          title: "Fixture credit",
          author: "Fixture",
          license: "cc0",
          sourceUri: "https://example.test/Q3",
        },
      ],
    });
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-04T06:00:00.000Z",
    );
    expect(snapshot.findings.map((entry) => entry.code)).toContain(
      "public-credit-overreach",
    );
  });

  it("detects route, robots, terms, and availability drift without creating authority", () => {
    const root = estateRoot();
    recordSourceHealthObservation(root, {
      sourceId: "grrm-not-a-blog",
      checkedAt: "2026-08-04T00:00:00.000Z",
      targetUri: "https://georgerrmartin.com/notablog/",
      status: "available",
      httpStatus: 200,
      routeDigest: DIGEST_A,
      robotsDigest: DIGEST_A,
      termsDigest: DIGEST_A,
    });
    const latest = recordSourceHealthObservation(root, {
      sourceId: "grrm-not-a-blog",
      checkedAt: "2026-08-05T00:00:00.000Z",
      targetUri: "https://georgerrmartin.com/notablog/",
      status: "terms-review",
      httpStatus: 200,
      routeDigest: DIGEST_A,
      robotsDigest: DIGEST_B,
      termsDigest: DIGEST_B,
      notes: "Robots or terms identity changed.",
    });
    expect(latest.graphEffect).toBe("none");
    expect(latest.canonEffect).toBe("none");
    const snapshot = buildSourceHealthSnapshot(
      root,
      "2026-08-05T01:00:00.000Z",
    );
    expect(snapshot.routeDriftCount).toBe(1);
    expect(snapshot.findings.map((entry) => entry.code)).toContain(
      "source-route-drift",
    );
    expect(
      buildSourceHealthPlan(root, snapshot.generatedAt, 300).tasks,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "grrm-not-a-blog",
          taskType: "inspect-drift",
        }),
        expect.objectContaining({
          sourceId: "grrm-not-a-blog",
          taskType: "review-rights",
        }),
      ]),
    );
  });

  it("keeps snapshot identity deterministic under source-ledger row reordering", () => {
    const root = estateRoot();
    initializeSourceHealth(root, "2026-08-04T00:00:00.000Z");
    const at = "2026-08-04T00:00:00.000Z";
    const first = buildSourceHealthSnapshot(root, at);
    const ledger = loadSourceLedger(root);
    writeJsonAtomic(collectorEstatePaths(root).sourceLedger, [...ledger].reverse());
    const second = buildSourceHealthSnapshot(root, at);
    expect(second).toEqual(first);
  });

  it("writes deterministic machine and operator reports without repository mutation", () => {
    const root = estateRoot();
    const report = writeSourceHealthReports(
      root,
      "2026-08-04T00:00:00.000Z",
      20,
    );
    expect(fs.existsSync(report.paths.snapshotJson)).toBe(true);
    expect(fs.existsSync(report.paths.snapshotMarkdown)).toBe(true);
    expect(fs.existsSync(report.paths.refreshPlan)).toBe(true);
    expect(
      fs.readFileSync(report.paths.snapshotMarkdown, "utf8"),
    ).toContain("Sources: **219**");

    const workflow = fs.readFileSync(
      ".github/workflows/asoiaf.yml",
      "utf8",
    );
    expect(workflow).toMatch(/name: ASOIAF canon estate qualification/);
    expect(workflow).not.toMatch(/git\s+(add|commit|push)/);
    expect(workflow).not.toMatch(/permissions:\s*[\s\S]*contents:\s*write/);
  });
});
