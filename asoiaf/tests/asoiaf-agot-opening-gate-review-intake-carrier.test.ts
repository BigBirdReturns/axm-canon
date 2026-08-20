import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-opening-gate-review-intake-v1");
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

describe("AGOT opening-gate exact review-intake carrier", () => {
  it("reconstructs the exact archive from eight ordered chunks", () => {
    expect(carrier.chunkCount).toBe(8);
    expect(carrier.base64Characters).toBe(29604);
    const observed = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((chunk: any) => chunk.path));
    const encoded = observed.join("");
    expect(encoded.length).toBe(29604);
    expect(sha256(encoded)).toBe("e4d077c175977bc7f7e288c2016290c36a3861421900c0e66169d24651f4597f");
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(22202);
    expect(sha256(archive)).toBe("df535e3f1bfc302aba23d7155c25ff2b924ba1c890bd1231cbd8d06cc75734c4");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
    expect(admission.carrier.materializedInRepository).toBe(true);
    expect(admission.carrier.archivePathMaterializedInRepository).toBe(false);
  });

  it("extracts safely and replays all 440 component checks", () => {
    const encoded = carrier.chunks
      .map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii"))
      .join("");
    const archive = Buffer.from(encoded, "base64");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-opening-intake-"));
    try {
      const archivePath = join(tempRoot, admission.package.filename);
      const tarPath = join(tempRoot, "package.tar");
      writeFileSync(archivePath, archive);
      const decompression = spawnSync("zstd", ["-dc", archivePath], { maxBuffer: 4 * 1024 * 1024 });
      expect(decompression.status, decompression.stderr.toString()).toBe(0);
      writeFileSync(tarPath, decompression.stdout);
      expect(statSync(tarPath).size).toBe(235520);
      expect(sha256(readFileSync(tarPath))).toBe("7045f423204e4c221e6c9d9799a3edff9146a5cc44ca0e428d0313ebfb34cdd0");

      const listing = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8" });
      expect(listing.status, listing.stderr).toBe(0);
      const members = listing.stdout.trim().split("\n");
      expect(members).toHaveLength(12);
      expect(members.every((member) =>
        member.startsWith("asoiaf/public/review/asoiaf-agot-opening-gate-review-intake-v1/") &&
        !member.startsWith("/") &&
        !member.split("/").includes(".."),
      )).toBe(true);

      const extraction = spawnSync("tar", ["-xf", tarPath, "-C", tempRoot], { encoding: "utf8" });
      expect(extraction.status, extraction.stderr).toBe(0);
      const verifierPath = resolve(tempRoot, "asoiaf/public/review/asoiaf-agot-opening-gate-review-intake-v1/verify.py");
      const replay = spawnSync(python(), [verifierPath], {
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "error" },
      });
      expect(replay.status, replay.stderr).toBe(0);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        componentId: "asoiaf-agot-opening-gate-review-intake-v1",
        passed: 440,
        total: 440,
        failed: 0,
        status: "PASS",
        warningsAsErrors: true,
        counts: admission.counts,
        executedHumanTransactions: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("withholds private source and every review authority path", () => {
    expect(admission.counts).toEqual({"atomicCandidates": 45, "automaticCanonPromotions": 0, "automaticGraphMutations": 0, "executedHumanTransactions": 0, "physicalTasks": 6, "reviewBatches": 3, "sourceParents": 31, "sourceRequests": 45, "transactionIntakes": 45, "validatedCompletedTransactions": 0});
    expect(admission.exactSourceHold.agotSource).toMatchObject({
      materialized: false,
      sourceBytes: 1365577,
      unitCount: 89,
      paragraphLocators: 7100,
      wordCount: 296417,
      sourceDigest: "sha256:4f1966c377e3f92f15f912ee5129b3a08d0f71133adf09daa61c573f916417c0",
    });
    expect(admission.exactSourceHold.sourceVault).toMatchObject({
      materialized: false,
      bytes: 8028251,
      sha256: "099f26d58f674a4dd353c15f162cda64c352d7e40d1fb02a1d09163fee76404e",
      reconstructionAllowed: false,
      substitutionAllowed: false,
    });
    expect(admission.authorityBoundary).toMatchObject({
      assistantCannotServeAsNamedHumanReviewer: true,
      sourceRequestIsNotSourceInspection: true,
      transactionIntakeIsNotTransaction: true,
      validatorDoesNotExecuteTransaction: true,
      carrierDoesNotImpersonateArchivePath: true,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
    });
  });
});
