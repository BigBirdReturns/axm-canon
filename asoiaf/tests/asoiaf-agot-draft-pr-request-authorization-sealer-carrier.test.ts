import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-draft-pr-request-authorization-sealer-v1";
const repositoryDirectory = "agot-draft-pr-request-authorization-sealer-v1";
const carrierRoot = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const carrier = JSON.parse(readFileSync(resolve(carrierRoot, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(carrierRoot, "ADMISSION.json"), "utf8"));
const python = () => process.platform === "win32" ? "python" : "python3";
const environment: NodeJS.ProcessEnv = { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" };
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
    const blob = spawnSync("git", ["hash-object", "--stdin"], { input: raw, encoding: "utf8" });
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
  const extraction = resolve(temporary, "source");
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
    extraction,
    JSON.stringify(carrier.expandedPaths),
  ], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(extraction, "asoiaf/public/review", repositoryDirectory);
}

function reconstructPacketBuilder(temporary: string): string {
  const root = resolve(process.cwd(), "asoiaf/public/review/agot-draft-pr-request-packet-v1");
  const packetAdmission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
  const encoded = readFileSync(resolve(root, packetAdmission.carrier.path));
  expect(encoded.length).toBe(packetAdmission.carrier.characters);
  expect(sha256(encoded)).toBe(packetAdmission.carrier.sha256);
  const blob = spawnSync("git", ["hash-object", "--stdin"], { input: encoded, encoding: "utf8" });
  expect(blob.status, blob.stderr).toBe(0);
  expect(blob.stdout.trim()).toBe(packetAdmission.carrier.gitBlobSha1);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(packetAdmission.package.bytes);
  expect(sha256(archive)).toBe(packetAdmission.package.sha256);
  const archivePath = resolve(temporary, packetAdmission.package.filename);
  const output = resolve(temporary, "packet-builder");
  writeFileSync(archivePath, archive);
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", [
    "import pathlib,stat,sys,zipfile",
    "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
    "with zipfile.ZipFile(p) as a:",
    " i=a.infolist();assert a.testzip() is None",
    " assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
    " assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
    " assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
    " assert sum(not v.is_dir() for v in i)==int(sys.argv[3])",
    " a.extractall(o)",
  ].join("\n"), archivePath, output, String(packetAdmission.package.expandedFileCount)], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, "asoiaf-agot-draft-pr-request-packet-v1");
}

describe("AGOT draft-request authorization sealer exact carrier", () => {
  it("binds the admitted leased push receipt to the admitted request-packet vocabulary", () => {
    expect(carrier).toMatchObject({
      schema: "axm-asoiaf-exact-base64-carrier/1",
      componentId,
      decodedObject: { expandedFileCount: 11 },
    });
    expect(admission).toMatchObject({
      componentId,
      baseMainCommit: "668d09865a15b9faae2d79ecbfc9f0102b532586",
      upstream: {
        componentId: "asoiaf-agot-remote-feature-push-operator-v1",
        admissionCommit: "87d3abac1f174bd87865db00d659f2bc401b0bca",
      },
      downstream: {
        componentId: "asoiaf-agot-draft-pr-request-packet-v1",
        admissionCommit: "7a595de3c8c018b74ec4000c3a6d8ac4846b9c95",
      },
      successStatus: "PASS_DRAFT_PR_REQUEST_AUTHORIZATION_SEALED_PACKET_CONSTRUCTION_WITHHELD",
      nextAuthorityHold: "DRAFT_PR_REQUEST_PACKET_CONSTRUCTION_WITHHELD",
    });
  });

  it("reconstructs safely and replays 187 static plus 394 adversarial checks", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-draft-request-auth-"));
    try {
      const source = reconstructSource(temporary);
      expect(executeJson([python(), "-W", "error", "-S", resolve(source, "verify.py")], source)).toMatchObject({
        status: "PASS",
        passed: 187,
        total: 187,
      });
      expect(executeJson([python(), "-W", "error", "-S", resolve(source, "synthetic_campaign.py")], source)).toMatchObject({
        status: "PASS",
        passed: 394,
        total: 394,
        noncopyrightedFixtureOnly: true,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("executes the exact admitted request-packet builder after sealing authorization", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-draft-request-auth-compat-"));
    try {
      const source = reconstructSource(temporary);
      const packetBuilder = reconstructPacketBuilder(temporary);
      expect(executeJson([
        python(), "-W", "error", "-S", resolve(source, "exact_packet_compatibility.py"),
        "--packet-builder", packetBuilder,
      ], source)).toMatchObject({
        status: "PASS",
        passed: 50,
        total: 50,
        exactRequestAuthorizationExecution: "PASS",
        exactPacketBuilderExecution: "PASS",
        packetValidation: "PASS",
        realPullRequestsOpened: 0,
        realPullRequestsReadied: 0,
        realPullRequestsMerged: 0,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect substantive census", () => {
    expect(Object.values(admission.counts)).toEqual(Object.values(admission.counts).map(() => 0));
    expect(admission.authorityBoundary).toMatchObject({
      authorizationIsNotRequestPacket: true,
      authorizationIsNotPullRequest: true,
      repositoryFilesWrittenByRuntime: 0,
      remotePushesByRuntime: 0,
      requestPacketsSealedByRuntime: 0,
      pullRequestsOpenedByRuntime: 0,
      pullRequestsReadiedByRuntime: 0,
      pullRequestsMergedByRuntime: 0,
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
