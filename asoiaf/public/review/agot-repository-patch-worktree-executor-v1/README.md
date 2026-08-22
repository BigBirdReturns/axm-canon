# AGOT repository patch worktree executor v1

This directory admits the exact current source-reconstructed public-safe package `asoiaf-agot-repository-patch-worktree-executor-v1.zip`. The package is 16,232 bytes at SHA-256 `02abfe23c19170796cda38750e80efa69cf090370dfb8f568f12e766ec704ff8` and expands to twelve files.

The component accepts one separately validated patch bundle, one exact clean local feature branch, and one separately named worktree executor. It verifies the branch, HEAD, live index, worktree, target preimages, package identities, and the two permitted AGOT ledger paths before an explicit local write. Post-write verification checks the exact changed-path set, `git diff --check`, unchanged HEAD, and unchanged live index; failure restores the original target preimages.

The static verifier passes 54 of 54 checks and the noncopyrighted campaign passes 17 of 17 checks before packaging and after fresh carrier extraction. No real patch bundle was consumed, no worktree was changed, no live index was mutated, no commit or local reference was created, no remote branch or pull request was touched, and canon and graph effects remain none.

The controlling question is whether the first real patch application changes only the two exact governed ledger postimages while preserving the live index, HEAD, local references, remote state, and every later admission boundary.
