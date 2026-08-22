import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-repository-effect-patch-builder-v1");
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));

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

describe("AGOT repository effect patch builder exact carrier", () => {
  it("reconstructs the exact source-rebuilt ZIP from ordered chunks", () => {
    expect(carrier.chunkCount).toBe(10);
    expect(carrier.base64Characters).toBe(25736);
    const parts = carrier.chunks.map((chunk: any) => {
      const data = readFileSync(resolve(root, chunk.path));
      expect(data.length).toBe(chunk.characters);
      expect(sha256(data)).toBe(chunk.sha256);
      expect(gitBlobSha1(data)).toBe(chunk.gitBlobSha1);
      return data.toString("ascii");
    });
    expect(carrier.concatenationOrder).toEqual(
      carrier.chunks.map((row: any) => row.path),
    );
    const encoded = parts.join("");
    expect(encoded.length).toBe(25736);
    expect(sha256(encoded)).toBe(
      "d236c237739a0b66fbadb353212cccd28f866dedcd0979a9f71a7aba11c9c194",
    );
    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(19300);
    expect(sha256(archive)).toBe(
      "fa50113c028738cb61806832d4fdf4e823ec5da12ec99d557315b9a5fd5a41fa",
    );
    expect(admission.package.materializedInRepository).toBe(false);
    expect(admission.package.reconstructableFromCarrier).toBe(true);
  });

  it("extracts safely and replays the static and six-action qualification", () => {
    const encoded = carrier.chunks
      .map((chunk: any) => readFileSync(resolve(root, chunk.path), "ascii"))
      .join("");
    const tempRoot = mkdtempSync(join(tmpdir(), "axm-agot-patch-builder-"));
    const archivePath = join(tempRoot, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encoded, "base64"));
      const inspect = spawnSync(
        python(),
        [
          "-S",
          "-c",
          [
            "import pathlib,sys,zipfile",
            "p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
            "z=zipfile.ZipFile(p); infos=z.infolist()",
            "assert len(infos)==14",
            "assert all(not pathlib.PurePosixPath(i.filename).is_absolute() for i in infos)",
            "assert all('..' not in pathlib.PurePosixPath(i.filename).parts for i in infos)",
            "assert all('\\\\' not in i.filename for i in infos)",
            "z.extractall(out)",
          ].join(";"),
          archivePath,
          tempRoot,
        ],
        { encoding: "utf8" },
      );
      expect(inspect.status, inspect.stderr).toBe(0);
      const component = resolve(
        tempRoot,
        "asoiaf-agot-repository-effect-patch-builder-v1",
      );
      const verify = spawnSync(
        python(),
        ["-S", resolve(component, "verify.py")],
        {
          encoding: "utf8",
          env: { ...process.env, PYTHONWARNINGS: "error" },
        },
      );
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({
        passed: 47,
        total: 47,
        status: "PASS",
        realPatchBundlesMaterialized: 0,
        repositoryMutationsExecuted: 0,
        pullRequestsOpened: 0,
        automaticCanonPromotions: 0,
        automaticGraphMutations: 0,
      });
      const campaign = spawnSync(
        python(),
        ["-S", resolve(component, "synthetic_campaign.py")],
        {
          encoding: "utf8",
          env: { ...process.env, PYTHONWARNINGS: "error" },
          timeout: 180_000,
        },
      );
      expect(campaign.status, campaign.stderr).toBe(0);
      expect(JSON.parse(campaign.stdout)).toMatchObject({
        passed: 44,
        total: 44,
        status: "PASS",
        fixtureSourceTextOnly: true,
        realPrivateSourceUsed: false,
        realPatchBundlesMaterialized: 0,
        repositoryMutationsExecuted: 0,
        pullRequestsOpened: 0,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("retains the upstream and every no-effect authority boundary", () => {
    expect(admission.upstream).toMatchObject({
      componentId: "asoiaf-agot-review-admission-effect-packet-v1",
      admissionCommit: "f0c710b0fc39d9fc04ecde4ff9bcaac1a06b027c",
      packageSha256:
        "28d454b5d94c3a5df011c92e9a9b46a2b8f4e25be72edfecfdb1a51d3f320389",
      effectPacketStanding:
        "PASS_REPOSITORY_EFFECT_PACKET_SEALED_PENDING_SEPARATE_PR",
    });
    expect(admission.counts).toEqual({
      realLedgerAdmissionsConsumed: 0,
      realEffectPacketsConsumed: 0,
      realPatchBundlesMaterialized: 0,
      repositoryMutationsExecuted: 0,
      pullRequestsOpened: 0,
      automaticCanonPromotions: 0,
      automaticGraphMutations: 0,
    });
    expect(admission.authorityBoundary).toMatchObject({
      privateSourceTextPresent: false,
      privatePayloadPresent: false,
      patchMaterializationIsNotRepositoryMutation: true,
      proposedLedgerRowsAreNotAdmittedState: true,
      repositoryMutationExecuted: false,
      canonEffect: "none",
      graphEffect: "none",
    });
  });
});
