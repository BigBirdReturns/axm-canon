# AGOT named-human disposition recorder

This component records one separately authored human disposition against one exact validated AGOT review intake. The upstream local workstation may display one private paragraph and save a text-free intake. Its validator may classify that intake as `PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR`. Neither operation records the later disposition.

`record_disposition.py` requires the exact intake bytes, the intake self-digest, a validation object bound to those exact bytes, a separately completed disposition, and a recording actor matching the disposition author. The disposition author must match the named reviewer in the intake. Machine-generated dispositions, reviewer or actor drift, duplicate JSON keys, source-text fields, symlink inputs, changed hashes, timestamp inversions, unauthorized effects, and output overwrite attempts are refused.

The four decisions retain separate holds. `ADMIT_EXACT_PROPOSITION` may bind one bounded reviewed proposition but ends at `LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD`. `REJECT_EXACT_PROPOSITION` ends at `CLOSE_INTAKE_WITHHELD`. `RETURN_FOR_CORRECTION` requires a distinct replacement intake hash and ends at `CORRECTED_INTAKE_WITHHELD`. `DEFER_PENDING_EVIDENCE` requires at least one evidence key and ends at `ADDITIONAL_EVIDENCE_WITHHELD`.

A successful receipt contains no private paragraph text and cannot write repository files, create commits, move references, push remotes, open pull requests, promote canon, or mutate the graph. The receipt uses a stable `SELF_DIGESTED_OUTPUT` preimage and is written with an exclusive no-overwrite operation.

Run the repository-native qualification under warnings-as-errors:

```text
python -W error -S verify.py
python -W error -S synthetic_campaign.py
```
