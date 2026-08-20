# ASOIAF repository-state reconciliation v1

This directory replaces the operational function of the missing `axm-canon-state-refresh-v0.2.tar.zst` packet with a repository-native current-state object. It does not recover, reconstruct, apply, replay, or impersonate that packet. The historical packet remains fixed at 3,596 bytes and SHA-256 `bd4b5f0d5fb46d9cc50e100f8911f7f066f8257c20056fc0928014576a47e533`; its patch remains identified by SHA-256 `34ddb453952805d99e51ed9638e84871bfa455b566272a05ab13916a096d1b28`, and its repository replay remains identified by SHA-256 `09dc60b62e0dcd935417dc71b2b9ac0a81d7f3243ea26def36270d2a657c7ac3`.

The historical packet was prepared against commit `fec0ddc9a5697d465ac46e55b7e3cb7647221952`. The repository has since admitted the exact public-safe six-edition corpus, the released-*Winds* witness successor, the bounded So Spake Martin successor, multilingual terminology and reception successors, public-source descent, their five-component reconciliation stack, and the fail-closed v4.2 recovery source. Applying an absent exact-base patch over that successor chain would be both evidentially unsupported and operationally stale.

`STATE.json` therefore derives standing only from repository-held admissions, exact component identities, merge and qualification receipts, and explicit external holds. It records six private edition identities, 458 ordered source units, 45,828 paragraph locators, 805 review candidates, 254 entity candidates, 31 opening-gate records, 219 external source identities, and 45 research lanes. It also records seven repository-native continuation successor lanes while retaining all seven sealed continuation-v3 predecessor archives as unmaterialized identities.

The distinction among functional succession, exact predecessor custody, and private integration is mandatory. The seven public successor lanes close the continuation-v3 functional surface, but they do not materialize the sealed v3 wave or any component predecessor. The fourth-generation campaign archive and the private v4.1 estate archive remain absent. The recovery source continues to report `HOLD_EXACT_ARCHIVES_UNAVAILABLE`, and v4.2 remains unbuilt and unclaimed.

`SUPERSESSION.json` records why the historical patch must not be applied or reconstructed. `verify.py` checks the current repository paths, the historical five-component stack as a retained snapshot, the recovery hold, all exact predecessor identities, the corpus census, and every authority boundary. Automatic canon promotions and graph mutations remain zero.

The control question is whether current standing can be regenerated from admitted repository receipts and exact hold identities without allowing an absent patch packet, obsolete base, documentation count, successful CI run, or successor component to impersonate historical bytes, source authority, canon authority, graph authority, or private v4.2 integration.

## Verification

```bash
python asoiaf/public/continuation/2026-08-20-repository-state-reconciliation-v1/verify.py
```
