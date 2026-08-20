# ASOIAF v4.2 recovery operator v1

This directory admits the exact qualified public recovery-operator successor archive `asoiaf-v4-2-recovery-operator-v1.tar.zst` at 10,686 bytes and SHA-256 `76e55f765d05203256fc0111e54a20e809048ac57650b1f2b2f86f76d45edc67`. The archive expands to eleven public control files. Its verifier passes 52 of 52 checks before packaging and after deterministic extraction, and its eight adversarial self-tests cover missing inputs, exact matches, wrong size, same-size digest mismatch, non-regular objects, symlinks, mixed refusal-plus-missing state, and deterministic receipts.

The operator verifies only the two exact prerequisite identities. The private root remains `asoiaf-private-world-estate-v4.1.tar.zst` at 244,436,743 bytes and SHA-256 `48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7`. The fourth-generation campaign remains `asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst` at 249,906 bytes and SHA-256 `a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02`.

The current execution receipt returns `HOLD_EXACT_ARCHIVES_UNAVAILABLE` with exit code 10 because both exact inputs remain absent. A symlink, non-regular object, wrong-sized file, or digest mismatch produces a hard refusal. Two exact matches produce only `READY_EXACT_INPUTS_VERIFIED_NOT_INTEGRATED`. No state copies, extracts, reconstructs, substitutes, uploads, commits, merges, or integrates an input. Every state records `v4_2Built: false` and `v4_2Claimed: false`.

The sealed predecessor `asoiaf-v4.2-recovery-kit-v0.1.tar.zst` remains absent at 23,112 bytes and SHA-256 `538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75`. This successor does not reproduce its bytes or acquire its exact identity. The continuation-v3 predecessor component therefore remains `payloadMaterialized: false`.

The control question is whether both exact prerequisite archives can be materialized and verified without allowing a manifest, old sandbox link, regenerated campaign, successful CI run, successor operator, or repository merge to impersonate missing bytes or private v4.2 integration.
