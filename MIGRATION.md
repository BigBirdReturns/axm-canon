# Migration from `axm-arc`

The canon and ASOIAF programme was built inside `BigBirdReturns/axm-arc` as a temporary construction home. This repository corrects that ownership error.

The ownership cut is:

- PR #221: portable Canon Constraint Bible, now `src/canon/`;
- PRs #224 through #248: ASOIAF corpus and research refinery, now `asoiaf/`;
- PR #249 and later: Tier Bench execution work, excluded;
- PR #245: unrelated Aperture timed-media work, excluded;
- PRs #235, #237, #240, #241, and #246: disposable repair or superseded integration carriers, excluded as product source.

Three exact material trees were required because the qualified lore work remained split across sibling branches:

1. PR #248 head `a424521e3a7a1c9f7c7f707298f179758daf3d27`, the integrated research and reviewed-answer head;
2. PR #238 head `777b7230f6cbc0555a5e286ac07c8d0f94671543`, including local-edition intake and private retrieval;
3. PR #242 head `0b502bbeaf4e0e91c5075243f019e5975d860e9e`, including structured adapters, acquisition, and the live-canary contract.

No private book payload was migrated. Data packets retain their original bytes. TypeScript imports, repository identifiers, documentation paths, and workflow topology changed only to give the code its correct home. The machine-readable manifest under `migration/MIGRATION_MANIFEST.json` records every moved source and resulting digest.
