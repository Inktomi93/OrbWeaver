---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: character
plan: unwired-code
---

# Mark already-imported characters on hub search

## What

Mark hub search results the user has already imported.

Ruling: no host hub search exists; the Card Atlas guest is the hub search, and its own kv index drifts when a character is deleted in the app. Add a read-only host op under the existing character.card_state grant (no new consent line) that answers which cards are already imported, and make the atlas badge from it instead of its index.

The op is `character.findCardData`. It answers from the calling plugin's own card state, not from `importedFrom`.

## Why

Owner ruling: wanted feature, built server-side and never surfaced.

## Done when

Hub search shows the marker for an imported card through `character.findCardData`, deleting the character clears it, and a card added from two hubs shows it on both; a CT and an integration test cover it.

## Evidence

`findByImportedFrom` could not back the marker. A plugin import stores `plugin:<pluginId>:<importHash>`, the hash needs the parsed card and art, and a hub row carries neither. `pluginImportedFrom` in `packages/contracts/src/character/index.ts` keeps hub ids out of that value on purpose. The uncalled service verb is deleted; `findByOwnerImportedFrom` stays for handoff.

`character.findCardData` (`packages/contracts/src/plugin/host-v1.ts`) matches strings in the caller's own `plugin_<slug>` stamp through `findPluginCardData` (`packages/server/src/domain/character/persistence/plugin-card-data.ts`). The host reads no field names, so no Atlas shape enters it. A row whose JSON the SQL functions refuse is skipped, so one over-deep card cannot fail the owner-wide read. Characters with identical stamps collapse to one match before the limit, so copies of one card cannot push another out; `characterId` therefore names one holder, and more than `PLUGIN_CARD_DATA_FIND_MAX` distinct stamps on one lookup stay accepted as a capped answer. Card Atlas stamps a `keys` list and still reads older single-ref stamps, with no migration. Its `owned:` kv index is gone and one activation sweep removes the keys. `tests/server/domain/plugin/substrate/atlas-library-marker.suite.int.test.ts` and `tests/client/features/plugin/components/platform-atlas-browse-state.suite.ct.tsx` cover it.
