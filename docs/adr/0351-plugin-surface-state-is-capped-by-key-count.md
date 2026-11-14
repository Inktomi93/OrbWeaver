---
kind: adr
status: active
updated: 2026-11-14
---

# A plugin's surface state is capped by key count

## Context

`host.ui.setState` writes into one in-memory plane in the server heap, outside the guest sandbox's memory cap. A plugin that published under a fresh surface id or room on every call would grow that plane without bound. A per-plugin byte budget and an eviction over rooms are the other ways to bound it.

## Decision

**A plugin holds at most `PLUGIN_SURFACE_STATE_MAX_KEYS` distinct surface-state keys, and a new key past that count is refused.** A key is a surface id, plus the room when the plugin publishes per room. An overwrite of a held key always proceeds. Each state is at most `SURFACE_STATE_MAX_BYTES`, so the key count also bounds one plugin's plane in bytes. The refusal rejects the guest's call and writes one warning per stay at the cap, with the plugin, the surface and the room. A plugin's keys free only when its whole plane clears on deactivate or uninstall.

**Revise this when a real plugin reaches the cap.** Its warning names the plugin and the room, and that is the evidence a revision starts from.

**Homes.** `PLUGIN_SURFACE_STATE_MAX_KEYS`, `SURFACE_STATE_MAX_BYTES` and `createPluginSurfaceStateStore` in `packages/server/src/domain/plugin/substrate/surface-state.ts`. Test: `tests/server/domain/plugin/substrate/surface-state-key-cap.int.test.ts`.

## Consequences

A widget that publishes per room uses one key for each room, so past the cap it is refused in each new room. The refusal reaches the guest as a rejected call and the operator as a log warning; the widget never stops in silence. The cap bounds the host heap however a plugin names its keys.

## Alternatives rejected

- A per-plugin byte budget: the key count times the per-state byte cap is already a byte bound, and no plugin has needed more keys.
- Eviction of the oldest room's state: it drops a room's state with no refusal. A full plugin queue refuses the one frame that would overflow it instead (D348), and the state plane follows the same rule.
- No count cap: a guest loop over fresh surface ids grows the server heap without bound.
