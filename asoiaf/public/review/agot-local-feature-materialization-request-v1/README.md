# AGOT local-feature materialization request sealer

This repository-native component follows the admitted named-human disposition recorder at `d5898d092ec4091395612ac0f4c555334acec21e`. It accepts only a valid `ADMIT_EXACT_PROPOSITION` receipt whose next authority hold is `LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD`, plus a separately authorized materialization plan by a different named actor.

The sealer binds the exact disposition-receipt bytes and self-digest, admitted proposition, private source-paragraph digest, request plan and self-digest, current repository base commit, governed feature branch, classification fields, reconciliation keys, subject keys, graph relation, and exact canon and graph ledger preimages. It derives one canonical append row for each of the two governed AGOT ledgers and computes the exact resulting postimage byte counts and SHA-256 values in memory.

The output persists the two append rows and postimage descriptors, but it does not write either postimage file. A successful request stops at `PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD` with `LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD`. It cannot modify a checkout, stage an index, create a commit, move a reference, push a remote, open a pull request, promote canon, or mutate the graph.

Private paragraph text and private payload fields are refused. Human action evidence, rationale, and request authorization evidence are carried forward only as SHA-256 bindings. Present preimages must be regular UTF-8 NDJSON files that end with a newline; absent preimages must be explicitly declared and supplied without a substitute path.

Run the repository-native qualification under warnings-as-errors:

```text
python -W error -S verify.py
python -W error -S synthetic_campaign.py
```
