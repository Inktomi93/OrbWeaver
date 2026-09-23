---
kind: adr
status: active
updated: 2026-09-23
---

# Theme doors + the card-embeddable appearance partition (TD)

## Context

Not recorded in the ledger row.

## Decision

A character card carries **IDENTITY & ATMOSPHERE** (colours, type family, corner language, backdrop source); the viewer owns **ERGONOMICS, ACCESSIBILITY, COST and TREATMENT**. Tie-break for a new key: would card-forcing it change how comfortably or expensively the VIEWER reads, or only what the room looks like? Comfort/cost ⇒ viewer-sacred. Enforcement is contracts-shape, not DDL: one classification record in `@orb/contracts/theme` derives `CARD_EMBEDDABLE_THEME_KEYS` + `VIEWER_SACRED_THEME_KEYS` (a new `ThemeOverride` field fails tsc until classified) and `cardEmbeddableSubset` is the ONE projection every card-sourced read runs (`resolveRoomTheme`, `speakerThemesByName`, `settings.promoteTheme`, the Start-from-theme seeding). `density` stays on the schema — live on a theme the viewer SELECTED, sacred from a card: the consent chain differs, not the key. `chatStyle` is DELETED from the override on both sides of the clamp pair (D107 dead switch — zero selectors read `data-chat-style`); the tuple stays as `appearance.chatStyle`'s vocabulary home. **Promote COPIES values, never a ref** (the override IS values; the roster wire threads them to members who cannot read the host's single-owned theme rows; deleting a theme must never strip N cards). **Name policy splits by input mode**: a DERIVED name de-collides at the mint (`freeThemeName`, shared by `duplicateTheme`/`promoteTheme`); a TYPED name keeps `createTheme`'s typed conflict. The picker's shipped set is D62's three; the ten character palettes now live only on the cards that wear them, and the seeder CONVERGES (heal-then-delete, sentinel-scoped). **Editor drafts mint NOTHING until the first real edit** (owner overruled auto-delete: interception, the preset fork-choice mechanism — a zero-edit Back means zero rows ever existed).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
