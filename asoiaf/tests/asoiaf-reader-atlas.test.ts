import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const site = resolve(process.cwd(), "docs/asoiaf");
const atlas = JSON.parse(readFileSync(resolve(site, "data/atlas.json"), "utf8")) as {
  version: string;
  boundary: {
    sourceTextPresent: boolean;
    holderControlledPayloadPresent: boolean;
    automaticCanonEffect: string;
    automaticGraphEffect: string;
  };
  sourceLanes: unknown[];
  twowChapters: unknown[];
  custody: {
    privateArchiveHold: { materialized: boolean; v4_2Built: boolean };
    publicWave: { sha256: string; sealed: boolean; repositoryMaterialized: boolean };
  };
};

describe("The Narrow Wall reader atlas", () => {
  it("publishes a governed reader surface", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8");
    expect(html).toContain("The Narrow Wall");
    expect(html).toContain("no holder-controlled book text");
    expect(html).toContain("Build a bounded research question");
    expect(atlas.version).toBe("1.0.0");
    expect(atlas.sourceLanes).toHaveLength(7);
    expect(atlas.twowChapters).toHaveLength(11);
  });

  it("keeps local reader links inside the deployed artifact", () => {
    const html = readFileSync(resolve(site, "index.html"), "utf8");
    const localLinks = [...html.matchAll(/href="(?!https?:|#)([^\"]+)"/g)]
      .map((match) => match[1])
      .filter((link): link is string => typeof link === "string");
    for (const link of localLinks) {
      expect(() => readFileSync(resolve(site, link))).not.toThrow();
    }
  });

  it("retains the public authority boundary", () => {
    expect(atlas.boundary.sourceTextPresent).toBe(false);
    expect(atlas.boundary.holderControlledPayloadPresent).toBe(false);
    expect(atlas.boundary.automaticCanonEffect).toBe("none");
    expect(atlas.boundary.automaticGraphEffect).toBe("none");
    expect(atlas.custody.privateArchiveHold.materialized).toBe(false);
    expect(atlas.custody.privateArchiveHold.v4_2Built).toBe(false);
    expect(atlas.custody.publicWave.sealed).toBe(true);
    expect(atlas.custody.publicWave.repositoryMaterialized).toBe(false);
    expect(atlas.custody.publicWave.sha256).toBe("0e999b7f8c921e7e81d439fc4c2fc1fd004a2b4a2adb375f0df3b99aefe92ab9");
  });
});
