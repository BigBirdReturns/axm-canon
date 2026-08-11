#!/usr/bin/env node
import path from "node:path";
import {
  buildSourceHealthPlan,
  buildSourceHealthSnapshot,
  initializeSourceHealth,
  recordSourceHealthObservation,
  verifySourceHealth,
  writeSourceHealthReceipt,
  writeSourceHealthReports,
  type SourceRouteHealthStatus,
} from "./lib/asoiaf-external-source-health.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function value(name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
}

function integer(name: string, fallback: number): number {
  const parsed = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

function nullableInteger(name: string): number | null {
  const raw = value(name);
  if (raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 599) {
    throw new Error(`--${name} must be an HTTP status from 100 through 599`);
  }
  return parsed;
}

function nullableDigest(name: string): `sha256:${string}` | null {
  const raw = value(name);
  if (raw === undefined) return null;
  if (!/^sha256:[a-f0-9]{64}$/.test(raw)) {
    throw new Error(`--${name} must be a lowercase sha256:<64 hex> digest`);
  }
  return raw as `sha256:${string}`;
}

function routeStatus(): SourceRouteHealthStatus {
  const status = required("status");
  const allowed: SourceRouteHealthStatus[] = [
    "available",
    "unavailable",
    "redirected",
    "robots-allow",
    "robots-deny",
    "terms-review",
    "retired",
  ];
  if (!allowed.includes(status as SourceRouteHealthStatus)) {
    throw new Error(`--status must be one of ${allowed.join(", ")}`);
  }
  return status as SourceRouteHealthStatus;
}

const root = path.resolve(
  value("root", process.env.ASOIAF_EXTERNAL_ESTATE ?? ".asoiaf-external-estate")!,
);
const now = value("at", new Date().toISOString())!;

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function usage(): void {
  process.stdout.write(`ASOIAF external-source health\n\n`);
  process.stdout.write(`Commands:\n`);
  process.stdout.write(`  init          Initialize source-health surfaces over the collector estate\n`);
  process.stdout.write(`  audit         Build and print the complete deterministic health snapshot\n`);
  process.stdout.write(`  plan          Build and print the bounded refresh and repair worklist\n`);
  process.stdout.write(`  report        Write SOURCE-HEALTH.json, SOURCE-HEALTH.md, and refresh-plan.json\n`);
  process.stdout.write(`  observe-route Append one route, robots, terms, or availability observation\n`);
  process.stdout.write(`  verify        Return only blocking source-health findings\n`);
  process.stdout.write(`  receipt       Emit a deterministic source-health qualification receipt\n\n`);
  process.stdout.write(`Common options:\n`);
  process.stdout.write(`  --root <path>      Collector estate root\n`);
  process.stdout.write(`  --at <iso>         Evaluation timestamp\n`);
  process.stdout.write(`  --limit <n>        Refresh-plan task ceiling; default 40\n\n`);
  process.stdout.write(`observe-route options:\n`);
  process.stdout.write(`  --source <id> --target <uri> --status <route-status>\n`);
  process.stdout.write(`  --http-status <n> --route-digest <sha256:...>\n`);
  process.stdout.write(`  --robots-digest <sha256:...> --terms-digest <sha256:...>\n`);
  process.stdout.write(`  --notes <text>\n`);
}

try {
  switch (command) {
    case "init": {
      print({ root, paths: initializeSourceHealth(root, now) });
      break;
    }
    case "audit": {
      print(buildSourceHealthSnapshot(root, now));
      break;
    }
    case "plan": {
      print(buildSourceHealthPlan(root, now, integer("limit", 40)));
      break;
    }
    case "report": {
      const report = writeSourceHealthReports(
        root,
        now,
        integer("limit", 40),
      );
      print({
        snapshotFingerprint: report.snapshot.snapshotFingerprint,
        planFingerprint: report.plan.planFingerprint,
        paths: report.paths,
      });
      break;
    }
    case "observe-route": {
      print(
        recordSourceHealthObservation(root, {
          sourceId: required("source"),
          checkedAt: now,
          targetUri: required("target"),
          status: routeStatus(),
          httpStatus: nullableInteger("http-status"),
          routeDigest: nullableDigest("route-digest"),
          robotsDigest: nullableDigest("robots-digest"),
          termsDigest: nullableDigest("terms-digest"),
          notes: value("notes", ""),
        }),
      );
      break;
    }
    case "verify": {
      const findings = verifySourceHealth(root, now);
      print({ ok: findings.length === 0, findings });
      if (findings.length) process.exitCode = 1;
      break;
    }
    case "receipt": {
      const output = path.resolve(
        value(
          "out",
          path.join(root, "asoiaf-external-source-health-receipt.json"),
        )!,
      );
      print(writeSourceHealthReceipt(root, output, now));
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
