# ASOIAF public corpus v1

This directory is the admitted repository-safe projection of six holder-controlled editions. The source books remain outside Git. The projection carries edition identities, ordered unit and paragraph locators, corpus counts, candidate evidence routes, an entity concordance, the AGOT opening gate, and exact checksums for this public surface.

## Admitted standing

- 6 edition identities
- 458 ordered units
- 347 narrative units
- 111 non-narrative units
- 45,828 paragraph locators
- 1,882,845 privately held source words represented by locators and counts
- 805 candidate evidence routes
- 254 entity candidates
- 31 source-attested AGOT opening records

`sourcePayloadPresent`, `sourceTextPresent`, `sourcePathRetained`, and `sourceFilenameRetained` are all false. `canonEffect` and `graphEffect` are both `none`. The public projection therefore supports navigation and review, but no candidate becomes canon merely by appearing here.

The exact transport and admission transaction is recorded in [`../../docs/ASOIAF_PUBLIC_CORPUS_V1_IMPORT_RECEIPT.json`](../../docs/ASOIAF_PUBLIC_CORPUS_V1_IMPORT_RECEIPT.json). Run the independent boundary verifier from the repository root with:

```bash
npm run validate:public-corpus
```
