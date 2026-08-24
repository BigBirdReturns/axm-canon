# AGOT end-to-end authority-continuity auditor

This repository-native public-safe component verifies that the admitted AGOT review machinery forms one ordered authority lane from the local named-human review workstation through the post-merge admission verifier. It inspects only public admission metadata and source-control identities. It does not read a private paragraph, consume a real transaction receipt, invoke any component runtime, or execute any repository effect.

The auditor binds sixteen component identities, their successful status boundaries, their next-authority holds, the exact public metadata files used for each determination, the current repository commit and tree, and the unchanged working state. It refuses a missing or reordered component, absent status or hold, duplicate identity, symlink metadata, duplicate JSON keys, private-source fields, nonzero runtime-effect counts, automatic canon or graph effects, repository drift during inspection, output inside the repository, and output overwrite.

A successful audit emits `PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD` and retains `FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD`. The independent validator checks the receipt self-digest, ordered component list, ordered status and hold digests, repository bindings, zero substantive census, and every no-effect boundary.

The auditor cannot display or review source, record a disposition, seal a materialization request, write postimages, construct or apply a patch, approve a worktree diff, create a Git object, move a reference, push a branch, create or ready a pull request, merge, promote canon, or mutate the graph. Its purpose is to prove that those separately governed transitions are admitted in one continuous order without allowing programme-level inspection to impersonate any of them.

Run the repository-native qualification under warnings-as-errors:

```text
python -W error -S verify.py
python -W error -S synthetic_campaign.py
```

A real audit must write its receipt outside the repository:

```text
python -W error -S audit_lane.py --repository-root <axm-canon-checkout> --output <outside-path>/CONTINUITY_RECEIPT.json
python -W error -S validate_receipt.py --receipt <outside-path>/CONTINUITY_RECEIPT.json
```
