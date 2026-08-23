# AGOT remote feature-push operator carrier

This directory carries the exact source-reconstructed `asoiaf-agot-remote-feature-push-operator-v1.zip` package. The decoded object is 14,610 bytes at SHA-256 `e4955137e16cd5b6659dc1fc69086572ef7fe62d0721533c8342b846c0551642` and expands to thirteen public-safe files.

The component follows the admitted local feature-reference updater at commit `af2d05a17c1f9c632774ba159c63b13a305964a1`. It verifies one exact reference-update receipt, local branch and commit identity, single-parent ancestry, the exact two governed ledger paths, `origin`, the exact remote base commit, and the exact old value or absence of the remote feature branch before an explicit leased push.

Existing remote feature branches use exact `--force-with-lease=<ref>:<old>` compare-and-swap. Intentionally absent branches use the same explicit lease with an empty expected old value. The package cannot push `main`, `master`, tags, deletions, or unrelated references. It cannot open or merge a pull request, modify the local worktree or index, read private source, promote canon, or mutate the graph.

The carrier and repository test consume no real reference-update receipt and execute no real remote push. Pull requests, merges, branch deletions, canon effects, and graph effects remain zero.
