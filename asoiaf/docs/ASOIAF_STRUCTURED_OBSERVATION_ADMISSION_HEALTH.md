# ASOIAF structured observation admission health

The structured-observation admission health actor audits the semantic disposition ledger between normalized structured acquisition and reviewed claim construction. It does not acquire source data, issue an admission decision, construct a reconciliation packet, or promote canon. It verifies that every retained `admit-to-review`, `reject-off-topic`, or `defer-insufficient-identity` disposition remains bound to the exact acquisition receipt, adapter receipt, collector observation, collector candidate, normalized digest, question lanes, identity evidence, relevance evidence, named reviewer, and review time that produced it.

This actor closes the maintenance gap exposed by the live structured-acquisition canary. The canary correctly acquired and normalized a Crossref record whose title overlapped “A Song of Ice and Fire,” while its DOI, container, and publisher identified an unrelated work. The admission actor records that semantic result as `reject-off-topic`. The health actor ensures that the rejection remains visible, content-addressed, current, and incapable of silently changing into an admitted claim.

## Holder-controlled surfaces

The audit reads these optional estate surfaces:

```text
structured-observation-admissions/
  admission-<admission-fingerprint-hex>.json
structured-observation-admission-state.json
structured-acquisition-receipts/*.json
observations.ndjson
candidates.ndjson
```

An estate with no admission surfaces is valid and reports an empty admission ledger. Once an admission record exists, the fingerprinted current-state projection is required.

The semantic admission identity retains its content-addressed form:

```text
asoiaf-structured-observation-admission:<content-id>
```

The filesystem name deliberately uses the lowercase SHA-256 fingerprint instead of the semantic identity. Colon-bearing semantic identifiers are not portable to NTFS and caused a real artifact-path failure during the live canary. The portable filename is therefore:

```text
admission-<64 lowercase hexadecimal characters>.json
```

The admission record still retains its complete semantic identity and fingerprint internally. Filesystem portability does not weaken content custody.

## Admission integrity

Each admission is verified for:

```text
format and canonical fingerprint
content-derived semantic admission identity
portable fingerprint filename
registered source, adapter, request, and plan identities
acquisition receipt identity and fingerprint
adapter receipt fingerprint
collector observation and candidate identities
normalized observation SHA-256
canonically sorted question lanes
canonically sorted identity and relevance evidence
outcome-to-reason compatibility
outcome-specific evidence effect
named reviewer and valid review time
admissionAuthority = admission-only
graphEffect = none
canonEffect = none
```

An admitted observation must retain at least one `supports-admission` evidence row. An off-topic rejection must retain `supports-rejection` evidence. An identity defer must retain an `unresolved` evidence row. The evidence rows preserve both the machine field and the reviewer’s explanation, so a DOI, ISBN, title, creator, container, publisher, subject, canonical URI, upstream record, revision, edition, continuity, or other identity signal cannot be silently reinterpreted later.

The acquisition receipt must remain content-addressed and agree with the admission on source, adapter, request identity, plan fingerprint, acquisition receipt fingerprint, adapter receipt fingerprint, observation identity, and candidate identity. The collector observation must agree on source, candidate, and normalized digest. The current candidate must contain the observation. An admission may not predate either acquisition completion or normalized observation custody.

## Current-state projection and history

The admission directory is append-only. A later review does not overwrite the earlier disposition. The current-state projection contains one entry per observation and points to the latest admission by review time, with admission identity as the deterministic tie-breaker. The state binds:

```text
observation identity
candidate identity
admission identity
safe estate-relative admission URI
review time
current outcome
state fingerprint
```

Duplicate observation rows, unsafe URIs, stale state fingerprints, missing admission files, state-to-admission mismatch, and a state row that does not identify the latest disposition are blocking ledger defects. Two different dispositions at the same latest review time are ambiguous and require reviewer repair.

A change in outcome or reason becomes `structured-admission-disposition-drift` and an `inspect-disposition` maintenance task. A reviewer change remains a separate visible notice. A defer may legitimately become an admission after exact identity evidence arrives, and an admission may legitimately become a rejection after a work-identity correction. Source health records the transition without converting it into graph or canon state.

## Operator transactions

```bash
npm run asoiaf:structured-admission:health -- audit \
  --root .asoiaf-external-estate

npm run asoiaf:structured-admission:health -- verify \
  --root .asoiaf-external-estate
```

`audit` returns history and current-state counts, current admitted, rejected, and deferred counts, disposition-change count, and every error, warning, and notice. `verify` returns only blocking errors and exits nonzero when custody is invalid. Both commands are read-only and perform no network access.

## Qualification boundary

Repository qualification builds synthetic holder-controlled estates with a structured acquisition receipt, normalized collector observation, collector candidate, portable admission records, and a fingerprinted current-state projection. The focused suite proves empty-ledger validity, admitted custody, healthy off-topic rejection, healthy identity defer, missing-state refusal, stale fingerprint and identity refusal, acquisition-plan mismatch refusal, visible defer-to-admit drift, stale-current-state refusal, and NTFS-safe admission filenames. The permanent workflow also runs the existing structured-acquisition and external source-health suites, a read-only operator smoke over an absent estate, strict TypeScript, the complete axm-canon test suite, and the production build.

The evidence tier is deterministic semantic-disposition and maintenance qualification over synthetic holder-controlled estates. The venue is the external collector and source-health estate. The target is admission identity, current-state, acquisition parity, collector parity, reviewer custody, and disposition drift rather than the truth of an ASOIAF proposition. The upside is durable quarantine of lexical collisions and visible evolution of review decisions. The downside is an append-only admission history and a required current-state projection. The failure mode is allowing an admission to lose its acquisition or identity evidence, allowing rejection or defer to disappear, or treating a current admission as adjudicating authority.

The control question is whether every structured observation can preserve its complete sequence of admission, rejection, and defer decisions, identify the exact evidence and reviewer behind the current disposition, remain bound to acquisition and collector custody, and still stay mechanically separate from canon authority.