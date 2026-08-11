#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildAsoiafResearchQuestionDossier,
  routeAsoiafResearchQuestion,
  validateAsoiafResearchQuestionDossier,
  type AsoiafResearchQuestionDossier,
  type AsoiafResearchQuestionDossierInput,
} from "./lib/asoiaf-research-question-dossier.js";
import type {
  AsoiafExternalContinuity,
  AsoiafExternalRole,
} from "../src/external/index.js";

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

function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as T;
}

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function write(output: unknown, target?: string): void {
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (!target) {
    process.stdout.write(serialized);
    return;
  }
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, serialized, "utf8");
  print({ ok: true, output: resolved });
}

function usage(): void {
  process.stdout.write("ASOIAF research question dossier\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  route   Route one question through the qualified external atlas\n");
  process.stdout.write("  build   Compile one deterministic question-scoped research dossier\n");
  process.stdout.write("  verify  Verify a dossier fingerprint, route, custody, standing, and authority boundary\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --question <text>       Local question text for route\n");
  process.stdout.write("  --continuity <id>       Continuity identity; repeat for route\n");
  process.stdout.write("  --lane <id>             Explicit atlas lane; repeat for route\n");
  process.stdout.write("  --input <json>          Holder-controlled dossier input for build\n");
  process.stdout.write("  --file <json>           Emitted dossier for verify\n");
  process.stdout.write("  --out <json>            Optional build output path\n");
}

try {
  switch (command) {
    case "route": {
      const continuityIds = values("continuity") as AsoiafExternalContinuity[];
      if (continuityIds.length === 0) {
        throw new Error("route requires at least one --continuity");
      }
      const laneIds = values("lane") as AsoiafExternalRole[];
      print(
        routeAsoiafResearchQuestion(
          required("question"),
          continuityIds,
          laneIds.length > 0 ? laneIds : undefined,
        ),
      );
      break;
    }
    case "build": {
      const input = readJson<AsoiafResearchQuestionDossierInput>(required("input"));
      write(buildAsoiafResearchQuestionDossier(input), value("out"));
      break;
    }
    case "verify": {
      const dossier = readJson<AsoiafResearchQuestionDossier>(required("file"));
      const findings = validateAsoiafResearchQuestionDossier(dossier);
      const errors = findings.filter((finding) => finding.severity === "error");
      print({ ok: errors.length === 0, findings, dossierId: dossier.dossierId });
      if (errors.length > 0) process.exitCode = 1;
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