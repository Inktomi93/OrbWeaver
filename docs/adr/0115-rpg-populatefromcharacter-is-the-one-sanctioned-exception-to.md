---
kind: adr
status: active
updated: 2026-09-23
---

# `rpg.populateFromCharacter` is the ONE sanctioned exception to the hand-only-fields law (AMENDS the `contracts/rpg/sheet.ts` "patchSheet is the ONLY door" clause; the sheet's model-absence law otherwise stands)

## Context

Not recorded in the ledger row.

## Decision

A HOST-invoked, per-character, button-only one-shot extraction round over the character CARD + the room's OPENING line (never the story window — that is `resyncFromStory`'s corpus) filling BORN state: sheet `className`/`level` (FILL-ONLY — an already-written value is the pin; the sheet has no `fieldLocks` plane, so "already written" IS the lock), wallet, inventory, background-implied quests. **(1) The schema is a SEPARATE ROOT, never a widening of the turn surface:** `rpgPopulateSchema` (contracts/rpg/extraction.ts) ADDS the sheet plane and structurally REBUILDS every live-play plane EMPTY (`salvagePopulate`) — a wire that volunteers a `scene`/`party`/`journal` write lands nothing, by construction, not by prompt (pinned by contract + composed-real tests). Plane shapes reuse the shared tool-arg schemas so fold/apply stay one path. `constrainPopulateSchema` pins `inventory[].targetRef` to the one actor and re-marks the sheet fields REQUIRED (the xgrammar lever). **(2) Writes go through the SAME doors as play:** snapshot half via `extractionToStateDelta` → `applyLockedPatch` (locks honored) → `writeResyncedSnapshot` on a fresh silent state-anchor slot; sheet half FILL-ONLY into `rpg_sheets`. A no-op round writes NOTHING — no slot, no row, no emit. **(3) Gating:** host at the model-call boundary (`resolveHost`, the resync seam — leak-free NOT_FOUND for a stranger, FORBIDDEN for a member, before any card read or model call; the CALLER's userId funds the round); capability via `hasStructuredWriter` surfaced as `RpgGameView.canPopulate` (a THIRD verdict on `resolveStateDelivery`, deliberately not `trackersReadOnly` — different capability key). A `user`/`cast` actor and an unreadable card are REFUSALS surfaced as disabled-with-reason (APPLICABILITY), never silent no-ops; host-only is a PERMISSION-omit. **(4) Client:** `invalidates`-reconciled mutation (the rpg bus is LIVE-ONLY; the resync precedent), verb returns void. Live-model smoke on a hosted wire remains a flagged manual step.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
