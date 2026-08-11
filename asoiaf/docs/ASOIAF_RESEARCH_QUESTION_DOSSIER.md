# ASOIAF research question dossier

The research-question dossier is the orientation actor between the qualified retrieval and collection estate and the separately qualified reviewed-claim transaction. It accepts one question, binds the question by digest, routes it through the forty-five-lane ASOIAF external atlas, and assembles the exact private, public, recalled, rejected, deferred, and unresolved objects already available for that question. It does not answer the question.

The dossier exists because the research estate now contains several deliberately separate kinds of knowledge. Holder-controlled book editions can return exact paragraph locators without disclosing text. Public structured interfaces can return normalized observations with complete acquisition and admission custody. Model recall and conversation synthesis can identify likely entities, relations, and open questions without authority. Source health can preserve blocked routes, unavailable records, lexical collisions, and changing review decisions. A useful research surface must make these objects visible together without flattening their standing.

## Question identity and routing

A research question is represented by:

```text
axm-asoiaf-research-question/1
```

The durable question record contains the SHA-256 of normalized question text, creator, creation time, selected lane identities, selected continuity identities, an explicit cross-continuity reason when more than one continuity is present, and the fixed statement that question text is not retained in the dossier. Its authority, graph, canon, and answer effects remain `none`.

The route is represented by:

```text
axm-asoiaf-research-route/1
```

Explicit lane selection is authoritative for the transaction. When no lane is supplied, the local router scores the qualified lane identifiers, labels, and aliases against normalized question text and returns a bounded deterministic lane set. Source routing combines lane-preferred source identities with registered sources whose role and continuity coverage match the question. The route freezes lane identities, source identities, continuity policies, response policies, and a route fingerprint.

The compiler refuses unknown lanes, empty continuity scope, silent multi-continuity research, a same-continuity lane that spans more than one continuity, and non-analogue continuities under an analogue-only lane. A cross-continuity comparison remains an explicit research operation rather than an accidental blend of book, companion, HBO, production-testimony, analysis, historical, or scientific records.

## Private exact-edition references

A private reference binds:

```text
atlas source identity
holder-selected edition identity
continuity identity
unit and paragraph identities
exact local locator
paragraph SHA-256
all, any, or phrase query mode
matched normalized terms
token positions
optional bounded snippet SHA-256 and character count
textRetained = false
standing = navigation-only
```

The dossier does not copy book text. Even an explicit snippet transaction enters the dossier by digest and bounded character count rather than by source text. Search rank, term frequency, phrase matching, and a returned locator remain navigation evidence. They cannot become a proposition or answer.

Private references must use a source registered for `local-private-only` custody, remain inside the question continuity, use a safe local locator, carry exact paragraph custody, and preserve `graphEffect=none` and `canonEffect=none`.

## Structured public references

A structured reference carries the complete acquisition receipt and fingerprinted semantic-admission record. The compiler verifies:

```text
registered atlas source
selected continuity
content-addressed acquisition receipt
raw-response SHA-256 and byte custody
rawResponseRetained = false
adapter receipt fingerprint
observation and candidate parity
content-addressed admission identity
admission fingerprint
question-lane parity
admissionAuthority = admission-only
graphEffect = none
canonEffect = none
```

An `admit-to-review` disposition enters as supporting-only, provenance-only, or constraint-only according to the source authority class. A `reject-off-topic` disposition remains visible as rejected. A `defer-insufficient-identity` disposition remains visible as deferred. Rejection and defer are not dropped merely because they cannot construct a claim. This preserves the live canary lesson that a technically valid Crossref result may still be an off-topic lexical collision.

Admission allows an observation to be considered by a later supporting-claim transaction. It does not make the observation evidence-ready, answer-ready, primary, or canonical.

## Recall references

Recall references bind candidate identity, packet identity, generator, selected continuity, and the qualified recall estate. They retain:

```text
authority = none
standing = navigation-only
graphEffect = none
canonEffect = none
```

A recall candidate may indicate which source, edition, entity, relation, chronology, or question should be investigated. It cannot become evidence because it has high confidence, matches the question lexically, or originated in a previous conversation. The dossier derives `reconcile-candidate` whenever recall references are present.

## Gaps and next actions

A dossier may retain explicit gaps for missing private sources, missing public records, unresolved editions, locator review, structured review, rejected or deferred dispositions, unreconciled recall, continuity conflicts, source conflicts, or an unresolved question. Every gap binds one lane and one continuity and remains `standing=unresolved`.

The next-action projection is deterministic. Depending on the retained objects and gaps, it may request:

```text
acquire-public-record
search-private-edition
resolve-edition
review-structured-observation
inspect-disposition
review-exact-locator
reconcile-candidate
split-continuity
close-gap
```

The projection schedules research. It does not execute acquisition, private search, review, reconciliation, graph mutation, or answer generation.

## Dossier boundary

The complete dossier is represented by:

```text
axm-asoiaf-research-question-dossier/1
```

It contains the question, route, sorted private references, sorted structured references, sorted recall references, sorted gaps, next actions, standing counts, content-derived identity, and fingerprint. It fixes:

```text
evidenceReady = false
answerReady = false
authority = none
graphEffect = none
canonEffect = none
answerEffect = none
```

This fixed boundary is intentional. The dossier is complete research orientation, not reviewed evidence compilation. A later actor must review exact private locators, accept or correct structured admissions, reconcile recall candidates, close gaps, and construct claim-level packets before any answer can acquire evidentiary standing.

## Operator transactions

```bash
npm run asoiaf:research-dossier -- route \
  --question 'Who is Varys and what is his relation to R’hllor?' \
  --continuity book-main

npm run asoiaf:research-dossier -- build \
  --input question-dossier-input.json \
  --out question-dossier.json

npm run asoiaf:research-dossier -- verify \
  --file question-dossier.json
```

The build input is holder-controlled JSON. It may include the raw question for the current local transaction, private reference metadata, structured acquisition and admission records, recall candidate identities, and gaps. The emitted dossier retains only the question digest and custody metadata. `verify` is read-only.

## Qualification boundary

Repository qualification uses synthetic, API-shaped acquisition, admission, private locator, recall, and gap fixtures. It performs no live network acquisition and reads no private edition text. The focused suite proves deterministic mixed dossiers, natural-language lane routing, visible off-topic rejection, visible identity defer, multi-continuity refusal, same-continuity refusal, stale acquisition refusal, admission-lane refusal, unknown-recall refusal, dossier tamper detection, and unsafe private-locator refusal. The permanent workflow also runs strict TypeScript, an operator smoke whose emitted dossier contains no raw question, the complete axm-canon test suite, and the production build.

The evidence tier is deterministic research-orientation qualification over synthetic custody references and the qualified atlas and recall estates. The venue is the holder-controlled research estate. The target is question routing, continuity safety, reference custody, standing separation, and explicit gap planning rather than ASOIAF truth. The upside is one inspectable map of what the estate knows, merely recalls, rejected, deferred, and still lacks. The downside is additional dossier state and gap maintenance. The failure mode is allowing route score, search rank, admission, structured metadata, or recall confidence to substitute for reviewed claim authority.

The control question is whether every research question can disclose which exact sources, editions, observations, admissions, recall candidates, continuities, and unresolved gaps were considered, why each item received its standing, and which separate transaction would be required before any answer could claim authority.