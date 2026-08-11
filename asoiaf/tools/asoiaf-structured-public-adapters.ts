#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildAsoiafStructuredRequestPlan,
  commitAsoiafStructuredPayload,
  normalizeAsoiafStructuredPayload,
  type AsoiafStructuredAdapterId,
  type AsoiafStructuredAdapterSourceId,
} from "./lib/asoiaf-structured-public-adapters.js";

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

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function readPayload(): unknown {
  const filePath = path.resolve(required("file"));
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write("ASOIAF rights-safe structured public adapters\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  plan       Build a bounded official-API request plan\n");
  process.stdout.write("  normalize  Normalize a JSON fixture without mutating an estate\n");
  process.stdout.write("  commit     Normalize and commit records to the collector estate\n\n");
  process.stdout.write("Common options:\n");
  process.stdout.write("  --adapter <id>       wikidata-sparql, openlibrary-catalog, crossref-works, awoiaf-mediawiki\n");
  process.stdout.write("  --source <id>        Registered structured source identity\n");
  process.stdout.write("  --request-id <id>    Durable query or response identity\n");
  process.stdout.write("  --source-uri <uri>   Exact response or request locator\n");
  process.stdout.write("  --file <json>        JSON response fixture or downloaded response\n");
  process.stdout.write("  --root <path>        Collector estate root for commit\n");
  process.stdout.write("  --at <iso>           Deterministic retrieval time\n");
  process.stdout.write("  --record-limit <n>   Maximum normalized records\n");
  process.stdout.write("  --include-text       Retain bounded AWOIAF page text under CC BY-SA\n");
  process.stdout.write("  --max-text-chars <n> AWOIAF text ceiling\n\n");
  process.stdout.write("Plan options:\n");
  process.stdout.write("  Wikidata: --query <SPARQL SELECT with LIMIT>\n");
  process.stdout.write("  Open Library: --key <OL key> or --search <query>\n");
  process.stdout.write("  Crossref: --doi <doi> or --query <query>\n");
  process.stdout.write("  AWOIAF: repeat --title <title> or --page-id <integer>\n");
}

try {
  switch (command) {
    case "plan": {
      const adapterId = required("adapter") as AsoiafStructuredAdapterId;
      const requestId = required("request-id");
      const recordLimit = positiveInteger("record-limit", 50);
      if (adapterId === "wikidata-sparql") {
        print(buildAsoiafStructuredRequestPlan({
          adapterId,
          requestId,
          query: required("query"),
          recordLimit,
        }));
      } else if (adapterId === "openlibrary-catalog") {
        print(buildAsoiafStructuredRequestPlan({
          adapterId,
          requestId,
          key: value("key"),
          search: value("search"),
          recordLimit,
        }));
      } else if (adapterId === "crossref-works") {
        print(buildAsoiafStructuredRequestPlan({
          adapterId,
          requestId,
          doi: value("doi"),
          query: value("query"),
          recordLimit,
        }));
      } else if (adapterId === "awoiaf-mediawiki") {
        print(buildAsoiafStructuredRequestPlan({
          adapterId,
          requestId,
          titles: values("title"),
          pageIds: values("page-id").map((entry) => Number(entry)),
          includeText: flag("include-text"),
          recordLimit,
        }));
      } else {
        throw new Error(`unknown adapter ${adapterId}`);
      }
      break;
    }
    case "normalize": {
      print(normalizeAsoiafStructuredPayload({
        adapterId: required("adapter") as AsoiafStructuredAdapterId,
        sourceId: required("source") as AsoiafStructuredAdapterSourceId,
        requestId: required("request-id"),
        sourceUri: required("source-uri"),
        payload: readPayload(),
        includeText: flag("include-text"),
        maxTextCharacters: positiveInteger("max-text-chars", 20_000),
        recordLimit: positiveInteger("record-limit", 100),
      }));
      break;
    }
    case "commit": {
      const result = commitAsoiafStructuredPayload({
        root: path.resolve(
          value("root", process.env.ASOIAF_EXTERNAL_ESTATE ?? ".asoiaf-external-estate")!,
        ),
        adapterId: required("adapter") as AsoiafStructuredAdapterId,
        sourceId: required("source") as AsoiafStructuredAdapterSourceId,
        requestId: required("request-id"),
        sourceUri: required("source-uri"),
        payload: readPayload(),
        retrievedAt: value("at"),
        includeText: flag("include-text"),
        maxTextCharacters: positiveInteger("max-text-chars", 20_000),
        recordLimit: positiveInteger("record-limit", 100),
      });
      print(result);
      if (result.receipt.outcome === "refused") process.exitCode = 1;
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
