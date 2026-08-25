import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-local-feature-materialization-request-v1",
);
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
const gitBlob = (value: Buffer) =>
  createHash("sha1")
    .update(Buffer.from(`blob ${value.length}\0`))
    .update(value)
    .digest("hex");
const encodedCarrier = () =>
  Buffer.concat(
    carrier.concatenationOrder.map((path: string) => readFileSync(resolve(root, path))),
  );
const python = () => (process.platform === "win32" ? "python" : "python3");
const environment = {
  ...process.env,
  PYTHONWARNINGS: "error",
  PYTHONSAFEPATH: "1",
};

describe("AGOT local-feature materialization request exact carrier", () => {
  it("reconstructs the exact deterministic tar.gz package", () => {
    expect(carrier).toMatchObject({
      schema: "axm-asoiaf-exact-base64-carrier/1",
      componentId: "asoiaf-agot-local-feature-materialization-request-v1",
      chunkCount: 7,
      base64Characters: 27672,
      base64Sha256:
        "a0eb542ef4bcd7d710851294564c172a48fa65e268cad876b535e8f40a43de5a",
      decodedObject: {
        bytes: 20753,
        sha256:
          "6b8a84702e148bfe921fc1eaec37a24392b914856cc9a5fe3b90c6166072ef68",
        expandedFileCount: 10,
      },
    });
    for (const entry of carrier.chunks) {
      const chunk = readFileSync(resolve(root, entry.path));
      expect(chunk.length).toBe(entry.characters);
      expect(sha256(chunk)).toBe(entry.sha256);
      expect(gitBlob(chunk)).toBe(entry.gitBlobSha1);
    }
    const encoded = encodedCarrier();
    expect(encoded.length).toBe(carrier.base64Characters);
    expect(sha256(encoded)).toBe(carrier.base64Sha256);
    const archive = Buffer.from(encoded.toString("ascii"), "base64");
    expect(archive.length).toBe(carrier.decodedObject.bytes);
    expect(sha256(archive)).toBe(carrier.decodedObject.sha256);
    expect(existsSync(resolve(root, carrier.decodedObject.filename))).toBe(false);
  });

  it("extracts safely and replays 86 static plus 36 adversarial checks", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-agot-materialization-request-"));
    const archivePath = join(temporary, carrier.decodedObject.filename);
    const extractionRoot = join(temporary, "extracted");
    try {
      writeFileSync(
        archivePath,
        Buffer.from(encodedCarrier().toString("ascii"), "base64"),
      );
      const extractionScript = [
        "import json,pathlib,sys,tarfile",
        "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
        "t=tarfile.open(p,'r:gz');m=t.getmembers();f=[v for v in m if v.isfile()]",
        "assert len(f)==10",
        "assert all(not pathlib.PurePosixPath(v.name).is_absolute() for v in m)",
        "assert all('..' not in pathlib.PurePosixPath(v.name).parts for v in m)",
        "assert all('\\\\' not in v.name for v in m)",
        "assert all(not v.issym() and not v.islnk() and not v.isdev() for v in m)",
        "t.extractall(o,filter='data')",
        "observed=sorted(v.relative_to(o).as_posix() for v in o.rglob('*') if v.is_file())",
        "assert observed==json.loads(sys.argv[3]),(observed,json.loads(sys.argv[3]))",
      ].join(";");
      const extract = spawnSync(
        python(),
        [
          "-W",
          "error",
          "-S",
          "-c",
          extractionScript,
          archivePath,
          extractionRoot,
          JSON.stringify(carrier.expandedPaths),
        ],
        { encoding: "utf8", env: environment },
      );
      expect(extract.status, extract.stderr).toBe(0);
      const component = resolve(
        extractionRoot,
        "asoiaf/public/review/agot-local-feature-materialization-request-v1",
      );
      const verify = spawnSync(
        python(),
        ["-W", "error", "-S", resolve(component, "verify.py")],
        { encoding: "utf8", env: environment },
      );
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({
        status: "PASS",
        passed: 86,
        total: 86,
        realDispositionReceiptsConsumed: 0,
        realAdmittedPropositionsConsumed: 0,
        realMaterializationPlansConsumed: 0,
        realMaterializationRequestsSealed: 0,
        realPostimagesMaterialized: 0,
        realRepositoryFilesWritten: 0,
        realCommitsCreated: 0,
        realReferencesUpdated: 0,
        realRemotePushes: 0,
        realPullRequestsOpened: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
      const synthetic = spawnSync(
        python(),
        ["-W", "error", "-S", resolve(component, "synthetic_campaign.py")],
        { encoding: "utf8", env: environment, timeout: 180_000 },
      );
      expect(synthetic.status, synthetic.stderr).toBe(0);
      expect(JSON.parse(synthetic.stdout)).toMatchObject({
        status: "PASS",
        passed: 36,
        total: 36,
        noncopyrightedFixtureOnly: true,
        privateSourceTextUsed: false,
        privatePayloadUsed: false,
        realDispositionReceiptsConsumed: 0,
        realMaterializationRequestsSealed: 0,
        realPostimagesMaterialized: 0,
        realRepositoryFilesWritten: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the upstream receipt and next-effect authority boundaries", () => {
    expect(admission).toMatchObject({
      schema:
        "axm-asoiaf-agot-local-feature-materialization-request-carrier-admission/1",
      componentId: "asoiaf-agot-local-feature-materialization-request-v1",
      baseMainCommit: "d5898d092ec4091395612ac0f4c555334acec21e",
      upstream: {
        componentId: "asoiaf-agot-named-human-disposition-recorder-v1",
        admissionCommit: "d5898d092ec4091395612ac0f4c555334acec21e",
        requiredDecision: "ADMIT_EXACT_PROPOSITION",
        requiredNextAuthorityHold:
          "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD",
      },
      successStatus:
        "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD",
      nextAuthorityHold: "LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD",
    });
    expect(Object.values(admission.counts)).toEqual(
      Object.values(admission.counts).map(() => 0),
    );
    expect(admission.authorityBoundary).toMatchObject({
      carrierReconstructionIsNotRequestExecution: true,
      requestIsNotPostimageMaterialization: true,
      postimageFilesWrittenByRuntime: 0,
      repositoryFilesWrittenByRuntime: 0,
      worktreesModifiedByRuntime: 0,
      commitsCreatedByRuntime: 0,
      referencesUpdatedByRuntime: 0,
      remotePushesByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
