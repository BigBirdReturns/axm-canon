# ASOIAF structured acquisition source health

The structured-acquisition health actor audits the acquisition ledger as a first-class source-health surface. It does not fetch, refresh, normalize, review, or promote records. It reads the holder-controlled estate and verifies that the fingerprinted acquisition state, acquisition receipts, adapter receipts, collector observations, candidates, attempts, gaps, and retained cache identities still describe one coherent acquisition history.

This actor closes the chronological gap between the original external source-health qualification and the later policy-bounded structured acquisition implementation. The original source-health actor already audits the 219-source ledger, collector observations and candidates, rights-aware retention, cache parity, attribution, route observations, drift, refresh cadence, and repair worklists. The structured extension adds the signed-plan and network-policy receipt plane without granting that plane graph or canon authority.

## Surfaces

The audit reads these optional holder-controlled surfaces:

```text
structured-acquisition-state.json
structured-acquisition-receipts/*.json
structured-adapter-receipts/*.json
SOURCE-LEDGER.json
observations.ndjson
candidates.ndjson
gaps.ndjson
attempts.ndjson
```

An estate with none of the structured-acquisition surfaces is valid and reports an empty acquisition ledger. Once any acquisition or adapter receipt exists, the state and receipt chain must satisfy the complete custody law.

## State custody

The acquisition state is a fingerprinted projection over the latest successful network-backed acquisition for each request identity. Every state entry must provide a nonempty request identity, lowercase SHA-256 plan fingerprint, safe estate-relative receipt URI, valid completion time, and `observed` or `partial` outcome. Duplicate request identities are forbidden. Each entry must point to the exact acquisition receipt with matching request identity, plan fingerprint, completion time, and outcome.

Cache replays do not replace the successful state entry. They are separately content-addressed receipts and attempts that point back to a prior `observed` or `partial` acquisition with the same request plan, raw response, adapter receipt, observations, and candidates.

## Acquisition receipt custody

Each acquisition receipt is verified for:

```text
format and canonical fingerprint
content-derived receipt identity and filename
registered adapter-to-source relationship
registered requested and final HTTPS endpoint
robots URL bound to the requested origin
robots digest shape
safe integer request, wait, redirect, and record counts
rawResponseRetained = false
graphEffect = none
canonEffect = none
committed record, observation, and candidate parity
collector observation and candidate existence
collector attempt parity
gap existence when a gap is named
```

A successful `observed` or `partial` receipt must record a positive network request count, successful JSON HTTP result, positive raw response byte count, raw response SHA-256, adapter receipt fingerprint, usable robots decision, and no terminal gap. A `cache-hit` receipt must record zero requests, zero wait, zero redirects, and a matching `cache-replay` collector attempt. It must also identify a prior network-backed success with the same plan and retained custody.

The audit treats route, robots, response, adapter, observation, or candidate changes between successful acquisitions as explicit drift. Drift is a warning and produces an `inspect-drift` repair task rather than silently classifying the source as fresh. Acquisition drift has no graph or canon effect.

## Adapter and collector parity

The adapter receipt path remains deterministic from the request identity. The adapter receipt must have a valid fingerprint and agree with the acquisition receipt on adapter, source, request identity, raw response SHA-256, raw response byte count, committed count, observation identities, and candidate identities. Missing or overwritten adapter custody is a blocking ledger finding.

Every acquisition observation must exist in the collector observation ledger, belong to the same atlas source, and identify the corresponding collector candidate. Every candidate must exist and contain the observation. Every successful acquisition receipt must have exactly one collector attempt whose receipt URI, request identity, request count, replay flag, outcome, and gap status agree with the acquisition receipt.

An adapter receipt that is not referenced by an acquisition receipt remains visible as a normalization-only notice. It is not silently deleted or promoted.

## Operator transactions

```bash
npm run asoiaf:structured-acquisition:health -- audit \
  --root .asoiaf-external-estate

npm run asoiaf:structured-acquisition:health -- verify \
  --root .asoiaf-external-estate
```

`audit` returns the state, receipt, replay, and adapter counts plus every error, warning, and notice. `verify` returns only blocking errors and exits nonzero when custody is invalid. Neither command performs network access or mutates the estate.

## Qualification boundary

Repository qualification constructs synthetic holder-controlled estates that reproduce a valid structured acquisition, its adapter receipt, normalized collector observation, candidate, attempt, and state projection. The focused suite proves empty-ledger validity, exact parity, stale state refusal, missing adapter refusal, raw-response retention refusal, valid zero-request replay, fabricated replay refusal, acquisition drift visibility, and missing attempt detection. The permanent workflow also runs the existing external source-health suite, an operator smoke transaction over a pristine estate, strict TypeScript, the complete axm-canon test suite, and the production build.

The evidence tier is deterministic source-health and custody qualification over synthetic estates. The venue is the holder-controlled external collector estate. The target is acquisition state, receipt, adapter, collector, replay, and drift integrity rather than endpoint availability in real time or the truth of an ASOIAF claim. The upside is that structured acquisitions remain auditable after normalization and replay. The downside is that historical adapter receipts must remain available for old acquisition receipts, which exposes any overwrite-based retention defect. The failure mode is allowing acquisition history to drift, disappear, or lose raw-response and collector parity while downstream normalized values continue to appear healthy.

The control question is whether every structured acquisition still has a valid state projection, content-addressed receipt, adapter receipt, raw-response identity, normalized observation, collector candidate, matching attempt, replay origin, and visible drift history while remaining incapable of promoting itself.