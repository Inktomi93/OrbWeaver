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

CharacterService.findByImportedFrom has no caller. Wire it so hub search results mark characters the user has already imported.

Ruling: no host hub search exists; the Card Atlas guest is the hub search, and its own kv index drifts when a character is deleted in the app. Add a read-only host op under the existing character.card_state grant (no new consent line) that answers which cards are already imported, and make the atlas badge from it instead of its index.

## Why

Owner ruling: wanted feature, built server-side and never surfaced.

## Done when

Hub search shows the marker for an imported card through the production verb; a CT and an integration test cover it.

## Evidence

Not landed; the premise is refuted. No server or client hub search surface exists. The hub search is the Card Atlas showcase plugin (`packages/showcase-plugins/bundles/card-atlas/main.ts`), a sandboxed guest that marks owned cards from its own `storage.kv` index (`publishBrowse`, badge `in your library`). `findByImportedFrom` is host-internal, so a marker driven by it needs a new host op in `packages/contracts/src/plugin/host-v1.ts`, probably a new capability (a consent line), and a card-atlas change. That is a plugin ABI and consent design decision. Owner call: add a host op and capability, or keep the guest index.
