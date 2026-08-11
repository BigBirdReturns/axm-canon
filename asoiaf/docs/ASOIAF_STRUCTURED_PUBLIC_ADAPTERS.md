# ASOIAF structured public adapters

The structured-adapter plane converts bounded JSON responses from explicitly registered public metadata and reference services into content-addressed collector observations. It operates after acquisition and before reviewed reconciliation. The adapter may normalize, whitelist, attribute, cache, and receipt a structured record. It cannot settle an ASOIAF claim, create a graph edge, assign primary fictional authority, or bypass the reviewed reconciliation-packet plane.

The initial adapters cover four source families:

```text
wikidata-sparql       structured-wikidata
openlibrary-catalog   structured-openlibrary-api
crossref-works        structured-crossref-api
awoiaf-mediawiki      structured-awoiaf-api
                      structured-awoiaf-category-api
                      structured-awoiaf-search-api
```

Every adapter verifies that the requested source identity is registered for that adapter, that the atlas grants an explicit structured-retention rights mode, and that the source work order uses `structured-cache-with-attribution`. Registration is still not authority. All normalized records, observations, candidates, attempts, caches, and receipts fix graph and canon effects to `none`; collector candidates remain `intake-only`.

## Official interfaces and operating constraints

Wikidata plans target the Wikidata Query Service SPARQL endpoint and request `application/sparql-results+json`. A plan must use `SELECT` and carry an explicit `LIMIT`. The adapter records bindings as CC0 structured metadata and never treats a Wikidata entity or relation as primary ASOIAF evidence.

Open Library plans use the current JSON work, edition, or bounded search interfaces. The adapter is intended for low-volume, human-directed lookups, not bulk harvesting. It retains catalog facts such as Open Library keys, titles, authors, publishers, publication dates, identifiers, languages, and subjects. Descriptions and other free-text book content are excluded.

Crossref plans use the REST works endpoint, identify the client through the shared collector user agent and `mailto`, and retain public bibliographic metadata. DOI identity, titles, author names, publication dates, containers, publishers, identifiers, counts, relations, and license URLs may be retained. Abstracts, affiliations, addresses, emails, and full-text links are excluded from the normalized record because Crossref metadata licensing does not convert publisher-controlled abstracts or linked full text into public-domain content.

A Wiki of Ice and Fire plans use the MediaWiki Action API with `formatversion=2`, bounded page selection, and one revision per page. Text contribution is treated as CC BY-SA only on the registered text surface. File and media routes are excluded because individual media licenses are separate. Page text is opt-in and bounded; metadata-only normalization is the default. Every retained AWOIAF observation carries visible attribution to the contributors and a revision-specific source URL.

The request-plan functions do not perform acquisition. They produce deterministic GET URLs, headers, record ceilings, and fingerprints. The existing collector remains responsible for robots policy, host-delay enforcement, `Retry-After`, retry ceilings, response-size ceilings, and honest network terminals. The adapter can also operate on holder-supplied or previously downloaded JSON fixtures without network access.

## Normalized record custody

Each normalized record binds:

```text
adapter identity
atlas source identity
durable upstream record identity
record type and title
canonical or revision-specific URI
source-response SHA-256
whitelisted normalized fields
required attribution metadata
normalized-record SHA-256
record identity
graphEffect = none
canonEffect = none
```

The raw response digest remains distinct from the normalized-record digest. A source response can contain several records, while each record receives its own stable source-record identity and observation. If the normalized form changes for the same upstream identity, the collector appends a new observation to the existing candidate.

Normalized records are stored under the collector cache in a content-addressed `structured-normalized/<source-id>/` namespace. The collector cache index binds each upstream source-record identity to the exact normalized digest and observation. The adapter writes a separate request-level receipt containing the raw response digest and byte count, input and committed record counts, observation and candidate identities, rejected rows, terminal outcome, and receipt fingerprint.

## Source-specific normalization

### Wikidata

A SPARQL binding is canonicalized by variable name. Each retained value preserves the RDF result type, value, optional datatype, and optional language. Variables with contact-shaped names are omitted, and a remaining private-contact result refuses the row. A Wikidata entity URI supplies a QID and canonical entity route when available. The source remains a structured-dataset observation.

### Open Library

The adapter accepts single work or edition objects and bounded search result sets. Stable identity comes from the Open Library key, edition key, or ISBN. Retained fields are bibliographic only. Description, excerpts, covers, and book text do not enter the record.

### Crossref

Stable identity is the lowercase DOI. The adapter whitelists bibliographic facts and strips author affiliations, email or address fields, abstracts, and full-text payloads. License metadata may be retained as metadata. A Crossref record can support publication, edition, bibliography, and analogue research, but cannot become primary fictional evidence.

### A Wiki of Ice and Fire

Stable identity binds page ID and latest revision ID. Retained metadata can include namespace, title, revision time, length, scalar page properties, category titles, non-file link titles, and bounded revision metadata. Page text is absent unless `includeText` is explicit. When enabled, it is normalized and clipped to the configured character ceiling. Files and media are always excluded from this adapter.

## Attribution boundary

Wikidata and Crossref normalized metadata produce no visible credit record under the current CC0 and public-metadata policies. Open Library catalog metadata likewise remains in the complete provenance ledger without decorative visible credit. A retained AWOIAF record produces exactly one CC BY-SA credit linked to the revision-specific page route. The collector regenerates `CREDITS.md`, `CREDITS.json`, and `CREDITS.bib` from the observation ledger, so missing required attribution and unnecessary attribution remain mechanically visible.

## Operator transactions

```bash
npm run asoiaf:structured-adapter -- plan \
  --adapter wikidata-sparql \
  --request-id wikidata:asoiaf-books \
  --query 'SELECT ?item ?itemLabel WHERE { ?item wdt:P31 wd:Q7725634. } LIMIT 25'

npm run asoiaf:structured-adapter -- normalize \
  --adapter openlibrary-catalog \
  --source structured-openlibrary-api \
  --request-id openlibrary:agot \
  --source-uri 'https://openlibrary.org/search.json?q=agot' \
  --file response.json

npm run asoiaf:structured-adapter -- commit \
  --root .asoiaf-external-estate \
  --adapter awoiaf-mediawiki \
  --source structured-awoiaf-api \
  --request-id awoiaf:varys \
  --source-uri 'https://awoiaf.westeros.org/api.php?...' \
  --file response.json \
  --at 2026-08-04T00:00:00.000Z
```

`--include-text` is available only for the AWOIAF adapter and should remain off unless the collection transaction has an identified reason to retain bounded CC BY-SA page text. The normalized record and receipt never include the local JSON input path or filename.

## Evidence ledger

The evidence tier is structured-normalization and custody qualification over synthetic fixtures shaped like official API responses. The venue is the external collector estate. The target is stable upstream identity, whitelisted field retention, source-response and normalized-record digests, rights-aware caching, required attribution, privacy rejection, and append-only revisions. The upside is reusable machine-readable metadata without conflating search convenience with canon. The downside is schema drift, source-specific adapter maintenance, and explicit rights review. The failure mode is either retaining publisher-controlled text through a metadata route or allowing a structured reference record to adjudicate a fictional claim.

The control question is whether every structured value can disclose which official interface returned it, which fields were retained or excluded, which rights and attribution rule applied, which raw and normalized digests bound it, and why the record still lacked authority to settle canon.
