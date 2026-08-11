# ASOIAF source-estate ownership

The ASOIAF source estate has three cooperating modules inside this repository. They share one atlas and remain separated by authority.

## Collection and custody

`asoiaf/tools/lib/asoiaf-external-collector.ts` owns bounded acquisition, local custody, append-only observations, candidates, gaps, attempts, receipts, disposable caches, and required public attribution. Collection cannot review or promote canon.

## Reviewed reconciliation

`asoiaf/src/external/reconciliation-packets.ts` owns the bridge from reviewed observations into the portable reconciliation formats under `src/canon/reconcile/`. It requires source identity, continuity, rights, exact locators, reviewer identity, and a lawful authority role before any decision can be compiled.

## Source health and maintenance

`asoiaf/tools/lib/asoiaf-external-source-health.ts` owns refresh planning, availability, robots and terms drift, rights-review queues, cache parity, and attribution debt. Route health never becomes source authority.

These modules may evolve independently, but none may acquire the authority of either other module. Tier Bench may execute their bounded commands; it is not an ancestor of their evidence or canon decisions.
