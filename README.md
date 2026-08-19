# AXM Canon

`axm-canon` owns portable canon, continuity, evidence, and closure law. It is neither a game engine nor an execution scheduler.

The generic compiler lives under [`src/canon/`](src/canon/). The first domain estate lives under [`asoiaf/`](asoiaf/README.md). Tier Bench work-order, lease, transport, credential, actor-runtime, adapter-host, and operating-system isolation code is intentionally absent.

The repository was extracted from temporary construction work in `BigBirdReturns/axm-arc`. Exact source heads, path mappings, transformed-file digests, exclusions, and the old-repository cleanup transaction are recorded under [`migration/`](migration/).

## ASOIAF corpus status

Six holder-controlled editions have now been admitted outside Git: the five principal novels and one compilation containing the three published Dunk and Egg novellas. Their repository-safe projection contains:

- 6 exact edition identities;
- 458 ordered source units;
- 347 narrative units and 111 non-narrative units;
- 45,828 exact paragraph locators;
- evidence routes for all 805 retained review candidates;
- a 254-entity concordance;
- a 31-record, source-attested AGOT opening gate;
- a self-contained reader under [`asoiaf/reader/`](asoiaf/reader/README.md).

No EPUB byte, private paragraph text, original filename, holder path, or private SQLite database is committed. Every candidate, entity, and opening record remains non-canonical until a named human reconciliation transaction grants standing. Exact corpus custody and current review posture are described in [`asoiaf/docs/ASOIAF_SIX_EDITION_CORPUS.md`](asoiaf/docs/ASOIAF_SIX_EDITION_CORPUS.md).

## Qualification

```bash
npm ci
npm run validate
```

The next product work is review rather than ingestion architecture: adjudicate the AGOT opening gate, widen chapter-by-chapter reconciliation, and turn the exact locator estate into progressively richer chronology, lineage, actor-knowledge, material-state, and reader surfaces.
