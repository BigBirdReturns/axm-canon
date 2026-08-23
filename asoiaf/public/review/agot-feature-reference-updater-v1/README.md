# AGOT local feature-reference updater carrier

This directory carries the exact source-reconstructed `asoiaf-agot-feature-reference-updater-v1.zip` package. The decoded object is 19,441 bytes at SHA-256 `eacc45d23dece6763fd13a1ca39e190220a266df673e4a39ae5b9afed4cae2c8` and expands to thirteen public-safe files.

The component follows the admitted temporary-index commit-object sealer. It verifies one exact unreferenced commit object, its single parent, tree, two-path diff, unchecked-out feature branch, repository identity, authorization, and expected old value before an explicit `git update-ref` compare-and-swap.

The carrier and repository test consume no real commit-object receipt and execute no local reference update. Real worktree mutations, live-index mutations, remote pushes, pull requests, canon effects, and graph effects remain zero.
