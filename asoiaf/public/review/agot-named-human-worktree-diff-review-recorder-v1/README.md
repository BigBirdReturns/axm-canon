# AGOT named-human worktree diff-review recorder

This component records one separately authored human review of the exact two-path worktree state produced by the admitted AGOT clean-worktree executor. It binds the exact application receipt and worktree authorization, recomputes the current repository identity, fixed head and branch, exact changed paths, clean live index, `git diff --check`, and the change-set digest derived from Git base bytes and current worktree bytes.

The reviewer must be separately named, must differ from the worktree executor, and must supply human-action evidence, reason codes, rationale, a nonce, and a UTC review timestamp. Machine-generated reviews, duplicate JSON keys, symlink inputs, source-bearing fields, changed repository state, output overwrite, and downstream-effect requests are refused.

`APPROVE_LOCAL_COMMIT_OBJECT` emits the exact `axm-asoiaf-human-diff-review-authorization/2` object already required by the admitted commit-object sealer and stops at `LOCAL_COMMIT_OBJECT_CREATION_WITHHELD`. Rejection, correction, and deferral emit no commit authorization and retain their own next-authority holds.

The recorder does not modify the worktree or live index, create a Git object, move a reference, push a remote, open a pull request, promote canon, or mutate the graph. Run repository-native qualification under warnings-as-errors:

```text
python -W error -S verify.py
python -W error -S synthetic_campaign.py
python -W error -S compatibility_campaign.py --worktree-executor <exact-source-root> --commit-sealer <exact-source-root>
```
