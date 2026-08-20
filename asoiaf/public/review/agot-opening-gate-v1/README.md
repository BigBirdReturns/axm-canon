# AGOT opening-gate structural triage v1

This component converts the 31 source-attested records in `asoiaf/public/corpus-v1/OPENING_GATE.json` into a bounded human-review queue. It does not decide whether any record should be confirmed, corrected, split, merged, rejected, or deferred. Those actions remain available only through a named human transaction bound to the exact record fingerprint and private source locator.

The source object is the public-safe *A Game of Thrones* opening gate for edition key `bantam-calibre-isbn-9780553588484-v1-1f37c562f9636`. Its Git blob is `01624a17e21eb0c31d8273f3bf1063402b112fae`, its gate fingerprint is `sha256:b8a8cadc1f5a49f0704f1dbe4b38358d86a52ac27520fc193657c0ffb949cda4`, and it contains no source prose.

Structural triage places fourteen records in `review-as-is`, ten in `split-before-review`, and seven in `rewrite-before-review`. `review-as-is` means only that the assistant-normalized draft is structurally atomic. It does not mean correct, canonical, or admitted. Compound records are routed to splitting because one decision cannot safely govern several propositions. Interpretive records are routed to bounded rewrite because normalized language cannot acquire standing merely by pointing at an exact locator.

`DECISION_TEMPLATES.json` contains one inert template per queue row. Every action, reviewer, time, transaction identity, evidence list, correction, split, merge, and rationale field remains empty. No transaction has been executed. Automatic canon promotions and graph mutations remain zero.

The controlling question is whether a named reviewer can inspect each exact private locator and execute an explicit transaction without allowing assistant wording, record order, structural atomicity, or a successful verifier to impersonate source meaning or canon authority.
