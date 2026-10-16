---
kind: work
status: open
updated: 2026-10-16
priority: P1
area: tests
plan: test-mirror
---

# e2e smoke matrix drives the real app on the owner's container data

## What

Add e2e specs that boot the real stack headless and walk the core flows. They run in CI on a synthetic corpus written by the seed tool (tooling/src/seed, packages/default-content): characters with and without art, personas, lore books, presets, solo and shared rooms with history; the corpus is committed, the owner's personal db never is. A local run may instead point at a copy of the owner's container db through the stage-db path from item 887. The flows: start a chat with a character, send and stream a reply on the scripted provider, swipe, edit, switch persona and pin, exercise each Settings group through its actual public behavior, including read-only About and Backup export/import, open a shared room as a second user, import a card, open the gallery. Run each flow across all chat styles at desktop and phone widths and assert on rendered state, not on hand-declared wire shapes. Specs import production constants and derive types per Spine-Testing section 10.

## Why

Owner: tests must follow product changes without edits; peers such as SillyTavern and Marinara Engine test mostly by driving the running app, while ours lean on CT harnesses that copied the product and drifted.

## Done when

The smoke specs pass headless in CI on the seeded corpus, and locally on an owner-data copy, at desktop and phone width for every chat style; no personal data is committed; a planted product change (a renamed menu item, a removed home tile) turns the matching spec red; the suite runs in a named pnpm script and is documented in Spine-Testing section 1.

## Evidence

Selected committed-corpus read/render intake passes; the complete flow, viewport, style and authentication matrix remains open. Ordinary collection does not establish execution. Corpus mode admits only its selected smoke file and single-user project; it owns no scripted provider. Real provider, local-auth and owner-copy admission need existing-owner integration. Additional `--project` arguments accumulate selections rather than replace defaults. Exercise each Settings group according to its actual public behavior. Evidence: `.claude/worktrees/codex-native-token-scales/reports/review/898-replacement-smoke-intake.md`. Replacement work waits for complete shared-reader foundations.
