# ASOIAF Canon Estate

This directory owns the actual *A Song of Ice and Fire* lore project: provisional recall, conversation synthesis, exact source custody, holder-controlled editions, private retrieval, public-safe corpus projection, reviewed reconciliation, research dossiers, reviewed answer packets, and the reader product.

## Current source estate

The private estate now contains exact holder-controlled copies of the five principal novels and the three published Dunk and Egg novellas in one compilation. The source payload remains outside Git. The repository contains only exact digests, edition identities, ordered unit and paragraph locators, review queues, evidence routes, paraphrased draft records, and reader-safe projections.

Current machine-readable surface:

- 6 exact edition identities;
- 458 ordered units;
- 347 narrative units;
- 111 non-narrative units;
- 45,828 paragraph locators;
- 1,882,845 source words under private custody;
- 726 model-recall candidates;
- 79 conversation-synthesis candidates;
- 805 combined candidates in 15 packets;
- evidence routes for all 805 candidates;
- 254 entity candidates, of which 231 have at least one source lead;
- 31 source-attested AGOT opening records awaiting human review;
- 219 registered external source identities and 45 research lanes.

These counts do not make the provisional candidates canon. Search results, model recall, and assistant-normalized paraphrases have `graphEffect=none` and `canonEffect=none`. Promotion requires an explicit human `confirm`, `correct`, `split`, `merge`, `reject`, or `defer` transaction bound to the exact edition and locator.

## Surfaces

- [`public/corpus-v1/`](public/corpus-v1/README.md) is the repository-safe six-edition projection.
- [`reader/index.html`](reader/index.html) is the self-contained source atlas and review browser.
- [`tools/asoiaf_private_corpus_sqlite.py`](tools/asoiaf_private_corpus_sqlite.py) builds and queries the private FTS5 corpus without returning text by default.
- [`docs/ASOIAF_SIX_EDITION_CORPUS.md`](docs/ASOIAF_SIX_EDITION_CORPUS.md) records exact corpus identity, boundaries, and current acceptance status.

Tier Bench may execute bounded work against this estate. It is not part of the estate and cannot acquire canon authority from scheduling, transport, process, or operating-system receipts.
