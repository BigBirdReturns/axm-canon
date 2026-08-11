# ASOIAF private research index

The private research index turns holder-controlled edition locators into a deterministic local retrieval surface. It is a search and navigation actor. It may identify exact editions, chapters, paragraphs, term positions, phrase matches, and bounded private snippets. It cannot convert a match into a proposition, assign evidentiary authority, resolve a continuity dispute, or promote anything into canon.

The index is built only from editions previously admitted through the holder-controlled local-edition intake. That intake has already bound the atlas source identity, holder-selected edition identity, exact source digest, collector observation, package structure, unit order, paragraph ranges, and private normalized-text custody. The search actor refuses an edition whose manifest, collector observation, unit, segment, private index, text digest, or locator verification fails.

## Private estate surfaces

```text
private-research/
  PRIVATE-RESEARCH-INDEX.json
  PRIVATE-RESEARCH-RECEIPT.json
```

The index is part of the holder-controlled local estate and is not a public Git artifact. It contains normalized search terms and positional postings because exact phrase and paragraph retrieval require local full-text structure. It does not contain paragraphs, chapter text, the original book path, or the original filename. Every document points back to one edition key, continuity, unit identity, paragraph identity, digest, and bounded locator.

Each indexed paragraph becomes one research document with:

```text
source and edition identity
continuity identity
unit and paragraph identity
unit label and order
paragraph locator
paragraph SHA-256
character, word, and token counts
graphEffect = none
canonEffect = none
```

Each normalized term contains document frequency, total frequency, and postings. A posting records the paragraph identity, term frequency, token positions, and character ranges within that paragraph. The index fingerprint binds the edition-manifest fingerprints, source digests, document plane, term plane, skipped-edition ledger, generation time, and authority boundary.

Digest-only editions remain represented as skipped editions with an explicit reason. They retain source and locator custody but cannot enter full-text search without private normalized text.

## Query semantics

The query actor supports three deterministic modes:

```text
all      every distinct query term must occur in one paragraph
any      at least one query term must occur
phrase   the complete normalized token sequence must occur contiguously
```

Results are ranked with a bounded term-frequency and inverse-document-frequency score plus an exact-phrase bonus. Stable ties resolve by source, edition, unit, paragraph, and document identity. Filters can constrain source IDs, edition keys, and continuity IDs so a query cannot silently blend holder editions or adaptation continuities.

A default search result contains no text. It returns the source, edition, continuity, unit, paragraph, exact locator, matched terms, token positions, score, and query receipt. `--include-text` is a separate explicit local transaction. When enabled, the query actor reopens the private unit, verifies the paragraph digest, and returns only a bounded snippet around the first match. The snippet receives its own SHA-256 digest. Query text is represented in the receipt by a digest rather than copied into durable verification receipts.

## Verification

Verification checks the index format and fingerprint, graph and canon effects, declared document and term counts, total token count, unique document identity, term frequencies, posting shapes, posting-to-document references, every bound local-edition estate, and exact agreement with a fresh deterministic rebuild at the original generation time.

Private text drift invalidates the underlying edition verification and therefore invalidates the research index. A stale index cannot remain qualified merely because its JSON fingerprint is internally consistent.

## Operator transactions

```bash
npm run asoiaf:private-research -- build \
  --root .asoiaf-external-estate \
  --at 2026-08-04T00:00:00.000Z

npm run asoiaf:private-research -- search \
  --root .asoiaf-external-estate \
  --query 'weirwood silence' \
  --mode all \
  --source local-agot

npm run asoiaf:private-research -- search \
  --root .asoiaf-external-estate \
  --query 'red priestess' \
  --mode phrase \
  --include-text \
  --context-chars 180

npm run asoiaf:private-research -- verify \
  --root .asoiaf-external-estate

npm run asoiaf:private-research -- receipt \
  --root .asoiaf-external-estate \
  --at 2026-08-04T00:00:00.000Z
```

Repeated `--source`, `--edition`, and `--continuity` options form explicit filters. Returned matches remain research leads. A later reviewed reconciliation packet must select a bounded claim, bind the exact collector observation and paragraph locator, record the reviewer and rights decision, assign a legal authority role, identify the candidate being adjudicated, and pass the existing all-or-nothing reconciliation compiler.

The evidence tier is deterministic private retrieval qualification over synthetic holder-controlled editions. The venue is the local edition estate. The target is exact-edition navigation, term and phrase retrieval, digest-bound snippets, filtering, and stale-index refusal. The upside is fast corpus-scale research without losing edition or locator identity. The downside is local index storage and edition-specific normalization. The failure mode is treating search rank, term co-occurrence, or a returned snippet as a reviewed claim.

The control question is whether every research hit can disclose the exact edition, source digest, collector observation, continuity, unit, paragraph digest, locator, query mode, and optional snippet digest while remaining visibly incapable of deciding what the passage means.
