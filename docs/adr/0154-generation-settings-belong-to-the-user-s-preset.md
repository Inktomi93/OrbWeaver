---
kind: adr
status: active
updated: 2026-09-23
---

# generation settings belong to the USER'S PRESET: global, never per-conversation, and a feature may RECOMMEND but never force-set one

## Context

Not recorded in the ledger row.

## Decision

Owner-ruled 2026-07-31: *"that is the user's preset, not something for us to change… presets and gen settings are not set per convo, they are global."* A feature that runs better with a particular sampling/effort value surfaces a RECOMMENDATION on its own tab and otherwise consumes the resolved preset as-is; there is no per-conversation override channel. The binding half: a chat never carries a preset — the HOST's active pick resolves at generation (`entry/compose/chat.ts::resolvePromptConfigFor`), and the owning feature carries any association (\[\[D58]]). Homes: `domain/preset` (the entity) · `Spine-Config-and-Serialization.md` §"Settings / config" (generation params are the fourth nature). Enforcer: the `schema-banned-shapes` gate REDs any `chats.*presetId*` column; the never-force-set half is owner-ruled, prose-enforced.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
