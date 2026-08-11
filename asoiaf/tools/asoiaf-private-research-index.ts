#!/usr/bin/env node
import path from "node:path";
import {
  readAsoiafPrivateResearchIndex,
  searchAsoiafPrivateResearchIndex,
  verifyAsoiafPrivateResearchIndex,
  writeAsoiafPrivateResearchIndex,
  writeAsoiafPrivateResearchReceipt,
  type AsoiafPrivateResearchQueryMode,
} from "./lib/asoiaf-private-research-index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function value(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function values(name: string): string[] {
  return args.flatMap((entry, index) =>
    entry === `--${name}` && args[index + 1]
      ? [args[index + 1]!]
      : [],
  );
}

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
}

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} through ${maximum}`);
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
  process.stdout.write("ASOIAF private research index\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  build    Build a deterministic private full-text index\n");
  process.stdout.write("  status   Print index custody and size metadata\n");
  process.stdout.write("  search   Search unit and paragraph locators\n");
  process.stdout.write("  verify   Reconcile the index against private edition custody\n");
  process.stdout.write("  receipt  Emit a deterministic index verification receipt\n\n");
  process.stdout.write("Common options:\n");
  process.stdout.write("  --root <path>           Collector estate root\n");
  process.stdout.write("  --at <iso>              Deterministic build or receipt time\n");
  process.stdout.write("  --source <id>           Repeatable atlas source filter\n");
  process.stdout.write("  --edition <key>         Repeatable edition-key filter\n");
  process.stdout.write("  --continuity <id>       Repeatable continuity filter\n");
  process.stdout.write("  --query <text>          Search query\n");
  process.stdout.write("  --mode all|any|phrase   Query semantics\n");
  process.stdout.write("  --limit <n>             Maximum returned matches, 1 through 200\n");
  process.stdout.write("  --include-text          Return private snippets explicitly\n");
  process.stdout.write("  --context-chars <n>     Snippet context, 0 through 2000\n");
}

try {
  switch (command) {
    case "build": {
      const index = writeAsoiafPrivateResearchIndex({
        root,
        generatedAt: value("at"),
        sourceIds: values("source"),
        editionKeys: values("edition"),
      });
      print(index);
      break;
    }
    case "status": {
      const index = readAsoiafPrivateResearchIndex(root);
      print({
        format: index.format,
        generatedAt: index.generatedAt,
        indexFingerprint: index.indexFingerprint,
        editionCount: index.editionBindings.length,
        skippedEditionCount: index.skippedEditions.length,
        documentCount: index.documentCount,
        termCount: index.termCount,
        totalTokenCount: index.totalTokenCount,
        graphEffect: index.graphEffect,
        canonEffect: index.canonEffect,
      });
      break;
    }
    case "search": {
      print(
        searchAsoiafPrivateResearchIndex(root, {
          text: required("query"),
          mode: value("mode", "all") as AsoiafPrivateResearchQueryMode,
          sourceIds: values("source"),
          editionKeys: values("edition"),
          continuityIds: values("continuity"),
          limit: boundedInteger("limit", 20, 1, 200),
          includeText: flag("include-text"),
          contextCharacters: boundedInteger("context-chars", 180, 0, 2_000),
        }),
      );
      break;
    }
    case "verify": {
      const errors = verifyAsoiafPrivateResearchIndex(root);
      print({ ok: errors.length === 0, errors });
      if (errors.length > 0) process.exitCode = 1;
      break;
    }
    case "receipt": {
      const receipt = writeAsoiafPrivateResearchReceipt(
        root,
        value("at") ?? new Date().toISOString(),
        value("out") ? path.resolve(value("out")!) : undefined,
      );
      print(receipt);
      if (!receipt.passed) process.exitCode = 1;
      break;
    }
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      throw new Error(`unknown command ${command}`);
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
