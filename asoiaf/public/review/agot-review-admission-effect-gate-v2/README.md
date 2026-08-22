# AGOT review admission and effect gate v2

This repository-native source successor follows the admitted transaction stager and projection planner. It consumes one public-safe transaction candidate, one action-specific projection, their exact chain receipt, and two separately signed authorizations.

A named repository-admission actor may seal one append-only ledger entry. A different named effect-packet actor may seal one `PASS_REPOSITORY_EFFECT_PACKET_SEALED_PENDING_SEPARATE_PR` object. The gate supports `confirm`, `correct`, `split`, `merge`, `reject`, and `defer`.

The source is admitted directly rather than through an unavailable predecessor archive. It makes no byte-equivalence claim to the earlier unadmitted local package. It never reads or persists private source text, writes Git, opens or merges a pull request, applies a patch, promotes canon, or mutates the graph.
