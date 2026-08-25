import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-remote-reference-state-observer-v1";
const repositoryDirectory = "agot-remote-reference-state-observer-v1";
const carrierRoot = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const carrier = JSON.parse(readFileSync(resolve(carrierRoot, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(carrierRoot, "ADMISSION.json"), "utf8"));
const python = () => process.platform === "win32" ? "python" : "python3";
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  PYTHONWARNINGS: "error",
  PYTHONSAFEPATH: "1",
};
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function executeJson(args: string[], cwd?: string): Record<string, unknown> {
  const [command, ...parameters] = args;
  if (!command) throw new Error("command is required");
  const completed = spawnSync(command, parameters, {
    cwd,
    encoding: "utf8",
    env: environment,
    timeout: 300_000,
  });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return JSON.parse(completed.stdout) as Record<string, unknown>;
}

function reconstructSource(temporary: string): string {
  const parts = carrier.concatenationOrder.map((path: string, index: number) => {
    const entry = carrier.chunks[index];
    expect(entry.path).toBe(path);
    const raw = readFileSync(resolve(carrierRoot, path));
    expect(raw.length).toBe(entry.characters);
    expect(sha256(raw)).toBe(entry.sha256);
    expect(raw.toString("ascii")).not.toMatch(/\s/);
    const blob = spawnSync("git", ["hash-object", "--stdin"], {
      input: raw,
      encoding: "utf8",
    });
    expect(blob.status, blob.stderr).toBe(0);
    expect(blob.stdout.trim()).toBe(entry.gitBlobSha1);
    return raw;
  });
  const encoded = Buffer.concat(parts);
  expect(encoded.length).toBe(carrier.base64Characters);
  expect(sha256(encoded)).toBe(carrier.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(carrier.decodedObject.bytes);
  expect(sha256(archive)).toBe(carrier.decodedObject.sha256);
  const uncompressed = gunzipSync(archive);
  expect(uncompressed.length).toBe(carrier.decodedObject.uncompressedTarBytes);
  expect(sha256(uncompressed)).toBe(carrier.decodedObject.uncompressedTarSha256);

  const archivePath = resolve(temporary, carrier.decodedObject.filename);
  const output = resolve(temporary, "observer-source");
  writeFileSync(archivePath, archive);
  const extractor = [
    "import json,pathlib,sys,tarfile",
    "a=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);e=json.loads(sys.argv[3]);o.mkdir()",
    "with tarfile.open(a,'r:gz') as t:",
    " m=t.getmembers();f=[]",
    " for v in m:",
    "  p=pathlib.PurePosixPath(v.name)",
    "  assert not p.is_absolute() and '..' not in p.parts and '\\\\' not in v.name",
    "  assert v.isfile() and not (v.issym() or v.islnk() or v.isdev() or v.isfifo())",
    "  f.append(v.name)",
    " assert f == e",
    " t.extractall(o,filter='data')",
  ].join("\n");
  const completed = spawnSync(python(), [
    "-W", "error", "-S", "-c", extractor,
    archivePath,
    output,
    JSON.stringify(carrier.expandedPaths),
  ], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, "asoiaf/public/review", repositoryDirectory);
}

function reconstructPushOperator(temporary: string): string {
  const component = "asoiaf-agot-remote-feature-push-operator-v1";
  const repositoryComponent = component.slice("asoiaf-".length);
  const root = resolve(process.cwd(), "asoiaf/public/review", repositoryComponent);
  const manifest = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
  const encoded = Buffer.concat(
    manifest.concatenationOrder.map((path: string) => readFileSync(resolve(root, path))),
  );
  expect(encoded.length).toBe(manifest.base64Characters);
  expect(sha256(encoded)).toBe(manifest.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(manifest.decodedObject.bytes);
  expect(sha256(archive)).toBe(manifest.decodedObject.sha256);
  const archivePath = resolve(temporary, manifest.decodedObject.filename);
  const output = resolve(temporary, "push-operator");
  writeFileSync(archivePath, archive);
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", [
    "import pathlib,stat,sys,zipfile",
    "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
    "with zipfile.ZipFile(p) as a:",
    " i=a.infolist();assert a.testzip() is None",
    " assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
    " assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
    " assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
    " a.extractall(o)",
  ].join("\n"), archivePath, output], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, component);
}

describe("AGOT remote-reference state observer exact carrier", () => {
  it("binds the current local-reference authority and the held remote-push authorization", () => {
    expect(carrier).toMatchObject({
      schema: "axm-asoiaf-exact-base64-carrier/1",
      componentId,
    });
    expect(admission).toMatchObject({
      componentId,
      baseMainCommit: "86b5a92e9883c608b17c253bad88a4c827cdd52f",
      upstream: {
        referenceUpdateAuthorizationSealer: {
          pullRequest: 91,
          admissionCommit: "86b5a92e9883c608b17c253bad88a4c827cdd52f",
        },
        featureReferenceUpdater: {
          admissionCommit: "af2d05a17c1f9c632774ba159c63b13a305964a1",
        },
      },
      successStatus: "PASS_REMOTE_REFERENCE_STATE_OBSERVED_PUSH_AUTHORIZATION_WITHHELD",
      nextAuthorityHold: "REMOTE_FEATURE_PUSH_AUTHORIZATION_WITHHELD",
    });
  });

  it("reconstructs safely and replays exact static and adversarial qualification", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-remote-observer-"));
    try {
      const source = reconstructSource(temporary);
      expect(executeJson([
        python(), "-W", "error", "-S", resolve(source, "verify.py"),
      ], source)).toMatchObject({
        status: "PASS",
        passed: 218,
        total: 218,
        realRemoteObservationsConsumedForAuthority: 0,
        realRemoteFeaturePushes: 0,
      });
      expect(executeJson([
        python(), "-W", "error", "-S", resolve(source, "synthetic_campaign.py"),
      ], source)).toMatchObject({
        status: "PASS",
        passed: 124,
        total: 124,
        noncopyrightedFixtureOnly: true,
        realRemoteFeaturePushes: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("feeds exact observed values into the admitted push operator preflight and rejects staleness", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-remote-observer-compat-"));
    try {
      const source = reconstructSource(temporary);
      const pushOperator = reconstructPushOperator(temporary);
      expect(executeJson([
        python(), "-W", "error", "-S", resolve(source, "exact_push_operator_compatibility.py"),
        "--push-operator-root", pushOperator,
      ], source)).toMatchObject({
        status: "PASS",
        passed: 36,
        total: 36,
        exactRemotePushOperatorPreflight: "PASS",
        staleObservationLeaseRefusal: "PASS",
        realRemoteFeaturePushes: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect substantive census", () => {
    expect(Object.values(admission.counts)).toEqual(
      Object.values(admission.counts).map(() => 0),
    );
    expect(admission.authorityBoundary).toMatchObject({
      observationIsNotPushAuthorization: true,
      observationIsNotRemotePush: true,
      repositoryFilesWrittenByRuntime: 0,
      localReferencesUpdatedByRuntime: 0,
      remoteReferencesUpdatedByRuntime: 0,
      remotePushesByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
