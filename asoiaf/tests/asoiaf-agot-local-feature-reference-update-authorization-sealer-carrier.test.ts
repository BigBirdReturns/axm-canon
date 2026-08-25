import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-local-feature-reference-update-authorization-sealer-v1";
const repositoryDirectory = "agot-local-feature-reference-update-authorization-sealer-v1";
const carrierRoot = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const carrier = JSON.parse(readFileSync(resolve(carrierRoot, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(carrierRoot, "ADMISSION.json"), "utf8"));
const python = () => process.platform === "win32" ? "python" : "python3";
const environment: NodeJS.ProcessEnv = { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" };
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function executeJson(args: string[], cwd?: string): Record<string, unknown> {
  const [command, ...parameters] = args;
  if (!command) throw new Error("command is required");
  const completed = spawnSync(command, parameters, { cwd, encoding: "utf8", env: environment, timeout: 300_000 });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return JSON.parse(completed.stdout) as Record<string, unknown>;
}

function reconstructTarGz(root: string, temporary: string): string {
  const manifest = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
  const parts = manifest.concatenationOrder.map((path: string, index: number) => {
    const entry = manifest.chunks[index];
    expect(entry.path).toBe(path);
    const raw = readFileSync(resolve(root, path));
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
  const tar = gunzipSync(archive);
  expect(tar.length).toBe(manifest.decodedObject.uncompressedTarBytes);
  expect(sha256(tar)).toBe(manifest.decodedObject.uncompressedTarSha256);
  const archivePath = resolve(temporary, manifest.decodedObject.filename);
  const output = resolve(temporary, `${manifest.componentId}-extracted`);
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
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", extractor, archivePath, output, JSON.stringify(manifest.expandedPaths)], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, "asoiaf/public/review", manifest.componentId.slice("asoiaf-".length));
}

function reconstructZip(component: string, temporary: string): string {
  const repositoryComponent = component.slice("asoiaf-".length);
  const root = resolve(process.cwd(), "asoiaf/public/review", repositoryComponent);
  const manifest = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
  const encoded = Buffer.concat(manifest.concatenationOrder.map((path: string) => readFileSync(resolve(root, path))));
  expect(encoded.length).toBe(manifest.base64Characters);
  expect(sha256(encoded)).toBe(manifest.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(manifest.decodedObject.bytes);
  expect(sha256(archive)).toBe(manifest.decodedObject.sha256);
  const archivePath = resolve(temporary, manifest.decodedObject.filename);
  const output = resolve(temporary, `${component}-extracted`);
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

describe("AGOT local feature-reference update authorization exact carrier", () => {
  it("binds the admitted adapter, v2 release, and updater authority boundary", () => {
    expect(carrier).toMatchObject({
      schema: "axm-asoiaf-exact-base64-carrier/1",
      componentId,
      decodedObject: { expandedFileCount: 11 },
    });
    expect(admission).toMatchObject({
      componentId,
      baseMainCommit: "8901544fd1a97dd95137283dfde87e1fdf289d83",
      upstream: {
        adapterAdmissionCommit: "cb5fd57143737a00985c9564e334e4ec16a578a0",
        releaseAdmissionCommit: "8901544fd1a97dd95137283dfde87e1fdf289d83",
      },
      downstream: { admissionCommit: "af2d05a17c1f9c632774ba159c63b13a305964a1" },
      successStatus: "PASS_LOCAL_FEATURE_REFERENCE_UPDATE_AUTHORIZATION_SEALED_REFERENCE_UPDATE_WITHHELD",
      nextAuthorityHold: "LOCAL_FEATURE_REFERENCE_UPDATE_WITHHELD",
    });
  });

  it("reconstructs safely and replays 177 static plus 113 adversarial checks", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-reference-auth-"));
    try {
      const source = reconstructTarGz(carrierRoot, temporary);
      expect(executeJson([python(), "-W", "error", "-S", resolve(source, "verify.py")], source)).toMatchObject({ status: "PASS", passed: 177, total: 177 });
      expect(executeJson([python(), "-W", "error", "-S", resolve(source, "synthetic_campaign.py")], source)).toMatchObject({ status: "PASS", passed: 113, total: 113, noncopyrightedFixtureOnly: true });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("executes the exact adapter, v2 release, authorization seal, and updater compare-and-swap", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-reference-auth-compat-"));
    try {
      const source = reconstructTarGz(carrierRoot, temporary);
      const adapter = resolve(process.cwd(), "asoiaf/public/review/agot-commit-object-receipt-adapter-v1");
      const release = reconstructTarGz(resolve(process.cwd(), "asoiaf/public/review/agot-reviewed-worktree-branch-release-operator-v2"), temporary);
      const updater = reconstructZip("asoiaf-agot-feature-reference-updater-v1", temporary);
      expect(executeJson([
        python(), "-W", "error", "-S", resolve(source, "exact_updater_compatibility.py"),
        "--adapter-root", adapter,
        "--release-root", release,
        "--updater-root", updater,
      ], source)).toMatchObject({
        status: "PASS",
        passed: 52,
        total: 52,
        exactAdapterExecution: "PASS",
        exactReleaseV2Execution: "PASS",
        exactAuthorizationSealing: "PASS",
        exactUpdaterPreflight: "PASS",
        exactUpdaterCompareAndSwap: "PASS",
        noncopyrightedFixtureOnly: true,
        realFeatureReferenceUpdates: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect substantive census", () => {
    expect(Object.values(admission.counts)).toEqual(Object.values(admission.counts).map(() => 0));
    expect(admission.authorityBoundary).toMatchObject({
      authorizationSealingIsNotReferenceUpdate: true,
      repositoryStateReadByRuntime: false,
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
