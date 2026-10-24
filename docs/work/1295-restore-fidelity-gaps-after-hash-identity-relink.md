---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: import
---

# Restore fidelity gaps after hash-identity relink

## What

Found while landing items 1290 and 1279; parts 1 and 3 were observed in a composed probe, the rest found by reading. (1) Seeded characters carry a null importHash, so restoring their exported cards onto a fresh box creates a second copy of each (charlotte-2 and so on). (2) createCharacterSchema strips starred, so an imported card's fav never lands and a restore unstars every card. (3) Rows imported from a fav:true file before the 1290 identity change keep their old identity, so re-uploading that original file creates a duplicate. (4) Databank sourceAssetId and imagery generations still re-link by carried id only; with the fourth asset check now succeeding on same-owner bytes, a box holding those bytes under another id leaves them dangling without a failure. (5) characters.background_override is not in the card export, so a card's background is lost on restore.

## Why

A clean restore should reproduce the library: no doubled starter cast, no lost stars or backgrounds, and no silent dangling reference behind a success report.

## Done when

Each part is reproduced or refuted with a composed round trip before any fix. Seeded cards dedup against their own export (for example through a seeded identity); an imported or restored card keeps its star; a legacy fav:true row re-imports onto itself or the drift is accepted in the item with a reason; databank and imagery referrers resolve by content hash with the carried id as fallback; a card's background override travels in its export. The composed round trip in tests/server/domain/import/loader/import-bundle.int.test.ts covers each, red first.

## Evidence

Each part ran as a composed round trip in `tests/server/domain/import/loader/import-bundle.int.test.ts`, red on the unmodified source first.

| Part | Verdict | Case | Red before the fix |
| - | - | - | - |
| 1 | reproduced | "a seeded library restored into a fresh box keeps one copy of each starter card" | every starter card landed twice on the target |
| 2 | reproduced | "an imported card keeps its star, alone and through a library restore" | the starred card landed unstarred on both boxes |
| 3 | accepted drift | none | not reproducible from any seed or migration (below) |
| 4 | reproduced | "databank documents and imagery history restore onto bytes the owner holds under another id, never another account's" | the restore reported one failure (the imagery call) and the document's source blob restored as null |
| 5 | reproduced | "a card's background travels in its export and re-links by content, never onto another account's bytes" | the restored card had no background |

Fixes:

1. A seeded card carries the import identity of its own export. After the seeder dresses a card, it exports the card through the real card export, reads the identity with `cardPngIdentity`, and writes it with the character verb `stampImportIdentity`, only onto a row with no identity. The identity comes from the export the restore reads, so both boxes compute it the same way. `importedFrom` stays null, so the card still reads as shipped. No schema change.
2. `createCharacterSchema` carries `starred`, and the create verb writes it. A restore onto a row that already exists keeps the owner's star on that row.
3. Accepted. Only an import of a `fav:true` file before the 1290 identity change produced such a row. No seed or migration writes `characters.import_hash`: the shipped seed created rows with a null identity, and the numbered migrations after the baseline do not touch the column. The owner states no one has used the app yet, so no such row exists to heal.
4. The databank file carries `sourceAssetHash` and the imagery file carries `assetHash` on each output. The import re-links each by the owner's asset holding those bytes, then by the carried id. Files without the hash restore by id as before.
5. The card export carries the background under `data.orbweaver_background` when it names an asset. The card import re-links it onto the owner's asset holding those bytes, then by the carried id. It drops a background the owner holds by neither. The key is outside the import identity, so stored identities do not change.

Owner scoping: each new hash lookup filters on the importing owner. The two-account case gives another account the same bytes:

- Databank: removing the owner filter turns the case red, because the document links the other account's blob.
- Imagery: the import still refuses an output the owner does not hold. The write's own owned-asset check refuses it even with the filter removed.
- Background: removing the owner filter turns the case red, because the other account's restored card paints the owner's plate.

Runs:

- `pnpm test tests/server/domain/import/loader/import-bundle.int.test.ts`: all cases pass.
- `pnpm test` on the related import, assets, databank, imagery, portability, export, seed-ledger and corpus suites: all pass.
- `pnpm typecheck`: clean.
- `pnpm depcruise`: no violations.
- `pnpm lint:eslint` on the changed files: clean.

Not covered:

- A seeded row created before this change keeps a null identity until it is seeded again.
- A seed-pack migration that rewrites a seeded card's content does not re-stamp its identity. A restore from a box seeded with the new pack onto a box migrated from the old pack can then land that card twice.
- `backfillPluginProvenance` now reads seeded rows as candidates, because they carry an identity and no `importedFrom`. They carry no `plugin_<slug>` key, so it counts them as left authored and writes nothing.

The imagery history in the part 4 case comes from a real image generation on the source box, through the owner's own image binding and a scripted provider. It then travels through the library export.
