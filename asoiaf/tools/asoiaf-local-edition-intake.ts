#!/usr/bin/env node
import path from "node:path";
import type { AsoiafExternalContinuity } from "../src/external/index.js";
import {
  intakeAsoiafLocalEdition,
  listAsoiafLocalEditions,
  locateAsoiafLocalEditionText,
  readAsoiafLocalEditionManifest,
  verifyAsoiafLocalEdition,
  writeAsoiafLocalEditionReceipt,
} from "./lib/asoiaf-local-edition-intake.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function value(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
}

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

const root = path.resolve(
  value("root", process.env.ASOIAF_EXTERNAL_ESTATE ?? ".asoiaf-external-estate")!,
);

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write("ASOIAF holder-controlled local-edition intake\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  intake   Stream-hash, parse, segment, and index a holder-supplied edition\n");
  process.stdout.write("  status   Print one edition manifest\n");
  process.stdout.write("  list     List local edition manifests without private text\n");
  process.stdout.write("  verify   Reconcile manifest, locators, private text, and collector custody\n");
  process.stdout.write("  locate   Resolve one unit or paragraph locator; text requires --include-text\n");
  process.stdout.write("  receipt  Emit a deterministic edition verification receipt\n\n");
  process.stdout.write("Common options:\n");
  process.stdout.write("  --root <path>         Collector estate root\n");
  process.stdout.write("  --source <id>         Local atlas source, for example local-agot\n");
  process.stdout.write("  --edition <id>        Stable holder-selected edition identity\n");
  process.stdout.write("  --file <path>         Holder-controlled TXT, HTML, or EPUB source\n");
  process.stdout.write("  --record-id <id>      Optional durable collector record identity\n");
  process.stdout.write("  --continuity <id>     Optional declared source continuity\n");
  process.stdout.write("  --at <iso>            Deterministic ingestion or verification time\n");
  process.stdout.write("  --no-private-text     Keep digests and locators without extracted text\n");
  process.stdout.write("  --refresh             Append a new source observation even when unchanged\n");
  process.stdout.write("  --max-source-bytes n  Bounded source-file ceiling\n");
  process.stdout.write("  --max-expanded-bytes n Bounded EPUB expansion ceiling\n");
}

try {
  switch (command) {
    case "intake": {
      const result = await intakeAsoiafLocalEdition({
        root,
        sourceId: required("source"),
        editionId: required("edition"),
        filePath: path.resolve(required("file")),
        sourceRecordId: value("record-id"),
        continuityId: value("continuity") as AsoiafExternalContinuity | undefined,
        ingestedAt: value("at"),
        retainPrivateText: !flag("no-private-text"),
        refresh: flag("refresh"),
        maxSourceBytes: positiveInteger(
          "max-source-bytes",
          256 * 1024 * 1024,
        ),
        maxExpandedBytes: positiveInteger(
          "max-expanded-bytes",
          512 * 1024 * 1024,
        ),
        maxZipEntries: positiveInteger("max-zip-entries", 8_192),
      });
      const receipt = writeAsoiafLocalEditionReceipt(
        root,
        result.manifest.sourceId,
        result.manifest.editionId,
        value("at") ?? new Date().toISOString(),
      );
      print({ manifest: result.manifest, receipt });
      if (!receipt.passed) process.exitCode = 1;
      break;
    }
    case "status": {
      print(
        readAsoiafLocalEditionManifest(
          root,
          required("source"),
          required("edition"),
        ),
      );
      break;
    }
    case "list": {
      print({ editions: listAsoiafLocalEditions(root) });
      break;
    }
    case "verify": {
      const sourceId = required("source");
      const editionId = required("edition");
      const errors = verifyAsoiafLocalEdition(root, sourceId, editionId);
      print({ ok: errors.length === 0, sourceId, editionId, errors });
      if (errors.length > 0) process.exitCode = 1;
      break;
    }
    case "locate": {
      print(
        locateAsoiafLocalEditionText({
          root,
          sourceId: required("source"),
          editionId: required("edition"),
          unitId: required("unit"),
          segmentId: value("segment"),
          includeText: flag("include-text"),
        }),
      );
      break;
    }
    case "receipt": {
      const sourceId = required("source");
      const editionId = required("edition");
      const output = value("out")
        ? path.resolve(value("out")!)
        : undefined;
      print(
        writeAsoiafLocalEditionReceipt(
          root,
          sourceId,
          editionId,
          value("at") ?? new Date().toISOString(),
          output,
        ),
      );
      break;
    }
    case "help":
    case "--help":
    case "-h": {
      usage();
      break;
    }
    default:
      throw new Error(`unknown command ${command}`);
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
