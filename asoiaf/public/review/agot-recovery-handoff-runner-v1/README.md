# AGOT admitted recovery-handoff runner v1

This component turns the admitted public-safe handoff carrier into a directly executable repository checkout operation. It verifies every carrier chunk against `CARRIER.json`, reconstructs the exact 107,565-byte Windows ZIP in memory, rejects unsafe ZIP members, and extracts the forty-five-file package only into a user-selected local directory outside the repository.

The decoded object must be `asoiaf-agot-recovery-to-review-handoff-v1.zip` at SHA-256 `dd70c8c9d5de23db7014d8e4d89b73a52d24ecedc8986c4e42812e7820a390d9`. Its carrier must contain 143,420 RFC 4648 base64 characters at SHA-256 `ed5b5c481488c0e68887702bb6c0c36ac775677887638cde51e39b979d2af819`. Every declared chunk is checked for path, character count, SHA-256, Git blob SHA-1, and concatenation order before decoding.

`Run-Admitted-Recovery-Handoff.cmd` verifies and extracts the exact package beneath `LOCAL_AGOT_RECOVERY_HANDOFF`, then calls its existing `Run-Recovery-And-Resolve.cmd`. The inner package remains the authority-free, read-only physical scanner already admitted by its own contract. The runner does not scan private storage itself, copy any private object, display source prose, complete a review intake, execute a canon transaction, or mutate the graph.

Use `python reconstruct_handoff.py verify --repo-root <checkout>` for a non-writing qualification receipt. Use `python reconstruct_handoff.py extract --repo-root <checkout> --out <local-directory>` to reconstruct and safely extract the package. Existing nonempty output is refused unless `--force` is supplied, and `--force` still removes only the selected output directory rather than touching carrier or source objects.

The controlling question is whether repository-held carrier bytes can reproduce the exact public-safe operating package without allowing metadata, a successful workflow, local extraction, or inner-launcher execution to impersonate private source custody or an executed human review.
