import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const componentId = "asoiaf-agot-draft-pr-creation-authorization-sealer-v1";
const repositoryDirectory = "agot-draft-pr-creation-authorization-sealer-v1";
const root = resolve(process.cwd(), "asoiaf/public/review", repositoryDirectory);
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const python = () => process.platform === "win32" ? "python" : "python3";
const environment: NodeJS.ProcessEnv = { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" };
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function execute(script: string, cwd: string): Record<string, unknown> {
  const completed = spawnSync(python(), ["-W", "error", "-S", resolve(cwd, script)], {
    cwd,
    encoding: "utf8",
    env: environment,
    timeout: 240_000,
  });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return JSON.parse(completed.stdout) as Record<string, unknown>;
}

function reconstruct(temporary: string): string {
  const encoded = Buffer.concat(carrier.concatenationOrder.map((path: string, index: number) => {
    const raw = readFileSync(resolve(root, path));
    expect(raw.length).toBe(carrier.chunks[index].characters);
    expect(sha256(raw)).toBe(carrier.chunks[index].sha256);
    expect(raw.toString("ascii")).not.toMatch(/\s/);
    return raw;
  }));
  expect(encoded.length).toBe(carrier.base64Characters);
  expect(sha256(encoded)).toBe(carrier.base64Sha256);
  const archive = Buffer.from(encoded.toString("ascii"), "base64");
  expect(archive.length).toBe(carrier.decodedObject.bytes);
  expect(sha256(archive)).toBe(carrier.decodedObject.sha256);
  const tar = gunzipSync(archive);
  expect(tar.length).toBe(carrier.decodedObject.uncompressedTarBytes);
  expect(sha256(tar)).toBe(carrier.decodedObject.uncompressedTarSha256);
  const archivePath = resolve(temporary, carrier.decodedObject.filename);
  const output = resolve(temporary, "source");
  writeFileSync(archivePath, archive);
  const extractor = [
    "import pathlib,sys,tarfile",
    "a=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2]);o.mkdir()",
    "with tarfile.open(a,'r:gz') as t:",
    " m=t.getmembers(); f=[]",
    " for v in m:",
    "  p=pathlib.PurePosixPath(v.name)",
    "  assert not p.is_absolute() and '..' not in p.parts and '\\\\' not in v.name",
    "  assert v.isfile() and not (v.issym() or v.islnk() or v.isdev() or v.isfifo())",
    "  f.append(v.name)",
    " assert len(f)==10",
    " t.extractall(o,filter='data')",
  ].join("\n");
  const completed = spawnSync(python(), ["-W", "error", "-S", "-c", extractor, archivePath, output], { encoding: "utf8", env: environment });
  expect(completed.status, completed.stderr || completed.stdout).toBe(0);
  return resolve(output, "asoiaf/public/review", repositoryDirectory);
}

describe("AGOT draft PR creation authorization exact carrier", () => {
  it("binds the admitted request packet and held creation effect", () => {
    expect(carrier).toMatchObject({ componentId, chunkCount: 2, base64Characters: 15768, decodedObject: { bytes: 11826, expandedFileCount: 10 } });
    expect(admission).toMatchObject({
      componentId,
      baseMainCommit: "666f979b393e416bc0a28a9f5890bb4f5d1f5697",
      upstream: { componentId: "asoiaf-agot-draft-pr-request-packet-v1", requiredValidationStatus: "PASS_VALID_FOR_SEPARATE_DRAFT_PR_CREATOR" },
      successStatus: "PASS_DRAFT_PULL_REQUEST_CREATION_AUTHORIZATION_SEALED_CREATION_WITHHELD",
      nextAuthorityHold: "DRAFT_PULL_REQUEST_CREATION_WITHHELD",
    });
  });

  it("reconstructs safely and replays 111 static plus 71 adversarial checks", () => {
    const temporary = mkdtempSync(resolve(tmpdir(), "axm-agot-draft-pr-creation-auth-"));
    try {
      const source = reconstruct(temporary);
      expect(execute("verify.py", source)).toMatchObject({ status: "PASS", passed: 111, total: 111 });
      expect(execute("synthetic_campaign.py", source)).toMatchObject({ status: "PASS", passed: 71, total: 71, noncopyrightedFixtureOnly: true });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the zero-effect substantive census", () => {
    expect(Object.values(admission.counts)).toEqual(Object.values(admission.counts).map(() => 0));
    expect(admission.authorityBoundary).toMatchObject({
      authorizationIsNotPullRequestCreation: true,
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
