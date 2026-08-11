import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectLocalSource,
  collectNetworkSource,
  collectorCredits,
  collectorInitialize,
  collectorPlan,
  collectorPublicStatus,
  collectorVerify,
  type CollectorClock,
  type FetchLike,
} from "../tools/lib/asoiaf-external-collector.js";
import {
  collectorEstatePaths,
  currentCandidates,
  loadSourceLedger,
  readNdjson,
  type CollectorCandidateRecord,
  type CollectorGapRecord,
  type CollectorObservationRecord,
} from "../tools/lib/asoiaf-external-estate.js";

const roots: string[] = [];

function estateRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asoiaf-external-collector-"));
  roots.push(root);
  return root;
}

class FakeClock implements CollectorClock {
  private current: number;
  readonly sleeps: number[] = [];

  constructor(iso = "2026-08-04T00:00:00.000Z") {
    this.current = new Date(iso).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.current += milliseconds;
  }
}

function response(
  body: BodyInit | null,
  init: ResponseInit = {},
): Response {
  return new Response(body, init);
}

function robotsAndTarget(input: {
  targetHost: string;
  target: () => Response | Promise<Response>;
  robots?: string;
}): { fetchImpl: FetchLike; calls: URL[] } {
  const calls: URL[] = [];
  const fetchImpl: FetchLike = async (request) => {
    const url = new URL(
      typeof request === "string"
        ? request
        : request instanceof URL
          ? request.href
          : request.url,
    );
    calls.push(url);
    if (url.pathname === "/robots.txt") {
      return response(input.robots ?? "User-agent: *\nAllow: /\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    expect(url.host).toBe(input.targetHost);
    return input.target();
  };
  return { fetchImpl, calls };
}

function readEstateText(root: string): string {
  const chunks: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else chunks.push(fs.readFileSync(target).toString("utf8"));
    }
  };
  visit(root);
  return chunks.join("\n");
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("ASOIAF external collector", () => {
  it("initializes one source-ledger row per qualified atlas source", () => {
    const root = estateRoot();
    collectorInitialize(root, "2026-08-04T00:00:00.000Z");
    const status = collectorPublicStatus(root);
    expect(status.sourceCount).toBe(219);
    expect(status.countsByStatus["never-attempted"]).toBe(219);
    expect(status.observationCount).toBe(0);
    expect(status.currentCandidateCount).toBe(0);
    expect(collectorVerify(root)).toEqual([]);
    expect(loadSourceLedger(root)).toHaveLength(219);
  });

  it("records a route-only terminal without making a network request", async () => {
    const root = estateRoot();
    let fetched = false;
    const result = await collectNetworkSource({
      root,
      sourceId: "discussion-reddit-asoiaf",
      fetchImpl: async () => {
        fetched = true;
        throw new Error("route-only source must not fetch");
      },
    });
    expect(fetched).toBe(false);
    expect(result.outcome).toBe("route-only");
    expect(result.requestCount).toBe(0);
    expect(result.gap?.graphEffect).toBe("none");
    expect(result.gap?.canonEffect).toBe("none");
    expect(
      readNdjson<CollectorGapRecord>(collectorEstatePaths(root).gaps),
    ).toHaveLength(1);
  });

  it("stream-hashes an exact local edition without retaining its path, filename, or payload", async () => {
    const root = estateRoot();
    const privateDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-asoiaf-source-"),
    );
    const privateFile = path.join(privateDirectory, "secret-agot-edition.epub");
    fs.writeFileSync(privateFile, "holder-controlled exact edition bytes", "utf8");
    try {
      const result = await collectLocalSource({
        root,
        sourceId: "local-agot",
        sourceRecordId: "isbn:9780553593716:holder-copy-1",
        filePath: privateFile,
        retrievedAt: "2026-08-04T01:00:00.000Z",
      });
      expect(result.outcome).toBe("observed");
      expect(result.observation?.retention).toBe("digest-and-locator");
      expect(result.observation?.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      const estateText = readEstateText(root);
      expect(estateText).not.toContain(privateFile);
      expect(estateText).not.toContain(path.basename(privateFile));
      expect(estateText).not.toContain("holder-controlled exact edition bytes");
      expect(collectorVerify(root)).toEqual([]);
    } finally {
      fs.rmSync(privateDirectory, { recursive: true, force: true });
    }
  });

  it("honors the host-delay floor and Retry-After before succeeding", async () => {
    const root = estateRoot();
    const clock = new FakeClock();
    let targetCalls = 0;
    const mock = robotsAndTarget({
      targetHost: "retry.example.test",
      target: () => {
        targetCalls += 1;
        if (targetCalls === 1) {
          return response("slow down", {
            status: 429,
            headers: { "retry-after": "2" },
          });
        }
        return response(JSON.stringify({ id: "Q1", label: "Varys" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-title": "Wikidata record Q1",
          },
        });
      },
    });
    const result = await collectNetworkSource({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q1",
      targetUri: "https://retry.example.test/entity/Q1.json",
      fetchImpl: mock.fetchImpl,
      clock,
    });
    expect(result.outcome).toBe("observed");
    expect(result.requestCount).toBe(3);
    expect(targetCalls).toBe(2);
    expect(clock.sleeps).toEqual(expect.arrayContaining([1_500, 2_000]));
    expect(result.observation?.retention).toBe("licensed-structured-body");
    expect(result.observation?.cacheUri).toMatch(/^cache\//);
  });

  it("rejects a response whose declared size exceeds the source work-order bound", async () => {
    const root = estateRoot();
    const mock = robotsAndTarget({
      targetHost: "oversize.example.test",
      target: () =>
        response("small body with dishonest length", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": "9000000",
          },
        }),
    });
    const result = await collectNetworkSource({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:oversize",
      targetUri: "https://oversize.example.test/entity/oversize.json",
      fetchImpl: mock.fetchImpl,
      clock: new FakeClock("2026-08-04T02:00:00.000Z"),
    });
    expect(result.outcome).toBe("rejected-oversize");
    expect(result.observation).toBeNull();
    expect(result.gap?.reason).toMatch(/maximum/);
  });

  it("blocks private contact data before retaining a licensed structured body", async () => {
    const root = estateRoot();
    const mock = robotsAndTarget({
      targetHost: "contact.example.test",
      target: () =>
        response(JSON.stringify({ id: "Q2", email: "person@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const result = await collectNetworkSource({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q2",
      targetUri: "https://contact.example.test/entity/Q2.json",
      fetchImpl: mock.fetchImpl,
      clock: new FakeClock("2026-08-04T03:00:00.000Z"),
    });
    expect(result.outcome).toBe("rejected-private-contact");
    expect(result.observation).toBeNull();
    expect(readEstateText(root)).not.toContain("person@example.com");
  });

  it("appends source revisions to one candidate and replays the latest observation from cache", async () => {
    const root = estateRoot();
    const clock = new FakeClock("2026-08-04T04:00:00.000Z");
    let revision = 0;
    const mock = robotsAndTarget({
      targetHost: "revision.example.test",
      target: () => {
        revision += 1;
        return response(JSON.stringify({ id: "Q3", revision }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const first = await collectNetworkSource({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q3",
      targetUri: "https://revision.example.test/entity/Q3.json",
      fetchImpl: mock.fetchImpl,
      clock,
    });
    const second = await collectNetworkSource({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q3",
      targetUri: "https://revision.example.test/entity/Q3.json",
      refresh: true,
      fetchImpl: mock.fetchImpl,
      clock,
    });
    let replayFetched = false;
    const replay = await collectNetworkSource({
      root,
      sourceId: "structured-wikidata",
      sourceRecordId: "wikidata:Q3",
      targetUri: "https://revision.example.test/entity/Q3.json",
      fetchImpl: async () => {
        replayFetched = true;
        throw new Error("cache replay must not fetch");
      },
      clock,
    });
    expect(first.observation?.candidateId).toBe(second.observation?.candidateId);
    expect(first.observation?.observationId).not.toBe(
      second.observation?.observationId,
    );
    const snapshots = readNdjson<CollectorCandidateRecord>(
      collectorEstatePaths(root).candidates,
    );
    const candidate = currentCandidates(snapshots).get(
      first.observation!.candidateId,
    );
    expect(candidate?.observationIds).toHaveLength(2);
    expect(candidate?.promotionStatus).toBe("intake-only");
    expect(replay.outcome).toBe("cache-replay");
    expect(replayFetched).toBe(false);
    expect(replay.observation?.observationId).toBe(
      second.observation?.observationId,
    );
  });

  it("separates complete provenance from selective public attribution", async () => {
    const root = estateRoot();
    const mock = robotsAndTarget({
      targetHost: "credit.example.test",
      target: () =>
        response(JSON.stringify({ pageid: 123, title: "Varys" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-title": "A Wiki of Ice and Fire: Varys",
          },
        }),
    });
    await collectNetworkSource({
      root,
      sourceId: "structured-awoiaf-api",
      sourceRecordId: "awoiaf:pageid:123",
      targetUri: "https://credit.example.test/api.php?pageid=123",
      fetchImpl: mock.fetchImpl,
      clock: new FakeClock("2026-08-04T05:00:00.000Z"),
    });
    await collectNetworkSource({
      root,
      sourceId: "discussion-reddit-asoiaf",
      fetchImpl: async () => {
        throw new Error("route-only source must not fetch");
      },
    });
    const credits = collectorCredits(root);
    expect(credits.recordCount).toBe(1);
    const markdown = fs.readFileSync(credits.markdownPath, "utf8");
    expect(markdown).toContain("A Wiki of Ice and Fire: Varys");
    expect(markdown).toContain("cc-by-sa");
    expect(markdown).not.toContain("Reddit r/asoiaf");
    expect(loadSourceLedger(root)).toHaveLength(219);
  });

  it("plans bounded work without repeatedly selecting completed endpoints", async () => {
    const root = estateRoot();
    collectorInitialize(root, "2026-08-04T00:00:00.000Z");
    const initial = collectorPlan({
      root,
      now: "2026-08-04T00:00:00.000Z",
      limit: 3,
      sourceIds: [
        "discussion-reddit-asoiaf",
        "discussion-reddit-hotd",
        "discussion-reddit-pureasoiaf",
      ],
    });
    expect(initial).toHaveLength(3);
    await collectNetworkSource({
      root,
      sourceId: initial[0]!.sourceId,
      fetchImpl: async () => {
        throw new Error("route-only source must not fetch");
      },
    });
    const next = collectorPlan({
      root,
      now: "2026-08-04T01:00:00.000Z",
      limit: 3,
      sourceIds: initial.map((row) => row.sourceId),
    });
    expect(next.map((row) => row.sourceId)).not.toContain(initial[0]!.sourceId);
  });
});
