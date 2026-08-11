#!/usr/bin/env node
import path from "node:path";
import {
  auditAsoiafStructuredAcquisitionHealth,
} from "./lib/asoiaf-structured-acquisition-source-health.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function value(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write("ASOIAF structured acquisition source health\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  audit   Inspect state, acquisition receipts, adapter receipts, collector identities, attempts, replay, and drift\n");
  process.stdout.write("  verify  Return only blocking acquisition-health findings\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --root <path>  Holder-controlled collector estate root\n");
}

const root = path.resolve(
  value("root", process.env.ASOIAF_EXTERNAL_ESTATE ?? ".asoiaf-external-estate")!,
);

try {
  switch (command) {
    case "audit": {
      print(auditAsoiafStructuredAcquisitionHealth(root));
      break;
    }
    case "verify": {
      const audit = auditAsoiafStructuredAcquisitionHealth(root);
      const findings = audit.findings.filter((entry) => entry.severity === "error");
      print({ ok: findings.length === 0, findings, audit });
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