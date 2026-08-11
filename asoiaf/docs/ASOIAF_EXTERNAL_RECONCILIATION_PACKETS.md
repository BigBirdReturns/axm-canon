# ASOIAF external reconciliation packets

This branch implements the adjudication actor between the external collector and the existing canon reconciliation floor. A collector observation has source identity, durable record identity, a content digest, a receipt, and no graph or canon effect. A reconciliation packet adds exact locator custody, claim normalization, source-specific authority standing, rights review, a named human reviewer, the recall candidates under review, and an explicit canon decision set. Only then may the packet invoke the existing `confirm`, `correct`, `split`, `merge`, `reject`, or `defer` transaction.

## Packet boundary

A review packet is bound to one external source, one source record, one content-addressed observation, one continuity, one rights decision, and one reviewer. Each claim names a bounded locator, reviewed text or normalization, reconciliation keys, the recall candidates it can adjudicate, and one authority role:

```text
primary
supporting
provenance
constraint
```

The role is constrained by the source's atlas authority class. Primary or companion text may carry fictional-event, world-state, actor-knowledge, or lineage evidence. Adaptation canon may carry adaptation-continuity facts. Author statements may carry author intent and publication records. Production testimony may carry production intent. Licensed and official bibliographic references may carry publication records.

Structured datasets, community reference, community analysis, discussion, scholarly analogues, archives, and discovery-only sources cannot acquire primary canon standing through this packet format. Community material remains supporting evidence. Discussion establishes theory provenance. Scholarly material constrains analogies. Structured and archival material remain supporting unless a later source-specific authority transaction explicitly expands their role.

## Observation review

An observation cannot enter a packet while it remains collector intake. The packet requires:

```text
promotionStatus       reviewed
reviewerId            named
reviewedAt            present
receiptUri            present
responseBytes         positive
contentDigest         exact SHA-256
collector identity    source + durable record
observation identity  source + durable record + digest
graphEffect           none
canonEffect           none
```

Rights review is explicit and source-specific. Holder-controlled editions require private-holder custody. CC BY and CC BY-SA bodies require licensed-cache review. Link-only sources remain link-only. Publisher-copyright sources may contribute holder-controlled exact locators or metadata-only records. Unknown rights require a named clearance or metadata-only determination. The rights reviewer must be the packet reviewer.

## Exact evidence bundle

A passing packet compiles into the existing `axm-canon-evidence-bundle/1` format. It uses a logical source label instead of a private filename, preserves the exact source digest and byte count, binds every evidence record to one or more exact locators, marks extraction as `human-reviewed-external-observation`, and records the reviewer. The source hint routes come from the qualified atlas rather than from packet prose.

The canon work order is rebuilt from the combined 805-candidate recall and conversation estate using the source's qualified source-hint routes. Sources without an exact source-hint route may remain useful supporting material, but they cannot directly resolve recall candidates through this transaction.

## Decision firewall

A non-defer decision may cite only packet claims whose authority role is `primary`. A community, discussion, structured, archive, analogue, or discovery claim cannot be smuggled into a primary decision merely because it shares reconciliation keys with a candidate. The decision reviewer must match the observation and rights reviewer. The packet then binds the work-order and evidence-bundle fingerprints and invokes the existing all-or-nothing canon reconciliation compiler.

Any malformed digest, stale packet fingerprint, missing locator, incomplete rights review, continuity crossing, candidate outside the source work order, reviewer mismatch, nonprimary decision evidence, missing source route, or downstream canon validation error refuses the packet. On refusal, no resolution or promoted record survives.

## Qualification

The focused qualification proves deterministic packet identity, private filename non-disclosure, exact evidence-bundle construction, a passing holder-controlled primary-text confirmation, refusal of intake-only observations, reviewer-crossing refusal, community-primary refusal, analogue-promotion refusal, and continuity isolation. The permanent workflow also runs strict TypeScript, the complete axm-canon test suite, the production build, and a deterministic sample receipt.

The evidence tier is reviewed-observation transaction qualification. The venue is this stacked draft. The target is the bridge between collector custody and canon adjudication, not the truth of any production ASOIAF claim. The upside is that broad crawling can feed a narrow, auditable review transaction without flattening authority tiers. The downside is reviewer load and the need to prepare exact source-specific locators. The failure mode is any shortcut that treats a source's availability, familiarity, machine readability, or community prestige as authority to settle canon.

The control question is whether every canon resolution can show which collector observation entered review, why that source had the required authority, which exact locator supported the decision, who cleared the rights and evidence, and why every nonprimary source remained outside the adjudicating set.
