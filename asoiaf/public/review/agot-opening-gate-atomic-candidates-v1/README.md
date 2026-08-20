# AGOT opening-gate atomic candidate carrier v1

This repository surface admits an exact base64 carrier for the public-safe atomic-candidate archive covering all thirty-one records in the *A Game of Thrones* opening gate. The reconstructed archive contains fourteen source-normalized atomic drafts, twenty-four split proposals, seven bounded rewrite proposals, forty-five inert human transaction templates, and three source-order review batches.

The reconstructed archive is `asoiaf-agot-opening-gate-atomic-candidates-v1.tar.zst`, 17,125 bytes at SHA-256 `2a1502f3f68ce4548d69a5dd2af770ffe4c5c67fcc9eb4ec885fb855246dbae4`. Its uncompressed tar is 174,080 bytes at SHA-256 `deccbdc810aa77b88331383824c8be83c630654a8c9fe8d25827b1764660a91f` and expands to eight files beneath `asoiaf/public/review/agot-opening-gate-atomic-candidates-v1/`. Git stores 6 ordered RFC 4648 base64 chunks totaling 22,836 characters at SHA-256 `00c8d026e385f4e8f31b7ec748377b5d3995cfe059d1bbacc417e6bd818295a3`. `CARRIER.json` fixes every chunk path, character count, digest, Git blob identity, concatenation order, decoded byte count, and decoded archive digest.

The binary archive path is intentionally absent from Git. Carrier reconstruction proves exact package identity only. It does not execute a review, supply private source text, promote canon, mutate the graph, or satisfy any parent record's human-review requirement.

Every candidate remains pending named human source review and is bound to its exact parent claim identifier, record fingerprint, edition, unit, paragraph, claim class, epistemic class, and derivation object. All decision fields remain empty. The repository test reconstructs the archive from the carrier, safely extracts it, supplies the admitted source, triage, and preparation objects, and requires exactly 112 verifier checks under warnings-as-errors.

The next admitted surface is [`../agot-opening-gate-review-intake-v1/`](../agot-opening-gate-review-intake-v1/README.md). It converts all forty-five candidates into exact private-source requests and inert transaction intakes without claiming that the absent source vault has been inspected.
