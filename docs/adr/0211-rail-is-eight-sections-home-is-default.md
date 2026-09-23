---
kind: adr
status: active
updated: 2026-09-23
---

# The rail is eight sections and home is the born default

## Context

Split off [ADR 0121](0121-the-close-out-ruling-for-the-preset-and.md), the close-out ruling for the preset and actor-state programs, whose seven independent clauses (A–G) pushed it over the 8 KiB ADR cap. This clause stands alone, as the original states. It amends D62-P6 ("the rail is SEVEN sections").

## Decision

**(C) HOME — the rail is EIGHT sections and `home` is the born default. AMENDS D62-P6** ("the rail is SEVEN sections … seven is the ceiling"), which the built tree outgrew: `SECTION_IDS = [home, chats, characters, corpus, worldInfo, presets, refinery, analytics]` (`client/src/state/shell-store.ts`), tuple order IS rail order, `home` leads and is the persisted store's default `activeSection`. Its rail affordance is the BRAND cell (the Weave glyph became a real named button; below `48rem` the brand cell hides and home rides the mobile bar as its FIRST tab — exactly one of the two is ever in the a11y tree). The CEILING is now a rule about kind, not a count: a rail section owns a top-level WORKSPACE with its own LIST/CONTENT/CONTEXT grid; anything that is a dialog, a preference, or a one-shot goes to modals/settings. **This also reverses the lockdown-O7 claim "there is NO home page concept"** — O7's ruling killed a `/` ROUTE that hand-assembled a 63-symbol god-map, and that stands (the route is `app-root.tsx`, a thin registry mount); home is a SECTION whose CONTENT is a grid of door-assembled tiles (`home: makeHomeSection(homeTiles)`, gate `home-tile-registry-completeness`), so a new tile is one file in the owning feature plus one array member at the door.

## Consequences

`SECTION_IDS` is eight members with `home` leading and the persisted store's default `activeSection`. The rail ceiling is a rule about kind (a top-level workspace with its own list/content/context grid), not a count.

## Alternatives rejected

Keep the seven-section ceiling from D62-P6 (rejected: the built tree outgrew it once home shipped as an eighth workspace-kind section).
