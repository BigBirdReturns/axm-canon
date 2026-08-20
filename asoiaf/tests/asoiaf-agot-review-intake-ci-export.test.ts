import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(
  process.cwd(),
  "asoiaf/public/review/agot-opening-gate-review-intake-v1",
);
const carrier = JSON.parse(readFileSync(resolve(root, "CARRIER.json"), "utf8")) as {
  componentId: string;
  chunks: Array<{ path: string; characters: number; sha256: string }>;
  base64Characters: number;
  base64Sha256: string;
  decodedArchive: { filename: string; bytes: number; sha256: string };
};

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("AGOT review-intake bounded CI export", () => {
  it("reconstructs the exact admitted carrier and exports it only to the workflow artifact root", () => {
    const encoded = carrier.chunks
      .map((chunk) => {
        const data = readFileSync(resolve(root, chunk.path));
        expect(data.length).toBe(chunk.characters);
        expect(sha256(data)).toBe(chunk.sha256);
        return data.toString("ascii");
      })
      .join("");

    expect(encoded.length).toBe(carrier.base64Characters);
    expect(sha256(encoded)).toBe(carrier.base64Sha256);

    const archive = Buffer.from(encoded, "base64");
    expect(archive.length).toBe(carrier.decodedArchive.bytes);
    expect(sha256(archive)).toBe(carrier.decodedArchive.sha256);

    const runnerTemp = process.env.RUNNER_TEMP;
    if (runnerTemp) {
      const artifactRoot = join(runnerTemp, "axm-canon-asoiaf-qualification");
      mkdirSync(artifactRoot, { recursive: true });
      writeFileSync(join(artifactRoot, carrier.decodedArchive.filename), archive);
      writeFileSync(
        join(artifactRoot, "agot-review-intake-export-receipt.json"),
        `${JSON.stringify(
          {
            schema: "axm-asoiaf-bounded-ci-export/1",
            componentId: carrier.componentId,
            archive: carrier.decodedArchive,
            source: "exact-admitted-base64-carrier",
            repositoryMutation: false,
            sourceTextPresent: false,
            privatePayloadPresent: false,
            authority: "transport-only",
            canonEffect: "none",
            graphEffect: "none",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
  });
});
