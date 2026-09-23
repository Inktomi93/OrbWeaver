---
kind: adr
status: active
updated: 2026-09-23
---

# A `Required<…$inferInsert>` copy allow-list is BLIND inside a JSON column, so a JSON column whose fields are independently gated owes its OWN exhaustive-literal ratchet

## Context

Not recorded in the ledger row.

## Decision

D133 made a new COLUMN fail `tsc` at the member→host fork; on `rpg/chat-ops/fork-game.ts` the entire trust boundary lives INSIDE one column (`rpg_games.config`), whose fields split across three gates — the member-gated `getGame.publicConfig`, the member-gated `getTrackerView.trackerDefs`, and the host-gated `getConfigView`. The column-level ratchet proves `config` is named and proves nothing about its contents, and that blindness had already let THREE host-plane fields ride: `config.userMacros` (the member-gated picks pane projects name+description+inputs and withholds the BODY as prompt content — an input-less macro is not projected at all) and `config.features.relationshipHints`/`journalTypeHints` (host-authored steering prose with NO member-gated reader). All three now drop for a non-host forker, whole-value, the `lite.steeringNote` precedent. **THE ENFORCEMENT IS THE SHAPE:** `stripConfigForForker`/`stripFeaturesForForker` build `RpgGameConfig`/`RpgGameFeatures` from explicit literals with NO spread, so a new config field is a missing property and fails the build until classified; the five per-plane `fork*Values` builders carry D133's column-level ratchet for the four row planes. Both have behavioral twins in `rpg/chat-ops/fork-game.int.test.ts` cross-checked against the LIVE `getTableColumns` and the LIVE `rpgGameConfigSchema.shape`, so neither side can rot alone. **The rpg wrinkle the matrix settled:** rpg has no `ownerId` (authority is chat-FK-derived, D18/D20) and its host-only READ surface is exactly `getConfigView` + `revealHidden` — every column `getGame`/`getTrackerView`/`listJournal`/`listCheckpoints`/`listTurnToolCalls` serves is member-readable and copies verbatim, which cleared checkpoint labels, sheets, and the whole snapshot state plane. **A WRITE gate is not a read-secrecy boundary** (`selectVariant`'s author-or-host gate and `restoreCheckpoint`'s host gate make data host-reachable-only, but they gate an action that changes what the room sees — the content behind them stays COPIED). **A COPIED verdict must name the member-gated reader OF THAT FIELD, never of its genre:** `rpg_snapshots.recentEvents` was first classified COPIED because the same distillation CLASS is served unbounded by the member-gated `listJournal` — a true statement about different bytes. The log is append-only across the whole game and its only member-gated reader slices it by the HOST-writable `recentBeatsKeepLast` (`keepLast: 0` ⇒ the member reads NONE), so a non-host forker now carries `keepLastBeats(log, SOURCE keepLast)` and nothing more, via the SAME exported helper the panel uses (one home — a re-spelled slice could drift and silently widen the boundary). **The knob copies; the data it gated does not** — a host-only SCALAR is still a gate over member-visible bytes, and the scalar carve-out never licenses carrying what the scalar hid. The D16 floor needs no further clamp HERE (`readsHidden === false` already covers every clamped forker, and the window is what the source's own unclamped `getTrackerView` served them); that `getTrackerView` is unclamped at all is a source-side member-visibility question, recorded separately. Findings record: `docs/history/reviews/security/2026-08-07-rpg-fork-host-plane-strip.md`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
