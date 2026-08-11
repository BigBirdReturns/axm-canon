# ASOIAF Model-Recall Bootstrap Estate

## Classification

This estate uses language-model recall to populate the review surface before the
user's exact books are ingested. It is broad by design and authoritative by
neither assertion nor confidence. Every packet is fixed to:

```text
authority            none
compilationEligible  false
generatedBy          language-model-recall
knowledgeCutoff      2025-12
```

The estate cannot enter `compileCanonBible`. It cannot close an endpoint,
satisfy a source locator, establish a quotation, or acquire canon standing. Its
purpose is to prevent the exact-source pass from beginning with an empty schema.

## First fanout

The first fanout contains **10 packets** and **726 recall candidates**:

```text
core entities           254
lineage and claims      74
chronology and geography 58
actor knowledge         58
material and logistics  52
magic and world physics 67
narrative functions     56
adaptation deltas       30
endgame coordinates     37
smallfolk systems       40
```

The core inventory identifies named actors, houses, locations, institutions,
creatures, artifacts, and collective actors. The remaining packets propose
normalized relations, events, knowledge states, physical constraints, magical
observations, narrative functions, adaptation decisions, terminal coordinates,
and local propagation chains.

## Why recall is useful

Exact ingestion needs a target vocabulary. Model recall supplies a provisional
map of likely entities, aliases, source families, disputes, event windows,
knowledge transfers, routes, costs, and unresolved questions. That allows the
source pass to perform reconciliation rather than blind extraction.

A high confidence score means only that the model strongly recalls the item. It
does not mean that the item is canon, correctly scoped, or supported by the
source hint. Low-confidence theories remain visible so that source ingestion can
reject them explicitly rather than allowing them to survive as tacit fan lore.

## Source hints

Source hints such as `AGOT`, `ADWD`, `F&B`, `TWOW-SAMPLE`,
`GRRM-STATEMENT`, and `PRODUCTION-TESTIMONY` are routing labels. They are not
citations. The source-hint registry marks every one as placeholder-only or as
requiring an exact venue and locator.

When the user's copies arrive, each accepted candidate must be reconciled to:

1. an exact source digest;
2. a bounded byte, page, chapter, line, timestamp, or structured-record locator;
3. an authority tier and continuity;
4. the exact normalized record promoted into the canon bible;
5. a review receipt that records acceptance, rejection, split, or supersession.

## Domain fanout

### Core entities

The entity inventory is deliberately overinclusive. It includes the principal
cast, secondary claimants, houses, institutions, armies, ports, magical
artifacts, creatures, gods as claimed entities, and collective actors such as
smallfolk. Same-name collisions and title changes remain reconciliation work.

### Lineage and claims

The lineage packet separates public parentage, biological parentage, legal
parentage, disputed identity, inheritance custom, claim basis, and surviving
legal instruments. Jon Snow and Young Griff therefore enter as variant
proposition families rather than settled labels.

### Chronology and geography

The chronology packet begins with major historical anchors and the current
war, then adds qualitative route constraints. Exact travel durations will be
derived from maps, chapter synchronization, vessel class, weather, army size,
and known departures after the source estate is mounted.

### Actor knowledge

The epistemic packet records who may know, believe, misread, or lack a
proposition and names the likely channel. This is the layer that prevents reader
knowledge, production knowledge, and actor knowledge from collapsing into one
plot convenience.

### Material systems

The material packet identifies state variables and propagation laws around
grain, winter stores, fleets, debt, disease, ports, roads, armies, dragons,
hostages, and institutional manpower. Numeric values remain absent unless the
source provides or supports a bounded estimate.

### Magic and world physics

The magic packet records observed effects, costs or conditions, and explicit
unknowns. It does not identify R'hllor, the Great Other, the voice in Varys's
flames, or the Others' motive merely because the corpus demonstrates that an
effect occurred.

### Narrative functions and adaptation deltas

The function packet records the work carried by characters and storylines. The
adaptation packet then records what HBO removed, merged, or substituted. Young
Griff's omission is represented as a bundle of rival-claim, prior-restoration,
Varys-project, Golden Company, and Daenerys-position obligations.

### Endgame coordinates

Attributed coordinates, strong structural requirements, cross-continuity
inferences, show-only mechanisms, and unresolved questions remain visibly
different. Bran's sovereignty can therefore be a Martin-attributed destination
without promoting the television council mechanism.

### Smallfolk systems

The smallfolk packet demonstrates the scale expansion the user specified. Army
movement can propagate through grain seizure, seed loss, livestock, mills,
prices, migration, disease, banditry, religion, and local legitimacy, while the
chain remains attached to a named major event and bounded geography.

## Reconciliation order

The first exact source transaction should ingest the user's edition of
*A Game of Thrones*. The initial review queue is:

```text
chapter and viewpoint boundaries
named entities and aliases
explicit locations and movements
direct kinship and office relations
actor knowledge acquisitions
material observations
magic observations
open prophecies and reported histories
```

Candidates may be accepted, rejected, split into multiple records, or retained
as questions. Promotion should never be automatic, even for high-confidence
items.

The control question is whether every recall candidate can eventually be
replaced by an exact-source record or an explicit rejection receipt without
changing the branch's hidden assumptions.
