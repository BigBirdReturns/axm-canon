# ASOIAF reviewed answer packet

The reviewed answer packet is the final assembly actor above the qualified ASOIAF research dossier and reviewed reconciliation floor. It does not search private editions, acquire public records, normalize structured responses, admit observations, review source rights, reconcile canon candidates, or generate free-form prose. It accepts the exact outputs of those actors and determines whether bounded human-reviewed answer text may be rendered with complete sentence-level custody.

The research dossier and reconciliation packet solve different problems. The dossier identifies the bounded question, selected continuities, routed sources, exact private locators, admitted or rejected structured observations, recall candidates, and unresolved gaps. It fixes `evidenceReady=false` and `answerReady=false`. Reconciliation determines whether exact reviewed primary evidence confirms, corrects, splits, merges, rejects, or defers specific recall candidates. It may change canon state through its own all-or-nothing compiler, but it does not determine which reviewed statements belong in a user-visible answer. The answer packet requires both planes and preserves their authority boundaries.

## Transaction custody

Each reconciliation transaction entering an answer packet is represented by:

```text
axm-asoiaf-reviewed-answer-transaction/1
```

The transaction contains one external review packet and its exact external reconciliation receipt. Its content-derived identity binds:

```text
review packet identity and fingerprint
reviewed observation identity
source and continuity identity
external reconciliation receipt fingerprint
evidence-bundle fingerprint
canon reconciliation receipt fingerprint
transaction fingerprint
```

The answer transaction requires a passed external reconciliation receipt and a passed canon receipt. It does not require the source-wide reconciliation work order to be globally complete. A source work order may contain unrelated candidates that remain pending. The relevant authority test occurs at the answer-claim level, where every rendered statement must cite exact non-deferred resolutions and exact primary evidence records promoted by reconciliation.

This distinction prevents two opposite failures. Requiring the entire source work order to be complete would block a bounded answer merely because unrelated candidates remain open. Allowing a passed receipt without claim-level checks would permit an answer to cite evidence or decisions that the receipt did not actually promote. The transaction establishes valid reconciliation custody; the claim establishes exact adjudicated support.

## Reviewed answer claims

Each answer claim is bounded reviewed text rather than a model-generated assertion. The claim fixes:

```text
claim identity and render order
continuity identity
reviewed text and SHA-256
character count
answer transaction identity
review packet and observation identities
source identity
external and canon receipt fingerprints
evidence-bundle fingerprint
primary evidence-record identities
exact locator identities
non-deferred resolution decision identities
resolved candidate identities
resolution actions
standing = adjudicated-primary
graphEffect = none
canonEffect = none
```

The compiler accepts only `confirm`, `correct`, `split`, or `merge` resolutions. A rejected or deferred decision cannot support rendered answer text. Every cited evidence record must exist in the reviewed packet, carry primary authority, and appear in the canon receipt’s promoted-record set. Every cited resolution must cite at least one of the claim’s evidence records. Every candidate resolved by the claim must already appear in the question dossier’s recall set. The claim continuity must be present in the dossier and equal the continuity of its review packet.

Structured metadata remains supporting, provenance, or constraint evidence under the existing authority matrix. A successful HTTP response, normalized record, semantic admission, or supporting claim cannot become answer text merely because it is useful or precise. It may orient research or support a primary claim, but the rendered statement must remain attached to adjudicating primary evidence.

## Gap closures and limitations

A research dossier is immutable. Later review may resolve a gap that was open when the dossier was compiled, but the answer actor must not rewrite the earlier research record. A content-addressed gap closure records that later event:

```text
axm-asoiaf-reviewed-answer-gap-closure/1
```

A closure binds one dossier gap, one or more adjudicated answer claims, a substantive reviewer rationale, and a closure fingerprint. Candidate, observation, and source identities named by the gap must be present in the closing claims. A closure remains `standing=resolved-by-adjudicated-claim`, `graphEffect=none`, and `canonEffect=none`; any canon effect already occurred in the separate reconciliation transaction.

A gap that is not closed must appear in an explicit answer limitation. Rejected and deferred structured observations must also appear in limitations rather than disappearing from the rendered record. Each limitation carries reviewed text, a digest, related gap or reference identities, and `standing=explicit-limitation`. A gap cannot be both closed and retained as a limitation.

An answer packet with any limitation has `scope=partial`. A packet with no limitations has `scope=bounded-complete`, which means complete only for the exact question, continuity scope, claims, and transactions represented by that packet. It does not claim comprehensive knowledge of ASOIAF, complete source collection, or closure of every candidate in a source-wide work order.

## Rendering

The complete packet is represented by:

```text
axm-asoiaf-reviewed-answer-packet/1
```

The packet binds the exact dossier identity and fingerprint, question identity and digest, continuity scope, named answer reviewer, review time, sorted reconciliation transactions, ordered answer claims, gap closures, limitations, rendered-text SHA-256, rendered character count, packet fingerprint, and content-derived packet identity.

Rendering is deterministic. Claims appear in their reviewed order. Each claim is followed by a citation token derived from its source and exact locator identities:

```text
[source-id:locator-id]
```

Explicit limitations appear under a `Limits:` heading. The renderer performs no inference, paraphrase, summarization, retrieval, ranking, source selection, reconciliation, or promotion. It emits only the reviewed text already fixed in the packet. Any change to text, citations, decisions, closures, limitations, or custody invalidates the packet fingerprint and rendered-text digest.

The fixed authority boundary is:

```text
answerReady = true
renderAuthority = reviewed-text-only
acquisitionAuthority = none
reconciliationAuthority = none
graphEffect = none
canonEffect = none
answerEffect = render-reviewed-packet
```

`answerReady=true` is local to the reviewed packet. It means the renderer may reproduce the packet’s exact reviewed text. It does not grant the renderer authority to answer a different question, extend a sentence, change a continuity, add a citation, close a gap, or reinterpret evidence.

## Operator transactions

The operator exposes four local transactions:

```bash
npm run asoiaf:reviewed-answer -- transaction \
  --input reviewed-transaction-input.json \
  --out reviewed-transaction.json

npm run asoiaf:reviewed-answer -- build \
  --input reviewed-answer-input.json \
  --out reviewed-answer-packet.json

npm run asoiaf:reviewed-answer -- verify \
  --file reviewed-answer-packet.json

npm run asoiaf:reviewed-answer -- render \
  --file reviewed-answer-packet.json \
  --out reviewed-answer.txt
```

`transaction` verifies the review packet and reconciliation receipt before binding them. `build` validates the dossier, transactions, claims, closures, limitations, and complete authority boundary before writing a packet. `verify` is read-only and returns all findings. `render` first verifies the entire packet and refuses to emit text when any custody field is stale or inconsistent.

The operator reads holder-controlled JSON. It performs no network requests and does not open private source files. The packet may include reviewed normalized statements and exact private locators, but it must not contain source prose merely because the underlying evidence was holder-controlled.

## Qualification boundary

Repository qualification uses a synthetic holder-controlled AGOT observation, one primary reviewed claim, one confirm decision, one qualified research dossier, and one reviewed answer claim. The fixture contains no book text. It proves that a bounded answer may cite an exact confirmed candidate even when unrelated candidates in the source work order remain pending, because the rendered claim itself binds the exact approved decision and promoted primary evidence.

The focused suite proves deterministic packet and rendering identity, exact citation custody, dossier-candidate confinement, supporting-evidence refusal, incomplete-reconciliation refusal, mandatory gap closure or limitation, partial-scope rendering, and text, citation, closure, rendered-output, packet-fingerprint, and packet-identity tamper detection. The permanent workflow also runs strict TypeScript, the command-line build, verify, and render path, the complete axm-canon test suite, and the production build. It performs no live acquisition and reads no private edition text.

The evidence tier is answer-assembly mechanism qualification over synthetic reviewed custody. The venue is the integrated question-dossier and reconciliation floor. The target is the last custody boundary between adjudicated claims and user-visible text rather than the truth of a production ASOIAF answer. The upside is deterministic sentence-level provenance, explicit residual uncertainty, and mechanical refusal of unsupported fluency. The downside is the preparation cost of reviewed text segments, exact citations, gap dispositions, and limitation ledgers. The failure mode is allowing dossier orientation, recall confidence, supporting metadata, unresolved gaps, or model narration to substitute for promoted primary evidence and exact non-deferred decisions.

The control question is whether every rendered sentence can identify the bounded question it answers, the continuity it belongs to, the exact primary evidence and locator supporting it, the reconciliation decision that admitted it, the reviewer who approved the assembly, and every unresolved matter deliberately excluded or preserved as a limitation.