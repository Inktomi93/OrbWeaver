---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: test-foundation
---

# Build the appearance message-style section CT

## What

The fourth check item 1434 names and law UI-Theming-and-Content 12.1 cites: schematic geometry, palette readability and picker behavior of the appearance message-style section (legacy client/features/chat/components/appearance-message-style-section.ct.tsx, reference-only).

## Why

The law cites a check that does not run.

## Done when

A CT on the real section through the production door, red against a planted defect; the register row is updated.

## Evidence

CT: `tests/client/features/chat/components/appearance-message-style-section.ct.tsx`, 18 cases, mounting the registered section through `CtClientProviders` on a corpus root with the settings verbs served from the root's own caller. It passes on Chromium (`pnpm test:ct`) and WebKit (`pnpm test:ct:webkit`, added to the WebKit project's file list in `playwright-ct.config.ts`). It makes no hover assertion, so it reads no `(hover: hover)` state.

Red against planted defects in `appearance-chat-style-cards.tsx`, each reverted: a ripple portrait moved off its bubble fails the ripple anatomy case (portrait side `loose`); the diagram wrapper at 20% opacity fails the three palette cases at the non-text floor (1.72 against 3); a picker that always saves `flat` fails the pick case and the arrow-key case.

Decision per legacy case is in the register row for the file: selection, gloss, diagram decoration, keyboard, switches, apertures and phone overflow rebuilt; patch minimality rebuilt as a sibling key surviving a pick; per-style anatomy derived from `MESSAGE_ROW_SKINS`; the two-style light check widened to every style in every shipped palette; the row-track and narrow-stack cases dropped to the settings-pane suites.

The skin table, the picker items and the section model sit behind no client door, so the suite holds one `PACKAGE_TEST_REACHES` entry in `.dependency-cruiser.ts` for those three files, each with its reason. Cells are found in `THEME_CHAT_STYLES` order and held to the items' own label and gloss.

A skin defect planted in production also goes red: `ripple` given the chip avatar treatment fails only the ripple anatomy case, and the other 17 cases stay green. The defect was reverted.
