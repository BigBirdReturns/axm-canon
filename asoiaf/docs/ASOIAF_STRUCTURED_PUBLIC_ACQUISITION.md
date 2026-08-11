# ASOIAF structured public acquisition

This branch implements the live acquisition actor above the qualified structured public-source adapters and beneath reviewed reconciliation. It executes only exact signed request plans produced by the registered Wikidata, Open Library, Crossref, and A Wiki of Ice and Fire adapters. It does not accept arbitrary URLs, does not retain raw responses, and cannot grant graph or canon authority to an acquired record.

## Transaction boundary

The adapter layer defines the official endpoint, source identity, HTTP method, response type, record ceiling, headers, and request-plan fingerprint. The acquisition actor validates that complete plan before any network transaction. A valid plan must remain an HTTPS `GET`, stay on the registered host and path, preserve the adapter-to-source mapping, contain no credentials or fragments, declare bounded JSON, and retain `graphEffect=none` and `canonEffect=none`.

The registered endpoint surface is deliberately narrow:

```text
Wikidata       https://query.wikidata.org/sparql
Open Library   https://openlibrary.org/search.json
               https://openlibrary.org/works/<key>.json
               https://openlibrary.org/books/<key>.json
Crossref       https://api.crossref.org/works[/<doi>]
AWOIAF         https://awoiaf.westeros.org/api.php
```

A signed plan cannot be repurposed for another source, adapter, host, path, authorization header, cookie, or API key by recomputing its fingerprint. The acquisition validator checks the semantic registration independently of the digest.

## Network policy

Every transaction begins with the origin `robots.txt`. A denial prevents the structured request. An unavailable robots surface is an explicit terminal error rather than permission inferred from failure. A missing `robots.txt` at HTTP 404 or 410 is recorded as absent. The parser applies the most specific matching user-agent group, longest matching path rule, allow-over-disallow tie behavior, and any declared crawl delay.

The request runtime enforces the greater of the source atlas host-delay floor and the robots crawl delay. The default atlas floor is 1,500 milliseconds. One pacer is shared across a sequential batch, including robots and data requests, so plan boundaries cannot reset host timing. HTTP 429 and server errors use bounded retries, honor `Retry-After`, and otherwise apply bounded exponential backoff. Redirects are manual, HTTPS-only, same-origin, bounded in count, and revalidated against the registered endpoint before they are followed.

Responses must be successful JSON or a registered JSON derivative. Declared and streamed response sizes are checked against the exact source policy. Invalid media, malformed JSON, oversize bodies, credential blocks, unavailable routes, redirects outside the endpoint, and exhausted transient failures produce honest terminal receipts and collector gaps.

## Raw and normalized custody

The response stream is hashed as raw UTF-8 or binary bytes before JSON decoding. The raw response SHA-256 and byte count enter the acquisition receipt and are passed into the adapter transaction. The adapter therefore binds each normalized record to the actual network response digest rather than a reserialized JavaScript object.

Raw response bytes are discarded after parsing. The adapter retains only its rights-approved normalized record. Wikidata remains CC0 structured supporting evidence. Open Library remains bibliographic metadata. Crossref excludes abstracts, affiliations, private contact surfaces, and full text. AWOIAF retains metadata by default and bounded page text only when the operator explicitly enables the CC BY-SA text transaction. The existing collector writes content-addressed normalized records, observations, candidates, attempts, cache entries, attribution projections, and adapter receipts.

The acquisition layer writes a separate append-only receipt containing:

```text
request-plan fingerprint
adapter and atlas source identity
request identity and requested/final URL
robots URL, decision, and digest
request, wait, retry, and redirect counts
HTTP status and response media type
raw response byte count and SHA-256
adapter receipt fingerprint
observation and candidate identities
terminal outcome and collector gap identity
rawResponseRetained=false
graphEffect=none
canonEffect=none
```

## Completion and replay

Successful `observed` or `partial` transactions enter a fingerprinted local completion state. Re-executing the same request identity and exact plan fingerprint returns a zero-network cache replay unless `--refresh` is explicit. A replay receives its own valid acquisition receipt and attempt record while retaining the original response, adapter, observation, and candidate custody. A missing, altered, or mismatched prior receipt invalidates replay.

The completion state is a disposable projection over append-only receipts. Verification checks its fingerprint, unique request identities, safe receipt paths, successful outcome constraints, request-plan and receipt parity, authority boundaries, raw-response non-retention, and the complete collector estate. Collector attempt projections remain reconciled with the append-only attempt ledger.

## Operator surface

Build a request plan with the qualified adapter CLI, save it as JSON, then validate or execute it:

```bash
npm run asoiaf:structured-adapter -- plan \
  --adapter awoiaf-mediawiki \
  --request-id awoiaf:varys \
  --title Varys \
  > request-plan.json

npm run asoiaf:structured-acquisition -- validate \
  --plan request-plan.json

npm run asoiaf:structured-acquisition -- execute \
  --root .asoiaf-external-estate \
  --plan request-plan.json
```

Execute a sequential batch with one shared host pacer:

```bash
npm run asoiaf:structured-acquisition -- batch \
  --root .asoiaf-external-estate \
  --plan request-plan-a.json \
  --plan request-plan-b.json
```

Inspect or verify the local estate:

```bash
npm run asoiaf:structured-acquisition -- status \
  --root .asoiaf-external-estate

npm run asoiaf:structured-acquisition -- verify \
  --root .asoiaf-external-estate
```

No production network request runs in repository CI. The qualification suite uses synthetic `Response` objects and a deterministic runtime clock to prove endpoint confinement, robots denial, host pacing, `Retry-After`, retry ceilings, same-origin redirect control, response-size refusal, invalid-media refusal, raw digest binding, adapter integration, attribution, cache replay, batch pacing, state tamper detection, and collector parity.

The evidence tier is structured acquisition, normalization, and custody qualification. The venue is the holder-controlled external collector estate. The target is official-interface confinement, network policy, raw-response identity, rights-aware normalization, receipt completeness, and replay integrity. The upside is unattended low-volume acquisition whose exact route and retained result remain inspectable. The downside is source-specific endpoint and schema maintenance. The failure mode is either allowing a request plan to escape its registered interface or treating a successful fetch as authority to settle an ASOIAF claim.

The control question is whether every normalized public record can disclose which signed plan authorized the request, which robots and pacing rule governed it, which exact raw response supplied it, which fields and rights rule survived normalization, and why neither acquisition nor availability allowed the record to bypass reviewed reconciliation.
