import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const forbiddenRootPaths = [
  ".admission-payload",
  ".carrier-input",
  ".reader-atlas",
  ".state",
  "carrier",
  "state",
] as const;

const durableWorkflows = [
  "asoiaf-live-canary.yml",
  "asoiaf-reader-atlas-live-canary-v3.yml",
  "asoiaf-reader-atlas-pages-v3.yml",
  "asoiaf-reader-atlas-publish-live-receipt.yml",
  "asoiaf.yml",
  "canon.yml",
] as const;

describe("ASOIAF repository custody", () => {
  it("does not retain admission transport residue in the admitted tree", () => {
    for (const relative of forbiddenRootPaths) {
      expect(fs.existsSync(path.join(root, relative)), relative).toBe(false);
    }
  });

  it("retains only the durable workflow set", () => {
    const workflowRoot = path.join(root, ".github", "workflows");
    const observed = fs
      .readdirSync(workflowRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    expect(observed).toEqual([...durableWorkflows].sort());
  });

  it("keeps the exact public corpus and admission receipt physically present", () => {
    const required = [
      "asoiaf/public/corpus-v1/PUBLIC_CORPUS_MANIFEST.json",
      "asoiaf/public/corpus-v1/CANDIDATE_EVIDENCE_ROUTING.ndjson",
      "asoiaf/public/corpus-v1/ENTITY_CONCORDANCE.json",
      "asoiaf/public/corpus-v1/OPENING_GATE.json",
      "asoiaf/reader/index.html",
      "asoiaf/docs/ASOIAF_PUBLIC_CORPUS_V1_IMPORT_RECEIPT.json",
    ] as const;

    for (const relative of required) {
      expect(fs.statSync(path.join(root, relative)).isFile(), relative).toBe(true);
    }
  });
});
