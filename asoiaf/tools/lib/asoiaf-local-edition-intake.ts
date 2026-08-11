import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  getAsoiafExternalSource,
  type AsoiafExternalContinuity,
} from "../../src/external/index.js";
import { collectLocalSource } from "./asoiaf-external-collector.js";
import {
  collectorContentId,
  collectorEstatePaths,
  readJson,
  readNdjson,
  sha256,
  writeJsonAtomic,
  type CollectorObservationRecord,
  type CollectorRunResult,
} from "./asoiaf-external-estate.js";

export const ASOIAF_LOCAL_EDITION_MANIFEST_FORMAT =
  "axm-asoiaf-local-edition-manifest/1" as const;
export const ASOIAF_LOCAL_EDITION_UNIT_FORMAT =
  "axm-asoiaf-local-edition-unit/1" as const;
export const ASOIAF_LOCAL_EDITION_SEGMENT_FORMAT =
  "axm-asoiaf-local-edition-segment/1" as const;
export const ASOIAF_LOCAL_EDITION_PRIVATE_INDEX_FORMAT =
  "axm-asoiaf-local-edition-private-index/1" as const;
export const ASOIAF_LOCAL_EDITION_RECEIPT_FORMAT =
  "axm-asoiaf-local-edition-receipt/1" as const;

export type AsoiafLocalEditionInputFormat = "epub" | "html" | "plain-text";

export interface AsoiafLocalEditionMetadata {
  title: string | null;
  language: string | null;
  publisher: string | null;
  identifiers: string[];
}

export interface AsoiafLocalEditionLocator {
  kind: "chapter" | "record";
  unit: string;
  start: number;
  end: number;
  contentDigest: `sha256:${string}`;
}

export interface AsoiafLocalEditionSegment {
  format: typeof ASOIAF_LOCAL_EDITION_SEGMENT_FORMAT;
  segmentId: string;
  unitId: string;
  order: number;
  paragraphIndex: number;
  startChar: number;
  endChar: number;
  charCount: number;
  wordCount: number;
  textDigest: `sha256:${string}`;
  locator: AsoiafLocalEditionLocator;
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafLocalEditionUnit {
  format: typeof ASOIAF_LOCAL_EDITION_UNIT_FORMAT;
  unitId: string;
  order: number;
  label: string;
  sourcePart: string;
  sourcePartDigest: `sha256:${string}`;
  textDigest: `sha256:${string}`;
  charCount: number;
  wordCount: number;
  paragraphCount: number;
  segmentIds: string[];
  locator: AsoiafLocalEditionLocator;
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafLocalEditionPrivateIndexEntry {
  unitId: string;
  relativeUri: string;
  bytes: number;
  textDigest: `sha256:${string}`;
}

export interface AsoiafLocalEditionPrivateIndex {
  format: typeof ASOIAF_LOCAL_EDITION_PRIVATE_INDEX_FORMAT;
  editionKey: string;
  entries: AsoiafLocalEditionPrivateIndexEntry[];
  indexFingerprint: `sha256:${string}`;
}

export interface AsoiafLocalEditionManifest {
  format: typeof ASOIAF_LOCAL_EDITION_MANIFEST_FORMAT;
  sourceId: string;
  editionId: string;
  editionKey: string;
  sourceRecordId: string;
  continuityId: AsoiafExternalContinuity;
  ingestedAt: string;
  custody: "user-controlled-private";
  inputFormat: AsoiafLocalEditionInputFormat;
  mediaType: string;
  sourceDigest: `sha256:${string}`;
  sourceBytes: number;
  sourcePathRetained: false;
  sourceFilenameRetained: false;
  privateTextRetained: boolean;
  metadata: AsoiafLocalEditionMetadata;
  unitCount: number;
  segmentCount: number;
  charCount: number;
  wordCount: number;
  collectorOutcome: CollectorRunResult["outcome"];
  collectorCandidateId: string | null;
  collectorObservationId: string | null;
  files: {
    manifest: string;
    units: string;
    segments: string;
    privateIndex: string | null;
    receipt: string;
  };
  graphEffect: "none";
  canonEffect: "none";
  manifestFingerprint: `sha256:${string}`;
}

export interface AsoiafLocalEditionReceipt {
  format: typeof ASOIAF_LOCAL_EDITION_RECEIPT_FORMAT;
  sourceId: string;
  editionId: string;
  editionKey: string;
  sourceRecordId: string;
  sourceDigest: `sha256:${string}`;
  manifestFingerprint: `sha256:${string}`;
  collectorObservationId: string | null;
  unitCount: number;
  segmentCount: number;
  privateTextRetained: boolean;
  verifiedAt: string;
  errorCount: number;
  passed: boolean;
  receiptFingerprint: `sha256:${string}`;
}

export interface AsoiafLocalEditionPaths {
  collectorRoot: string;
  editionRoot: string;
  manifest: string;
  units: string;
  segments: string;
  privateRoot: string;
  privateIndex: string;
  receipt: string;
}

export interface IntakeAsoiafLocalEditionOptions {
  root: string;
  sourceId: string;
  editionId: string;
  filePath: string;
  sourceRecordId?: string;
  continuityId?: AsoiafExternalContinuity;
  ingestedAt?: string;
  retainPrivateText?: boolean;
  refresh?: boolean;
  maxSourceBytes?: number;
  maxZipEntries?: number;
  maxExpandedBytes?: number;
}

interface ParsedUnit {
  label: string;
  sourcePart: string;
  sourcePartDigest: `sha256:${string}`;
  text: string;
}

interface ParsedEdition {
  inputFormat: AsoiafLocalEditionInputFormat;
  mediaType: string;
  metadata: AsoiafLocalEditionMetadata;
  units: ParsedUnit[];
}

interface ZipDirectoryEntry {
  name: string;
  compression: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface ParsedZipEntry extends ZipDirectoryEntry {
  bytes: Buffer;
}

const DEFAULT_MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_ZIP_ENTRIES = 8_192;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;

function digestBytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function digestText(text: string): `sha256:${string}` {
  return digestBytes(Buffer.from(text, "utf8"));
}

function safeSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "edition";
}

function editionKey(sourceId: string, editionId: string): string {
  const suffix = sha256({ sourceId, editionId }).slice("sha256:".length, 20);
  return `${safeSlug(editionId)}-${suffix}`;
}

function relativeFromRoot(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target)).split(path.sep).join("/");
}

export function localEditionPaths(
  root: string,
  sourceId: string,
  editionId: string,
): AsoiafLocalEditionPaths {
  const collectorRoot = path.resolve(root);
  const key = editionKey(sourceId, editionId);
  const editionRoot = path.join(collectorRoot, "local-editions", key);
  return {
    collectorRoot,
    editionRoot,
    manifest: path.join(editionRoot, "edition-manifest.json"),
    units: path.join(editionRoot, "units.ndjson"),
    segments: path.join(editionRoot, "segments.ndjson"),
    privateRoot: path.join(editionRoot, "private-text"),
    privateIndex: path.join(editionRoot, "private-text-index.json"),
    receipt: path.join(editionRoot, "edition-receipt.json"),
  };
}

function writeNdjsonAtomic(filePath: string, values: readonly unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(
    temporary,
    values.map((value) => JSON.stringify(value)).join("\n")
      + (values.length > 0 ? "\n" : ""),
    "utf8",
  );
  fs.renameSync(temporary, filePath);
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,
    (match, token: string) => {
      if (token.startsWith("#x") || token.startsWith("#X")) {
        const code = Number.parseInt(token.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (token.startsWith("#")) {
        const code = Number.parseInt(token.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return named[token.toLowerCase()] ?? match;
    },
  );
}

function stripMarkup(value: string): string {
  return decodeEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|svg|math)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|li|blockquote|h[1-6]|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizeText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t \u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wordCount(value: string): number {
  const matches = value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

function firstHeading(markup: string): string | null {
  const match = markup.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/i);
  if (!match?.[1]) return null;
  const heading = normalizeText(stripMarkup(match[1]));
  return heading || null;
}

function parseAttributes(fragment: string): Record<string, string> {
  const output: Record<string, string> = {};
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of fragment.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    if (!key) continue;
    output[key] = decodeEntities(match[2] ?? match[3] ?? "");
  }
  return output;
}

function xmlElement(xml: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, "i"),
  );
  if (!match?.[1]) return null;
  const value = normalizeText(stripMarkup(match[1]));
  return value || null;
}

function cleanZipName(name: string): string {
  const normalized = path.posix.normalize(name.replace(/\\/g, "/"));
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || /^[a-z]:/i.test(normalized)
  ) {
    throw new Error(`unsafe ZIP member ${name}`);
  }
  return normalized;
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_END_SIGNATURE) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found");
}

function parseZipDirectory(
  bytes: Buffer,
  maxEntries: number,
  maxExpandedBytes: number,
): ZipDirectoryEntry[] {
  const eocd = findEndOfCentralDirectory(bytes);
  const diskNumber = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const totalEntries = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error("multi-disk ZIP archives are not supported");
  }
  if (totalEntries > maxEntries) {
    throw new Error(`ZIP contains ${totalEntries} entries; maximum is ${maxEntries}`);
  }
  if (
    totalEntries === 0xffff
    || centralSize === 0xffffffff
    || centralOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 archives are not supported by the bounded intake parser");
  }
  if (centralOffset + centralSize > bytes.length) {
    throw new Error("ZIP central directory exceeds source bounds");
  }

  const entries: ZipDirectoryEntry[] = [];
  let offset = centralOffset;
  let expanded = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL_FILE_SIGNATURE) {
      throw new Error(`ZIP central directory entry ${index} is malformed`);
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compression = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error(`ZIP central directory entry ${index} exceeds source bounds`);
    const name = cleanZipName(
      bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
    );
    if (flags & 0x1) throw new Error(`encrypted ZIP member ${name} is not supported`);
    if (![0, 8].includes(compression)) {
      throw new Error(`ZIP member ${name} uses unsupported compression method ${compression}`);
    }
    expanded += uncompressedSize;
    if (expanded > maxExpandedBytes) {
      throw new Error(`ZIP expanded bytes exceed ${maxExpandedBytes}`);
    }
    entries.push({
      name,
      compression,
      flags,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = end;
  }
  return entries;
}

function materializeZipEntry(source: Buffer, entry: ZipDirectoryEntry): ParsedZipEntry {
  const offset = entry.localHeaderOffset;
  if (
    offset + 30 > source.length
    || source.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE
  ) {
    throw new Error(`ZIP local header for ${entry.name} is malformed`);
  }
  const nameLength = source.readUInt16LE(offset + 26);
  const extraLength = source.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > source.length) throw new Error(`ZIP member ${entry.name} exceeds source bounds`);
  const compressed = source.subarray(dataOffset, dataEnd);
  const expanded = entry.compression === 0
    ? Buffer.from(compressed)
    : inflateRawSync(compressed, {
        maxOutputLength: Math.max(1, entry.uncompressedSize),
      });
  if (expanded.length !== entry.uncompressedSize) {
    throw new Error(
      `ZIP member ${entry.name} expanded to ${expanded.length} bytes; expected ${entry.uncompressedSize}`,
    );
  }
  return { ...entry, bytes: expanded };
}

function resolvePackagePath(packagePath: string, href: string): string {
  const base = path.posix.dirname(packagePath);
  return cleanZipName(path.posix.join(base, href.split("#", 1)[0] ?? href));
}

function navLabels(
  packagePath: string,
  items: Map<string, Record<string, string>>,
  entries: Map<string, ParsedZipEntry>,
): Map<string, string> {
  const output = new Map<string, string>();
  const nav = [...items.values()].find((item) =>
    (item.properties ?? "").split(/\s+/).includes("nav"),
  );
  if (!nav?.href) return output;
  const navPath = resolvePackagePath(packagePath, nav.href);
  const entry = entries.get(navPath);
  if (!entry) return output;
  const html = entry.bytes.toString("utf8");
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attributes = parseAttributes(match[1] ?? "");
    if (!attributes.href) continue;
    const target = resolvePackagePath(navPath, attributes.href);
    const label = normalizeText(stripMarkup(match[2] ?? ""));
    if (label && !output.has(target)) output.set(target, label);
  }
  return output;
}

function parseEpub(
  source: Buffer,
  maxEntries: number,
  maxExpandedBytes: number,
): ParsedEdition {
  const directory = parseZipDirectory(source, maxEntries, maxExpandedBytes);
  const entries = new Map<string, ParsedZipEntry>();
  for (const entry of directory) {
    if (entry.name.endsWith("/")) continue;
    entries.set(entry.name, materializeZipEntry(source, entry));
  }
  const container = entries.get("META-INF/container.xml");
  if (!container) throw new Error("EPUB is missing META-INF/container.xml");
  const containerXml = container.bytes.toString("utf8");
  const rootfileMatch = containerXml.match(
    /<rootfile\b[^>]*\bfull-path\s*=\s*(?:"([^"]+)"|'([^']+)')/i,
  );
  const packagePath = cleanZipName(rootfileMatch?.[1] ?? rootfileMatch?.[2] ?? "");
  const packageEntry = entries.get(packagePath);
  if (!packageEntry) throw new Error(`EPUB package document ${packagePath} is missing`);
  const opf = packageEntry.bytes.toString("utf8");
  const metadata: AsoiafLocalEditionMetadata = {
    title: xmlElement(opf, "dc:title") ?? xmlElement(opf, "title"),
    language: xmlElement(opf, "dc:language") ?? xmlElement(opf, "language"),
    publisher: xmlElement(opf, "dc:publisher") ?? xmlElement(opf, "publisher"),
    identifiers: [...opf.matchAll(/<(?:dc:)?identifier\b[^>]*>([\s\S]*?)<\/(?:dc:)?identifier\s*>/gi)]
      .map((match) => normalizeText(stripMarkup(match[1] ?? "")))
      .filter(Boolean)
      .sort(),
  };

  const items = new Map<string, Record<string, string>>();
  for (const match of opf.matchAll(/<item\b([^>]*?)(?:\/?>)/gi)) {
    const attributes = parseAttributes(match[1] ?? "");
    if (attributes.id && attributes.href) items.set(attributes.id, attributes);
  }
  const spineIds = [...opf.matchAll(/<itemref\b([^>]*?)(?:\/?>)/gi)]
    .map((match) => parseAttributes(match[1] ?? "").idref)
    .filter((value): value is string => Boolean(value));
  const labels = navLabels(packagePath, items, entries);
  const selectedIds = spineIds.length > 0
    ? spineIds
    : [...items.entries()]
        .filter(([, item]) => /xhtml|html/i.test(item["media-type"] ?? ""))
        .map(([id]) => id)
        .sort();

  const units: ParsedUnit[] = [];
  for (const id of selectedIds) {
    const item = items.get(id);
    if (!item?.href) continue;
    const memberPath = resolvePackagePath(packagePath, item.href);
    const entry = entries.get(memberPath);
    if (!entry) continue;
    const markup = entry.bytes.toString("utf8");
    const text = normalizeText(stripMarkup(markup));
    if (!text) continue;
    units.push({
      label: labels.get(memberPath) ?? firstHeading(markup) ?? id,
      sourcePart: memberPath,
      sourcePartDigest: digestBytes(entry.bytes),
      text,
    });
  }
  if (units.length === 0) throw new Error("EPUB package contains no readable spine documents");
  return {
    inputFormat: "epub",
    mediaType: "application/epub+zip",
    metadata,
    units,
  };
}

function headingLine(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 80) return false;
  if (/^(?:prologue|epilogue|chapter\b|appendix\b|part\b|book\b)/i.test(text)) {
    return true;
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && text === text.toUpperCase() && !/[.!?]$/.test(text);
}

function parsePlainText(source: Buffer): ParsedEdition {
  const text = normalizeText(source.toString("utf8"));
  if (!text) throw new Error("plain-text source is empty");
  const lines = text.split("\n");
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter((entry) => headingLine(entry.line));
  const units: ParsedUnit[] = [];
  if (headings.length >= 2) {
    const first = headings[0]!;
    if (first.index > 0) {
      const front = normalizeText(lines.slice(0, first.index).join("\n"));
      if (front) {
        units.push({
          label: "Front Matter",
          sourcePart: "plain-text:front-matter",
          sourcePartDigest: digestText(front),
          text: front,
        });
      }
    }
    for (let index = 0; index < headings.length; index += 1) {
      const current = headings[index]!;
      const next = headings[index + 1];
      const unitText = normalizeText(
        lines.slice(current.index + 1, next?.index ?? lines.length).join("\n"),
      );
      if (!unitText) continue;
      units.push({
        label: current.line.trim(),
        sourcePart: `plain-text:heading-${current.index}`,
        sourcePartDigest: digestText(
          lines.slice(current.index, next?.index ?? lines.length).join("\n"),
        ),
        text: unitText,
      });
    }
  }
  if (units.length === 0) {
    units.push({
      label: "Document",
      sourcePart: "plain-text:document",
      sourcePartDigest: digestBytes(source),
      text,
    });
  }
  return {
    inputFormat: "plain-text",
    mediaType: "text/plain; charset=utf-8",
    metadata: {
      title: null,
      language: null,
      publisher: null,
      identifiers: [],
    },
    units,
  };
}

function parseHtml(source: Buffer): ParsedEdition {
  const markup = source.toString("utf8");
  const text = normalizeText(stripMarkup(markup));
  if (!text) throw new Error("HTML source contains no readable text");
  const title = xmlElement(markup, "title") ?? firstHeading(markup);
  return {
    inputFormat: "html",
    mediaType: "text/html; charset=utf-8",
    metadata: {
      title,
      language: parseAttributes(markup.match(/<html\b([^>]*)>/i)?.[1] ?? "").lang ?? null,
      publisher: null,
      identifiers: [],
    },
    units: [
      {
        label: title ?? "Document",
        sourcePart: "html:document",
        sourcePartDigest: digestBytes(source),
        text,
      },
    ],
  };
}

function detectAndParse(
  source: Buffer,
  options: { maxEntries: number; maxExpandedBytes: number },
): ParsedEdition {
  if (source.length >= 4 && source.readUInt32LE(0) === ZIP_LOCAL_FILE_SIGNATURE) {
    return parseEpub(source, options.maxEntries, options.maxExpandedBytes);
  }
  const prefix = source.subarray(0, Math.min(source.length, 4_096)).toString("utf8");
  if (/<!doctype\s+html|<html\b|<body\b|<head\b/i.test(prefix)) {
    return parseHtml(source);
  }
  return parsePlainText(source);
}

function splitParagraphs(text: string): Array<{ text: string; start: number; end: number }> {
  const paragraphs: Array<{ text: string; start: number; end: number }> = [];
  const pattern = /\S[\s\S]*?(?=\n\n|$)/g;
  for (const match of text.matchAll(pattern)) {
    const value = match[0].trim();
    if (!value) continue;
    const rawStart = match.index ?? 0;
    const leading = match[0].indexOf(value);
    const start = rawStart + Math.max(0, leading);
    paragraphs.push({ text: value, start, end: start + value.length });
  }
  return paragraphs;
}

function buildUnitsAndSegments(input: {
  sourceId: string;
  editionId: string;
  parsed: ParsedEdition;
}): { units: AsoiafLocalEditionUnit[]; segments: AsoiafLocalEditionSegment[] } {
  const units: AsoiafLocalEditionUnit[] = [];
  const segments: AsoiafLocalEditionSegment[] = [];
  input.parsed.units.forEach((parsedUnit, order) => {
    const unitDigest = digestText(parsedUnit.text);
    const unitId = collectorContentId("asoiaf-local-unit", {
      sourceId: input.sourceId,
      editionId: input.editionId,
      order,
      label: parsedUnit.label,
      sourcePart: parsedUnit.sourcePart,
      textDigest: unitDigest,
    });
    const paragraphs = splitParagraphs(parsedUnit.text);
    const unitSegments = paragraphs.map((paragraph, paragraphIndex) => {
      const textDigest = digestText(paragraph.text);
      const segmentId = collectorContentId("asoiaf-local-segment", {
        unitId,
        paragraphIndex,
        startChar: paragraph.start,
        endChar: paragraph.end,
        textDigest,
      });
      const segment: AsoiafLocalEditionSegment = {
        format: ASOIAF_LOCAL_EDITION_SEGMENT_FORMAT,
        segmentId,
        unitId,
        order: segments.length + paragraphIndex,
        paragraphIndex,
        startChar: paragraph.start,
        endChar: paragraph.end,
        charCount: paragraph.text.length,
        wordCount: wordCount(paragraph.text),
        textDigest,
        locator: {
          kind: "record",
          unit: `${input.sourceId}/${input.editionId}/${order}/${paragraphIndex}`,
          start: paragraph.start,
          end: paragraph.end,
          contentDigest: unitDigest,
        },
        graphEffect: "none",
        canonEffect: "none",
      };
      return segment;
    });
    segments.push(...unitSegments);
    units.push({
      format: ASOIAF_LOCAL_EDITION_UNIT_FORMAT,
      unitId,
      order,
      label: parsedUnit.label,
      sourcePart: parsedUnit.sourcePart,
      sourcePartDigest: parsedUnit.sourcePartDigest,
      textDigest: unitDigest,
      charCount: parsedUnit.text.length,
      wordCount: wordCount(parsedUnit.text),
      paragraphCount: unitSegments.length,
      segmentIds: unitSegments.map((segment) => segment.segmentId),
      locator: {
        kind: "chapter",
        unit: `${input.sourceId}/${input.editionId}/${order}`,
        start: 0,
        end: parsedUnit.text.length,
        contentDigest: unitDigest,
      },
      graphEffect: "none",
      canonEffect: "none",
    });
  });
  return { units, segments };
}

function privateTextFileName(order: number, unitId: string): string {
  const suffix = unitId.split(":").at(-1) ?? String(order);
  return `${String(order + 1).padStart(4, "0")}-${suffix}.txt`;
}

function writePrivateText(input: {
  paths: AsoiafLocalEditionPaths;
  editionKey: string;
  parsed: ParsedEdition;
  units: AsoiafLocalEditionUnit[];
}): AsoiafLocalEditionPrivateIndex {
  fs.rmSync(input.paths.privateRoot, { recursive: true, force: true });
  fs.mkdirSync(input.paths.privateRoot, { recursive: true });
  const entries = input.units.map((unit, index) => {
    const text = input.parsed.units[index]?.text;
    if (text === undefined) throw new Error(`missing private text for ${unit.unitId}`);
    const fileName = privateTextFileName(index, unit.unitId);
    const target = path.join(input.paths.privateRoot, fileName);
    fs.writeFileSync(target, text, { encoding: "utf8", mode: 0o600 });
    return {
      unitId: unit.unitId,
      relativeUri: `private-text/${fileName}`,
      bytes: Buffer.byteLength(text, "utf8"),
      textDigest: digestText(text),
    };
  });
  const core = {
    format: ASOIAF_LOCAL_EDITION_PRIVATE_INDEX_FORMAT,
    editionKey: input.editionKey,
    entries,
  };
  const index: AsoiafLocalEditionPrivateIndex = {
    ...core,
    indexFingerprint: sha256(core),
  };
  writeJsonAtomic(input.paths.privateIndex, index);
  return index;
}

function manifestCore(
  manifest: AsoiafLocalEditionManifest,
): Omit<AsoiafLocalEditionManifest, "manifestFingerprint"> {
  const { manifestFingerprint: _fingerprint, ...core } = manifest;
  return core;
}

export async function intakeAsoiafLocalEdition(
  options: IntakeAsoiafLocalEditionOptions,
): Promise<{
  manifest: AsoiafLocalEditionManifest;
  units: AsoiafLocalEditionUnit[];
  segments: AsoiafLocalEditionSegment[];
  collector: CollectorRunResult;
  paths: AsoiafLocalEditionPaths;
}> {
  const source = getAsoiafExternalSource(options.sourceId);
  if (!source) throw new Error(`unknown atlas source ${options.sourceId}`);
  if (source.harvestPolicy.mode !== "local-private-only") {
    throw new Error(`${options.sourceId} is not a holder-controlled local source`);
  }
  if (!options.editionId.trim()) throw new Error("editionId is required");
  const continuityId = options.continuityId ?? source.continuityIds[0];
  if (!continuityId || !source.continuityIds.includes(continuityId)) {
    throw new Error(`${String(continuityId)} is not declared by ${source.id}`);
  }
  const ingestedAt = options.ingestedAt ?? new Date().toISOString();
  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  const stats = fs.statSync(options.filePath);
  if (!stats.isFile()) throw new Error("local edition input is not a regular file");
  if (stats.size <= 0 || stats.size > maxSourceBytes) {
    throw new Error(`local edition source size ${stats.size} exceeds bounded intake policy`);
  }
  const sourceBytes = fs.readFileSync(options.filePath);
  const sourceDigest = digestBytes(sourceBytes);
  const parsed = detectAndParse(sourceBytes, {
    maxEntries: options.maxZipEntries ?? DEFAULT_MAX_ZIP_ENTRIES,
    maxExpandedBytes: options.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES,
  });
  const sourceRecordId = options.sourceRecordId
    ?? `local-edition:${source.id}:${safeSlug(options.editionId)}`;
  const collector = await collectLocalSource({
    root: options.root,
    sourceId: source.id,
    sourceRecordId,
    filePath: options.filePath,
    retrievedAt: ingestedAt,
    refresh: options.refresh,
  });
  if (!collector.observation) {
    throw new Error(`collector did not retain local custody for ${source.id}`);
  }

  const key = editionKey(source.id, options.editionId);
  const paths = localEditionPaths(options.root, source.id, options.editionId);
  fs.mkdirSync(paths.editionRoot, { recursive: true });
  const { units, segments } = buildUnitsAndSegments({
    sourceId: source.id,
    editionId: options.editionId,
    parsed,
  });
  writeNdjsonAtomic(paths.units, units);
  writeNdjsonAtomic(paths.segments, segments);
  const retainPrivateText = options.retainPrivateText ?? true;
  if (retainPrivateText) {
    writePrivateText({ paths, editionKey: key, parsed, units });
  } else {
    fs.rmSync(paths.privateRoot, { recursive: true, force: true });
    fs.rmSync(paths.privateIndex, { force: true });
  }

  const core: Omit<AsoiafLocalEditionManifest, "manifestFingerprint"> = {
    format: ASOIAF_LOCAL_EDITION_MANIFEST_FORMAT,
    sourceId: source.id,
    editionId: options.editionId,
    editionKey: key,
    sourceRecordId,
    continuityId,
    ingestedAt,
    custody: "user-controlled-private",
    inputFormat: parsed.inputFormat,
    mediaType: parsed.mediaType,
    sourceDigest,
    sourceBytes: sourceBytes.length,
    sourcePathRetained: false,
    sourceFilenameRetained: false,
    privateTextRetained: retainPrivateText,
    metadata: parsed.metadata,
    unitCount: units.length,
    segmentCount: segments.length,
    charCount: units.reduce((sum, unit) => sum + unit.charCount, 0),
    wordCount: units.reduce((sum, unit) => sum + unit.wordCount, 0),
    collectorOutcome: collector.outcome,
    collectorCandidateId: collector.observation.candidateId,
    collectorObservationId: collector.observation.observationId,
    files: {
      manifest: relativeFromRoot(options.root, paths.manifest),
      units: relativeFromRoot(options.root, paths.units),
      segments: relativeFromRoot(options.root, paths.segments),
      privateIndex: retainPrivateText
        ? relativeFromRoot(options.root, paths.privateIndex)
        : null,
      receipt: relativeFromRoot(options.root, paths.receipt),
    },
    graphEffect: "none",
    canonEffect: "none",
  };
  const manifest: AsoiafLocalEditionManifest = {
    ...core,
    manifestFingerprint: sha256(core),
  };
  const serialized = JSON.stringify({ manifest, units, segments });
  const sourcePath = path.resolve(options.filePath);
  const sourceName = path.basename(options.filePath);
  if (serialized.includes(sourcePath) || serialized.includes(sourceName)) {
    throw new Error("local edition output retained a private source path or filename");
  }
  writeJsonAtomic(paths.manifest, manifest);
  return { manifest, units, segments, collector, paths };
}

export function readAsoiafLocalEditionManifest(
  root: string,
  sourceId: string,
  editionId: string,
): AsoiafLocalEditionManifest {
  const paths = localEditionPaths(root, sourceId, editionId);
  if (!fs.existsSync(paths.manifest)) {
    throw new Error(`local edition ${editionId} is not initialized`);
  }
  return readJson<AsoiafLocalEditionManifest>(paths.manifest, null as never);
}

function safeEditionRelative(editionRoot: string, relativeUri: string): string | null {
  if (!relativeUri.trim() || path.isAbsolute(relativeUri)) return null;
  const absoluteRoot = path.resolve(editionRoot);
  const absolute = path.resolve(absoluteRoot, relativeUri);
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    return null;
  }
  return absolute;
}

export function verifyAsoiafLocalEdition(
  root: string,
  sourceId: string,
  editionId: string,
): string[] {
  const errors: string[] = [];
  const paths = localEditionPaths(root, sourceId, editionId);
  if (!fs.existsSync(paths.manifest)) return ["missing edition manifest"];
  const manifest = readJson<AsoiafLocalEditionManifest>(paths.manifest, null as never);
  const units = readNdjson<AsoiafLocalEditionUnit>(paths.units);
  const segments = readNdjson<AsoiafLocalEditionSegment>(paths.segments);
  if (manifest.format !== ASOIAF_LOCAL_EDITION_MANIFEST_FORMAT) {
    errors.push("invalid manifest format");
  }
  if (manifest.sourceId !== sourceId || manifest.editionId !== editionId) {
    errors.push("manifest identity mismatch");
  }
  if (manifest.graphEffect !== "none" || manifest.canonEffect !== "none") {
    errors.push("manifest acquired graph or canon effect");
  }
  if (manifest.sourcePathRetained || manifest.sourceFilenameRetained) {
    errors.push("manifest retained private source identity");
  }
  if (manifest.manifestFingerprint !== sha256(manifestCore(manifest))) {
    errors.push("manifest fingerprint mismatch");
  }
  if (manifest.unitCount !== units.length) errors.push("unit count mismatch");
  if (manifest.segmentCount !== segments.length) errors.push("segment count mismatch");
  if (units.some((unit, index) => unit.order !== index)) {
    errors.push("unit order is not contiguous");
  }
  const unitsById = new Map(units.map((unit) => [unit.unitId, unit] as const));
  const segmentsByUnit = new Map<string, AsoiafLocalEditionSegment[]>();
  for (const segment of segments) {
    const unit = unitsById.get(segment.unitId);
    if (!unit) {
      errors.push(`segment ${segment.segmentId} references unknown unit`);
      continue;
    }
    if (
      segment.startChar < 0
      || segment.endChar < segment.startChar
      || segment.endChar > unit.charCount
      || segment.charCount !== segment.endChar - segment.startChar
    ) {
      errors.push(`segment ${segment.segmentId} has invalid bounds`);
    }
    const entries = segmentsByUnit.get(segment.unitId) ?? [];
    entries.push(segment);
    segmentsByUnit.set(segment.unitId, entries);
  }
  for (const unit of units) {
    const unitSegments = (segmentsByUnit.get(unit.unitId) ?? []).sort(
      (left, right) => left.paragraphIndex - right.paragraphIndex,
    );
    if (unit.paragraphCount !== unitSegments.length) {
      errors.push(`unit ${unit.unitId} paragraph count mismatch`);
    }
    if (
      JSON.stringify(unit.segmentIds)
      !== JSON.stringify(unitSegments.map((segment) => segment.segmentId))
    ) {
      errors.push(`unit ${unit.unitId} segment identity mismatch`);
    }
  }

  if (manifest.privateTextRetained) {
    if (!fs.existsSync(paths.privateIndex)) {
      errors.push("private-text index is missing");
    } else {
      const index = readJson<AsoiafLocalEditionPrivateIndex>(
        paths.privateIndex,
        null as never,
      );
      const { indexFingerprint: _fingerprint, ...indexCore } = index;
      if (index.indexFingerprint !== sha256(indexCore)) {
        errors.push("private-text index fingerprint mismatch");
      }
      if (index.entries.length !== units.length) {
        errors.push("private-text index count mismatch");
      }
      for (const entry of index.entries) {
        const unit = unitsById.get(entry.unitId);
        const target = safeEditionRelative(paths.editionRoot, entry.relativeUri);
        if (!unit || !target || !fs.existsSync(target)) {
          errors.push(`private text for ${entry.unitId} is missing or unsafe`);
          continue;
        }
        const text = fs.readFileSync(target, "utf8");
        if (
          digestText(text) !== entry.textDigest
          || entry.textDigest !== unit.textDigest
          || Buffer.byteLength(text, "utf8") !== entry.bytes
          || text.length !== unit.charCount
        ) {
          errors.push(`private text for ${entry.unitId} failed digest or size custody`);
        }
        for (const segment of segmentsByUnit.get(entry.unitId) ?? []) {
          const value = text.slice(segment.startChar, segment.endChar);
          if (
            digestText(value) !== segment.textDigest
            || value.length !== segment.charCount
            || wordCount(value) !== segment.wordCount
          ) {
            errors.push(`segment ${segment.segmentId} failed private-text reconciliation`);
          }
        }
      }
    }
  } else if (fs.existsSync(paths.privateIndex) || fs.existsSync(paths.privateRoot)) {
    errors.push("private text exists although retention is disabled");
  }

  const collectorPaths = collectorEstatePaths(root);
  const observations = readNdjson<CollectorObservationRecord>(collectorPaths.observations);
  if (
    !manifest.collectorObservationId
    || !observations.some(
      (observation) =>
        observation.observationId === manifest.collectorObservationId
        && observation.sourceId === manifest.sourceId
        && observation.sourceRecordId === manifest.sourceRecordId
        && observation.contentDigest === manifest.sourceDigest,
    )
  ) {
    errors.push("collector custody observation is missing or mismatched");
  }
  return [...new Set(errors)].sort();
}

export function writeAsoiafLocalEditionReceipt(
  root: string,
  sourceId: string,
  editionId: string,
  verifiedAt = new Date().toISOString(),
  outputPath?: string,
): AsoiafLocalEditionReceipt {
  const paths = localEditionPaths(root, sourceId, editionId);
  const manifest = readAsoiafLocalEditionManifest(root, sourceId, editionId);
  const errors = verifyAsoiafLocalEdition(root, sourceId, editionId);
  const core = {
    format: ASOIAF_LOCAL_EDITION_RECEIPT_FORMAT,
    sourceId: manifest.sourceId,
    editionId: manifest.editionId,
    editionKey: manifest.editionKey,
    sourceRecordId: manifest.sourceRecordId,
    sourceDigest: manifest.sourceDigest,
    manifestFingerprint: manifest.manifestFingerprint,
    collectorObservationId: manifest.collectorObservationId,
    unitCount: manifest.unitCount,
    segmentCount: manifest.segmentCount,
    privateTextRetained: manifest.privateTextRetained,
    verifiedAt,
    errorCount: errors.length,
    passed: errors.length === 0,
  };
  const receipt: AsoiafLocalEditionReceipt = {
    ...core,
    receiptFingerprint: sha256(core),
  };
  writeJsonAtomic(outputPath ?? paths.receipt, receipt);
  return receipt;
}

export function listAsoiafLocalEditions(root: string): AsoiafLocalEditionManifest[] {
  const directory = path.join(path.resolve(root), "local-editions");
  if (!fs.existsSync(directory)) return [];
  const manifests: AsoiafLocalEditionManifest[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(directory, entry.name, "edition-manifest.json");
    if (fs.existsSync(target)) {
      manifests.push(readJson<AsoiafLocalEditionManifest>(target, null as never));
    }
  }
  return manifests.sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId)
      || left.editionId.localeCompare(right.editionId),
  );
}

export function locateAsoiafLocalEditionText(input: {
  root: string;
  sourceId: string;
  editionId: string;
  unitId: string;
  segmentId?: string;
  includeText?: boolean;
}): {
  unit: AsoiafLocalEditionUnit;
  segment: AsoiafLocalEditionSegment | null;
  text: string | null;
} {
  const paths = localEditionPaths(input.root, input.sourceId, input.editionId);
  const manifest = readAsoiafLocalEditionManifest(
    input.root,
    input.sourceId,
    input.editionId,
  );
  if (!manifest.privateTextRetained) throw new Error("edition has no retained private text");
  const units = readNdjson<AsoiafLocalEditionUnit>(paths.units);
  const segments = readNdjson<AsoiafLocalEditionSegment>(paths.segments);
  const unit = units.find((entry) => entry.unitId === input.unitId);
  if (!unit) throw new Error(`unknown local-edition unit ${input.unitId}`);
  const segment = input.segmentId
    ? segments.find(
        (entry) => entry.segmentId === input.segmentId && entry.unitId === unit.unitId,
      ) ?? null
    : null;
  if (input.segmentId && !segment) throw new Error(`unknown unit segment ${input.segmentId}`);
  const privateIndex = readJson<AsoiafLocalEditionPrivateIndex>(
    paths.privateIndex,
    null as never,
  );
  const privateEntry = privateIndex.entries.find((entry) => entry.unitId === unit.unitId);
  if (!privateEntry) throw new Error(`private text index lost ${unit.unitId}`);
  const target = safeEditionRelative(paths.editionRoot, privateEntry.relativeUri);
  if (!target || !fs.existsSync(target)) throw new Error(`private text for ${unit.unitId} is unavailable`);
  const fullText = fs.readFileSync(target, "utf8");
  const selectedText = segment
    ? fullText.slice(segment.startChar, segment.endChar)
    : fullText;
  return {
    unit,
    segment,
    text: input.includeText ? selectedText : null,
  };
}
