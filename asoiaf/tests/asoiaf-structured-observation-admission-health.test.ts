import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
  type AsoiafStructuredAcquisitionReceipt,
} from "../tools/lib/asoiaf-structured-acquisition-source-health.js";
import {
  ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT,
  ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_STATE_FORMAT,
  auditAsoiafStructuredObservationAdmissionHealth,
  type AsoiafStructuredObservationAdmission,
  type AsoiafStructuredObservationAdmissionEvidence,
  type AsoiafStructuredObservationAdmissionOutcome,
  type AsoiafStructuredObservationAdmissionReason,
} from "../tools/lib/asoiaf-structured-observation-admission-health.js";
import {
  collectorContentId,
  commitObservation,
  initializeCollectorEstate,
  sha256,
  writeJsonAtomic,
} from "../tools/lib/asoiaf-external-estate.js";

const roots: string[] = [];
const SOURCE_ID = "structured-wikidata";
const ADAPTER_ID = "wikidata-sparql";
const REQUEST_ID = "wikidata:varys:Q285779";
const SOURCE_RECORD_ID = "wikidata:Q285779";
const PLAN_FINGERPRINT = `sha256:${"1".repeat(64)}` as const;
const ADAPTER_FINGERPRINT = `sha256:${"2".repeat(64)}` as const;
const RAW_DIGEST = `sha256:${"a".repeat(64)}` as const;
const NORMALIZED_DIGEST = `sha256:${"b".repeat(64)}` as const;
const ROBOTS_DIGEST = `sha256:${"c".repeat(64)}` as const;
const RETRIEVED_AT = "2026-08-04T17:00:00.000Z";
const COMPLETED_AT = "2026-08-04T17:00:03.000Z";
const REVIEWED_AT = "2026-08-04T17:30:00.000Z";
const PLAN_URL =
  "https://query.wikidata.org/sparql?query=SELECT+%3Fitem+WHERE+%7B+%3Fitem+wdt%3AP31+wd%3AQ5+%7D+LIMIT+1&format=json";

function estateRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "asoiaf-structured-admission-health-"),
  );
  roots.push(root);
  return root;
}

function admissionCore(
  admission: AsoiafStructuredObservationAdmission,
) {
  const {
    admissionId: _admissionId,
    admissionFingerprint: _admissionFingerprint,
    ...core
  } = admission;
  return core;
}

function receiptCore(
  receipt: AsoiafStructuredAcquisitionReceipt,
) {
  const {
    receiptId: _receiptId,
    receiptFingerprint: _receiptFingerprint,
    ...core
  } = receipt;
  return core;
}

function evidenceIdentity(
  row: AsoiafStructuredObservationAdmissionEvidence,
): string {
  return `${row.field}\u0000${row.value.trim()}\u0000${row.effect}`;
}

function initializeFixture(root: string) {
  initializeCollectorEstate(root, "2026-08-04T16:59:00.000Z");
  const committed = commitObservation({
    root,
    sourceId: SOURCE_ID,
    sourceRecordId: SOURCE_RECORD_ID,
    retrievedAt: COMPLETED_AT,
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

  const acquisitionCore = {
    format: ASOIAF_STRUCTURED_ACQUISITION_RECEIPT_FORMAT,
    planFingerprint: PLAN_FINGERPRINT,
    adapterId: ADAPTER_ID as "wikidata-sparql",
    sourceId: SOURCE_ID as "structured-wikidata",
    requestId: REQUEST_ID,
    requestedUrl: PLAN_URL,
    finalUrl: PLAN_URL,
    retrievedAt: RETRIEVED_AT,
    completedAt: COMPLETED_AT,
    requestCount: 2,
    waitedMilliseconds: 1_500,
    redirectCount: 0,
    robotsUrl: "https://query.wikidata.org/robots.txt",
    robotsStatus: "allowed" as const,
    robotsDigest: ROBOTS_DIGEST,
    httpStatus: 200,
    responseMediaType: "application/sparql-results+json",
    responseBytes: 1_024,
    sourceResponseDigest: RAW_DIGEST,
    adapterReceiptFingerprint: ADAPTER_FINGERPRINT,
    committedRecordCount: 1,
    observationIds: [committed.observation.observationId],
    candidateIds: [committed.observation.candidateId],
    gapId: null,
    outcome: "observed" as const,
    rawResponseRetained: false as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const receiptFingerprint = sha256(acquisitionCore);
  const acquisitionReceipt: AsoiafStructuredAcquisitionReceipt = {
    ...acquisitionCore,
    receiptId: collectorContentId("asoiaf-structured-acquisition-receipt", {
      requestId: REQUEST_ID,
      planFingerprint: PLAN_FINGERPRINT,
      receiptFingerprint,
    }),
    receiptFingerprint,
  };
  writeJsonAtomic(
    path.join(
      root,
      "structured-acquisition-receipts",
      `${acquisitionReceipt.receiptId}.json`,
    ),
    acquisitionReceipt,
  );
  return { committed, acquisitionReceipt };
}

function defaultEvidence(
  outcome: AsoiafStructuredObservationAdmissionOutcome,
): AsoiafStructuredObservationAdmissionEvidence[] {
  const rows: Record<
    AsoiafStructuredObservationAdmissionOutcome,
    AsoiafStructuredObservationAdmissionEvidence[]
  > = {
    "admit-to-review": [
      {
        field: "title",
        value: "Varys",
        effect: "supports-admission",
        note: "The reviewed label serves the selected entity-resolution lane.",
      },
      {
        field: "upstream-record",
        value: SOURCE_RECORD_ID,
        effect: "supports-admission",
        note: "The exact Wikidata record identity matches the selected fixture.",
      },
    ],
    "reject-off-topic": [
      {
        field: "container",
        value: "Unrelated reference work",
        effect: "supports-rejection",
        note: "The retained container identifies a lexical collision outside ASOIAF.",
      },
    ],
    "defer-insufficient-identity": [
      {
        field: "title",
        value: "A Song of Ice and Fire",
        effect: "unresolved",
        note: "The title alone does not establish a durable work identity.",
      },
    ],
  };
  return [...rows[outcome]].sort((left, right) =>
    evidenceIdentity(left).localeCompare(evidenceIdentity(right)),
  );
}

function defaultReason(
  outcome: AsoiafStructuredObservationAdmissionOutcome,
): AsoiafStructuredObservationAdmissionReason {
  if (outcome === "admit-to-review") {
    return "exact-identity-and-question-match";
  }
  if (outcome === "reject-off-topic") {
    return "off-topic-query-collision";
  }
  return "insufficient-work-identity";
}

function writeAdmission(input: {
  root: string;
  observationId: string;
  candidateId: string;
  acquisitionReceipt: AsoiafStructuredAcquisitionReceipt;
  outcome?: AsoiafStructuredObservationAdmissionOutcome;
  reason?: AsoiafStructuredObservationAdmissionReason;
  reviewedAt?: string;
  reviewedBy?: string;
  planFingerprint?: `sha256:${string}`;
  evidence?: AsoiafStructuredObservationAdmissionEvidence[];
}): { admission: AsoiafStructuredObservationAdmission; uri: string } {
  const outcome = input.outcome ?? "admit-to-review";
  const core = {
    format: ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_FORMAT,
    sourceId: SOURCE_ID,
    adapterId: ADAPTER_ID,
    requestId: REQUEST_ID,
    planFingerprint: input.planFingerprint ?? PLAN_FINGERPRINT,
    acquisitionReceiptId: input.acquisitionReceipt.receiptId,
    acquisitionReceiptFingerprint: input.acquisitionReceipt.receiptFingerprint,
    adapterReceiptFingerprint: ADAPTER_FINGERPRINT,
    observationId: input.observationId,
    candidateId: input.candidateId,
    normalizedContentDigest: NORMALIZED_DIGEST,
    questionLaneIds: ["entity-resolution"],
    evidence:
      input.evidence
      ?? defaultEvidence(outcome),
    outcome,
    reason: input.reason ?? defaultReason(outcome),
    rationale:
      outcome === "admit-to-review"
        ? "The exact upstream identity and reviewed label serve the selected entity-resolution question while remaining supporting-only evidence."
        : outcome === "reject-off-topic"
          ? "The retained work identity does not serve the selected ASOIAF question and remains intake-only without claim construction."
          : "The retained title lacks a durable creator, DOI, ISBN, revision, or edition identity sufficient for admission.",
    reviewedBy: input.reviewedBy ?? "reviewer:jonathan",
    reviewedAt: input.reviewedAt ?? REVIEWED_AT,
    authorityRole: "admission-only" as const,
    graphEffect: "none" as const,
    canonEffect: "none" as const,
  };
  const admissionFingerprint = sha256(core);
  const admission: AsoiafStructuredObservationAdmission = {
    ...core,
    admissionId: collectorContentId(
      "asoiaf-structured-observation-admission",
      {
        observationId: input.observationId,
        candidateId: input.candidateId,
        admissionFingerprint,
      },
    ),
    admissionFingerprint,
  };
  const filename = `admission-${admissionFingerprint.slice("sha256:".length)}.json`;
  const target = path.join(input.root, "structured-observation-admissions", filename);
  writeJsonAtomic(target, admission);
  return {
    admission,
    uri: path.relative(input.root, target).split(path.sep).join("/"),
  };
}

function writeState(
  root: string,
  admissions: Array<{ admission: AsoiafStructuredObservationAdmission; uri: string }>,
): void {
  const latestByObservation = new Map<
    string,
    { admission: AsoiafStructuredObservationAdmission; uri: string }
  >();
  for (const value of admissions) {
    const previous = latestByObservation.get(value.admission.observationId);
    if (
      !previous
      || previous.admission.reviewedAt < value.admission.reviewedAt
      || (
        previous.admission.reviewedAt === value.admission.reviewedAt
        && previous.admission.admissionId < value.admission.admissionId
      )
    ) {
      latestByObservation.set(value.admission.observationId, value);
    }
  }
  const entries = [...latestByObservation.values()]
    .map(({ admission, uri }) => ({
      observationId: admission.observationId,
      candidateId: admission.candidateId,
      admissionId: admission.admissionId,
      admissionUri: uri,
      reviewedAt: admission.reviewedAt,
      outcome: admission.outcome,
    }))
    .sort((left, right) => left.observationId.localeCompare(right.observationId));
  const core = {
    format: ASOIAF_STRUCTURED_OBSERVATION_ADMISSION_STATE_FORMAT,
    entries,
  };
  writeJsonAtomic(
    path.join(root, "structured-observation-admission-state.json"),
    { ...core, stateFingerprint: sha256(core) },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("ASOIAF structured observation admission health", () => {
  it("treats an estate without admission surfaces as an empty valid ledger", () => {
    const root = estateRoot();
    initializeCollectorEstate(root, "2026-08-04T00:00:00.000Z");
    expect(auditAsoiafStructuredObservationAdmissionHealth(root)).toEqual({
      statePresent: false,
      stateEntryCount: 0,
      admissionCount: 0,
      currentAdmissionCount: 0,
      admittedCount: 0,
      rejectedCount: 0,
      deferredCount: 0,
      dispositionChangeCount: 0,
      findings: [],
    });
  });

  it("verifies exact acquisition, observation, candidate, reviewer, and state parity", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const admission = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
    });
    writeState(root, [admission]);

    expect(auditAsoiafStructuredObservationAdmissionHealth(root)).toEqual(
      expect.objectContaining({
        statePresent: true,
        stateEntryCount: 1,
        admissionCount: 1,
        currentAdmissionCount: 1,
        admittedCount: 1,
        rejectedCount: 0,
        deferredCount: 0,
        dispositionChangeCount: 0,
        findings: [],
      }),
    );
  });

  it("retains an off-topic rejection as healthy admission history without claim authority", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const admission = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      outcome: "reject-off-topic",
    });
    writeState(root, [admission]);
    const audit = auditAsoiafStructuredObservationAdmissionHealth(root);
    expect(audit.rejectedCount).toBe(1);
    expect(audit.admittedCount).toBe(0);
    expect(audit.findings).toEqual([]);
  });

  it("retains an insufficient-identity defer as healthy unresolved review work", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const admission = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      outcome: "defer-insufficient-identity",
    });
    writeState(root, [admission]);
    const audit = auditAsoiafStructuredObservationAdmissionHealth(root);
    expect(audit.deferredCount).toBe(1);
    expect(audit.findings).toEqual([]);
  });

  it("refuses an admission ledger without its current-state projection", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
    });
    expect(
      auditAsoiafStructuredObservationAdmissionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toContain("structured-admission-state-missing");
  });

  it("refuses stale admission fingerprints and identities", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const value = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
    });
    const target = path.join(root, value.uri);
    writeJsonAtomic(target, {
      ...value.admission,
      rationale: `${value.admission.rationale} Altered after review.`,
    });
    writeState(root, [value]);
    expect(
      auditAsoiafStructuredObservationAdmissionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        "structured-admission-fingerprint",
        "structured-admission-identity",
      ]),
    );
  });

  it("refuses an admission that diverges from its acquisition plan", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const admission = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      planFingerprint: `sha256:${"d".repeat(64)}`,
    });
    writeState(root, [admission]);
    expect(
      auditAsoiafStructuredObservationAdmissionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toContain("structured-admission-acquisition-parity");
  });

  it("makes a defer-to-admit transition visible as disposition drift", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const deferred = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      outcome: "defer-insufficient-identity",
      reviewedAt: "2026-08-04T17:15:00.000Z",
    });
    const admitted = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      outcome: "admit-to-review",
      reviewedAt: "2026-08-04T17:45:00.000Z",
    });
    writeState(root, [deferred, admitted]);

    const audit = auditAsoiafStructuredObservationAdmissionHealth(root);
    expect(audit.admissionCount).toBe(2);
    expect(audit.currentAdmissionCount).toBe(1);
    expect(audit.admittedCount).toBe(1);
    expect(audit.dispositionChangeCount).toBe(1);
    expect(audit.findings).toContainEqual(
      expect.objectContaining({
        code: "structured-admission-disposition-drift",
        severity: "warning",
        repairTask: "inspect-disposition",
      }),
    );
    expect(
      audit.findings.filter((entry) => entry.severity === "error"),
    ).toEqual([]);
  });

  it("refuses a state projection that points to an older disposition", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const deferred = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      outcome: "defer-insufficient-identity",
      reviewedAt: "2026-08-04T17:15:00.000Z",
    });
    writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
      outcome: "admit-to-review",
      reviewedAt: "2026-08-04T17:45:00.000Z",
    });
    writeState(root, [deferred]);

    expect(
      auditAsoiafStructuredObservationAdmissionHealth(root).findings.map(
        (entry) => entry.code,
      ),
    ).toContain("structured-admission-state-latest");
  });

  it("uses portable fingerprint filenames rather than semantic IDs containing colons", () => {
    const root = estateRoot();
    const fixture = initializeFixture(root);
    const admission = writeAdmission({
      root,
      observationId: fixture.committed.observation.observationId,
      candidateId: fixture.committed.observation.candidateId,
      acquisitionReceipt: fixture.acquisitionReceipt,
    });
    writeState(root, [admission]);
    expect(path.basename(admission.uri)).toMatch(/^admission-[a-f0-9]{64}\.json$/);
    expect(path.basename(admission.uri)).not.toContain(":");
    expect(auditAsoiafStructuredObservationAdmissionHealth(root).findings).toEqual([]);
  });
});