# AGOT local-feature patch-bundle sealer

This component converts one exact, independently validated local postimage materialization receipt into a deterministic, public-safe patch bundle. It copies only the two governed ledger postimages, verifies their exact preimages and append-only relationship, and emits `PATCH_MANIFEST.json`, `repository.patch`, and `BUNDLE.SHA256SUMS` in an isolated empty directory.

The component does not reinterpret the admitted proposition, classifications, subject keys, reconciliation keys, graph relation, target paths, append rows, or postimage bytes. It verifies that the repository, base commit, feature branch, target paths, preimage identities, and postimage identities authorized for bundling are already present in the exact materialization receipt.

A successful operation stops at `PASS_LOCAL_FEATURE_PATCH_BUNDLE_SEALED_WORKTREE_EXECUTOR_COMPATIBILITY_WITHHELD`. The bundle is not evidence that the already admitted worktree executor accepts it. That compatibility transition remains separately withheld and must be proved against the exact executor package.

The runtime writes no checkout file, modifies no worktree or live index, creates no commit, moves no reference, pushes no remote, opens no pull request, promotes no canon, and mutates no graph state.

Run qualification under warnings-as-errors:

```text
python -W error -S verify.py
python -W error -S synthetic_campaign.py
```
