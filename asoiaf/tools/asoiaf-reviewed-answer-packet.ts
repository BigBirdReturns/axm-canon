#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  buildAsoiafReviewedAnswerPacket,
  buildAsoiafReviewedAnswerTransaction,
  renderAsoiafReviewedAnswerPacket,
  validateAsoiafReviewedAnswerPacket,
  type AsoiafReviewedAnswerPacket,
  type AsoiafReviewedAnswerPacketInput,
  type AsoiafReviewedAnswerTransactionInput,
} from "./lib/asoiaf-reviewed-answer-packet.js";

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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as T;
}

function print(output: unknown): void {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function writeJson(
  output: unknown,
  target: string | undefined,
  receipt: Record<string, unknown>,
): void {
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  if (!target) {
    process.stdout.write(serialized);
    return;
  }
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, serialized, "utf8");
  print({ ok: true, output: resolved, ...receipt });
}

function writeText(
  output: string,
  target: string | undefined,
  packet: AsoiafReviewedAnswerPacket,
): void {
  if (!target) {
    process.stdout.write(`${output}\n`);
    return;
  }
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${output}\n`, "utf8");
  print({
    ok: true,
    output: resolved,
    answerPacketId: packet.answerPacketId,
    answerPacketFingerprint: packet.answerPacketFingerprint,
    renderedTextDigest: packet.renderedTextDigest,
    renderedTextCharacters: packet.renderedTextCharacters,
  });
}

function usage(): void {
  process.stdout.write("ASOIAF reviewed answer packet\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  transaction  Bind one reviewed packet to its reconciliation receipt\n");
  process.stdout.write("  build        Assemble one deterministic reviewed answer packet\n");
  process.stdout.write("  verify       Verify answer, dossier, reconciliation, claim, citation, gap, and authority custody\n");
  process.stdout.write("  render       Render only the reviewed answer text and citation ledger\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --input <json>  Transaction or answer-packet input\n");
  process.stdout.write("  --file <json>   Emitted answer packet for verify or render\n");
  process.stdout.write("  --out <path>    Optional JSON or text output path\n");
}

try {
  switch (command) {
    case "transaction": {
      const input = readJson<AsoiafReviewedAnswerTransactionInput>(
        required("input"),
      );
      const transaction = buildAsoiafReviewedAnswerTransaction(input);
      writeJson(transaction, value("out"), {
        transactionId: transaction.transactionId,
        transactionFingerprint: transaction.transactionFingerprint,
      });
      break;
    }
    case "build": {
      const input = readJson<AsoiafReviewedAnswerPacketInput>(required("input"));
      const packet = buildAsoiafReviewedAnswerPacket(input);
      writeJson(packet, value("out"), {
        answerPacketId: packet.answerPacketId,
        answerPacketFingerprint: packet.answerPacketFingerprint,
        scope: packet.scope,
      });
      break;
    }
    case "verify": {
      const packet = readJson<AsoiafReviewedAnswerPacket>(required("file"));
      const findings = validateAsoiafReviewedAnswerPacket(packet);
      const errors = findings.filter((finding) => finding.severity === "error");
      print({
        ok: errors.length === 0,
        findings,
        answerPacketId: packet.answerPacketId,
        answerPacketFingerprint: packet.answerPacketFingerprint,
        dossierId: packet.dossierId,
        questionId: packet.questionId,
        scope: packet.scope,
        claimCount: packet.claims.length,
        limitationCount: packet.limitations.length,
      });
      if (errors.length > 0) process.exitCode = 1;
      break;
    }
    case "render": {
      const packet = readJson<AsoiafReviewedAnswerPacket>(required("file"));
      writeText(renderAsoiafReviewedAnswerPacket(packet), value("out"), packet);
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