import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  listAsoiafLocalEditions,
  localEditionPaths,
  verifyAsoiafLocalEdition,
  type AsoiafLocalEditionLocator,
  type AsoiafLocalEditionManifest,
  type AsoiafLocalEditionPrivateIndex,
  type AsoiafLocalEditionSegment,
  type AsoiafLocalEditionUnit,
} from "./asoiaf-local-edition-intake.js";
import {
  collectorContentId,
  readJson,
  readNdjson,
  sha256,
  writeJsonAtomic,
} from "./asoiaf-external-estate.js";

export const ASOIAF_PRIVATE_RESEARCH_INDEX_FORMAT =
  "axm-asoiaf-private-research-index/1" as const;
export const ASOIAF_PRIVATE_RESEARCH_RECEIPT_FORMAT =
  "axm-asoiaf-private-research-receipt/1" as const;
export const ASOIAF_PRIVATE_RESEARCH_QUERY_RECEIPT_FORMAT =
  "axm-asoiaf-private-research-query-receipt/1" as const;

export type AsoiafPrivateResearchQueryMode = "all" | "any" | "phrase";

export interface AsoiafPrivateResearchPaths {
  root: string;
  directory: string;
  index: string;
  receipt: string;
}

export interface AsoiafPrivateResearchEditionBinding {
  sourceId: string;
  editionId: string;
  editionKey: string;
  continuityId: string;
  manifestFingerprint: `sha256:${string}`;
  sourceDigest: `sha256:${string}`;
  unitCount: number;
  segmentCount: number;
}

export interface AsoiafPrivateResearchSkippedEdition {
  sourceId: string;
  editionId: string;
  editionKey: string;
  reason: string;
}

export interface AsoiafPrivateResearchDocument {
  documentId: string;
  sourceId: string;
  editionId: string;
  editionKey: string;
  continuityId: string;
  unitId: string;
  unitLabel: string;
  unitOrder: number;
  segmentId: string;
  paragraphIndex: number;
  charCount: number;
  wordCount: number;
  textDigest: `sha256:${string}`;
  locator: AsoiafLocalEditionLocator;
  tokenCount: number;
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafPrivateResearchPosting {
  documentId: string;
  frequency: number;
  tokenIndexes: number[];
  charStarts: number[];
  charEnds: number[];
}

export interface AsoiafPrivateResearchTerm {
  term: string;
  documentFrequency: number;
  totalFrequency: number;
  postings: AsoiafPrivateResearchPosting[];
}

export interface AsoiafPrivateResearchIndex {
  format: typeof ASOIAF_PRIVATE_RESEARCH_INDEX_FORMAT;
  generatedAt: string;
  editionBindings: AsoiafPrivateResearchEditionBinding[];
  skippedEditions: AsoiafPrivateResearchSkippedEdition[];
  documentCount: number;
  termCount: number;
  totalTokenCount: number;
  documents: AsoiafPrivateResearchDocument[];
  terms: AsoiafPrivateResearchTerm[];
  graphEffect: "none";
  canonEffect: "none";
  indexFingerprint: `sha256:${string}`;
}

export interface AsoiafPrivateResearchQuery {
  text: string;
  mode?: AsoiafPrivateResearchQueryMode;
  sourceIds?: string[];
  editionKeys?: string[];
  continuityIds?: string[];
  limit?: number;
  includeText?: boolean;
  contextCharacters?: number;
}

export interface AsoiafPrivateResearchMatch {
  documentId: string;
  sourceId: string;
  editionId: string;
  editionKey: string;
  continuityId: string;
  unitId: string;
  unitLabel: string;
  segmentId: string;
  paragraphIndex: number;
  locator: AsoiafLocalEditionLocator;
  score: number;
  matchedTerms: string[];
  matchedTokenIndexes: number[];
  snippet: string | null;
  snippetDigest: `sha256:${string}` | null;
  graphEffect: "none";
  canonEffect: "none";
}

export interface AsoiafPrivateResearchQueryReceipt {
  format: typeof ASOIAF_PRIVATE_RESEARCH_QUERY_RECEIPT_FORMAT;
  indexFingerprint: `sha256:${string}`;
  queryTextDigest: `sha256:${string}`;
  mode: AsoiafPrivateResearchQueryMode;
  normalizedTerms: string[];
  sourceIds: string[];
  editionKeys: string[];
  continuityIds: string[];
  requestedLimit: number;
  returnedCount: number;
  includeText: boolean;
  matches: AsoiafPrivateResearchMatch[];
  graphEffect: "none";
  canonEffect: "none";
  queryFingerprint: `sha256:${string}`;
}

export interface AsoiafPrivateResearchReceipt {
  format: typeof ASOIAF_PRIVATE_RESEARCH_RECEIPT_FORMAT;
  generatedAt: string;
  indexFingerprint: `sha256:${string}`;
  editionCount: number;
  skippedEditionCount: number;
  documentCount: number;
  termCount: number;
  totalTokenCount: number;
  errorCount: number;
  passed: boolean;
  graphEffect: "none";
  canonEffect: "none";
  receiptFingerprint: `sha256:${string}`;
}

export interface CompileAsoiafPrivateResearchIndexOptions {
  root: string;
  generatedAt?: string;
  sourceIds?: string[];
  editionKeys?: string[];
}

interface TokenOccurrence {
  term: string;
  tokenIndex: number;
  start: number;
  end: number;
}

interface LoadedPrivateUnit {
  manifest: AsoiafLocalEditionManifest;
  unit: AsoiafLocalEditionUnit;
  segments: AsoiafLocalEditionSegment[];
  text: string;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

function digestText(text: string): `sha256:${string}` {
  return `sha256:${crypto.createHash("sha256").update(text, "utf8").digest("hex")}`;
}

export function privateResearchPaths(root: string): AsoiafPrivateResearchPaths {
  const absolute = path.resolve(root);
  const directory = path.join(absolute, "private-research");
  return {
    root: absolute,
    directory,
    index: path.join(directory, "PRIVATE-RESEARCH-INDEX.json"),
    receipt: path.join(directory, "PRIVATE-RESEARCH-RECEIPT.json"),
  };
}

function normalizeTerm(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

export function tokenizeAsoiafPrivateResearchText(text: string): TokenOccurrence[] {
  const occurrences: TokenOccurrence[] = [];
  let tokenIndex = 0;
  const pattern = new RegExp(WORD_PATTERN.source, WORD_PATTERN.flags);
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const term = normalizeTerm(raw);
    if (!term) continue;
    occurrences.push({
      term,
      tokenIndex,
      start,
      end: start + raw.length,
    });
    tokenIndex += 1;
  }
  return occurrences;
}

function safeRelative(root: string, relativeUri: string): string | null {
  if (!relativeUri.trim() || path.isAbsolute(relativeUri)) return null;
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, relativeUri);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${path.sep}`)) {
    return null;
  }
  return target;
}

function readPrivateUnits(
  root: string,
  manifest: AsoiafLocalEditionManifest,
): LoadedPrivateUnit[] {
  const paths = localEditionPaths(root, manifest.sourceId, manifest.editionId);
  if (!manifest.privateTextRetained || !fs.existsSync(paths.privateIndex)) return [];
  const units = readNdjson<AsoiafLocalEditionUnit>(paths.units);
  const segments = readNdjson<AsoiafLocalEditionSegment>(paths.segments);
  const privateIndex = readJson<AsoiafLocalEditionPrivateIndex>(
    paths.privateIndex,
    null as never,
  );
  const privateByUnit = new Map(
    privateIndex.entries.map((entry) => [entry.unitId, entry] as const),
  );
  return units.map((unit) => {
    const privateEntry = privateByUnit.get(unit.unitId);
    if (!privateEntry) throw new Error(`private index lost ${unit.unitId}`);
    const target = safeRelative(paths.editionRoot, privateEntry.relativeUri);
    if (!target || !fs.existsSync(target)) {
      throw new Error(`private text for ${unit.unitId} is missing or unsafe`);
    }
    const text = fs.readFileSync(target, "utf8");
    if (digestText(text) !== unit.textDigest) {
      throw new Error(`private text for ${unit.unitId} failed digest custody`);
    }
    return {
      manifest,
      unit,
      segments: segments
        .filter((segment) => segment.unitId === unit.unitId)
        .sort((left, right) => left.paragraphIndex - right.paragraphIndex),
      text,
    };
  });
}

function indexCore(
  index: AsoiafPrivateResearchIndex,
): Omit<AsoiafPrivateResearchIndex, "indexFingerprint"> {
  const { indexFingerprint: _fingerprint, ...core } = index;
  return core;
}

export function compileAsoiafPrivateResearchIndex(
  options: CompileAsoiafPrivateResearchIndexOptions,
): AsoiafPrivateResearchIndex {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceFilter = new Set(options.sourceIds ?? []);
  const editionFilter = new Set(options.editionKeys ?? []);
  const manifests = listAsoiafLocalEditions(options.root)
    .filter((manifest) => sourceFilter.size === 0 || sourceFilter.has(manifest.sourceId))
    .filter((manifest) => editionFilter.size === 0 || editionFilter.has(manifest.editionKey))
    .sort(
      (left, right) =>
        left.sourceId.localeCompare(right.sourceId)
        || left.editionKey.localeCompare(right.editionKey),
    );

  const editionBindings: AsoiafPrivateResearchEditionBinding[] = [];
  const skippedEditions: AsoiafPrivateResearchSkippedEdition[] = [];
  const documents: AsoiafPrivateResearchDocument[] = [];
  const termPostings = new Map<string, Map<string, TokenOccurrence[]>>();
  let totalTokenCount = 0;

  for (const manifest of manifests) {
    const errors = verifyAsoiafLocalEdition(
      options.root,
      manifest.sourceId,
      manifest.editionId,
    );
    if (errors.length > 0) {
      throw new Error(
        `${manifest.sourceId}/${manifest.editionId} failed edition verification: ${errors.join("; ")}`,
      );
    }
    if (!manifest.privateTextRetained) {
      skippedEditions.push({
        sourceId: manifest.sourceId,
        editionId: manifest.editionId,
        editionKey: manifest.editionKey,
        reason: "private normalized text is not retained",
      });
      continue;
    }
    editionBindings.push({
      sourceId: manifest.sourceId,
      editionId: manifest.editionId,
      editionKey: manifest.editionKey,
      continuityId: manifest.continuityId,
      manifestFingerprint: manifest.manifestFingerprint,
      sourceDigest: manifest.sourceDigest,
      unitCount: manifest.unitCount,
      segmentCount: manifest.segmentCount,
    });

    for (const loaded of readPrivateUnits(options.root, manifest)) {
      for (const segment of loaded.segments) {
        const text = loaded.text.slice(segment.startChar, segment.endChar);
        if (digestText(text) !== segment.textDigest) {
          throw new Error(`segment ${segment.segmentId} failed text digest custody`);
        }
        const occurrences = tokenizeAsoiafPrivateResearchText(text);
        const documentId = collectorContentId("asoiaf-private-research-document", {
          sourceId: manifest.sourceId,
          editionKey: manifest.editionKey,
          unitId: loaded.unit.unitId,
          segmentId: segment.segmentId,
          textDigest: segment.textDigest,
        });
        const document: AsoiafPrivateResearchDocument = {
          documentId,
          sourceId: manifest.sourceId,
          editionId: manifest.editionId,
          editionKey: manifest.editionKey,
          continuityId: manifest.continuityId,
          unitId: loaded.unit.unitId,
          unitLabel: loaded.unit.label,
          unitOrder: loaded.unit.order,
          segmentId: segment.segmentId,
          paragraphIndex: segment.paragraphIndex,
          charCount: segment.charCount,
          wordCount: segment.wordCount,
          textDigest: segment.textDigest,
          locator: segment.locator,
          tokenCount: occurrences.length,
          graphEffect: "none",
          canonEffect: "none",
        };
        documents.push(document);
        totalTokenCount += occurrences.length;
        for (const occurrence of occurrences) {
          const byDocument = termPostings.get(occurrence.term) ?? new Map();
          const values = byDocument.get(documentId) ?? [];
          values.push(occurrence);
          byDocument.set(documentId, values);
          termPostings.set(occurrence.term, byDocument);
        }
      }
    }
  }

  documents.sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId)
      || left.editionKey.localeCompare(right.editionKey)
      || left.unitOrder - right.unitOrder
      || left.paragraphIndex - right.paragraphIndex
      || left.documentId.localeCompare(right.documentId),
  );
  const terms: AsoiafPrivateResearchTerm[] = [...termPostings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([term, byDocument]) => {
      const postings = [...byDocument.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([documentId, occurrences]): AsoiafPrivateResearchPosting => ({
          documentId,
          frequency: occurrences.length,
          tokenIndexes: occurrences.map((entry) => entry.tokenIndex),
          charStarts: occurrences.map((entry) => entry.start),
          charEnds: occurrences.map((entry) => entry.end),
        }));
      return {
        term,
        documentFrequency: postings.length,
        totalFrequency: postings.reduce((sum, posting) => sum + posting.frequency, 0),
        postings,
      };
    });
  const core: Omit<AsoiafPrivateResearchIndex, "indexFingerprint"> = {
    format: ASOIAF_PRIVATE_RESEARCH_INDEX_FORMAT,
    generatedAt,
    editionBindings,
    skippedEditions,
    documentCount: documents.length,
    termCount: terms.length,
    totalTokenCount,
    documents,
    terms,
    graphEffect: "none",
    canonEffect: "none",
  };
  return { ...core, indexFingerprint: sha256(core) };
}

export function writeAsoiafPrivateResearchIndex(
  options: CompileAsoiafPrivateResearchIndexOptions,
): AsoiafPrivateResearchIndex {
  const paths = privateResearchPaths(options.root);
  fs.mkdirSync(paths.directory, { recursive: true });
  const index = compileAsoiafPrivateResearchIndex(options);
  writeJsonAtomic(paths.index, index);
  return index;
}

export function readAsoiafPrivateResearchIndex(
  root: string,
): AsoiafPrivateResearchIndex {
  const paths = privateResearchPaths(root);
  if (!fs.existsSync(paths.index)) {
    throw new Error("private research index has not been built");
  }
  return readJson<AsoiafPrivateResearchIndex>(paths.index, null as never);
}

function queryTerms(text: string): string[] {
  return tokenizeAsoiafPrivateResearchText(text).map((entry) => entry.term);
}

function phraseStarts(
  terms: readonly string[],
  postingsByTerm: ReadonlyMap<string, AsoiafPrivateResearchPosting>,
): number[] {
  if (terms.length === 0) return [];
  const first = postingsByTerm.get(terms[0] ?? "");
  if (!first) return [];
  const sets = terms.map((term) =>
    new Set(postingsByTerm.get(term)?.tokenIndexes ?? []),
  );
  return first.tokenIndexes.filter((start) =>
    sets.every((set, index) => set.has(start + index)),
  );
}

function documentPrivateText(
  root: string,
  document: AsoiafPrivateResearchDocument,
): string {
  const paths = localEditionPaths(root, document.sourceId, document.editionId);
  const privateIndex = readJson<AsoiafLocalEditionPrivateIndex>(
    paths.privateIndex,
    null as never,
  );
  const entry = privateIndex.entries.find((value) => value.unitId === document.unitId);
  if (!entry) throw new Error(`private index lost ${document.unitId}`);
  const target = safeRelative(paths.editionRoot, entry.relativeUri);
  if (!target || !fs.existsSync(target)) {
    throw new Error(`private text for ${document.unitId} is missing or unsafe`);
  }
  const unitText = fs.readFileSync(target, "utf8");
  const unitSegments = readNdjson<AsoiafLocalEditionSegment>(paths.segments);
  const segment = unitSegments.find((value) => value.segmentId === document.segmentId);
  if (!segment) throw new Error(`segment ${document.segmentId} is missing`);
  const text = unitText.slice(segment.startChar, segment.endChar);
  if (digestText(text) !== document.textDigest) {
    throw new Error(`document ${document.documentId} failed private-text custody`);
  }
  return text;
}

function firstCharacterMatch(
  terms: readonly string[],
  postingsByTerm: ReadonlyMap<string, AsoiafPrivateResearchPosting>,
): number {
  const starts = terms.flatMap((term) => postingsByTerm.get(term)?.charStarts ?? []);
  return starts.length > 0 ? Math.min(...starts) : 0;
}

export function searchAsoiafPrivateResearchIndex(
  root: string,
  query: AsoiafPrivateResearchQuery,
): AsoiafPrivateResearchQueryReceipt {
  const index = readAsoiafPrivateResearchIndex(root);
  const mode = query.mode ?? "all";
  const normalizedTerms = queryTerms(query.text);
  if (normalizedTerms.length === 0) throw new Error("research query has no searchable terms");
  const sourceIds = [...new Set(query.sourceIds ?? [])].sort();
  const editionKeys = [...new Set(query.editionKeys ?? [])].sort();
  const continuityIds = [...new Set(query.continuityIds ?? [])].sort();
  const sourceFilter = new Set(sourceIds);
  const editionFilter = new Set(editionKeys);
  const continuityFilter = new Set(continuityIds);
  const requestedLimit = Math.min(200, Math.max(1, query.limit ?? 20));
  const includeText = query.includeText ?? false;
  const contextCharacters = Math.min(
    2_000,
    Math.max(0, query.contextCharacters ?? 180),
  );
  const documentsById = new Map(
    index.documents.map((document) => [document.documentId, document] as const),
  );
  const termsByValue = new Map(index.terms.map((term) => [term.term, term] as const));
  const uniqueTerms = [...new Set(normalizedTerms)];
  const documentSets = uniqueTerms.map(
    (term) =>
      new Set(
        (termsByValue.get(term)?.postings ?? []).map(
(posting) => posting.documentId,
        ),
      ),
  );
  const candidateDocumentIds = mode === "any"
    ? new Set(documentSets.flatMap((documents) => [...documents]))
    : new Set(
        [...(documentSets[0] ?? new Set<string>())].filter((documentId) =>
documentSets.every((documents) => documents.has(documentId)),
        ),
      );

  const matches: AsoiafPrivateResearchMatch[] = [];
  for (const documentId of candidateDocumentIds) {
    const document = documentsById.get(documentId);
    if (!document) continue;
    if (sourceFilter.size > 0 && !sourceFilter.has(document.sourceId)) continue;
    if (editionFilter.size > 0 && !editionFilter.has(document.editionKey)) continue;
    if (continuityFilter.size > 0 && !continuityFilter.has(document.continuityId)) continue;
    const postingsByTerm = new Map<string, AsoiafPrivateResearchPosting>();
    for (const term of normalizedTerms) {
      const posting = termsByValue
        .get(term)
        ?.postings.find((entry) => entry.documentId === documentId);
      if (posting) postingsByTerm.set(term, posting);
    }
    const presentTerms = uniqueTerms.filter((term) => postingsByTerm.has(term));
    const phraseMatches = phraseStarts(normalizedTerms, postingsByTerm);
    if (mode === "all" && presentTerms.length !== uniqueTerms.length) continue;
    if (mode === "phrase" && phraseMatches.length === 0) continue;
    if (mode === "any" && presentTerms.length === 0) continue;

    let score = 0;
    for (const term of presentTerms) {
      const dictionary = termsByValue.get(term)!;
      const posting = postingsByTerm.get(term)!;
      const idf = Math.log((index.documentCount + 1) / (dictionary.documentFrequency + 1)) + 1;
      score += idf * (1 + Math.log(posting.frequency));
    }
    if (phraseMatches.length > 0) score += 4 + Math.log(phraseMatches.length + 1);
    score += presentTerms.length / Math.max(1, uniqueTerms.length);
    const matchedTokenIndexes = [...new Set([
      ...presentTerms.flatMap((term) => postingsByTerm.get(term)?.tokenIndexes ?? []),
      ...phraseMatches,
    ])].sort((left, right) => left - right);

    let snippet: string | null = null;
    let snippetDigest: `sha256:${string}` | null = null;
    if (includeText) {
      const text = documentPrivateText(root, document);
      const first = firstCharacterMatch(presentTerms, postingsByTerm);
      const start = Math.max(0, first - contextCharacters);
      const end = Math.min(text.length, first + contextCharacters);
      const selected = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
      snippet = selected;
      snippetDigest = digestText(selected);
    }
    matches.push({
      documentId,
      sourceId: document.sourceId,
      editionId: document.editionId,
      editionKey: document.editionKey,
      continuityId: document.continuityId,
      unitId: document.unitId,
      unitLabel: document.unitLabel,
      segmentId: document.segmentId,
      paragraphIndex: document.paragraphIndex,
      locator: document.locator,
      score: Number(score.toFixed(8)),
      matchedTerms: presentTerms.sort(),
      matchedTokenIndexes,
      snippet,
      snippetDigest,
      graphEffect: "none",
      canonEffect: "none",
    });
  }
  matches.sort(
    (left, right) =>
      right.score - left.score
      || left.sourceId.localeCompare(right.sourceId)
      || left.editionKey.localeCompare(right.editionKey)
      || left.unitLabel.localeCompare(right.unitLabel)
      || left.paragraphIndex - right.paragraphIndex
      || left.documentId.localeCompare(right.documentId),
  );
  const returned = matches.slice(0, requestedLimit);
  const core: Omit<AsoiafPrivateResearchQueryReceipt, "queryFingerprint"> = {
    format: ASOIAF_PRIVATE_RESEARCH_QUERY_RECEIPT_FORMAT,
    indexFingerprint: index.indexFingerprint,
    queryTextDigest: digestText(query.text),
    mode,
    normalizedTerms,
    sourceIds,
    editionKeys,
    continuityIds,
    requestedLimit,
    returnedCount: returned.length,
    includeText,
    matches: returned,
    graphEffect: "none",
    canonEffect: "none",
  };
  return { ...core, queryFingerprint: sha256(core) };
}

export function verifyAsoiafPrivateResearchIndex(root: string): string[] {
  const index = readAsoiafPrivateResearchIndex(root);
  const errors: string[] = [];
  if (index.format !== ASOIAF_PRIVATE_RESEARCH_INDEX_FORMAT) {
    errors.push("invalid private-research index format");
  }
  if (index.graphEffect !== "none" || index.canonEffect !== "none") {
    errors.push("private-research index acquired graph or canon effect");
  }
  if (index.indexFingerprint !== sha256(indexCore(index))) {
    errors.push("private-research index fingerprint mismatch");
  }
  if (index.documentCount !== index.documents.length) {
    errors.push("private-research document count mismatch");
  }
  if (index.termCount !== index.terms.length) {
    errors.push("private-research term count mismatch");
  }
  if (
    index.totalTokenCount
    !== index.documents.reduce((sum, document) => sum + document.tokenCount, 0)
  ) {
    errors.push("private-research token count mismatch");
  }
  const documentIds = new Set(index.documents.map((document) => document.documentId));
  if (documentIds.size !== index.documents.length) {
    errors.push("private-research document identity is duplicated");
  }
  for (const term of index.terms) {
    if (term.documentFrequency !== term.postings.length) {
      errors.push(`term ${term.term} document frequency mismatch`);
    }
    if (
      term.totalFrequency
      !== term.postings.reduce((sum, posting) => sum + posting.frequency, 0)
    ) {
      errors.push(`term ${term.term} total frequency mismatch`);
    }
    for (const posting of term.postings) {
      if (!documentIds.has(posting.documentId)) {
        errors.push(`term ${term.term} references unknown document`);
      }
      if (
        posting.frequency !== posting.tokenIndexes.length
        || posting.frequency !== posting.charStarts.length
        || posting.frequency !== posting.charEnds.length
      ) {
        errors.push(`term ${term.term} posting shape mismatch`);
      }
    }
  }
  for (const binding of index.editionBindings) {
    const editionErrors = verifyAsoiafLocalEdition(
      root,
      binding.sourceId,
      binding.editionId,
    );
    errors.push(...editionErrors.map((error) => `${binding.editionKey}: ${error}`));
  }
  if (errors.length === 0) {
    try {
      const allEditions = [
        ...index.editionBindings,
        ...index.skippedEditions,
      ];
      const rebuilt = compileAsoiafPrivateResearchIndex({
        root,
        generatedAt: index.generatedAt,
        sourceIds: [...new Set(allEditions.map((edition) => edition.sourceId))],
        editionKeys: allEditions.map((edition) => edition.editionKey),
      });
      if (rebuilt.indexFingerprint !== index.indexFingerprint) {
        errors.push("private-research index no longer matches private edition custody");
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return [...new Set(errors)].sort();
}

export function writeAsoiafPrivateResearchReceipt(
  root: string,
  generatedAt = new Date().toISOString(),
  outputPath?: string,
): AsoiafPrivateResearchReceipt {
  const paths = privateResearchPaths(root);
  const index = readAsoiafPrivateResearchIndex(root);
  const errors = verifyAsoiafPrivateResearchIndex(root);
  const core: Omit<AsoiafPrivateResearchReceipt, "receiptFingerprint"> = {
    format: ASOIAF_PRIVATE_RESEARCH_RECEIPT_FORMAT,
    generatedAt,
    indexFingerprint: index.indexFingerprint,
    editionCount: index.editionBindings.length,
    skippedEditionCount: index.skippedEditions.length,
    documentCount: index.documentCount,
    termCount: index.termCount,
    totalTokenCount: index.totalTokenCount,
    errorCount: errors.length,
    passed: errors.length === 0,
    graphEffect: "none",
    canonEffect: "none",
  };
  const receipt: AsoiafPrivateResearchReceipt = {
    ...core,
    receiptFingerprint: sha256(core),
  };
  writeJsonAtomic(outputPath ?? paths.receipt, receipt);
  return receipt;
}
