# AGOT commit-object receipt adapter

This component closes only the receipt-vocabulary discontinuity between the admitted temporary-index commit-object sealer and the admitted local feature-reference updater. It accepts one exact `/2` commit-object receipt and a separately authored adaptation authorization, verifies the repository and Git object graph, and emits the updater's exact `/1` receipt vocabulary.

The adapter does not release the reviewed worktree and does not move the feature reference. The exact downstream updater must therefore accept the adapted receipt far enough to return `REFUSE_CHECKED_OUT_BRANCH` while the reviewed branch remains checked out, then return `PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP` after a separate actor detaches the worktree. That worktree-release operation is outside this component.

A successful operation stops at `PASS_COMMIT_OBJECT_RECEIPT_ADAPTED_WORKTREE_RELEASE_WITHHELD` with `REVIEWED_WORKTREE_RELEASE_WITHHELD`. It writes only one exclusive receipt outside the repository. It cannot modify a worktree or live index, create a commit, move a reference, push a remote, open a pull request, promote canon, or mutate graph state.

Run qualification under warnings-as-errors:

```text
python -W error -S verify.py
python -W error -S synthetic_campaign.py
python -W error -S exact_updater_compatibility.py
```
