# AXM Canon

`axm-canon` owns portable canon, continuity, evidence, and closure law. It is neither a game engine nor an execution scheduler.

The generic compiler lives under [`src/canon/`](src/canon/). The first domain estate lives under [`asoiaf/`](asoiaf/README.md). Tier Bench work-order, lease, transport, credential, actor-runtime, adapter-host, and operating-system isolation code is intentionally absent.

The repository was extracted from temporary construction work in `BigBirdReturns/axm-arc`. Exact source heads, path mappings, transformed-file digests, exclusions, and the old-repository cleanup transaction are recorded under [`migration/`](migration/).

## ASOIAF corpus status

The admitted public-safe six-edition corpus is now physically present under [`asoiaf/public/corpus-v1/`](asoiaf/public/corpus-v1/README.md). Its exact surface contains:

- 6 edition identities;
- 458 ordered source units;
- 347 narrative units and 111 non-narrative units;
- 45,828 paragraph locators covering 1,882,845 privately held source words;
- evidence routes for all 805 retained review candidates;
- a 254-entity concordance;
- a 31-record, source-attested AGOT opening gate;
- a self-contained public-safe corpus reader under [`asoiaf/reader/`](asoiaf/reader/README.md);
- a separate live programme reader, *The Narrow Wall*, under [`docs/asoiaf/`](docs/asoiaf/README.md).

No EPUB byte, private paragraph text, original filename, holder path, or private SQLite database is committed. Every candidate, entity, and opening record remains non-canonical until a named human reconciliation transaction grants standing. Exact corpus custody and current review posture are described in [`asoiaf/docs/ASOIAF_SIX_EDITION_CORPUS.md`](asoiaf/docs/ASOIAF_SIX_EDITION_CORPUS.md).

The sealed continuation-v3 manifest is admitted separately under [`asoiaf/public/continuation/2026-08-18-v3/`](asoiaf/public/continuation/2026-08-18-v3/README.md). Its component payloads remain outside Git until each public-safe component is admitted with its own inventory and replay receipt. The private v4.2 integration remains held until the exact inherited v4.1 archive is materialized at its recorded byte count and SHA-256.

## Qualification

```bash
npm ci
npm run validate
```

The active work is review and source expansion: adjudicate the AGOT opening gate, widen chapter-by-chapter reconciliation, admit the bounded continuation components, and extend chronology, lineage, actor-knowledge, material-state, and reader surfaces without flattening evidentiary tiers.
