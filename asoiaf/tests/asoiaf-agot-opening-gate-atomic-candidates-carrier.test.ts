import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-atomic-candidates-v1");
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
function gitBlobSha1(data: Buffer): string {
  return createHash("sha1")
    .update(Buffer.from(`blob ${data.length}\0`, "utf8"))
    .update(data)
    .digest("hex");
}
function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("AGOT opening-gate exact atomic-candidate carrier", () => {
  it("reconstructs the exact archive from six ordered chunks", () => {
    expect(carrier.chunkCount).toBe(6);
    expect(carrier.base64Characters).toBe(22836);
    const observed = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((chunk: any) => chunk.path));
    const encoded = observed.join("");
    expect(encoded.length).toBe(22836);
    expect(sha256(encoded)).toBe("00c8d026e385f4e8f31b7ec748377b5d3995cfe059d1bbacc417e6bd818295a3");
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(17125);
    expect(sha256(archive)).toBe("2a1502f3f68ce4548d69a5dd2af770ffe4c5c67fcc9eb4ec885fb855246dbae4");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
    expect(admission.carrier.materializedInRepository).toBe(true);
  });

  it("extracts safely and replays all 112 component checks", () => {
    const encoded = carrier.chunks
      .map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii"))
      .join("");
    const archive = Buffer.from(encoded, "base64");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-opening-atomic-"));
    try {
      const archivePath = join(tempRoot, admission.package.filename);
      const tarPath = join(tempRoot, "package.tar");
      writeFileSync(archivePath, archive);
      const decompression = spawnSync("zstd", ["-dc", archivePath], { maxBuffer: 4 * 1024 * 1024 });
      expect(decompression.status, decompression.stderr.toString()).toBe(0);
      writeFileSync(tarPath, decompression.stdout);
      expect(statSync(tarPath).size).toBe(174080);
      expect(sha256(readFileSync(tarPath))).toBe("deccbdc810aa77b88331383824c8be83c630654a8c9fe8d25827b1764660a91f");

      const listing = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8" });
      expect(listing.status, listing.stderr).toBe(0);
      const members = listing.stdout.trim().split("\n");
      expect(members).toHaveLength(9);
      expect(members.every((member) =>
        member.startsWith("asoiaf/public/review/agot-opening-gate-atomic-candidates-v1/") &&
        !member.startsWith("/") &&
        !member.split("/").includes(".."),
      )).toBe(true);

      const extraction = spawnSync("tar", ["-xf", tarPath, "-C", tempRoot], { encoding: "utf8" });
      expect(extraction.status, extraction.stderr).toBe(0);
      const sourceTarget = resolve(tempRoot, "asoiaf/public/corpus-v1/OPENING_GATE.json");
      const triageTarget = resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-v1/TRIAGE.json");
      const preparationTarget = resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-preparation-v1/asoiaf-agot-opening-gate-preparation-v1.tar.zst");
      mkdirSync(resolve(tempRoot, "asoiaf/public/corpus-v1"), { recursive: true });
      mkdirSync(resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-v1"), { recursive: true });
      mkdirSync(resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-preparation-v1"), { recursive: true });
      copyFileSync(resolve(process.cwd(), "asoiaf/public/corpus-v1/OPENING_GATE.json"), sourceTarget);
      copyFileSync(resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-v1/TRIAGE.json"), triageTarget);
      copyFileSync(resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-preparation-v1/asoiaf-agot-opening-gate-preparation-v1.tar.zst"), preparationTarget);

      const verifierPath = resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-atomic-candidates-v1/verify.py");
      const replay = spawnSync(python(), [verifierPath], {
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "error" },
      });
      expect(replay.status, replay.stderr).toBe(0);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        componentId: "asoiaf-agot-opening-gate-atomic-candidates-v1",
        passed: 112,
        total: 112,
        status: "PASS",
        warningsAsErrors: true,
        counts: {
          parentRecords: 31,
          directAtomicDrafts: 14,
          splitProposals: 24,
          rewriteProposals: 7,
          atomicCandidates: 45,
          decisionTemplates: 45,
          executedHumanTransactions: 0,
          automaticCanonPromotions: 0,
          automaticGraphMutations: 0,
        },
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("retains all review and authority counts without decision execution", () => {
    expect(admission.counts).toEqual({
      parentRecords: 31,
      directAtomicDrafts: 14,
      splitProposals: 24,
      rewriteProposals: 7,
      atomicCandidates: 45,
      decisionTemplates: 45,
      reviewBatches: 3,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.qualification).toEqual({
      componentVerifierExpectedChecks: 112,
      carrierReconstructionRequired: true,
      archiveReplayRequired: true,
      warningsAsErrorsRequired: true,
      repositoryQualificationRequired: true,
    });
    expect(admission.authorityBoundary).toMatchObject({
      candidateIsNotDecision: true,
      sourceNormalizedDraftIsNotCanonReview: true,
      assistantProposalIsNotSourceText: true,
      assistantCannotExecuteHumanTransaction: true,
      carrierDoesNotImpersonateArchivePath: true,
      parentRecordFingerprintMustMatch: true,
      privateSourceInspectionRequired: true,
      sourceTextPresent: false,
      privatePayloadPresent: false,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
    });
  });
});
