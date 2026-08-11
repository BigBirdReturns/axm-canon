import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
  ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT,
  ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT,
  auditAsoiafStructuredAcquisitionHealth,
  type AsoiafStructuredAcquisitionReceipt,
  type AsoiafStructuredAdapterReceipt,
} from "../tools/lib/asoiaf-structured-acquisition-source-health.js";
import {
  collectorContentId,
  collectorEstatePaths,
  commitObservation,
  initializeCollectorEstate,
  readJson,
  recordAttempt,
  sha256,
  updateSourceLedgerRow,
  writeJsonAtomic,
} from "../tools/lib/asoiaf-external-estate.js";

const roots: string[] = [];
const SOURCE_ID = "structured-wikidata" as const;
const ADAPTER_ID = "wikidata-sparql" as const;
const REQUEST_ID = "wikidata:varys:Q285779";
const SOURCE_RECORD_ID = "wikidata:Q285779";
const PLAN_FINGERPRINT = `sha256:${"1".repeat(64)}` as const;
const RAW_DIGEST = `sha256:${"a".repeat(64)}` as const;
const NORMALIZED_DIGEST = `sha256:${"b".repeat(64)}` as const;
const ROBOTS_DIGEST = `sha256:${"c".repeat(64)}` as const;
const PLAN_URL =
  "https://query.wikidata.org/sparql?query=SELECT+%3Fitem+WHERE+%7B+%3Fitem+wdt%3AP31+wd%3AQ5+%7D+LIMIT+1&format=json";

function estateRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "asoiaf-structured-acquisition-health-"),
  );
  roots.push(root);
  return root;
}

function adapterReceiptPath(root: string): string {
  const id = collectorContentId(
    "asoiaf-structured-adapter-receipt",
    REQUEST_ID,
  );
  return path.join(root, "structured-adapter-receipts", `${id}.json`);
}

function acquisitionDirectory(root: string): string {
  return path.join(root, "structured-acquisition-receipts");
}

function acquisitionStatePath(root: string): string {
  return path.join(root, "structured-acquisition-state.json");
}

function receiptCore(
  receipt: AsoiafStructuredAcquisitionReceipt,
) {
  const {
    receiptId: _receiptId,
    receiptFingerprint: _fingerprint,
    ...core
  } = receipt;
  return core;
}

function initializeStructuredFixture(root: string) {
  initializeCollectorEstate(root, "2026-08-04T17:00:00.000Z");
  const committed = commitObservation({
    root,
    sourceId: SOURCE_ID,
    sourceRecordId: SOURCE_RECORD_ID,
    retrievedAt: "2026-08-04T17:00:03.000Z",
    contentDigest: NORMALIZED_DIGEST,
    recordType: "wikidata-binding-set",
    title: "Wikidata Varys fixture",
    summary: "Synthetic normalized structured observation.",
    mediaType: "application/json",
    responseBytes: 512,
    retainedFields: [
      "adapterId",
      "sourceId",
      "sourceRecordId",
      "sourceResponseDigest",
      "normalizedDigest",
      "fields",
    ],
    retention: "licensed-structured-body",
    cacheUri: null,
    sourceUri: "https://www.wikidata.org/wiki/Q285779",
    publishedAt: null,
    updatedAt: null,
    credit: null,
    retainedValue: {
      adapterId: ADAPTER_ID,
      sourceId: SOURCE_ID,
      sourceRecordId: SOURCE_RECORD_ID,
      sourceResponseDigest: RAW_DIGEST,
      normalizedDigest: NORMALIZED_DIGEST,
      fields: { qid: "Q285779", label: "Varys" },
    },
    requestCount: 0,
    cacheHit: false,
  });

  const adapterCore = {
    format: ASOIAF_STRUCTURED_ADAPTER_RECEIPT_FORMAT,
    adapterId: ADAPTER_ID,
    sourceId: SOURCE_ID,
    requestId: REQUEST_ID,
    sourceUri: PLAN_URL,
    retrievedAt: "2026-08-04T17:00:03.000Z",
    sourceResponseDigest: RAW_DIGEST,
    sourceResponseBytes: 1_024,
    inputRecordCount: 1,
    committedRecordCount: 1,
    observationIds: [committed.observation.observationId],
    candidateIds: [committed.observation.candidateId],
    normalizedRecordIds: ["asoiaf-structured-record:wikidata-Q285779"],
    rejected: [],
    outcome: "observed" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const adapter: AsoiafStructuredAdapterReceipt = {
    ...adapterCore,
    receiptFingerprint: sha256(adapterCore),
  };
  writeJsonAtomic(adapterReceiptPath(root), adapter);
  return { committed, adapter };
}

function writeAcquisition(input: {
  root: string;
  observationId: string;
  candidateId: string;
  adapterFingerprint: `sha256:${string}`;
  outcome?: "observed" | "cache-hit";
  completedAt?: string;
  robotsDigest?: `sha256:${string}`;
  updateState?: boolean;
}): { receipt: AsoiafStructuredAcquisitionReceipt; uri: string } {
  const outcome = input.outcome ?? "observed";
  const completedAt = input.completedAt ?? "2026-08-04T17:00:03.000Z";
  const core = {
    format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
    planFingerprint: PLAN_FINGERPRINT,
    adapterId: ADAPTER_ID,
    sourceId: SOURCE_ID,
    requestId: REQUEST_ID,
    requestedUrl: PLAN_URL,
    finalUrl: PLAN_URL,
    retrievedAt: outcome === "cache-hit"
      ? completedAt
      : "2026-08-04T17:00:00.000Z",
    completedAt,
    requestCount: outcome === "cache-hit" ? 0 : 2,
    waitedMilliseconds: outcome === "cache-hit" ? 0 : 1_500,
    redirectCount: 0,
    robotsUrl: "https://query.wikidata.org/robots.txt",
    robotsStatus: "allowed" as const,
    robotsDigest: input.robotsDigest ?? ROBOTS_DIGEST,
    httpStatus: 200,
    responseMediaType: "application/sparql-results+json",
    responseBytes: 1_024,
    sourceResponseDigest: RAW_DIGEST,
    adapterReceiptFingerprint: input.adapterFingerprint,
    committedRecordCount: 1,
    observationIds: [input.observationId],
    candidateIds: [input.candidateId],
    gapId: null,
    outcome,
    rawResponseRetained: false as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const receiptFingerprint = sha256(core);
  const receipt: AsoiafStructuredAcquisitionReceipt = {
    ...core,
    receiptId: collectorContentId("asoiaf-structured-acquisition-receipt", {
      requestId: REQUEST_ID,
      planFingerprint: PLAN_FINGERPRINT,
      receiptFingerprint,
    }),
    receiptFingerprint,
  };
  const target = path.join(acquisitionDirectory(input.root), `${receipt.receiptId}.json`);
  writeJsonAtomic(target, receipt);
  const uri = path.relative(input.root, target).split(path.sep).join("/");
  recordAttempt({
    root: input.root,
    sourceId: SOURCE_ID,
    sourceRecordId: REQUEST_ID,
    startedAt: receipt.retrievedAt,
    completedAt: receipt.completedAt,
    outcome: outcome === "cache-hit" ? "cache-replay" : "observed",
    requestCount: receipt.requestCount,
    cacheHit: outcome === "cache-hit",
    receiptUri: uri,
    observationId: input.observationId,
    gapId: null,
  });
  updateSourceLedgerRow(input.root, SOURCE_ID, (row) => ({
    ...row,
    firstAttemptAt: row.firstAttemptAt ?? receipt.retrievedAt,
    lastAttemptAt: receipt.completedAt,
    attemptCount: row.attemptCount + 1,
  }));

  if ((input.updateState ?? outcome !== "cache-hit") && outcome !== "cache-hit") {
    const stateCore = {
      format: ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT,
      entries: [
        {
          requestId: REQUEST_ID,
          planFingerprint: PLAN_FINGERPRINT,
          receiptUri: uri,
          completedAt: receipt.completedAt,
          outcome: "observed" as const,
        },
      ],
    };
    writeJsonAtomic(acquisitionStatePath(input.root), {
      ...stateCore,
      stateFingerprint: sha256(stateCore),
    });
  }
  return { receipt, uri };
}

function qualifiedEstate(root: string) {
  const fixture = initializeStructuredFixture(root);
  const acquisition = writeAcquisition({
    root,
    observationId: fixture.committed.observation.observationId,
    candidateId: fixture.committed.observation.candidateId,
    adapterFingerprint: fixture.adapter.receiptFingerprint,
  });
  return { ...fixture, acquisition };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("ASOIAF structured acquisition source health", () => {
  it("treats an estate without acquisition surfaces as an empty valid acquisition ledger", () => {
    const root = estateRoot();
    initializeCollectorEstate(root, "2026-08-04T00:00:00.000Z");
    expect(auditAsoiafStructuredAcquisitionHealth(root)).toEqual({
      statePresent: false,
      stateEntryCount: 0,
      receiptCount: 0,
      successfulReceiptCount: 0,
      replayReceiptCount: 0,
      adapterReceiptCount: 0,
      findings: [],
    });
  });

  it("verifies state, acquisition, adapter, observation, candidate, and attempt parity", () => {
    const root = estateRoot();
    qualifiedEstate(root);
    const audit = auditAsoiafStructuredAcquisitionHealth(root);
    expect(audit).toEqual(
      expect.objectContaining({
        statePresent: true,
        stateEntryCount: 1,
        receiptCount: 1,
        successfulReceiptCount: 1,
        replayReceiptCount: 0,
        adapterReceiptCount: 1,
      }),
    );
    expect(audit.findings).toEqual([]);
  });

  it("refuses a stale state projection and missing adapter receipt", () => {
    const root = estateRoot();
    qualifiedEstate(root);
    const state = readJson<Record<string, unknown>>(
      acquisitionStatePath(root),
      {},
    );
    writeJsonAtomic(acquisitionStatePath(root), {
      ...state,
      stateFingerprint: `sha256:${"f".repeat(64)}`,
    });
    fs.rmSync(adapterReceiptPath(root));
    expect(
      auditAsoiafStructuredAcquisitionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "structured-acquisition-state-fingerprint",
        "structured-acquisition-adapter-receipt-missing",
      ]),
    );
  });

  it("refuses raw-response retention even when the altered receipt is re-fingerprinted", () => {
    const root = estateRoot();
    const fixture = qualifiedEstate(root);
    const target = path.join(
      acquisitionDirectory(root),
      `${fixture.acquisition.receipt.receiptId}.json`,
    );
    const alteredCore = {
      ...receiptCore(fixture.acquisition.receipt),
      rawResponseRetained: true,
    };
    const receiptFingerprint = sha256(alteredCore);
    const altered = {
      ...alteredCore,
      receiptId: collectorContentId("asoiaf-structured-acquisition-receipt", {
        requestId: REQUEST_ID,
        planFingerprint: PLAN_FINGERPRINT,
        receiptFingerprint,
      }),
      receiptFingerprint,
    };
    fs.rmSync(target);
    const alteredTarget = path.join(
      acquisitionDirectory(root),
      `${altered.receiptId}.json`,
    );
    writeJsonAtomic(alteredTarget, altered);
    const stateCore = {
      format: ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT,
      entries: [
        {
          requestId: REQUEST_ID,
          planFingerprint: PLAN_FINGERPRINT,
          receiptUri: path.relative(root, alteredTarget).split(path.sep).join("/"),
          completedAt: altered.completedAt,
          outcome: "observed" as const,
        },
      ],
    };
    writeJsonAtomic(acquisitionStatePath(root), {
      ...stateCore,
      stateFingerprint: sha256(stateCore),
    });
    const attemptsPath = collectorEstatePaths(root).attempts;
    const attempts = fs
      .readFileSync(attemptsPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .map((attempt) => ({
        ...attempt,
        receiptUri: path.relative(root, alteredTarget).split(path.sep).join("/"),
      }));
    fs.writeFileSync(
      attemptsPath,
      `${attempts.map((attempt) => JSON.stringify(attempt)).join("\n")}\n`,
      "utf8",
    );
    expect(
      auditAsoiafStructuredAcquisitionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toContain("structured-acquisition-raw-retention");
  });

  it("accepts a zero-request replay only when prior acquisition custody exists", () => {
    const root = estateRoot();
    const fixture = qualifiedEstate(root);
    writeAcquisition({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      adapterFingerprint: fixture.adapter.receiptFingerprint,
      outcome: "cache-hit",
      completedAt: "2026-08-04T18:00:00.000Z",
    });
    const audit = auditAsoiafStructuredAcquisitionHealth(root);
    expect(audit.replayReceiptCount).toBe(1);
    expect(audit.findings).toEqual([]);
  });

  it("refuses a cache replay that has no prior successful acquisition", () => {
    const root = estateRoot();
    const fixture = initializeStructuredFixture(root);
    writeAcquisition({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      adapterFingerprint: fixture.adapter.receiptFingerprint,
      outcome: "cache-hit",
      completedAt: "2026-08-04T18:00:00.000Z",
      updateState: false,
    });
    const emptyStateCore = {
      format: ASOIAF_STRUCTURED_ACQUISITION_STATE_FORMAT,
      entries: [],
    };
    writeJsonAtomic(acquisitionStatePath(root), {
      ...emptyStateCore,
      stateFingerprint: sha256(emptyStateCore),
    });
    expect(
      auditAsoiafStructuredAcquisitionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toContain("structured-acquisition-replay-origin");
  });

  it("turns changed robots or response custody into explicit drift rather than silent freshness", () => {
    const root = estateRoot();
    const fixture = qualifiedEstate(root);
    writeAcquisition({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      adapterFingerprint: fixture.adapter.receiptFingerprint,
      completedAt: "2026-08-05T17:00:03.000Z",
      robotsDigest: `sha256:${"d".repeat(64)}`,
    });
    const audit = auditAsoiafStructuredAcquisitionHealth(root);
    expect(audit.findings).toContainEqual(
      expect.objectContaining({
        code: "structured-acquisition-drift",
        severity: "warning",
        sourceId: SOURCE_ID,
        repairTask: "inspect-drift",
      }),
    );
    expect(
      audit.findings.filter((entry) => entry.severity === "error"),
    ).toEqual([]);
  });

  it("detects a successful receipt whose collector attempt was removed", () => {
    const root = estateRoot();
    qualifiedEstate(root);
    fs.writeFileSync(collectorEstatePaths(root).attempts, "", "utf8");
    expect(
      auditAsoiafStructuredAcquisitionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toContain("structured-acquisition-attempt-count");
  });
});