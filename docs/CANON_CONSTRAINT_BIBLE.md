# RFC: Canon Constraint Bible

## Classification

The Canon Constraint Bible is an additive authority plane above the existing deterministic narrative rails. It compiles a provenance-bearing corpus, an explicit adaptation decision set, and optional continuation events into one deterministic branch receipt. It does not generate canonical prose, infer missing source text, collapse contradictory testimony into a single truth, or grant an LLM authority to change the world state.

The initial portable formats are:

```text
axm-canon-bible/1
axm-canon-decision-set/1
axm-canon-compile-receipt/1
axm-canon-proposal-set-receipt/1
```

The first implementation lives under `src/canon/` and is exported through the narrative authority namespace.

## Governing object

A canon bible is not a lore wiki. It is a constraint-bearing compilation unit whose records answer seven different questions without blending them:

1. **Source custody:** Which exact edition, recording, statement, script, or derived record supports a claim, and where is the bounded locator?
2. **Continuity:** Which claims belong to the novel, adaptation, companion-history, or other inherited continuity?
3. **Truth and testimony:** What proposition is represented, which sources support or contradict it, and which branch activates it?
4. **World physics:** What can move, act, transform, or be spent, under what capabilities, travel times, and bounded state variables?
5. **Actor epistemics:** Which character knows a proposition before an action that depends on it?
6. **Narrative function:** What causal, political, informational, symbolic, or endpoint work does a character or storyline carry?
7. **Closure:** Which hard endpoints and unresolved functions must be satisfied, in what order and temporal window?

These questions are separate because adaptation failure frequently occurs when one answer is substituted for another. A character can be removed from the cast while the political function carried by that character remains mandatory. A proposition can be true while no actor knows it. A destination can be fixed while the available causal routes remain plural. A scene can be dramatically attractive while violating travel time, material supply, or an established magical cost.

## Evidence and custody

`CanonSource` records authority tier, continuity, edition or version, custody class, digest, and parent-source lineage. `CanonLocator` records a bounded location such as byte range, page, chapter, line, timestamp, or structured record. Claims and derived structures cite locator identifiers rather than embedding source text.

The public repository must not become a substitute distribution channel for copyrighted books. Exact book bytes remain in holder-controlled local custody or a private signed shard. Git may contain schemas, source manifests, digests, locators, extracted entity identifiers, normalized propositions, and synthetic qualification fixtures. A strict-evidence deployment is expected to use the existing Forge, Genesis, and Spectra custody chain:

```text
holder-controlled source bytes
  -> Forge extraction and locator manifest
  -> Genesis strict-evidence shard and signature
  -> canon bible records with exact locator receipts
  -> deterministic branch compilation
  -> Spectra query and inspection surface
```

An unsupported derived claim is a protocol failure, even when a language model could plausibly reconstruct it from general knowledge.

## Continuity inheritance

A continuity declares zero or more parents. The compiler resolves the target continuity through its transitive inheritance closure and admits only entities, propositions, capabilities, variables, routes, functions, events, endpoints, and variant groups assigned to that closure.

This permits the source estate to preserve book continuity, television continuity, public author statements, production testimony, and historical analogues without silently mixing them. An adaptation may inherit general world law from a parent while replacing selected events. A historical analogue can inform a hypothesis while remaining outside primary-canon authority.

## Proposition and attestation law

A proposition is a normalized subject, predicate, and entity or literal object. Attestations point to the proposition and preserve support, contradiction, report, uncertainty, or deliberate withholding. Contradictory narrators are retained as contradictory evidence. They do not become multiple votes that automatically establish truth.

Branch truth is selected by default activation, variant effects, and explicit assumptions or exclusions in the decision set. Mutually exclusive propositions may share an `exclusiveGroupId`; simultaneous activation is a compile error. This allows the corpus to represent unresolved claims such as parentage, identity, prophecy, authorship, or motive without laundering speculation into canon.

## World-physics law

The first implementation enforces four physical and institutional constraint classes:

- **Capabilities:** entities may require and gain or lose bounded capabilities.
- **Travel:** directed routes have minimum durations and optional capability requirements.
- **State variables:** integer or real quantities carry units, initial values, and optional lower and upper bounds. Events may test, set, or change them transactionally.
- **Active existence:** removed or deactivated entities cannot participate in later events or continue carrying unresolved functions.

State variables are intentionally general. A corpus can represent grain reserves, fleet tonnage, army strength, treasury, population, dragon count, magical charge, public legitimacy, disease burden, raven capacity, or any other quantity whose interpretation and unit are explicitly authored. The compiler does not pretend that an invented number is a source fact. Every initialized variable and branch override still requires provenance through the bible.

An event is transactional. Preconditions, chronology, travel, knowledge, capabilities, proposition exclusivity, variable bounds, function-carrier continuity, and endpoint conditions are checked against one snapshot. If a hard check fails, the event does not enter `completedEventIds` and none of its state changes survive.

## Narrative-function law

`CanonNarrativeFunction` separates story work from the character currently performing it. A function may encode:

- a rival claim that changes the protagonist's political position;
- an information channel that delivers a hidden truth;
- an institutional veto or source of legitimacy;
- a resource carrier such as an army, fleet, dragon, archive, or treasury;
- a causal trigger such as a bell, letter, betrayal, marriage, or death;
- a symbolic payoff or endpoint prerequisite.

Each function has default carriers, required status, optional deadline, and source locators. Variant options and decision sets may transfer a function to new carriers. Removing the last active carrier of a required unresolved function is an error. Retiring a required function is also an error.

This is the control that an adaptation bible needs. A production may remove a character, merge plots, alter chronology, or invent a substitute, but it must declare where every inherited function went. Deletion is therefore a branch decision with propagated obligations rather than an untracked screenplay convenience.

## Variant decision law

Variant groups declare cardinality and named options. Options can activate or deactivate propositions and events, remove entities, override bounded variables, transfer functions, or retire optional functions. Options may require or conflict with other options.

The decision set records the selected options, explicit proposition assumptions and exclusions, state-variable overrides, function assignments, and reasoned function retirements. The compiler fingerprints both the canonicalized bible and canonicalized decision set. Reordering semantically unordered arrays cannot change identity.

## Event and endpoint law

Every event declares sequence, time window, participants, location, causal parents, preconditions, effects, endpoint claims, and source locators. The compiler enforces:

- active participants;
- completed causal parents that precede the event;
- required and forbidden propositions;
- actor knowledge;
- entity capabilities;
- state-variable conditions and bounds;
- minimum travel duration;
- transactional entity activation, deactivation, movement, knowledge, capability, and variable changes;
- narrative-function resolution;
- endpoint windows, predecessor endpoints, proposition conditions, variable conditions, and required function closure.

A hard endpoint is a known terminal coordinate. It can remain unresolved during exploratory compilation by setting `requireClosure: false`, in which case the receipt carries a warning rather than pretending that the branch is complete. A release or final adaptation branch can require closure and refuse every incomplete route.

## Closure lattice and proposal classification

`classifyCanonProposals` compiles each candidate event against the same frozen bible and decision set. It classifies the proposal as:

- **necessary:** the only viable candidate in the supplied set that closes at least one current hard gap;
- **strongly implied:** a viable route that closes a hard gap for which at least one alternative remains;
- **permissible:** compatible background or connective material that closes no current hard gap;
- **contradicted:** a proposal that violates a hard corpus, chronology, knowledge, capability, material, function, or endpoint constraint.

The classification is relative to the supplied candidate set and current branch. It is not a claim that the engine has enumerated every possible authorial choice. The receipt names the exact gaps, coverage, finding codes, and compile identities so later tools can widen the candidate set without rewriting history.

## Qualification fixture

The repository fixture, *The Ash Crown*, is synthetic. It proves the mechanism without importing any copyrighted source text. The fixture contains:

- contradictory attestations that remain independently preserved;
- a rival claimant whose removal or merger creates function-propagation obligations;
- actor-specific secret knowledge;
- bounded travel routes and a qualified fast-travel capability;
- a material grain reserve with transactional lower-bound enforcement;
- a fixed terminal window;
- candidate continuations exercising all four proposal classifications.

The focused tests require deterministic input-order-independent fingerprints, refusal of orphaned functions, explicit function transfer, mutually exclusive proposition refusal, missing-knowledge refusal, impossible-travel refusal, variable-underflow rollback, repeatable receipts, and no mutation of input records.

## Deliberate exclusions

The first slice does not yet:

- extract claims automatically from source text;
- adjudicate truth from source-authority weights;
- generate prose or dialogue;
- solve all possible continuations exhaustively;
- model probabilistic population behavior;
- encode a general symbolic theorem language;
- publish private corpus bytes;
- grant adaptation or generated events canonical standing.

Those are later trains. The first authority establishes the invariant data model and proves that a branch cannot delete functions, teleport actors, spend unavailable resources, or use undisclosed knowledge without leaving a deterministic refusal receipt.

## Next seams

The next compiler-facing work is a source-ingestion contract that converts exact local books, scripts, interviews, and histories into locator-bound records without copying payload text into Git. After that, the ASOIAF pilot should add lineage and succession rules, geography and travel, material logistics, actor knowledge, magic costs, faction resources, fixed endgame coordinates, and the adaptation decision ledger. Spectra can then expose the compiled closure lattice as an inspectable historical surface.

The control question is whether a substantially new writer or production team can explain, from receipts alone, which source fact authorized a branch choice, what function it inherited, which constraints it satisfied, and which future outcomes it made impossible.
