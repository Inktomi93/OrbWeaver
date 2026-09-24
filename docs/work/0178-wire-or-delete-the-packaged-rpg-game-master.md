---
kind: decision
status: open
updated: 2026-09-24
priority: P2
area: rpg
---

# Wire or delete the packaged RPG Game Master preset

## What

The rpg-gm packaged preset is seeded at boot and has a clonePackaged service verb (packages/server/src/domain/preset/verbs/clone-packaged.ts), but no procedure, no UI and no caller reach it; RPG games start with gmPresetId null. The design intended a game to clone it as its GM voice. Owner decides: wire a way to use it (for example on game creation or in the Stats and Trackers editor) or delete the seed, the verb and the template. Its own per-turn rpg sections also still sit above Chat History, which D251 says loses the history cache.

## Why

Unwired code is a question about intent; a seeded row nothing reads is dead weight or a missing feature.

## Done when

Either a user can make a game use the GM preset through a real path with a test, or the seed, verb and template are gone with their tests; the preset's per-turn sections follow D251 if it stays.

## Evidence

Filled at landing: what ran and where its output is.
