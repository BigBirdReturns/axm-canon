# ASOIAF external source atlas and collection floor

This package is a source-routing and collection-control system for the existing ASOIAF canon estate. It does not create a new canon tier. The atlas identifies the external surfaces that can help answer a question, records the authority and rights boundaries of each surface, issues one deterministic work order per source, and holds every retrieved record below the promotion firewall until exact evidence and human review complete the existing canon-reconciliation transaction.

The compiled estate contains 219 source identities, 45 question-routing lanes, 219 source-specific harvest work orders, 510 authored source-to-lane edges, and routes all 805 held recall and conversation-synthesis candidates. The source registry spans user-held primary and companion editions, released future-book material, George R. R. Martin's official publication and statement surfaces, HBO adaptation continuity, production testimony, publisher and edition catalogs, structured reference tools, community reference and analysis, discussion provenance, scholarly analogues, and archival recovery systems.

## Governing lineage

The collector inherits its evidentiary model from `BigBirdReturns/clifford-number`. Retrieval first creates a privacy-minimized observation. Candidate identity derives from the source identity and a durable upstream record identifier. Observation identity adds the upstream content digest, so a source revision appends a new immutable observation to the same candidate instead of overwriting history. Names remain entity hints until resolved. Crawling has no graph effect, no canon effect, and no causal effect. Promotion requires a separate human-reviewed reconciliation decision with claim-level receipts.

The collector inherits its operating model from `BigBirdReturns/undercast`. The sequence remains harvest, triage, then card. A lead is not a card. Network collection is single-threaded by default, observes a 1,500 millisecond host-delay floor, names the tool and contact surface in its user agent, honors `Retry-After`, bounds transient retries and response size, replays from disposable caches, records honest no-result terminals, and does not refetch completed endpoints unless refresh is explicit.

Those inherited laws are frozen in `lineage.ts`. The complete machine provenance surface is `SOURCE-LEDGER.json`, accompanied by append-only observation, candidate, gap, attempt, state, receipt, and cache surfaces. Public attribution is intentionally narrower. `CREDITS.md`, `CREDITS.json`, and `CREDITS.bib` include only records whose license or publisher terms require visible credit. Complete provenance and public credit therefore remain related but distinct outputs.

## Authority and continuity

The atlas preserves fifteen authority classes: primary text, companion text, released author text, author statement, adaptation canon, production testimony, licensed reference, official bibliography, structured dataset, community reference, community analysis, discussion provenance, scholarly analogue, archival custody, and discovery-only routing. These classes are not interchangeable.

A community wiki can resolve an alias, expose a candidate family relation, and lead the collector to an exact source. It cannot overrule a user-held edition. A discussion thread can establish when and where a theory appeared. It cannot establish that the theory is true. A production interview can establish what an adaptation team intended. It cannot establish the mechanism Martin will use in an unpublished book. A historical or scientific source can constrain a physical or institutional analogy. It cannot create fictional canon.

Book-main, book-companion, released-future-book, author-statement, HBO Game of Thrones, HBO House of the Dragon, production-testimony, analysis, historical-analogue, and scientific-analogue continuities remain explicit. Query routing may cross them only when the lane's continuity policy permits it, and the returned route discloses that crossing.

## Question router

The forty-five lanes cover exact quotation, entity resolution, genealogy and parentage, succession and legitimacy, chronology, geography and travel, dragons, magic and world physics, religion and sacrifice, Varys and R'hllor, prophecy, actor knowledge, military logistics, economics and smallfolk, law and governance, the Dance, Blackfyres, the Others and Long Night, language, author intent, production intent, adaptation deltas, episode dialogue, historical analogues, religious analogues, scientific analogues, community consensus, theory provenance, chapter analysis, publication history, edition resolution, maps, networks, fandom history, endgame closure, House of the Dragon endpoints, heraldry, food and agriculture, medicine and disease, gender and kinship, death status, literary influences, dataset validation, archive recovery, and international reference.

Each lane declares preferred and supporting authority classes, preferred source identities, required source roles, continuity policy, quotation handling, attribution requirements, community standing, and analogue standing. The router scores lane aliases, explicit lane requests, authority fit, source-specific preference, and continuity fit. It returns a deterministic route receipt rather than an answer claim.

Exact quotation is deliberately special. User-held editions and subtitle packs can produce exact local locators, but copyrighted text does not become a mirrored search corpus. Public tools may help locate a passage. They do not authorize the project to reproduce the underlying work.

## Harvest work orders

Every source receives one work order bound to the source fingerprint. The work order identifies applicable lanes, source-hint routes, held candidates, collection steps, review actions, receipt requirements, and the conditions that prohibit promotion. Depending on the source, the transaction establishes local custody, checks robots and terms, discovers a schema, fetches bounded records, hashes the upstream record, normalizes whitelisted fields, blocks private contact data, writes an immutable observation, deduplicates the candidate, generates required credit, reconciles held candidates, and records an honest terminal result.

The rights modes are user-controlled private, public domain, CC0, CC BY, CC BY-SA, publisher copyright, unknown pending rights review, and link-only. Collection modes are local-private-only, route-only-no-mirror, manual-rights-review, structured-cache-with-attribution, metadata-and-bounded-excerpt, and metadata-only. Raw public bodies are retained only under an explicit compatible license or public-domain determination. Publisher-copyright and link-only sources retain routes, metadata, receipts, and bounded locators rather than silently growing a copied corpus.

A successful fetch cannot promote a claim. Promotion remains forbidden until source identity, continuity, rights, claim-level receipts, reviewer identity, and the canon-reconciliation transaction all pass. The reconciliation action must be explicit: confirm, correct, split, merge, reject, or defer.

## Qualification

The focused qualification verifies the exact estate counts, all 805 candidate routes, deterministic identity under source and lane reordering, one work order per source, complete authority and rights boundaries, the Varys and R'hllor multi-plane route, the Dance genealogy and endpoint route, quotation refusal to mirror copyrighted text, community utility without primary standing, observation and candidate identity, append-only source revisions, privacy blocking, UnderCast collection limits, Clifford Number promotion separation, and selective credit generation.

The permanent workflow runs strict TypeScript, the focused external-atlas tests, the complete axm-canon test suite, the production build, and a deterministic receipt emitter. The retained artifact includes the exact candidate SHA, logs, authority boundary, source and work-order summary, provenance lineage, findings, and SHA-256 inventory.

The evidence tier is source-registry, routing, and collection-mechanism qualification. The venue is the stacked draft branch. The target is the integrity of source selection, collection, rights, provenance, and reconciliation control. The upside is that the project can crawl broadly without losing the ability to explain where a record came from or why it has no authority yet. The downside is stale routes, source-specific rights variance, community error, and the review burden created by honest unresolved records. The failure mode is allowing retrieval success, model confidence, or a familiar community summary to bypass exact-source custody and human review.

The control question is whether every promoted claim can be traced to a durable source record, a content-addressed observation, a receipt, an authority decision, and a rights-compliant credit path without allowing the crawler itself to write canon.
