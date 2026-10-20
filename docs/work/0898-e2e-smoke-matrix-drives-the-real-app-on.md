---
kind: work
status: doing
updated: 2026-10-20
priority: P1
area: tests
lane: wt/agent-a0ab572a9f7283722
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

Native folder classification, split-folder restore and unique backup entry paths are integrated at `f462cdcd01` after independent security review; the public Backup case passes. The private full-size path remains open. Evidence: `reports/review/898-native-folder-restore-final.md`.

Corpus flows, provider modes and CI admission are integrated. Hosted and owner-copy execution remain open; collection is not execution.

Navigation, canon and persona freshness have scoped production evidence. Preserve source epochs and failures. Evidence: `reports/review/898-qualification-leg.md` and `reports/review/898-qualification-case-evidence.json`.

Private intake qualifies on an unchanged disposable, schedule-quarantined copy. The matrix fails with confirmed retirement. Keep personal data outside Git, publication and CI. Evidence: `reports/review/898-private-matrix-current-qualification.md` and `reports/review/898-private-current-intake-verdict.md`.

Request-sensitive corpus publication passes its seed and native boundary controls. Evidence: `reports/review/898-v2-publication.md`.

Isolated E2E stacks disable only the native checker HUD. Terminal lint diagnostics and Vite application errors remain. Red-first browser controls and independent review pass; complete matrix acceptance stays open. Evidence: `reports/review/898-checker-hud-independent-review.md`.

Synthetic cases pass across frozen matrix and recovery epochs, not a current aggregate. Preserve failures. Native-client conversation and sharing controls pass. Evidence: `reports/review/898-native-trpc-browser-qualification.md`, `reports/review/898-production-defect-controls.md`, `reports/review/898-v2-matrix-qualification.md` and `reports/review/898-v2-matrix-recovery.md`.

Windowed World Info and file-backed Backup pass every style and width, retaining native ordering, workload ownership and exact restoration. Private/full matrix and hosted acceptance remain open. Evidence: `reports/review/898-large-library-upload-selection-independent.md`.

Native ZIP size admission refuses the private Backup selection. Qualify complete folder restoration and shared native/ST classification before recovery. Evidence: `reports/review/898-private-backup-response-diagnosis.md`.
