#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  executeAsoiafStructuredAcquisition,
  listAsoiafStructuredAcquisitionReceipts,
  readAsoiafStructuredAcquisitionState,
  runAsoiafStructuredAcquisitionBatch,
  validateAsoiafStructuredRequestPlan,
  verifyAsoiafStructuredAcquisitionEstate,
} from "./lib/asoiaf-structured-public-acquisition.js";
import type {
  AsoiafStructuredRequestPlan,
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

function readPlan(filePath: string): AsoiafStructuredRequestPlan {
  return JSON.parse(
    fs.readFileSync(path.resolve(filePath), "utf8"),
  ) as AsoiafStructuredRequestPlan;
}

function readPlans(): AsoiafStructuredRequestPlan[] {
  const repeated = values("plan").map(readPlan);
  const plansFile = value("plans");
  if (!plansFile) return repeated;
  const decoded = JSON.parse(fs.readFileSync(path.resolve(plansFile), "utf8"));
  if (!Array.isArray(decoded)) throw new Error("--plans must contain a JSON array");
  return [...repeated, ...(decoded as AsoiafStructuredRequestPlan[])];
}

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write("ASOIAF structured public acquisition\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  validate  Validate one signed structured request plan without network access\n");
  process.stdout.write("  execute   Execute one plan through robots, pacing, bounded JSON, and its adapter\n");
  process.stdout.write("  batch     Execute plans sequentially with one shared host pacer\n");
  process.stdout.write("  status    Print the fingerprinted successful-request state and receipts\n");
  process.stdout.write("  verify    Verify acquisition, receipt, state, and collector custody\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --root <path>        Collector estate root\n");
  process.stdout.write("  --plan <json>        One signed request-plan file; repeat for batch\n");
  process.stdout.write("  --plans <json>       JSON array of signed request plans\n");
  process.stdout.write("  --at <iso>           Deterministic request start time\n");
  process.stdout.write("  --refresh            Re-execute a completed plan\n");
  process.stdout.write("  --include-text       Permit bounded AWOIAF text under CC BY-SA\n");
  process.stdout.write("  --max-text-chars <n> AWOIAF retained-text ceiling\n");
  process.stdout.write("  --max-redirects <n>  Same-origin redirect ceiling; default 3\n");
}

const root = path.resolve(
  value("root", process.env.ASOIAF_EXTERNAL_ESTATE ?? ".asoiaf-external-estate")!,
);

try {
  switch (command) {
    case "validate": {
      const plan = readPlan(required("plan"));
      const findings = validateAsoiafStructuredRequestPlan(plan);
      print({ ok: findings.length === 0, findings });
      if (findings.length > 0) process.exitCode = 1;
      break;
    }
    case "execute": {
      const result = await executeAsoiafStructuredAcquisition({
        root,
        plan: readPlan(required("plan")),
        retrievedAt: value("at"),
        refresh: flag("refresh"),
        includeText: flag("include-text"),
        maxTextCharacters: positiveInteger("max-text-chars", 20_000),
        maxRedirects: positiveInteger("max-redirects", 3),
      });
      print(result);
      if (
        !["observed", "partial", "cache-hit"].includes(result.receipt.outcome)
      ) {
        process.exitCode = 1;
      }
      break;
    }
    case "batch": {
      const plans = readPlans();
      if (plans.length === 0) throw new Error("batch requires --plan or --plans");
      const results = await runAsoiafStructuredAcquisitionBatch({
        root,
        plans,
        retrievedAt: value("at"),
        refresh: flag("refresh"),
        includeText: flag("include-text"),
        maxTextCharacters: positiveInteger("max-text-chars", 20_000),
        maxRedirects: positiveInteger("max-redirects", 3),
      });
      print(results);
      if (
        results.some(
          (result) =>
            !["observed", "partial", "cache-hit"].includes(result.receipt.outcome),
        )
      ) {
        process.exitCode = 1;
      }
      break;
    }
    case "status": {
      print({
        state: readAsoiafStructuredAcquisitionState(root),
        receipts: listAsoiafStructuredAcquisitionReceipts(root),
      });
      break;
    }
    case "verify": {
      const findings = verifyAsoiafStructuredAcquisitionEstate(root);
      print({ ok: findings.length === 0, findings });
      if (findings.length > 0) process.exitCode = 1;
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