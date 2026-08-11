#!/usr/bin/env node
import path from "node:path";
import {
  collectLocalSource,
  collectNetworkSource,
  collectPlannedSources,
  collectorCredits,
  collectorInitialize,
  collectorPlan,
  collectorPublicStatus,
  collectorVerify,
  writeCollectorReceiptSummary,
} from "./lib/asoiaf-external-collector.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function value(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function integer(name: string, fallback: number): number {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
}

const root = path.resolve(
  value("root", process.env.ASOIAF_EXTERNAL_ESTATE ?? ".asoiaf-external-estate")!,
);

function print(valueToPrint: unknown): void {
  process.stdout.write(`${JSON.stringify(valueToPrint, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(`ASOIAF external collector\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  init          Initialize the 219-source local collection estate\n`);
  process.stdout.write(`  status        Print collection, gap, candidate, and credit counts\n`);
  process.stdout.write(`  plan          Print the bounded next source worklist\n`);
  process.stdout.write(`  collect       Collect one public source by source identity\n`);
  process.stdout.write(`  collect-local Stream-hash one holder-controlled source file\n`);
  process.stdout.write(`  run           Execute a bounded planned public-source pass\n`);
  process.stdout.write(`  credits       Regenerate selective public attribution surfaces\n`);
  process.stdout.write(`  verify        Validate estate identity, receipts, privacy, and authority\n`);
  process.stdout.write(`  receipt       Emit a deterministic estate qualification receipt\n\n`);
  process.stdout.write(`Common options:\n`);
  process.stdout.write(`  --root <path>       Estate root; default .asoiaf-external-estate\n`);
  process.stdout.write(`  --source <id>       Atlas source identity\n`);
  process.stdout.write(`  --record-id <id>    Durable upstream record or exact-edition identity\n`);
  process.stdout.write(`  --target <https>    Record-specific HTTPS locator\n`);
  process.stdout.write(`  --refresh           Recollect an already completed record\n`);
  process.stdout.write(`  --limit <n>         Bounded plan or run size; default 20\n`);
}

try {
  switch (command) {
    case "init": {
      collectorInitialize(root);
      print({ root, status: collectorPublicStatus(root) });
      break;
    }
    case "status": {
      print(collectorPublicStatus(root));
      break;
    }
    case "plan": {
      print(
        collectorPlan({
          root,
          limit: integer("limit", 20),
          sourceIds: value("source") ? [value("source")!] : undefined,
          refresh: flag("refresh"),
        }),
      );
      break;
    }
    case "collect": {
      print(
        await collectNetworkSource({
          root,
          sourceId: required("source"),
          sourceRecordId: value("record-id"),
          targetUri: value("target"),
          refresh: flag("refresh"),
        }),
      );
      break;
    }
    case "collect-local": {
      print(
        await collectLocalSource({
          root,
          sourceId: required("source"),
          sourceRecordId: required("record-id"),
          filePath: path.resolve(required("file")),
          refresh: flag("refresh"),
        }),
      );
      break;
    }
    case "run": {
      print(
        await collectPlannedSources({
          root,
          limit: integer("limit", 20),
          sourceIds: value("source") ? [value("source")!] : undefined,
          refresh: flag("refresh"),
        }),
      );
      break;
    }
    case "credits": {
      print(collectorCredits(root));
      break;
    }
    case "verify": {
      const findings = collectorVerify(root);
      print({ ok: findings.length === 0, findings });
      if (findings.length) process.exitCode = 1;
      break;
    }
    case "receipt": {
      const output = path.resolve(
        value(
          "out",
          path.join(root, "asoiaf-external-collector-receipt.json"),
        )!,
      );
      writeCollectorReceiptSummary(root, output);
      print({ output });
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
