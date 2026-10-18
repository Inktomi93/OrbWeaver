---
kind: work
status: doing
updated: 2026-10-18
priority: P1
area: tests
lane: codex/corpus-smoke-matrix-898
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

Corpus flows, provider/authentication modes, widths, styles and CI admission are integrated. Settings include About and Backup. Hosted qualification and owner-copy execution remain open; collection is not execution.

Responsive navigation, canon, persona freshness, recent threads and restored-room navigation have scoped production evidence. Preserve their source epochs and historical failures. Evidence: `reports/review/898-qualification-leg.md` and `reports/review/898-qualification-case-evidence.json`.

The corpus smoke matrix is independent of callable resolution, store cost and gate migration. Native shape and clone checks judge its specs. Only general legacy suite ports wait for shared-reader completion.

Private intake migrates and scrubs a disposable, schedule-quarantined copy. The current owner-copy attempt expires at its first admitted job without a fixture or row snapshot; its input is unchanged. Timeout diagnostics preserve the original reason and phase without starting I/O after expiry. Last observations are not final states. Personal data stays outside Git and CI. Evidence: `reports/review/898-private-current-intake-verdict.md` and `reports/review/898-owned-workload-timeout-independent.md`.

Request-sensitive corpus publication passes its seed and native boundary controls. Evidence: `reports/review/898-v2-publication.md`.

Isolated E2E stacks disable only the native checker HUD. Terminal lint diagnostics and Vite application errors remain. Red-first browser controls and independent review pass; complete matrix acceptance stays open. Evidence: `reports/review/898-checker-hud-independent-review.md`.

The complete synthetic case population has passing local evidence through the frozen matrix and targeted recovery. Original failures remain recorded. This is case-scoped composition across source epochs, not a fresh aggregate on current source. Current native-client desktop and phone conversation plus local sharing cases pass. Evidence: `reports/review/898-native-trpc-browser-qualification.md`. Production-defect controls pass; see `reports/review/898-production-defect-controls.md`. Hosted and owner-copy acceptance remain open. Evidence: `reports/review/898-v2-matrix-qualification.md` and `reports/review/898-v2-matrix-recovery.md`.
