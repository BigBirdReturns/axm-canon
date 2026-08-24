# AGOT local-postimage patch-bundle sealer carrier

This directory carries the exact public-safe source package for `asoiaf-agot-local-postimage-patch-bundle-sealer-v1`. 10 ordered RFC 4648 base64 chunks reconstruct a deterministic 29,217-byte tar.gz archive at SHA-256 `3c9cfc5ebd9576f898d1f5442e25919c3577511bc67361c67f043eb413eb4e12`, expanding to ten repository-native source and test files.

The component follows the postimage materializer admitted at `ca74f4a51a18a754f21bfdbab8ca2782d3c5665b`. It consumes one exact request, request validation, materialization receipt, materialization validation, two isolated postimages, exact preimages where present, and a separately authored patch-bundle authorization. It emits the four-file interface already accepted by the admitted clean-worktree executor: `PATCH_MANIFEST.json`, two proposed ledger postimages, and deterministic `repository.patch`.

The component does not reinterpret proposition text, classification, reconciliation keys, graph relations, or append rows. It verifies exact upstream bytes and derives the patch only from exact preimage and postimage bytes. The patch-bundle actor must differ from the reviewer, disposition author, requester, and materializer.

Static qualification passes 199 of 199 checks. The noncopyrighted adversarial campaign passes 62 of 62 cases. A direct compatibility replay through the admitted worktree executor passes preflight and explicit apply while leaving HEAD and the live index unchanged.

Runtime success stops at `PASS_LOCAL_POSTIMAGE_PATCH_BUNDLE_SEALED_WORKTREE_APPLICATION_WITHHELD` with `LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD`. Carrier reconstruction and repository qualification do not consume a real request, seal a real bundle, modify a worktree, create a commit, move a reference, push a remote, open a pull request, promote canon, or mutate the graph.
