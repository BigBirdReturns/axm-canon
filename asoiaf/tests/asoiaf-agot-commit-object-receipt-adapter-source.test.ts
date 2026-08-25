import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-commit-object-receipt-adapter-v1");
const updaterCarrierRoot = resolve(process.cwd(), "asoiaf/public/review/agot-feature-reference-updater-v1");
const contract = JSON.parse(readFileSync(resolve(root, "CONTRACT.json"), "utf8"));
const standing = JSON.parse(readFileSync(resolve(root, "CURRENT_STANDING.json"), "utf8"));
const python = () => (process.platform === "win32" ? "python" : "python3");
const environment = { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" };
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const gitBlob = (value: Buffer) => createHash("sha1").update(Buffer.from(`blob ${value.length}\0`)).update(value).digest("hex");

const executeJson = (script: string, extra: string[] = []) => {
  const completed = spawnSync(python(), ["-W", "error", "-S", resolve(root, script), ...extra], {
    encoding: "utf8",
    env: environment,
    timeout: 180_000,
  });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return JSON.parse(completed.stdout);
};

describe("AGOT commit-object receipt adapter repository source", () => {
  it("binds the exact admitted /2 producer, /1 consumer, and remaining worktree hold", () => {
    expect(contract).toMatchObject({
      componentId: "asoiaf-agot-commit-object-receipt-adapter-v1",
      upstream: {
        componentId: "asoiaf-agot-local-feature-commit-object-sealer-v1",
        admissionCommit: "70da97f7f92e792eaad32fdc7a456c598347bd78",
        requiredReceiptSchema: "axm-asoiaf-agot-local-feature-commit-object-receipt/2",
      },
      downstream: {
        componentId: "asoiaf-agot-feature-reference-updater-v1",
        admissionCommit: "af2d05a17c1f9c632774ba159c63b13a305964a1",
        acceptedReceiptSchema: "axm-asoiaf-agot-local-feature-commit-object-receipt/1",
        checkedOutBranchRefusal: "REFUSE_CHECKED_OUT_BRANCH",
        detachedPreflightStatus: "PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP",
      },
      adapterStatus: "PASS_COMMIT_OBJECT_RECEIPT_ADAPTED_WORKTREE_RELEASE_WITHHELD",
      nextAuthorityHold: "REVIEWED_WORKTREE_RELEASE_WITHHELD",
    });
  });

  it("replays static and adversarial qualification under warnings-as-errors", () => {
    expect(executeJson("verify.py")).toMatchObject({ status: "PASS", passed: 85, total: 85 });
    expect(executeJson("synthetic_campaign.py")).toMatchObject({
      status: "PASS",
      passed: 41,
      total: 41,
      noncopyrightedFixtureOnly: true,
      realAdaptedReceiptsSealed: 0,
      realWorktreeReleases: 0,
      realReferenceUpdates: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
  });

  it("reconstructs the exact admitted updater and proves both sides of the checked-out boundary", () => {
    const carrier = JSON.parse(readFileSync(resolve(updaterCarrierRoot, "CARRIER.json"), "utf8"));
    expect(carrier.componentId).toBe("asoiaf-agot-feature-reference-updater-v1");
    const chunks: Buffer[] = [];
    for (const entry of carrier.chunks) {
      const chunk = readFileSync(resolve(updaterCarrierRoot, entry.path));
      expect(chunk.length).toBe(entry.characters);
      expect(sha256(chunk)).toBe(entry.sha256);
      expect(gitBlob(chunk)).toBe(entry.gitBlobSha1);
      chunks.push(chunk);
    }
    const encoded = Buffer.concat(chunks);
    expect(encoded.length).toBe(carrier.base64Characters);
    expect(sha256(encoded)).toBe(carrier.base64Sha256);
    const archive = Buffer.from(encoded.toString("ascii"), "base64");
    expect(archive.length).toBe(carrier.decodedObject.bytes);
    expect(sha256(archive)).toBe(carrier.decodedObject.sha256);

    const temporary = mkdtempSync(resolve(tmpdir(), "axm-adapter-updater-"));
    try {
      const archivePath = resolve(temporary, carrier.decodedObject.filename);
      const extractRoot = resolve(temporary, "extracted");
      writeFileSync(archivePath, archive);
      const extracted = spawnSync(python(), ["-S", "-c", [
        "import pathlib,stat,sys,zipfile",
        "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
        "z=zipfile.ZipFile(p);i=z.infolist()",
        "assert len(i)==13 and z.testzip() is None",
        "assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
        "assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
        "assert all('\\\\' not in v.filename for v in i)",
        "assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
        "z.extractall(o)"
      ].join(";"), archivePath, extractRoot], { encoding: "utf8", env: environment });
      expect(extracted.status, extracted.stderr).toBe(0);
      const updaterRoot = resolve(extractRoot, "asoiaf-agot-feature-reference-updater-v1");
      expect(executeJson("exact_updater_compatibility.py", ["--updater-root", updaterRoot])).toMatchObject({
        status: "PASS",
        passed: 24,
        total: 24,
        checkedOutBoundary: "REFUSE_CHECKED_OUT_BRANCH",
        detachedBoundary: "PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP",
        realReferenceUpdates: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves a zero-effect substantive census", () => {
    expect(Object.values(standing.counts)).toEqual(Object.values(standing.counts).map(() => 0));
    expect(standing).toMatchObject({
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      runtimeRepositoryEffect: "none",
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
