# `axm-arc` cleanup transaction

Cleanup is destructive and therefore follows target publication, not source export.

1. Create and verify the initial `BigBirdReturns/axm-canon` commit against `MIGRATION_MANIFEST.json`.
2. Add the text from `AXM_ARC_TOMBSTONE.md` to `axm-arc/docs/MIGRATED_AXM_CANON.md`.
3. Close migrated lore PRs #221, #224, #225, #226, #229, #231, #232, #233, #234, #236, #238, #239, #242, #243, and #248 with the exact target commit and migration-manifest digest.
4. Close disposable PR #299 unmerged and remove its exporter and trigger refs. Confirm that #235, #237, #240, #241, and #246 remain closed and carry no active authority.
5. Delete or archive the migrated lore branches after verifying their exact source SHA appears in `migration/SOURCE_HEADS.json`.
6. Leave PR #245 untouched because it belongs to Aperture. Leave PR #249 and later untouched until the separate Tier Bench migration renames and relocates them.
7. Search `axm-arc` default and active release branches for canon and ASOIAF source residue. The only permitted residue is the migration tombstone and exact historical Git objects.

A source branch is not deleted merely because a local package exists. Target repository custody and checksum parity are the admission conditions.
