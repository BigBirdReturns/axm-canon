# ASOIAF six-edition corpus v1

## Classification

This is the first production source estate for `axm-canon/asoiaf`. Six holder-controlled EPUB files were admitted into private custody, assigned neutral source identities, hashed byte for byte, segmented into stable ordered units and paragraphs, and projected into repository-safe records. Source payload, normalized paragraph text, original filenames, and holder filesystem paths remain outside Git.

The source estate contains the five principal novels plus one compilation containing *The Hedge Knight*, *The Sworn Sword*, and *The Mystery Knight*.

## Exact source bindings

```text
local-agot      sha256:4f1966c377e3f92f15f912ee5129b3a08d0f71133adf09daa61c573f916417c0
local-acok      sha256:ce337c672ee2687e23fb787c4079a2c9c13772c4539c69d1187db9ce8a7d9eb9
local-asos      sha256:7432af001591b92b2e52090ee78f3bc0f09b63825fc6038e21b9092ba6324193
local-affc      sha256:f2edcabe7a4157c7cb32ae9ab3bd5aa444b3bf3702607592269cf8fb5d84fd93
local-adwd      sha256:46a394d0ea08f3e2de058c582edc96d099dccc31f9fd5b7316740b6ba1b45ee4
local-dunk-egg  sha256:fe6977025b37ad7324b6c8ce89641849867c76e4f368c6ff151903c57d71d5d5
```

The ADWD file is classified as a holder-supplied converted edition because its internal metadata identifies an ePub Bud conversion and contains weak bibliographic fields. The Dunk and Egg compilation is classified as a holder-supplied collection with weak bibliographic metadata. Exact byte custody is valid for both files; publisher-authenticated replacements remain useful later for edition parity.

## Corpus counts

```text
editions                 6
ordered units          458
narrative units        347
non-narrative units    111
paragraph locators  45,828
source words      1,882,845
entity candidates       254
candidate routes        805
opening-gate records     31
canon promotions          0
```

The private SQLite FTS5 corpus reproduces all 45,828 paragraph documents and retains exact source, edition, unit, segment, locator, and text-digest identity. Queries return no source text by default. The repository-safe projection contains structural metadata, source digests, locators, evidence leads, and paraphrased draft records only.

## First reviewed-product boundary

The opening gate covers the AGOT prologue and early Winterfell, Daenerys exile, Bran's fall, Jon and Catelyn, Tyrion and Joffrey, and Robert's memory of Lyanna. Its 31 records are source-attested assistant-normalized drafts. They are deliberately marked `humanReviewRequired=true`, `promotionStatus=draft-awaiting-human-review`, and `canonEffect=none`.

The reader atlas exposes the complete six-edition structure, all 805 candidate evidence routes, the 254-entity concordance, and the opening gate without copying source prose. It is a review and navigation product, not a substitute for human adjudication.

## Rights and custody boundary

Public Git may contain source and edition digests, bounded locators, normalized identifiers, reviewer decisions, evidence-route receipts, and original analytical paraphrases. It may not contain EPUB files, reconstructed chapters, normalized paragraph text, private database bytes, original source filenames, holder paths, or text-bearing snippets from the private corpus.

## Next work

The next transaction is chapter-by-chapter human reconciliation beginning with the AGOT opening gate. Accepted records then become strict-evidence shards for chronology, lineage, office and claim, actor knowledge, material state, magic and world physics, narrative-function custody, and the reader-facing lore atlas. The remaining books can be processed continuously against the already admitted locator estate without another ingestion redesign.
