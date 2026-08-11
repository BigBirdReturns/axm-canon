# ASOIAF structured public acquisition canary

The live canary is an artifact-only operating transaction over the qualified structured acquisition actor. It executes one bounded, human-selected request plan for each registered adapter family, preserves every honest terminal outcome, verifies the resulting holder-controlled collector estate, and uploads the complete normalized custody package without committing collected records to Git.

The canary is not a second qualification suite and it does not grant availability, successful acquisition, normalization, or structured reference data any canon authority. Synthetic qualification established the mechanism. The canary observes how the mechanism behaves against the current Wikidata, Open Library, Crossref, and A Wiki of Ice and Fire interfaces under their live robots, routing, pacing, response, and schema conditions.

## Request set

The canary uses four low-volume plans:

```text
Wikidata SPARQL
  one SELECT query for the English label "Varys"
  record limit 1

Open Library
  one catalog search for A Game of Thrones by George R. R. Martin
  record limit 1

Crossref
  one works query for A Song of Ice and Fire
  record limit 1

A Wiki of Ice and Fire MediaWiki
  one metadata-only title lookup for Varys
  record limit 1
  includeText = false
```

Each plan is produced by the qualified adapter planner, carries its own request identity and plan fingerprint, and is validated before any network transaction. Batch execution remains sequential and shares the qualified host pacer. No credential, cookie, API key, authorization header, fragment, non-HTTPS route, cross-origin redirect, raw response body, publisher-controlled book text, Crossref abstract, affiliation, address, email, or AWOIAF page text is retained.

## Operating result

The workflow binds the exact canary branch head, requires a clean repository worktree before acquisition, and proves that the worktree remains clean after every artifact-only transaction. The temporary collector estate and every diagnostic or summary file remain under the runner temporary directory.

The workflow does not require every endpoint to return a successful record. Robots denial, route unavailability, oversize response, invalid media, malformed JSON, no normalized records, or another bounded terminal is an observed source result rather than a CI defect. The workflow itself succeeds only when plan generation and validation complete, the acquisition runner terminates honestly, the resulting collector and acquisition estate verifies, the raw response remains absent, and the artifact package is complete.

The retained custody directory contains:

```text
four signed request plans
batch stdout and stderr
batch exit status
acquisition status and verification outputs
collector source ledger
collector observations, candidates, gaps, and attempts
content-addressed normalized records permitted by source rights
adapter receipts
acquisition receipts
fingerprinted successful-request state
selective public attribution records
machine canary summary
SHA256SUMS over every retained artifact file
```

The exact raw response SHA-256 and byte count remain in the adapter and acquisition receipts. Raw response bytes are discarded after normalization and are not uploaded. A successful unchanged plan may later replay from its fingerprinted state with zero requests, but each canary execution begins from an empty temporary estate.

## Portable custody envelope

Collector receipt identities contain colons because they are content-addressed semantic identifiers. GitHub's artifact uploader rejects colon-bearing paths to preserve compatibility with filesystems such as NTFS. The workflow therefore verifies the complete custody directory internally, wraps it in a single deterministic tar and gzip envelope, computes a separate SHA-256 over that envelope, and uploads only the portable tar file plus its checksum file.

The tar envelope preserves every original filename and internal `SHA256SUMS` entry. Its archive construction fixes file order, owner, group, numeric ownership, modification time, and gzip timestamp behavior. GitHub supplies a second digest over the uploaded artifact ZIP. The durable receipt therefore binds three layers:

```text
internal SHA256SUMS for the collector estate and canary files
SHA-256 for the portable tar and gzip envelope
GitHub artifact ZIP digest and artifact identity
```

Maintenance commits marked `[no-live-canary]` are explicitly excluded from source acquisition. They may repair packaging or reporting without issuing another request set. A live run requires an unmarked operating-contract or workflow commit, or an explicit manual dispatch.

## Authority boundary

The canary records endpoint behavior and retained structured observations. It cannot create a reviewed claim, select a canon candidate, interpret a value, resolve a continuity, or invoke `confirm`, `correct`, `split`, `merge`, `reject`, or `defer`. Any retained observation remains `intake-only` until it enters the separately qualified named-review and reconciliation transaction.

The evidence tier is a live operating canary over a previously qualified mechanism. The venue is an ephemeral GitHub Actions runner with an artifact-only holder-controlled estate. The target is live route, robots, pacing, response, normalization, receipt, and collector behavior rather than comprehensive source collection or ASOIAF truth. The upside is current interface evidence with complete custody. The downside is endpoint and schema variability. The failure mode is interpreting a successful or failed canary request as a statement about canon, source quality, or permanent availability.

This revision authorizes the final portable-envelope canary after the original source transaction proved the actor but exposed the artifact uploader's cross-platform path restriction. The replacement run is a new bounded operating observation. It is not a replay of the missing runner filesystem and does not alter the authority boundary.

The control question is whether each live request can end in an honest, bounded, content-addressed portable artifact that proves what route and policy governed it, what response identity was observed, what normalized values survived rights controls, and why the result still lacked authority to settle any ASOIAF claim.