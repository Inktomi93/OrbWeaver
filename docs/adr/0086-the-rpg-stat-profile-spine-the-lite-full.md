---
kind: adr
status: active
updated: 2026-09-23
---

# The rpg stat-profile spine + the lite/full mode axis (AMENDS D58; spec home: the docs/plans/rpg/design.md set — doc 13 + the 03/04/05/10 amendments)

## Context

Not recorded in the ledger row.

## Decision

Stat vocabularies are DATA, not types: `RpgGameConfig.statProfile` (attribute defs + hints · score `range` · a `{center, step}` modifier normalization · the skill→attribute governing map + default · a perception-attribute key) drives sheet shape, validation, prompt, and the d20 engine's two attribute reads; `RpgSheet.attributes` is a record over the profile vocabulary; the D\&D six, Fallout SPECIAL, and `freeform` ship as packaged contract-data profiles (the D33 defaults-with-contract pattern). The compatibility contract is the MODIFIER SPACE — every profile normalizes into it (`floor((score − center) / step)`, missing key = center = +0); the house RESOLUTION engine (d20/bands/DC/fail-forward/consequences/encounters) stays THE system; alt-RESOLUTION remains the D46 Tier-2 plugin seam. LITE is a mode axis, never a subsystem: `rpg_games.mode ∈ {lite, full}` dispatched through ONE exhaustive `MODE_POLICY` record — lite = flexible sheet + pools-as-meters + inventory + scene cast/custom fields + `subjectName`d custom widgets + a depth-0 steering injection over the user's OWN preset (`presetOverride` null in lite — the GM preset is full-mode voice), riding the SAME snapshots/locks/staging/tools; no seat/checks/clocks/encounters/maps/sessions in lite (typed `RpgModeUnsupportedError`). Lite's update mechanism is the D48 tool SUBSET (`update_party`/`update_inventory`/`update_scene`/`set_widget_value`/`roll_dice`) — the prose-rewrite/tag pattern stays dead. Write policy BOTH modes: the model writes VOLATILE state only; identity (attributes, defs, the profile) is human-owned — no `update_stats` tool exists. Capability cases: full = hard tool-capable refusal (unchanged); lite = soft — a non-tool model runs visibly-badged READ-ONLY trackers (steering + manual edits; derived per-turn from capability, never stored) until the Tier-3b polyfill. Combat slots (`sheet.maxHp`, volatile `hp`) are nullable; full-mode seeding makes them invariant-present (verb-enforced; lite health is a pool). Graduation = `rpg.setMode`, both directions, guarded — a config flip, never a migration. Cards contribute stat VALUES (`extensions.rpgStats`, name-matched onto the profile at seeding); the game owns the schema. **The extension seams stay deliberately cheap (owner-directed):** the profile carries a RESERVED single-case `resolution` discriminant (`{kind:"house-d20"}` — the `element` reserved-additive precedent) behind a one-case `assertNever` dispatch at the check entry, so a future alt-resolution engine is an additive union case + one engine module, never a re-shape or migration; the D48 registry's `plugin` tool source is live code awaiting only a capability grant; opening either is a ledger decision, not a builder's call. All schema deltas ride the pre-launch `0000_baseline` regen as the L0 chunk, which lands BEFORE any further R-chunk builds on the old sheet shape.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
