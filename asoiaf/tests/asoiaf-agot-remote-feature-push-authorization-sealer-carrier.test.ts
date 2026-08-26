import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-remote-feature-push-authorization-sealer-v1";
const repositoryDirectory = "agot-remote-feature-push-authorization-sealer-v1";
const carrierRoot = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const carrier = JSON.parse(readFileSync(resolve(carrierRoot, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(carrierRoot, "ADMISSION.json"), "utf8"));
const python = () => process.platform === "win32" ? "python" : "python3";
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  PYTHONWARNINGS: "error",
  PYTHONSAFEPATH: "1",
  GIT_TERMINAL_PROMPT: "0",
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

function reconstructTarGzFromCarrier(component: string, temporary: string): string {
  const repositoryComponent = component.startsWith("asoiaf-") ? component.slice("asoiaf-".length) : component;
  const componentRoot = resolve(process.cwd(), "asoiaf/public/review", repositoryComponent);
  const manifest = JSON.parse(readFileSync(resolve(componentRoot, "CARRIER.json"), "utf8"));
  const parts = manifest.concatenationOrder.map((path: string, index: number) => {
    const entry = manifest.chunks[index];
    expect(entry.path).toBe(path);
    const raw = readFileSync(resolve(componentRoot, path));
    expect(raw.length).toBe(entry.characters);
    expect(sha256(raw)).toBe(entry.sha256);
    expect(raw.toString("ascii")).not.toMatch(/\s/);
    const blob = spawnSync("git", ["hash-object", "--stdin"], { input: raw, encoding: "utf8" });
    expect(blob.status, blob.stderr).toBe(0);
    expect(blob.stdout.trim()).toBe(entry.gitBlobSha1);
    return raw;
  });
  const encoded = Buffer.concat(parts);
  expect(encoded.length).toBe(manifest.base64Characters);
  expect(sha256(encoded)).toBe(manifest.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(manifest.decodedObject.bytes);
  expect(sha256(archive)).toBe(manifest.decodedObject.sha256);
  const uncompressed = gunzipSync(archive);
  expect(uncompressed.length).toBe(manifest.decodedObject.uncompressedTarBytes);
  expect(sha256(uncompressed)).toBe(manifest.decodedObject.uncompressedTarSha256);

  const archivePath = resolve(temporary, `${repositoryComponent}-${manifest.decodedObject.filename}`);
  const output = resolve(temporary, `${repositoryComponent}-source`);
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
    JSON.stringify(manifest.expandedPaths),
  ], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, "asoiaf/public/review", repositoryComponent);
}

function reconstructZipFromCarrier(component: string, temporary: string): string {
  const repositoryComponent = component.startsWith("asoiaf-") ? component.slice("asoiaf-".length) : component;
  const componentRoot = resolve(process.cwd(), "asoiaf/public/review", repositoryComponent);
  const manifest = JSON.parse(readFileSync(resolve(componentRoot, "CARRIER.json"), "utf8"));
  const encoded = Buffer.concat(manifest.concatenationOrder.map((path: string, index: number) => {
    const entry = manifest.chunks[index];
    expect(entry.path).toBe(path);
    const raw = readFileSync(resolve(componentRoot, path));
    expect(raw.length).toBe(entry.characters);
    expect(sha256(raw)).toBe(entry.sha256);
    const blob = spawnSync("git", ["hash-object", "--stdin"], { input: raw, encoding: "utf8" });
    expect(blob.status, blob.stderr).toBe(0);
    expect(blob.stdout.trim()).toBe(entry.gitBlobSha1);
    return raw;
  }));
  expect(encoded.length).toBe(manifest.base64Characters);
  expect(sha256(encoded)).toBe(manifest.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(manifest.decodedObject.bytes);
  expect(sha256(archive)).toBe(manifest.decodedObject.sha256);
  const archivePath = resolve(temporary, `${repositoryComponent}-${manifest.decodedObject.filename}`);
  const output = resolve(temporary, `${repositoryComponent}-source`);
  writeFileSync(archivePath, archive);
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", [
    "import pathlib,stat,sys,zipfile",
    "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
    "with zipfile.ZipFile(p) as a:",
    " i=a.infolist();assert a.testzip() is None",
    " assert len([v for v in i if not v.is_dir()]) == int(sys.argv[3])",
    " assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
    " assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
    " assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
    " a.extractall(o)",
  ].join("\n"), archivePath, output, String(manifest.decodedObject.expandedFileCount)], {
    encoding: "utf8",
    env: environment,
  });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, component);
}

describe("AGOT remote-feature push-authorization exact carrier", () => {
  it("binds the exact package, observer, and leased-push operator", () => {
    expect(carrier).toMatchObject({
      schema: "axm-asoiaf-exact-base64-carrier/1",
      componentId,
      chunkCount: 4,
      base64Characters: 29752,
      base64Sha256: "32b1bb730662796fda50ff19b8efe9529f63eb38301177a46d3e86b4c4c0812a",
      decodedObject: {
        filename: "asoiaf-agot-remote-feature-push-authorization-sealer-v1.tar.gz",
        bytes: 22312,
        sha256: "d7ab3f13532f08fb0eb6658c8db815cd474485a54481c40e2025707a7c0fa6e9",
        expandedFileCount: 11,
      },
    });
    expect(admission).toMatchObject({
      componentId,
      baseMainCommit: "aab3625a4f2125e9d46966739032db0a7cc4c24d",
      upstream: {
        componentId: "asoiaf-agot-remote-reference-state-observer-v1",
        admissionCommit: "aab3625a4f2125e9d46966739032db0a7cc4c24d",
        pullRequest: 95,
      },
      downstream: {
        componentId: "asoiaf-agot-remote-feature-push-operator-v1",
        admissionCommit: "87d3abac1f174bd87865db00d659f2bc401b0bca",
      },
      successStatus: "PASS_REMOTE_FEATURE_PUSH_AUTHORIZATION_SEALED_EXECUTION_WITHHELD",
      nextAuthorityHold: "REMOTE_FEATURE_PUSH_EXECUTION_WITHHELD",
    });
  });

  it("reconstructs safely and replays 249 static plus 261 adversarial checks", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-remote-push-auth-carrier-"));
    try {
      const source = reconstructTarGzFromCarrier(componentId, temporary);
      expect(executeJson([python(), "-W", "error", "-S", resolve(source, "verify.py")], source)).toMatchObject({
        status: "PASS",
        passed: 249,
        total: 249,
      });
      expect(executeJson([python(), "-W", "error", "-S", resolve(source, "synthetic_campaign.py")], source)).toMatchObject({
        status: "PASS",
        passed: 261,
        total: 261,
        noncopyrightedFixtureOnly: true,
        privateSourceTextUsed: false,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("executes the exact observer, sealer, and admitted leased-push preflight", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-remote-push-auth-exact-"));
    try {
      const source = reconstructTarGzFromCarrier(componentId, temporary);
      const observer = reconstructTarGzFromCarrier("asoiaf-agot-remote-reference-state-observer-v1", temporary);
      const pushOperator = reconstructZipFromCarrier("asoiaf-agot-remote-feature-push-operator-v1", temporary);
      expect(executeJson([
        python(), "-W", "error", "-S", resolve(source, "exact_observer_push_compatibility.py"),
        "--observer-root", observer,
        "--push-operator-root", pushOperator,
      ], source)).toMatchObject({
        status: "PASS",
        passed: 52,
        total: 52,
        exactObserverExecution: "PASS",
        exactAuthorizationSealing: "PASS",
        exactPushOperatorPreflight: "PASS",
        staleObservationLeaseRefusal: "PASS",
        realRemoteFeaturePushes: 0,
        realPullRequestsOpened: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect admission census", () => {
    expect(Object.values(admission.counts)).toEqual(Object.values(admission.counts).map(() => 0));
    expect(admission.authorityBoundary).toMatchObject({
      carrierReconstructionIsNotAuthorizationSealing: true,
      authorizationSealingIsNotRemotePush: true,
      authorizationSealingIsNotPullRequestCreation: true,
      remotePushesByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
