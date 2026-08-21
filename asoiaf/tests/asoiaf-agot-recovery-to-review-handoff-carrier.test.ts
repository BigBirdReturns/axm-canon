import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-recovery-to-review-handoff-v1");
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

const safeExtract = String.raw`
import json, pathlib, stat, sys, zipfile
archive = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(archive) as handle:
    names = []
    for info in handle.infolist():
        name = info.filename.replace("\\", "/")
        path = pathlib.PurePosixPath(name)
        mode = info.external_attr >> 16
        if path.is_absolute() or ".." in path.parts or stat.S_ISLNK(mode):
            raise SystemExit(f"unsafe zip member: {name}")
        names.append(name)
    handle.extractall(destination)
print(json.dumps({"members": len(names)}))
`;

describe("AGOT exact physical-recovery handoff carrier", () => {
  it("reconstructs the exact Windows handoff ZIP from sixteen ordered chunks", () => {
    expect(carrier.chunkCount).toBe(16);
    expect(carrier.base64Characters).toBe(143420);
    const observed = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(carrier.chunks.map((chunk: any) => chunk.path));
    const encoded = observed.join("");
    expect(encoded.length).toBe(143420);
    expect(sha256(encoded)).toBe("ed5b5c481488c0e68887702bb6c0c36ac775677887638cde51e39b979d2af819");
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(107565);
    expect(sha256(archive)).toBe("dd70c8c9d5de23db7014d8e4d89b73a52d24ecedc8986c4e42812e7820a390d9");
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
    expect(admission.package.archivePathMaterializedInRepository).toBe(false);
    expect(admission.carrier.materializedInRepository).toBe(true);
  });

  it("extracts safely and replays the complete 27-check handoff verifier", () => {
    const encoded = carrier.chunks
      .map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii"))
      .join("");
    const archive = Buffer.from(encoded, "base64");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-recovery-handoff-"));
    try {
      const archivePath = join(tempRoot, admission.package.filename);
      writeFileSync(archivePath, archive);
      const extraction = spawnSync(python(), ["-c", safeExtract, archivePath, tempRoot], {
        encoding: "utf8",
      });
      expect(extraction.status, extraction.stderr).toBe(0);
      expect(JSON.parse(extraction.stdout)).toEqual({ members: 45 });

      const extractedRoot = resolve(tempRoot, "asoiaf-agot-recovery-to-review-handoff-v1");
      const replay = spawnSync(python(), [resolve(extractedRoot, "verify.py")], {
        encoding: "utf8",
        env: { ...process.env, PYTHONWARNINGS: "error" },
      });
      expect(replay.status, replay.stderr).toBe(0);
      expect(JSON.parse(replay.stdout)).toMatchObject({
        componentId: "asoiaf-agot-recovery-to-review-handoff-v1",
        passed: 27,
        total: 27,
        status: "PASS",
        warningsAsErrors: true,
        reviewTransactionsExecuted: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
        copyrightedSourceTextUsed: false,
        sourceTextReturned: false,
      });

      const targets = JSON.parse(
        readFileSync(resolve(extractedRoot, "physical-recovery-probe/TARGETS.json"), "utf8"),
      );
      expect(targets.targets).toHaveLength(4);
      expect(targets.targets.map((row: any) => row.bytes)).toEqual([
        1365577,
        8028251,
        229297511,
        106151936,
      ]);
      const standing = JSON.parse(readFileSync(resolve(extractedRoot, "CURRENT_STANDING.json"), "utf8"));
      expect(standing).toMatchObject({
        status: "HOLD_PHYSICAL_LOCAL_RECOVERY_REQUIRED",
        currentRuntimeExactMatches: 0,
        privateLocatorExecutableAfterExactSqliteRecovery: true,
        sourceArchiveRecoveryRequiresSeparateRestorationTransaction: true,
        reviewTransactionsExecuted: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("preserves every private-source and review authority boundary", () => {
    expect(admission.counts).toEqual({
      recoveryTargets: 4,
      atomicReviewCandidates: 45,
      sourceParents: 31,
      privateParagraphLocators: 31,
      expandedFiles: 45,
      reviewTransactionsExecuted: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.exactSourceHolds).toHaveLength(4);
    expect(admission.exactSourceHolds.every((row: any) => row.materialized === false)).toBe(true);
    expect(admission.authorityBoundary).toMatchObject({
      assistantCannotServeAsNamedHumanReviewer: true,
      carrierDoesNotImpersonateArchivePath: true,
      exactRecoveryDoesNotEqualHumanReview: true,
      locatorResolutionDoesNotAuthorizePrivateDisplay: true,
      sourceArchiveRecoveryDoesNotAuthorizeExtraction: true,
      privatePayloadPresent: false,
      sourceTextPresent: false,
      automaticCanonEffect: "none",
      automaticGraphEffect: "none",
    });
  });
});
