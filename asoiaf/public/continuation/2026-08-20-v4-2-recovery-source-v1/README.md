# ASOIAF v4.2 fail-closed recovery source

This directory materializes a repository-native verification operator for the two exact archives that control any future private v4.2 integration. It is a new public-safe successor identity. It is not the sealed `asoiaf-v4.2-recovery-kit-v0.1.tar.zst` object, does not reproduce that archive, and does not change the continuation-v3 predecessor component from `payloadMaterialized: false`.

The operator recognizes only two admissible inputs: `asoiaf-private-world-estate-v4.1.tar.zst` at 244,436,743 bytes and SHA-256 `48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7`, and `asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst` at 249,906 bytes and SHA-256 `a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02`. Both remain absent from repository custody.

`operator.py` may stat candidate paths, stream their bytes through SHA-256, and emit a JSON verification receipt. It cannot copy, move, rename, extract, mount, reconstruct, substitute, rewrite, or integrate either input. A successful match produces `READY_EXACT_ARCHIVES_VERIFIED`, but the receipt still records `integrationAuthorized: false`, `v4_2Built: false`, and `v4_2Claimed: false`.

The refusal states are independently typed. Missing paths produce exit 10. Wrong byte counts produce exit 20. Correct-sized files with wrong digests produce exit 21. Unsafe I/O produces exit 30. `verify.py` exercises missing, size-mismatch, digest-mismatch, and exact-match cases with bounded fixtures and statically rejects extraction, copying, movement, and subprocess machinery.

A previously qualified local package, `asoiaf-v4-2-recovery-operator-v1.tar.zst`, is identified at 10,686 bytes and SHA-256 `76e55f765d05203256fc0111e54a20e809048ac57650b1f2b2f86f76d45edc67`. Its Git blob identity is recorded for continuity, but it is not reachable from this tree and no package-materialization claim is made. The source files in this directory are the admitted candidate surface.

The current execution remains `HOLD_EXACT_ARCHIVES_UNAVAILABLE`. Automatic canon promotions and graph mutations remain zero. The controlling question is whether both exact input archives can be materialized and independently verified without allowing a matching filename, partial archive, reconstruction, substitute, successful CI run, or ready receipt to authorize private integration or impersonate v4.2 custody.

## Use

```bash
python asoiaf/public/continuation/2026-08-20-v4-2-recovery-source-v1/verify.py
python asoiaf/public/continuation/2026-08-20-v4-2-recovery-source-v1/operator.py \
  --private /path/to/asoiaf-private-world-estate-v4.1.tar.zst \
  --campaign /path/to/asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst \
  --receipt /path/to/verification-receipt.json
```
