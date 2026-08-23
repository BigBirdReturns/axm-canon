import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "asoiaf/public/review/agot-named-human-disposition-recorder-v1");
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8"));
const admission = JSON.parse(readFileSync(resolve(root, "ADMISSION.json"), "utf8"));
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const gitBlob = (value: Buffer) => createHash("sha1").update(Buffer.from(`blob ${value.length}\0`)).update(value).digest("hex");
const encodedCarrier = () => Buffer.concat(carrier.concatenationOrder.map((path: string) => readFileSync(resolve(root, path))));
const python = () => process.platform === "win32" ? "python" : "python3";

describe("AGOT named-human disposition recorder exact carrier", () => {
  it("reconstructs the exact deterministic ZIP", () => {
    expect(carrier.chunkCount).toBe(6);
    for (const entry of carrier.chunks) {
      const chunk = readFileSync(resolve(root, entry.path));
      expect(chunk.length).toBe(entry.characters);
      expect(sha256(chunk)).toBe(entry.sha256);
      expect(gitBlob(chunk)).toBe(entry.gitBlobSha1);
    }
    const encoded = encodedCarrier();
    expect(encoded.length).toBe(22384);
    expect(sha256(encoded)).toBe("dd324f39487d97f7cbee6460db90c5a81005b32ca57ed47a4acb4289e3dd4e0f");
    const archive = Buffer.from(encoded.toString("ascii"), "base64");
    expect(archive.length).toBe(16787);
    expect(sha256(archive)).toBe("dd32d286438fe66a66d2b0407509bd918b90aa79153320650f66844aacc9756d");
  });

  it("extracts safely and replays 52 static plus 20 synthetic checks", () => {
    const temporary = mkdtempSync(join(tmpdir(), "axm-named-human-disposition-"));
    const archivePath = join(temporary, admission.package.filename);
    try {
      writeFileSync(archivePath, Buffer.from(encodedCarrier().toString("ascii"), "base64"));
      const extract = spawnSync(python(), ["-S", "-c", [
        "import pathlib,stat,sys,zipfile",
        "p=pathlib.Path(sys.argv[1]);o=pathlib.Path(sys.argv[2])",
        "z=zipfile.ZipFile(p);i=z.infolist()",
        "assert len(i)==10",
        "assert all(not pathlib.PurePosixPath(v.filename).is_absolute() for v in i)",
        "assert all('..' not in pathlib.PurePosixPath(v.filename).parts for v in i)",
        "assert all('\\\\' not in v.filename for v in i)",
        "assert all(stat.S_IFMT(v.external_attr>>16)!=stat.S_IFLNK for v in i)",
        "assert z.testzip() is None",
        "z.extractall(o)"
      ].join(";"), archivePath, temporary], { encoding: "utf8" });
      expect(extract.status, extract.stderr).toBe(0);
      const component = resolve(temporary, "asoiaf-agot-named-human-disposition-recorder-v1");
      const verify = spawnSync(python(), ["-S", resolve(component, "verify.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" } });
      expect(verify.status, verify.stderr).toBe(0);
      expect(JSON.parse(verify.stdout)).toMatchObject({ status: "PASS", passed: 52, total: 52, realNamedHumanDispositionsConsumed: 0, realLocalFeatureMaterializationRequests: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
      const synthetic = spawnSync(python(), ["-S", resolve(component, "synthetic_campaign.py")], { encoding: "utf8", env: { ...process.env, PYTHONWARNINGS: "error", PYTHONSAFEPATH: "1" }, timeout: 180000 });
      expect(synthetic.status, synthetic.stderr).toBe(0);
      expect(JSON.parse(synthetic.stdout)).toMatchObject({ status: "PASS", passed: 20, total: 20, noncopyrightedFixtureOnly: true, privateSourceTextUsed: false, realNamedHumanDispositionsConsumed: 0, realLocalFeatureMaterializationRequests: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("preserves the upstream intake and next-effect authority boundaries", () => {
    expect(admission.baseMainCommit).toBe("7a595de3c8c018b74ec4000c3a6d8ac4846b9c95");
    expect(admission.upstream).toMatchObject({ componentId: "asoiaf-agot-local-human-review-workstation-v1", admissionCommit: "85b6ad80a7e115bb867d729ec8fccb8a9b76b79e", requiredValidationStatus: "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR" });
    expect(admission.counts).toMatchObject({ realPrivateParagraphsConsumed: 0, realNamedHumanDispositionsConsumed: 0, realPropositionAdmissions: 0, realLocalFeatureMaterializationRequests: 0, realLocalFeaturesMaterialized: 0, automaticCanonPromotions: 0, automaticGraphMutations: 0 });
    expect(admission.authorityBoundary).toMatchObject({ receiptIsNotLocalFeatureMaterializationRequest: true, repositoryFilesWrittenByRuntime: 0, commitsCreatedByRuntime: 0, referencesUpdatedByRuntime: 0, remotePushesByRuntime: 0, pullRequestsOpenedByRuntime: 0, privateSourceTextPresent: false, privatePayloadPresent: false, canonEffect: "none", graphEffect: "none" });
  });
});
