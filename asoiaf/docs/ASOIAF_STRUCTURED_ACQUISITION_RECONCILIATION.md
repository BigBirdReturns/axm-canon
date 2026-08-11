# ASOIAF structured acquisition reconciliation custody

The structured-acquisition reconciliation binding is the custody bridge between policy-bounded public acquisition and the existing reviewed external reconciliation transaction. It does not fetch, normalize, review, or promote records. It receives the already completed request plan, acquisition receipt, adapter receipt, collector observation, named human review, rights decision, exact locator, and supporting claim packet, then proves that those objects describe one unbroken transaction before the claim can enter the existing evidence-bundle compiler.

The acquisition actor remains responsible for network policy. It confines signed request plans to the registered Wikidata, Open Library, Crossref, and A Wiki of Ice and Fire interfaces; rejects sensitive headers and unsafe endpoints; evaluates robots policy; enforces host pacing, `Retry-After`, retry ceilings, redirect boundaries, media type, and response-size ceilings; hashes the exact raw response bytes; and discards the raw body after JSON decoding. The adapter actor remains responsible for source-specific field whitelisting, rights-aware normalized retention, attribution, collector observations, candidates, attempts, cache entries, and adapter receipts. The collector remains the append-only custody actor. The reconciliation actor remains the only route from a named human review into a canon decision.

## Binding format

The portable binding format is:

```text
axm-asoiaf-structured-acquisition-review-binding/1
```

A binding fixes:

```text
registered adapter and atlas source
signed request identity and plan fingerprint
requested and final registered HTTPS route
acquisition receipt identity, fingerprint, and estate URI
adapter receipt fingerprint and estate URI
raw response SHA-256 and byte count
normalized observation and candidate identities
normalized observation SHA-256
collector receipt URI
robots status and digest
HTTP status and response media type
request, wait, and redirect counts
observed, partial, or zero-request replay outcome
rawResponseRetained = false
authorityRole = supporting-only
graphEffect = none
canonEffect = none
```

Raw-response identity and normalized-observation identity remain separate. The acquisition receipt and adapter receipt must agree on the exact raw response SHA-256 and byte count. The acquisition receipt, adapter receipt, and reviewed observation must agree on the committed observation and candidate identities. The resulting canon evidence source uses the normalized observation digest because that is the retained reviewed object, while each evidence record carries the raw response digest, acquisition receipt, adapter receipt, robots decision, request identity, and replay status as explicit provenance.

## Admission law

A structured acquisition enters this bridge only when all of the following are true:

1. The request plan fingerprint matches its canonical contents, uses `GET`, carries the qualified collector user agent, contains no sensitive or multiline header, remains inside the adapter-specific registered HTTPS endpoint, and is registered to the selected atlas source.
2. The source exists in the qualified atlas and authorizes `structured-cache-with-attribution` acquisition.
3. The acquisition receipt has a valid content-derived receipt identity and fingerprint, records an `observed`, `partial`, or `cache-hit` outcome, records a successful bounded JSON response, binds the exact plan and adapter receipt, and declares that the raw response was not retained.
4. The adapter receipt has a valid fingerprint, records an `observed` or `partial` result, preserves raw-response digest and byte custody, and has exact count and identity parity across normalized records, observations, and candidates.
5. The reviewed observation is one of the acquisition receipt's committed observations, points to the corresponding collector candidate, has its own normalized content digest and positive byte count, names the reviewer and review time, includes a compatible rights determination, and uses safe estate-relative receipt paths.
6. Every claim enters as `supporting`. Structured datasets, bibliographic metadata, community reference APIs, and normalized public records cannot acquire primary adjudicating authority through machine readability, availability, completeness, or prestige.

A replay is valid only when the acquisition outcome is `cache-hit` and the request count is zero. A network-backed success requires a positive request count. The replay remains a new acquisition receipt and collector attempt bound to the previously qualified raw response and normalized observation; it does not fabricate a second fetch.

## Reviewed packet compilation

The binding builder injects flat acquisition custody fields into the reviewed observation and each claim's normalized evidence record. The existing external packet builder then canonicalizes and fingerprints the complete packet. Existing source authority rules still apply. Structured datasets must enter as supporting evidence, community reference remains supporting, discussion remains provenance, scholarly analogues remain constraint, and only source classes already authorized by the reconciliation floor may carry primary decisions.

The existing evidence-bundle compiler retains the normalized observation as the evidence source and exact locator substrate. It also retains:

```text
acquisition binding fingerprint
request identity and plan fingerprint
acquisition receipt identity, fingerprint, and URI
adapter receipt fingerprint and URI
raw response digest and byte count
robots decision and digest
request and redirect counts
zero-network replay status
normalized observation digest
raw-response non-retention statement
```

This bridge does not itself compile a `confirm`, `correct`, `split`, `merge`, `reject`, or `defer` decision. It prepares a fully reviewable supporting evidence object for the existing transaction. A later non-defer decision still must satisfy the existing authority, reviewer, locator, reconciliation-key, work-order, and all-or-nothing receipt law.

## Qualification boundary

Repository qualification uses synthetic, API-shaped custody objects and performs no live network requests. The focused suite proves deterministic binding, exact packet and evidence-bundle construction, raw-versus-normalized digest separation, supporting-only standing, stale plan and receipt refusal, raw custody mismatch refusal, observation identity refusal, safe estate paths, and zero-request replay custody. Strict TypeScript, the existing external packet suite, the complete axm-canon test suite, and the production build must all pass on the exact candidate.

The evidence tier is acquisition-to-review custody qualification. The venue is the holder-controlled collector and reconciliation estate. The target is the integrity of the signed-plan, raw-response, normalized-observation, human-review, and evidence-bundle chain rather than the truth of an ASOIAF claim. The upside is that structured public records can enter review with complete network and retention provenance. The downside is additional receipt and schema maintenance. The failure mode is allowing a normalized value to lose its raw acquisition history or acquire primary canon authority because it was successfully fetched.

The control question is whether every structured supporting claim can disclose which signed request authorized it, which network policy governed it, which exact raw response supplied it, which normalized observation survived rights review, who reviewed it, and why none of those facts allowed the acquisition or adapter to settle canon.

## Structured observation admission

Successful acquisition and valid normalized custody are necessary but insufficient for claim construction. Every structured observation requires one fingerprinted named-review disposition before the acquisition-to-review bridge can build a packet: `admit-to-review`, `reject-off-topic`, or `defer-insufficient-identity`.

The disposition binds the exact source, adapter, request, plan fingerprint, acquisition receipt, adapter receipt, observation, candidate, normalized digest, question lanes, work-identity evidence, relevance evidence, outcome, reason, rationale, reviewer, and review time. Admission requires evidence supporting exact identity and question relevance. A lexical collision, continuity mismatch, or unsupported lane remains a rejection. Missing durable identity or relevance remains a defer.

Rejection and defer preserve the acquisition and collector ledgers but cannot construct a reviewed claim, evidence bundle, reconciliation proposal, graph effect, or canon effect. Admitted observations remain supporting-only. The bridge carries the admission identity and fingerprint into the reviewed observation, every normalized evidence record, and packet verification.

This gate was operationalized after the live canary returned a mechanically valid Crossref record whose title overlapped “A Song of Ice and Fire” while its DOI, container, and publisher identified an unrelated work. HTTP success, lexical overlap, and normalized metadata therefore remain insufficient for semantic admission.
