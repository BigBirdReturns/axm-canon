import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-local-feature-postimage-materializer-v1");
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const gitBlob = (value: Buffer) => createHash("sha1").update(Buffer.from(`blob ${value.length}\0`)).update(value).digest("hex");
const encodedCarrier = () => Buffer.concat(carrier.concatenationOrder.map((path: string) => readFileSync(resolve(root, path))));
const python = () => process.platform === "win32" ? "python" : "python3";

describe("AGOT local-feature postimage materializer exact carrier", () => {
  it("reconstructs the exact deterministic tar.gz package", () => {
    expect(carrier.chunkCount).toBe(9);
    for (const entry of carrier.chunks) {
      const chunk = readFileSync(resolve(root, entry.path));
      expect(chunk.length).toBe(entry.characters);
      expect(sha256(chunk)).toBe(entry.sha256);
      expect(gitBlob(chunk)).toBe(entry.gitBlobSha1);
    }
    const encoded = encodedCarrier();
    expect(encoded.length).toBe(33344);
    expect(sha256(encoded)).toBe("8a508c7911fb062c24f4a1a30d5cd661801ba076728c73e40b46b411538e5c09");
    const archive = Buffer.from(encoded.toString("ascii"), "base64");
    expect(archive.length).toBe(25007);
    expect(sha256(archive)).toBe("17c001a91f8d1d6727b0baebfbff1f0ec3933ba59bc191732d912df546acea93");
  });

  it("extracts safely and replays 127 static plus 59 synthetic checks", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-postimage-materializer-"));
    const archivePath = join(temporary, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encodedCarrier().toString("ascii"), "base64"));
      const extract = spawnSync(python(), ["-S", "-c", [
        "import pathlib,stat,sys,tarfile",
        "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2])",
        "z=tarfile.open(p,'r:gz');m=z.getmembers()",
        "f=[v for v in m if v.isfile()]",
        "assert len(f)==10",
        "assert all(not pathlib.PurePosixPath(v.name).is_absolute() for v in m)",
        "assert all('..' not in pathlib.PurePosixPath(v.name).parts for v in m)",
        "assert all('\\\\' not in v.name for v in m)",
        "assert all(not (v.issym() or v.islnk() or v.isdev() or v.isfifo()) for v in m)",
        "z.extractall(o,filter='data')"
      ].join(";"), archivePath, temporary], { encoding: "utf8" });
      expect(extract.status, extract.stderr).toBe(0);
      const component = resolve(temporary, "asoiaf/public/review/agot-local-feature-postimage-materializer-v1");
      const environment = { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" };
      const verify = spawnSync(python(), ["-W", "error", "-S", resolve(component, "verify.py")], { encoding: "utf8", env: environment });
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({ status: "PASS", passed: 127, total: 127, realPostimagePairsMaterialized: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
      const synthetic = spawnSync(python(), ["-W", "error", "-S", resolve(component, "synthetic_campaign.py")], { encoding: "utf8", env: environment, timeout: 180000 });
      expect(synthetic.status, synthetic.stderr).toBe(0);
      expect(JSON.parse(synthetic.stdout)).toMatchObject({ status: "PASS", passed: 59, total: 59, noncopyrightedFixtureOnly: true, privateSourceTextUsed: false, realPostimagePairsMaterialized: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the exact upstream and zero-effect authority boundaries", () => {
    expect(admission.baseMainCommit).toBe("13621d4567875e05d40c5d29522ec87efb7b9f19");
    expect(admission.upstream).toMatchObject({ componentId: "asoiaf-agot-local-feature-materialization-request-v1", admissionCommit: "13621d4567875e05d40c5d29522ec87efb7b9f19", requiredRequestStatus: "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD", requiredNextAuthorityHold: "LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD" });
    expect(Object.values(admission.counts)).toEqual(Object.values(admission.counts).map(() => 0));
    expect(admission.authorityBoundary).toMatchObject({ carrierReconstructionIsNotMaterializationExecution: true, postimageMaterializationIsNotWorktreeApplication: true, postimageFilesWrittenByRuntime: 0, repositoryFilesWrittenByRuntime: 0, worktreesModifiedByRuntime: 0, liveIndexesModifiedByRuntime: 0, commitsCreatedByRuntime: 0, referencesUpdatedByRuntime: 0, remotePushesByRuntime: 0, pullRequestsOpenedByRuntime: 0, privateSourceTextPresent: false, privatePayloadPresent: false, canonEffect: "none", graphEffect: "none" });
  });
});
