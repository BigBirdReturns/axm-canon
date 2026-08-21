# AGOT local named-human review workstation v1

This repository source implements a loopback-only local workstation for reviewing the forty-five atomic *A Game of Thrones* opening-gate candidates against thirty-one exact paragraphs in the holder-controlled private corpus. It is an operating surface, not a source package, review decision, canon transaction, or graph mutation.

The workstation accepts only `ASOIAF-PRIVATE-CORPUS.sqlite3` at 106,151,936 bytes and SHA-256 `71cf5fe7b22ee33e5deb21440acce40dd2102771edaddff2d3e4853fc5d50843`. It opens SQLite through `mode=ro&immutable=1`, enables `PRAGMA query_only=ON`, and refuses non-loopback binding. A separately named human reviewer is required.

The standalone operating package supplies `CANDIDATES.json`, which binds forty-five public-safe candidate statements to thirty-one exact private locators. Run `Run-Local-Review.cmd`, provide the exact database, candidate file, and reviewer name, and open the printed loopback URL. The interface displays one exact paragraph at a time. The reviewer may select only `confirm`, `correct`, `split`, `merge`, `reject`, or `defer`.

A saved intake contains the source and locator identities, source-paragraph SHA-256, reviewer, rationale, and action-specific fields. It never stores the paragraph text and remains `executed: false`, `canonEffect: none`, and `graphEffect: none`. `validate_intakes.py` may return `PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR`; it cannot execute the transaction.

A separately validated intake may proceed to the [`../agot-review-transaction-stager-v1/`](../agot-review-transaction-stager-v1/README.md). That component requires a different named staging executor and produces only a deterministic transaction candidate pending repository admission. It does not reopen the private corpus or inherit review, transaction, canon, or graph authority.

The repository verifier and synthetic campaign use noncopyrighted fixture paragraphs only. The current standing remains `HOLD_PRIVATE_CORPUS_NOT_MATERIALIZED` until the exact private SQLite corpus is physically recovered.
