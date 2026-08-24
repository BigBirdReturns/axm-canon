# AGOT local-feature postimage materializer carrier

This directory carries the exact public-safe source package for `asoiaf-agot-local-feature-postimage-materializer-v1`. Nine ordered RFC 4648 base64 chunks reconstruct a deterministic 25,007-byte tar.gz archive at SHA-256 `17c001a91f8d1d6727b0baebfbff1f0ec3933ba59bc191732d912df546acea93`, expanding to ten repository-native source and test files.

The component follows the local-feature materialization request sealer admitted at `13621d4567875e05d40c5d29522ec87efb7b9f19`. It accepts one exact request, its independent validation receipt, a separately authored authorization, and any exact present preimages. It writes exactly two postimage files beneath an existing empty isolated output directory, preserves the governed repository-relative paths, and writes its receipt outside that directory.

The static verifier passes 127 of 127 checks. The noncopyrighted adversarial campaign passes 59 of 59 cases, including exact absent and present preimage handling, deterministic receipts, actor separation, output and receipt worktree refusals, duplicate-key and symlink refusals, postimage and receipt tamper detection, and rollback after injected partial-write failures.

Runtime success stops at `PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD` with `LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD`. Carrier reconstruction is not request execution. The package cannot modify a checkout, stage a live index, create a commit, move a reference, push a remote, open a pull request, promote canon, or mutate the graph. Real requests, authorizations, postimages, repository writes, worktree changes, commits, references, pushes, pull requests, canon promotions, and graph mutations remain zero.
