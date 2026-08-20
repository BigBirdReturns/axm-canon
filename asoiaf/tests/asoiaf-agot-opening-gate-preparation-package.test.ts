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

const root = resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-preparation-v1");
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const archivePath = resolve(root, admission.package.filename);
const archiveBytes = readFileSync(archivePath);
const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");

function python(): string {
  return process.platform === "win32" ? "python" : "python3";
}

describe("AGOT opening-gate exact review-preparation package", () => {
  it("materializes the exact archive and bounded admission contract", () => {
    expect(statSync(archivePath).size).toBe(11820);
    expect(archiveSha256).toBe("bdfce376c9e667e7596403c4f19f0d5535d5193636b9360131da89584df23121");
    expect(admission).toMatchObject({
      componentId: "asoiaf-agot-opening-gate-preparation-v1",
      standing: "exact-public-review-preparation-archive-materialized-expanded-files-package-bound",
      package: {
        bytes: 11820,
        sha256: "bdfce376c9e667e7596403c4f19f0d5535d5193636b9360131da89584df23121",
        tarBytes: 81920,
        tarSha256: "f6790f33b755b2a58fc076e2cfd6917c8533a8b73583d40faff4bcaeca0ef541",
        expandedFileCount: 7,
        expandedFilesMaterializedIndividually: false,
        materializedInRepository: true,
      },
    });
  });

  it("extracts safely and replays all eighty component checks", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-opening-preparation-"));
    try {
      const tarPath = join(tempRoot, "package.tar");
      const decompression = spawnSync("zstd", ["-dc", archivePath], {
        maxBuffer: 2 * 1024 * 1024,
      });
      expect(decompression.status, decompression.stderr.toString()).toBe(0);
      writeFileSync(tarPath, decompression.stdout);
      expect(statSync(tarPath).size).toBe(81920);
      expect(createHash("sha256").update(readFileSync(tarPath)).digest("hex")).toBe(
        "f6790f33b755b2a58fc076e2cfd6917c8533a8b73583d40faff4bcaeca0ef541",
      );

      const listing = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8" });
      expect(listing.status, listing.stderr).toBe(0);
      const members = listing.stdout.trim().split("\n");
      expect(members).toHaveLength(8);
      expect(
        members.every(
          (member) =>
            member.startsWith("asoiaf/public/review/agot-opening-gate-preparation-v1/") &&
            !member.startsWith("/") &&
            !member.split("/").includes(".."),
        ),
      ).toBe(true);

      const extraction = spawnSync("tar", ["-xf", tarPath, "-C", tempRoot], { encoding: "utf8" });
      expect(extraction.status, extraction.stderr).toBe(0);

      const sourceTarget = resolve(tempRoot, "asoiaf/public/corpus-v1/OPENING_GATE.json");
      const triageTarget = resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-v1/TRIAGE.json");
      mkdirSync(resolve(tempRoot, "asoiaf/public/corpus-v1"), { recursive: true });
      mkdirSync(resolve(tempRoot, "asoiaf/public/review/agot-opening-gate-v1"), { recursive: true });
      copyFileSync(resolve(process.cwd(), "asoiaf/public/corpus-v1/OPENING_GATE.json"), sourceTarget);
      copyFileSync(resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-v1/TRIAGE.json"), triageTarget);

      const verifierPath = resolve(
        tempRoot,
        "asoiaf/public/review/agot-opening-gate-preparation-v1/verify.py",
      );
      const replay = spawnSync(python(), [verifierPath], {
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "error" },
      });
      expect(replay.status, replay.stderr).toBe(0);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        componentId: "asoiaf-agot-opening-gate-preparation-v1",
        passed: 80,
        total: 80,
        status: "PASS",
        warningsAsErrors: true,
        executedHumanTransactions: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("retains all proposal and authority counts without review execution", () => {
    expect(admission.counts).toEqual({
      preparedParentRecords: 17,
      splitParents: 10,
      rewriteParents: 7,
      splitChildProposals: 24,
      rewriteProposals: 7,
      totalProposals: 31,
      executedHumanTransactions: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.qualification).toEqual({
      componentVerifierExpectedChecks: 80,
      archiveReplayRequired: true,
      warningsAsErrorsRequired: true,
      repositoryQualificationRequired: true,
    });
    expect(admission.authorityBoundary).toMatchObject({
      proposalIsNotDecision: true,
      proposalIsNotSourceText: true,
      proposalIsNotCanonReview: true,
      parentTransactionRequired: true,
      assistantCannotExecuteHumanTransaction: true,
      sourceTextPresent: false,
      privatePayloadPresent: false,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
    });
  });
});
