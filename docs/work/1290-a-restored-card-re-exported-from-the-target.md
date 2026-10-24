---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: import
---

# A restored card re-exported from the target box does not hash-match its restored row

## What

Found by the 1278/1280 lane in one probe: a card restored on box B and re-exported from B does not match B's own restored row by import hash. Within one export the hashes are self-consistent, so 1280's seat binding holds; across a restore round trip they drift. Cause unverified; possibly a lossy card round trip (fields normalized or dropped on import, re-rendered differently on export).

## Why

Item 1279's ruled fix moves asset and card referrers onto content-hash identity; hashes that drift across a restore round trip would make that identity unstable and break dedup on a second restore.

## Done when

Reproduced or refuted with a composed round trip (export A, restore into B, export B, compare identities); if real, the drifting field is named and either the import preserves it or the identity excludes it, with the round trip as the test. Must be settled before 1279's hash-identity legs land.

## Evidence

Reproduced with a composed round trip in `tests/server/domain/import/loader/import-bundle.int.test.ts` ("a restored card keeps its import identity through the next export and restore, whatever its star"): a starred SillyTavern card with a described embedded book is imported on box A, restored A to B, starred on B, then B's export is restored into a third box, back into B and back into A. A restore onto a box that holds the card dedups only when the identities match. Before the fix, A and B each held two Archivists.

Two fields drifted:

- The star. `cardFromJson` promotes `extensions.fav` to `starred` (`packages/server/src/primitives/serde/card/index.ts`), `cardImportHash` hashed it, the create verb drops it (`createCharacterSchema` has no `starred`), and the export writes the live star. A star is the owner's mark on the library, so the identity now excludes it. It pins the key to `false` instead of dropping it, so every stored identity of an unstarred card keeps its hash.
- The embedded book's description. The import stores it on the world book, but `embeddedBookWire` wrote only the name and entries. The description is book content, so the export now writes it (`bookDescription` from `export-character.ts`).

Each fix alone leaves the test red: the identity fix alone leaves two Archivists on A (the description), and the export fix alone leaves two on B (the star).

Asset content hashes are stable across a restore: every asset hash on A lands on B and every hash on B lands on the third box (`assetsLost: [[], []]` in the same test). After one pass through an export, card identities were already a fixed point (B equalled the third box) for unstarred cards without a book description.
