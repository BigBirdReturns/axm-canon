import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAsoiafExternalSource,
} from "../src/external/index.js";
import {
  buildAsoiafStructuredRequestPlan,
  type AsoiafStructuredRequestPlan,
} from "../tools/lib/asoiaf-structured-public-adapters.js";
import {
  executeAsoiafStructuredAcquisition,
  readAsoiafStructuredAcquisitionState,
  runAsoiafStructuredAcquisitionBatch,
  validateAsoiafStructuredRequestPlan,
  verifyAsoiafStructuredAcquisitionEstate,
  type AsoiafStructuredAcquisitionRuntime,
} from "../tools/lib/asoiaf-structured-public-acquisition.js";
import {
  collectorEstatePaths,
  readJson,
  readNdjson,
  sha256,
  verifyCollectorEstate,
  type CollectorObservationRecord,
} from "../tools/lib/asoiaf-external-estate.js";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "asoiaf-structured-acquisition-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

function rawDigest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function refingerprint(
  plan: AsoiafStructuredRequestPlan,
): AsoiafStructuredRequestPlan {
  const { planFingerprint: _fingerprint, ...core } = plan;
  return { ...plan, planFingerprint: sha256(core) };
}

function awoiafPlan(
  title = "Varys",
  requestId = `awoiaf:${title.toLowerCase()}`,
): AsoiafStructuredRequestPlan {
  return buildAsoiafStructuredRequestPlan({
    adapterId: "awoiaf-mediawiki",
    requestId,
    titles: [title],
    recordLimit: 10,
  });
}

function awoiafPayload(title = "Varys", pageId = 123, revisionId = 456) {
  return {
    batchcomplete: true,
    query: {
      pages: [
        {
          pageid: pageId,
          ns: 0,
          title,
          touched: "2026-07-31T22:00:00Z",
          lastrevid: revisionId,
          length: 12_000,
          canonicalurl: `https://awoiaf.westeros.org/index.php/${encodeURIComponent(title)}`,
          categories: [{ title: "Category:Characters" }],
          links: [
            { title: "Aerys II Targaryen" },
            { title: `File:${title}.jpg` },
          ],
          revisions: [
            {
              revid: revisionId,
              parentid: revisionId - 1,
              timestamp: "2026-07-31T21:58:00Z",
            },
          ],
        },
      ],
    },
  };
}

class ScriptedRuntime implements AsoiafStructuredAcquisitionRuntime {
  now: number;
  readonly requests: Array<{ url: string; at: number; init: RequestInit }> = [];
  readonly sleeps: number[] = [];

  constructor(
    private readonly handler: (
      url: string,
      init: RequestInit,
      requestIndex: number,
    ) => Response | Promise<Response>,
    now = Date.parse("2026-08-04T00:00:00.000Z"),
  ) {
    this.now = now;
  }

  async fetch(url: string, init: RequestInit): Promise<Response> {
    const index = this.requests.length;
    this.requests.push({ url, at: this.now, init });
    return await this.handler(url, init, index);
  }

  async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.now += milliseconds;
  }

  nowMilliseconds(): number {
    return this.now;
  }
}

function successRuntime(payload = awoiafPayload()): {
  runtime: ScriptedRuntime;
  body: string;
} {
  const body = JSON.stringify(payload);
  const runtime = new ScriptedRuntime((url) => {
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(Buffer.byteLength(body)),
      },
    });
  });
  return { runtime, body };
}

describe("ASOIAF structured public acquisition", () => {
  it("validates signed registered plans and refuses endpoint, source, or credential drift", () => {
    const valid = awoiafPlan();
    expect(validateAsoiafStructuredRequestPlan(valid)).toEqual([]);

    const escaped = refingerprint({
      ...valid,
      url: "https://example.com/api.php",
    });
    expect(validateAsoiafStructuredRequestPlan(escaped)).toContain(
      "request plan escaped the registered awoiaf-mediawiki endpoint",
    );

    const crossed = refingerprint({
      ...valid,
      sourceId: "structured-wikidata",
    });
    expect(validateAsoiafStructuredRequestPlan(crossed)).toContain(
      "structured-wikidata is not registered for adapter awoiaf-mediawiki",
    );

    const credentialed = refingerprint({
      ...valid,
      headers: {
        ...valid.headers,
        Authorization: "Bearer private-token",
      },
    });
    expect(validateAsoiafStructuredRequestPlan(credentialed)).toContain(
      "request plan contains a credential-bearing header",
    );
  });

  it("acquires one official response, binds its raw digest, commits through the adapter, and preserves estate parity", async () => {
    const root = temporaryRoot();
    const plan = awoiafPlan();
    const { runtime, body } = successRuntime();
    const result = await executeAsoiafStructuredAcquisition({
      root,
      plan,
      runtime,
      retrievedAt: "2026-08-04T00:00:00.000Z",
    });

    expect(result.receipt).toEqual(
      expect.objectContaining({
        planFingerprint: plan.planFingerprint,
        adapterId: "awoiaf-mediawiki",
        sourceId: "structured-awoiaf-api",
        requestId: "awoiaf:varys",
        requestCount: 2,
        robotsStatus: "absent",
        httpStatus: 200,
        responseBytes: Buffer.byteLength(body),
        sourceResponseDigest: rawDigest(body),
        committedRecordCount: 1,
        outcome: "observed",
        rawResponseRetained: false,
        graphEffect: "none",
        canonEffect: "none",
      }),
    );
    expect(result.adapterResult?.records[0]?.sourceResponseDigest).toBe(
      rawDigest(body),
    );
    expect(result.receipt.observationIds).toHaveLength(1);
    expect(result.receipt.candidateIds).toHaveLength(1);
    expect(readAsoiafStructuredAcquisitionState(root).entries).toHaveLength(1);
    expect(verifyAsoiafStructuredAcquisitionEstate(root)).toEqual([]);
    expect(verifyCollectorEstate(root)).toEqual([]);

    const observations = readNdjson<CollectorObservationRecord>(
      collectorEstatePaths(root).observations,
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]?.contentDigest).toBe(
      result.adapterResult?.records[0]?.normalizedDigest,
    );
    const credits = readJson<{ records: Array<{ sourceId: string }> }>(
      collectorEstatePaths(root).creditsJson,
      { records: [] },
    );
    expect(credits.records).toEqual([
      expect.objectContaining({ sourceId: "structured-awoiaf-api" }),
    ]);
  });

  it("replays an unchanged completed plan without network access and emits a valid cache-hit receipt", async () => {
    const root = temporaryRoot();
    const plan = awoiafPlan();
    const firstRuntime = successRuntime().runtime;
    await executeAsoiafStructuredAcquisition({ root, plan, runtime: firstRuntime });

    const replayRuntime = new ScriptedRuntime(() => {
      throw new Error("cache replay attempted network access");
    });
    const replay = await executeAsoiafStructuredAcquisition({
      root,
      plan,
      runtime: replayRuntime,
      retrievedAt: "2026-08-04T01:00:00.000Z",
    });
    expect(replay.cacheHit).toBe(true);
    expect(replay.receipt.outcome).toBe("cache-hit");
    expect(replay.receipt.requestCount).toBe(0);
    expect(replayRuntime.requests).toHaveLength(0);
    const { receiptFingerprint, receiptId: _receiptId, ...core } = replay.receipt;
    expect(receiptFingerprint).toBe(sha256(core));
    expect(readAsoiafStructuredAcquisitionState(root).entries).toHaveLength(1);
    expect(verifyAsoiafStructuredAcquisitionEstate(root)).toEqual([]);
    expect(verifyCollectorEstate(root)).toEqual([]);
  });

  it("refuses a robots denial without requesting the structured endpoint", async () => {
    const root = temporaryRoot();
    const runtime = new ScriptedRuntime((url) => {
      if (!url.endsWith("/robots.txt")) {
        throw new Error("structured endpoint was requested after robots denial");
      }
      return new Response("User-agent: *\nDisallow: /api.php\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });
    const result = await executeAsoiafStructuredAcquisition({
      root,
      plan: awoiafPlan(),
      runtime,
    });
    expect(result.receipt.outcome).toBe("blocked-robots");
    expect(result.receipt.requestCount).toBe(1);
    expect(result.receipt.robotsStatus).toBe("denied");
    expect(runtime.requests).toHaveLength(1);
    expect(verifyAsoiafStructuredAcquisitionEstate(root)).toEqual([]);
    expect(verifyCollectorEstate(root)).toEqual([]);
  });

  it("honors the host-delay floor and Retry-After before a bounded retry", async () => {
    const root = temporaryRoot();
    const body = JSON.stringify(awoiafPayload());
    let dataAttempts = 0;
    const runtime = new ScriptedRuntime((url) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      dataAttempts += 1;
      if (dataAttempts === 1) {
        return new Response("{}", {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "2",
          },
        });
      }
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await executeAsoiafStructuredAcquisition({
      root,
      plan: awoiafPlan(),
      runtime,
    });
    expect(result.receipt.outcome).toBe("observed");
    expect(result.receipt.requestCount).toBe(3);
    expect(result.receipt.waitedMilliseconds).toBeGreaterThanOrEqual(3_500);
    expect(runtime.sleeps).toEqual(expect.arrayContaining([1_500, 2_000]));
  });

  it("refuses cross-origin redirects before following them", async () => {
    const root = temporaryRoot();
    const runtime = new ScriptedRuntime((url) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/stolen.json" },
      });
    });
    const result = await executeAsoiafStructuredAcquisition({
      root,
      plan: awoiafPlan(),
      runtime,
    });
    expect(result.receipt.outcome).toBe("error");
    expect(result.receipt.finalUrl).toBe("https://example.com/stolen.json");
    expect(runtime.requests).toHaveLength(2);
    expect(runtime.requests.some((entry) => entry.url.includes("example.com"))).toBe(false);
  });

  it("refuses declared oversize responses and non-JSON media", async () => {
    const source = getAsoiafExternalSource("structured-awoiaf-api")!;

    const oversizeRoot = temporaryRoot();
    const oversizeRuntime = new ScriptedRuntime((url) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(source.harvestPolicy.maxResponseBytes + 1),
        },
      });
    });
    const oversize = await executeAsoiafStructuredAcquisition({
      root: oversizeRoot,
      plan: awoiafPlan(),
      runtime: oversizeRuntime,
    });
    expect(oversize.receipt.outcome).toBe("rejected-oversize");

    const invalidRoot = temporaryRoot();
    const invalidRuntime = new ScriptedRuntime((url) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    const invalid = await executeAsoiafStructuredAcquisition({
      root: invalidRoot,
      plan: awoiafPlan(),
      runtime: invalidRuntime,
    });
    expect(invalid.receipt.outcome).toBe("invalid-response");
  });

  it("shares one host pacer across a sequential batch", async () => {
    const root = temporaryRoot();
    let pageId = 100;
    const runtime = new ScriptedRuntime((url) => {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      const title = new URL(url).searchParams.get("titles") ?? "Unknown";
      pageId += 1;
      return new Response(JSON.stringify(awoiafPayload(title, pageId, pageId + 1000)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const results = await runAsoiafStructuredAcquisitionBatch({
      root,
      plans: [
        awoiafPlan("Varys", "awoiaf:varys"),
        awoiafPlan("Melisandre", "awoiaf:melisandre"),
      ],
      runtime,
    });
    expect(results.map((result) => result.receipt.outcome)).toEqual([
      "observed",
      "observed",
    ]);
    expect(runtime.requests).toHaveLength(4);
    for (let index = 1; index < runtime.requests.length; index += 1) {
      expect(runtime.requests[index]!.at - runtime.requests[index - 1]!.at)
        .toBeGreaterThanOrEqual(1_500);
    }
    expect(verifyAsoiafStructuredAcquisitionEstate(root)).toEqual([]);
    expect(verifyCollectorEstate(root)).toEqual([]);
  });

  it("detects state tampering without performing network access", async () => {
    const root = temporaryRoot();
    const { runtime } = successRuntime();
    await executeAsoiafStructuredAcquisition({
      root,
      plan: awoiafPlan(),
      runtime,
    });
    const statePath = path.join(root, "structured-acquisition-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      entries: Array<{ requestId: string }>;
    };
    state.entries[0]!.requestId = "tampered";
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    expect(verifyAsoiafStructuredAcquisitionEstate(root)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("state failed fingerprint custody"),
      ]),
    );
  });
});
