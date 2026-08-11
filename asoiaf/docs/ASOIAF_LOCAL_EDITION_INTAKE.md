# ASOIAF holder-controlled local-edition intake

The local-edition intake converts a reader-controlled copy of an ASOIAF primary or companion text into a deterministic private locator estate. Its purpose is to give exact editions machine-readable custody without placing copyrighted source text, local filesystem identity, or user filenames into public Git.

The intake actor sits beneath the external collector and before reviewed reconciliation packets. It may establish source identity, edition identity, content digest, package structure, chapter order, paragraph boundaries, local text custody, and exact locators. It cannot decide that a parsed statement is true, resolve a continuity conflict, assign a claim authority role, or promote a record into canon.

## Supported inputs

The bounded parser accepts UTF-8 plain text, HTML, and EPUB. Plain text is divided at explicit chapter, prologue, epilogue, part, book, appendix, or all-uppercase heading lines when at least two such boundaries are present. HTML becomes normalized private text with structural paragraph boundaries. EPUB intake parses the ZIP central directory, refuses encrypted, ZIP64, multi-disk, traversal, unsupported-compression, excessive-entry, and excessive-expansion archives, resolves `META-INF/container.xml`, reads the OPF manifest and spine, follows the navigation document where available, and processes only readable HTML or XHTML spine members.

The parser does not attempt DRM circumvention. An encrypted, malformed, unsupported, or unbounded package is an honest refusal.

## Custody surfaces

Each edition is stored beneath a deterministic estate key derived from the atlas source identity and the holder-selected edition identity:

```text
local-editions/<edition-key>/
  edition-manifest.json
  units.ndjson
  segments.ndjson
  edition-receipt.json
  private-text-index.json      # only when private text retention is enabled
  private-text/                # local-only normalized unit text
```

The manifest contains the logical atlas source, holder-selected edition identity, durable collector record identity, declared continuity, source byte count, source SHA-256 digest, detected format, bounded bibliographic metadata, unit and segment counts, collector observation identity, and estate-relative output identities. It fixes `sourcePathRetained` and `sourceFilenameRetained` to `false`. The source path and original filename are used only to read the holder-supplied input transaction and are rejected if they appear in the machine projections.

`units.ndjson` records ordered package or chapter units, labels, package-relative source parts, content digests, character and word counts, paragraph counts, segment identities, and bounded chapter locators. `segments.ndjson` records paragraph identities, character ranges within the normalized private unit, paragraph digests, counts, and locator identities. Neither surface contains paragraph text.

When private-text retention is enabled, normalized unit text is written with owner-only file mode where the platform supports it. `private-text-index.json` binds each private file to its unit identity, relative estate URI, byte count, and text digest. Disabling private-text retention preserves the manifest, unit, segment, digest, and locator planes while removing the extracted-text directory and index.

## Collector integration

Intake first verifies that the selected atlas source is `local-private-only`. It then invokes the existing collector local-custody transaction. The collector stream-hashes the original file, creates or updates the durable source-record candidate, appends a content-addressed observation for a changed edition, writes the receipt, and retains no source path, filename, or payload.

The default durable source-record identity is:

```text
local-edition:<atlas-source-id>:<holder-edition-slug>
```

The content digest is deliberately absent from that identity. A corrected or revised copy of the same logical edition therefore appends a new observation to the same candidate rather than inventing a second edition identity. The edition manifest points to the exact current collector observation.

## Verification

Verification recomputes the manifest fingerprint, reconciles declared counts, checks contiguous unit order, verifies every segment range against its unit, reconciles unit and segment identities, checks graph and canon effects, validates collector observation custody, and, when private text exists, recomputes every unit and paragraph digest from the private files. Missing files, unsafe relative paths, tampering, count drift, locator drift, source-digest mismatch, or collector-custody mismatch produce explicit errors.

The deterministic receipt binds the edition identity, source record, source digest, manifest fingerprint, collector observation, unit and segment counts, private-text retention status, verification time, and terminal pass or failure state.

## Operator transactions

```text
npm run asoiaf:local-edition -- intake \
  --root <collector-estate> \
  --source local-agot \
  --edition <stable-holder-edition-id> \
  --file <holder-controlled-path> \
  --at <ISO-8601-time>

npm run asoiaf:local-edition -- verify \
  --root <collector-estate> \
  --source local-agot \
  --edition <stable-holder-edition-id>

npm run asoiaf:local-edition -- list --root <collector-estate>

npm run asoiaf:local-edition -- locate \
  --root <collector-estate> \
  --source local-agot \
  --edition <stable-holder-edition-id> \
  --unit <unit-id> \
  --segment <segment-id>
```

`locate` returns structural metadata by default. Text is returned only when the operator adds `--include-text`, making disclosure an explicit local transaction rather than a default log surface.

## Authority boundary

The edition estate establishes exact local custody and locators. It does not convert extracted text into a canon record. A later reviewed reconciliation packet must identify the collector observation, choose bounded claims, attach exact locators, record the evidence and rights reviewer, assign a legal authority role, bind the target recall candidates, and pass the existing all-or-nothing reconciliation transaction.

The evidence tier is holder-controlled edition parsing and custody qualification. The venue is the private local estate. The target is deterministic source identity, package structure, locator generation, and non-disclosure. The upside is exact-edition retrieval and repeatable chapter-level work. The downside is local storage, edition-specific parser repair, and human review. The failure mode is any path by which extracted text, private filesystem identity, or a parser-generated proposition bypasses the reviewed reconciliation plane.

The control question is whether the system can answer which exact holder edition, source digest, package unit, paragraph digest, collector observation, and private locator underlies a later claim without placing the book or the holder's filesystem into public custody.
