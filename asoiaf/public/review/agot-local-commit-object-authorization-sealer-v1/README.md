# AGOT local commit-object authorization sealer

This component follows the admitted named-human worktree diff-review recorder. It consumes one exact approval authorization, the exact self-digested review receipt, the independent review-validation result, and one separately authored commit-object plan from a different named actor. It does not inspect the repository or reopen either reviewed ledger postimage.

The plan binds the exact upstream bytes, repository identity, base commit, feature branch, change-set digest, commit-object actor, bounded transaction identifier, author identity, author timestamp, authorization timestamp, nonce, and zero-effect boundaries. The component derives the exact `axm-asoiaf-commit-object-authorization/2` object already required by the admitted temporary-index commit-object sealer. The commit message is mechanically limited to `Admit AGOT reviewed transaction <transactionId>`.

Outputs are restricted to an existing empty directory outside every Git worktree. The sealer writes one self-digested authorization and one self-digested receipt, with rollback after any partial write. It cannot read or modify the reviewed worktree, touch the live index, create a Git object, move a reference, push a remote, open a pull request, promote canon, or mutate the graph.

A successful operation stops at `PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_SEALED_OBJECT_CREATION_WITHHELD` with `LOCAL_COMMIT_OBJECT_CREATION_WITHHELD`. The next separately governed actor is the already admitted local feature commit-object sealer.
