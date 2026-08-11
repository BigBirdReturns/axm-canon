# ASOIAF external collector

This branch implements bounded acquisition and holder-controlled custody beneath the qualified ASOIAF external-source atlas. It is the collector actor in the three-plane fanout. It may initialize the local estate, plan work, fetch a bounded public record, stream-hash a holder-supplied file, preserve immutable observations and receipts, append candidate revisions, maintain disposable caches, record honest terminal results, and generate required public attribution. It cannot review or promote a claim into canon.

## Local estate

The collector materializes the surfaces named by the atlas provenance lineage:

```text
SOURCE-LEDGER.json
observations.ndjson
candidates.ndjson
gaps.ndjson
attempts.ndjson
state.json
receipts/
cache/
CREDITS.md
CREDITS.json
CREDITS.bib
```

`SOURCE-LEDGER.json` is a mutable control projection with one row for every one of the 219 registered sources. It records the current terminal status, source and work-order fingerprints, rights and collection modes, timestamps, refresh eligibility, counts, latest content identity, and credit state. The observation, candidate, gap, and attempt ledgers are append-only. Receipts are content-addressed immutable files. Caches are disposable projections and never become evidence without the corresponding observation and receipt.

## Identity and revision law

A candidate is stable across source revisions because its identity derives from the atlas source identity and the durable upstream source-record identifier. An observation adds the exact SHA-256 digest of the retrieved record. A changed upstream record therefore appends a new observation to the same candidate. The current candidate projection lists all observation IDs and points to the latest observation without erasing prior source states.

Every collector object fixes `graphEffect` and `canonEffect` to `none`. Candidate promotion status remains `intake-only`. The collector has no API that emits a canon review decision.

## Network collection

Network collection is single-threaded by the caller and applies a per-host 1,500 millisecond delay. The user agent names the tool, repository, and contact surface. The collector checks `robots.txt`, follows the most specific applicable allow or disallow rule, honors `Retry-After`, retries transient failures within the source work-order ceiling, rejects a declared or actual response larger than the source limit, and accepts HTTPS locators only.

A route-only source creates a terminal gap and performs no request. A source requiring a local copy or unavailable credential is blocked before network activity. Missing record-specific locators remain explicit gaps. Failed, blocked, unavailable, oversize, and privacy-rejected attempts all receive receipts and advance the round-robin cursor.

The cache index is keyed by source identity and durable source-record identity. A completed record replays the retained observation without another request unless refresh is explicit. This implements the UnderCast rule that a completed endpoint is not repeatedly hammered.

## Rights and privacy

The atlas rights and harvest modes govern retention. User-held editions are stream-hashed and never copied into the estate. The observation records byte count, source identity, durable edition identity, digest, and custody class, but no local path, filename, or payload.

Public raw bodies are retained only when the source declares public domain, CC0, CC BY, or CC BY-SA. Metadata-and-bounded-excerpt sources retain only their authorized excerpt ceiling. Metadata-only sources retain no body. Route-only sources retain no body or excerpt. Before any body or excerpt is written, the collector rejects email addresses, phone or mobile fields, street or mailing addresses, and point-of-contact fields.

## Attribution

The complete provenance surface remains the 219-row source ledger and append-only observations. Public credit is narrower. `CREDITS.md`, `CREDITS.json`, and `CREDITS.bib` include only retained observations from CC BY or CC BY-SA sources. Publisher-copyright, link-only, CC0, public-domain, private-copy, and unresolved-rights sources remain visible in the machine ledger without being manufactured into a public credits roll.

## Operator commands

```bash
npm run asoiaf:external:collector -- init --root .asoiaf-external-estate
npm run asoiaf:external:collector -- status --root .asoiaf-external-estate
npm run asoiaf:external:collector -- plan --root .asoiaf-external-estate --limit 20
npm run asoiaf:external:collector -- collect --root .asoiaf-external-estate --source structured-wikidata --record-id wikidata:Q1 --target https://example.invalid/Q1.json
npm run asoiaf:external:collector -- collect-local --root .asoiaf-external-estate --source local-agot --record-id isbn:exact-holder-copy --file /holder/path/book.epub
npm run asoiaf:external:collector -- credits --root .asoiaf-external-estate
npm run asoiaf:external:collector -- verify --root .asoiaf-external-estate
npm run asoiaf:external:collector -- receipt --root .asoiaf-external-estate --out collector-receipt.json
```

The CLI requires an explicit source identity. Public collection may additionally require a record-specific HTTPS locator and durable record identifier. Local collection requires an explicit holder-supplied file and durable edition identity. The file path is consumed only by the streaming hash transaction.

## Qualification boundary

The focused qualification proves the 219-row initialization, authority-free ledgers, route-only refusal to fetch, local path and payload non-retention, the host-delay floor, `Retry-After`, bounded response size, private-contact rejection, append-only source revisions, cache replay, selective attribution, work planning, and complete estate verification. The permanent workflow also runs strict TypeScript, the complete axm-canon test suite, the production build, a CLI smoke transaction, and a deterministic collector receipt.

The evidence tier is collector-mechanism qualification over synthetic and local fixtures. The venue is this stacked draft. The target is acquisition and custody behavior, not the truth of an ASOIAF claim and not evidence that all 219 sources have already been collected. The upside is an unattended collection floor that preserves every source transition and refuses to acquire canon authority. The downside is source-specific normalization work, unavailable endpoints, rights review, and accumulated human triage. The failure mode is any path by which a fetch result, cache file, familiar label, or model-generated normalization becomes a reviewed canon proposition without the reconciliation-packet plane.

The control question is whether the collector can keep working for years while every byte it retains remains attributable, bounded, revisable, privacy-minimized, rights-compliant, and visibly incapable of writing canon.
