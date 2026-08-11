# ASOIAF external source health

This branch implements the maintenance actor over the qualified source atlas and collector estate. It does not fetch source bodies and it does not review or promote canon claims. It audits the 219-source machine ledger, computes source freshness and refresh eligibility, records append-only route, robots, terms, and availability observations, identifies rights-review work, reconciles cache and receipt custody, detects attribution debt or overreach, and emits a bounded deterministic work plan.

## Health surfaces

The source-health actor adds four local projections to the collector estate:

```text
source-health-observations.ndjson
SOURCE-HEALTH.json
SOURCE-HEALTH.md
refresh-plan.json
```

The observation ledger is append-only. The JSON and Markdown health reports and the refresh plan are disposable projections. None has graph or canon effect. `SOURCE-LEDGER.json` remains the complete current source-control projection, while the collector observation, candidate, gap, attempt, receipt, and cache surfaces remain the underlying custody record.

## Source state

Every registered source is classified as one of:

```text
never-attempted
fresh
due
blocked
rights-review
unavailable
retired
integrity-error
```

The classification does not convert source availability into evidence quality. It answers whether a source has entered collection, whether its current route and retained state remain usable, whether the source is due for a bounded refresh, and whether a human must repair rights, cache, credit, or ledger custody before further collection.

Observed sources use the source-specific atlas refresh interval. Route-only sources receive a 180-day route-health cadence so the scheduler does not repeatedly revisit navigation-only endpoints. Unavailable sources return after 30 days. Transient errors return after seven days. Robots blocks return after 90 days. Oversize responses return after 30 days. Privacy-rejected responses return after 180 days. Credential and rights blocks require explicit operator review rather than automatic repeated requests. Holder-controlled local sources never enter an automatic network cadence.

## Route and policy drift

A source-health observation can record the target URI, availability status, HTTP status, route digest, robots digest, terms digest, and operator notes. The latest two observations are compared for each source. A changed route, availability result, robots identity, or terms identity creates a drift warning and an `inspect-drift` work item. A terms-review or rights-blocked source enters the named rights-review queue. A robots denial remains blocked and does not become a collection task.

Route observations fix graph and canon effects to `none`. They establish that a public surface changed or remained available. They do not establish any fictional, historical, authorial, or production claim found on that surface.

## Estate parity

The audit reconciles the mutable source-ledger counts against append-only observations, current candidates, gaps, attempts, and public credit records. It refuses duplicate or missing source rows, unknown sources, authority leakage, collector-side promotion, missing candidate observations, missing receipts, and stale source projections.

The cache index is checked against exact observations and retained files. The audit detects missing observations, source or digest mismatch, unsafe paths, missing indexed files, and orphan cache files. A retained structured body is valid only when the atlas rights mode is public domain, CC0, CC BY, or CC BY-SA.

## Attribution control

The health actor audits both sides of the credit boundary. A retained CC BY or CC BY-SA observation must contain attribution metadata and appear exactly once in the public credit projection. A public credit must point to a real observation from the same source. CC0, public-domain, publisher-copyright, link-only, unresolved-rights, and holder-controlled sources must not be added to the visible credits merely to make the list look complete.

The complete provenance surface therefore remains broader than the public credit surface. Missing required attribution is debt. Unnecessary public credit is overreach. Both create explicit repair tasks.

## Refresh and repair plan

The deterministic plan emits tasks from the following vocabulary:

```text
collect
request-local-custody
refresh-route
review-rights
review-block
inspect-drift
repair-cache
repair-credit
repair-ledger
```

Integrity repairs outrank collection. Rights review and route drift outrank ordinary refresh. Never-attempted public sources become bounded collection tasks. Never-attempted holder-controlled editions become local-custody requests rather than attempts to discover private files. The plan is sorted by priority, due time, source identity, and task type, then clipped to the requested task ceiling.

No task creates a claim, graph edge, canon proposition, review decision, or publication approval. The planner controls maintenance order only.

## Operator commands

```bash
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- init --root .asoiaf-external-estate
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- audit --root .asoiaf-external-estate --at 2026-08-04T00:00:00Z
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- plan --root .asoiaf-external-estate --limit 40
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- report --root .asoiaf-external-estate
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- observe-route --root .asoiaf-external-estate --source grrm-not-a-blog --target https://georgerrmartin.com/notablog/ --status available --http-status 200
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- verify --root .asoiaf-external-estate
npx vite-node asoiaf/tools/asoiaf-external-source-health.ts -- receipt --root .asoiaf-external-estate --out source-health-receipt.json
```

The `observe-route` transaction accepts optional route, robots, and terms SHA-256 digests. It appends an observation and does not rewrite earlier route history.

## Scheduled operation

The permanent workflow runs on a weekly schedule with read-only repository permissions. It initializes a temporary 219-source estate, builds the health report and bounded plan, verifies the estate, runs focused and complete tests, builds the product, and uploads the report as an artifact. It contains no `git add`, `git commit`, or `git push` operation. Production estates remain holder-controlled and are not committed by the scheduled qualification.

The evidence tier is source-health and maintenance-mechanism qualification. The venue is this stacked draft. The target is source availability, refresh, rights, cache, receipt, ledger, and attribution control, not a claim that all registered sources are healthy or already collected. The upside is a collector that can operate for years without forgetting failed endpoints, silently losing receipts, accumulating invisible attribution debt, or repeatedly hammering completed routes. The downside is explicit maintenance work and unresolved rights queues. The failure mode is either allowing a stale or corrupted source projection to feed review, or mistaking a healthy route for authoritative evidence.

The control question is whether every source can age, move, fail, recover, change terms, accumulate debt, or retire while its complete history and current collection eligibility remain mechanically distinguishable from its evidentiary authority.
