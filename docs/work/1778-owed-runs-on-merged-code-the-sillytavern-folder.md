---
kind: work
status: open
updated: 2026-11-01
priority: P2
area: tests
plan: test-foundation
---

# Owed runs on merged code: the SillyTavern folder import, CSRF gates and RPG lite loop e2e specs, e2e specs the lint and consistency branches edited, and WebKit CT on touched platform suites

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Not run: every e2e spec. The lane guard refuses `pnpm e2e <spec>` as a whole-tree run, so these stay owed to the orchestrator: `tests/e2e/sillytavern-folder-import.spec.ts`, `tests/e2e/csrf-gates.forward.spec.ts`, `tests/e2e/csrf-gates.local.spec.ts`, and the lint and consistency branch specs (card-import, corpus-editor-draft-recovery, corpus-workbench, corpus-shell, corpus-settings, corpus-cold-boot, smoke, browser-launch, draft-mode-options, guided-generations, event-sequence, scripted-chat).

`tests/e2e/rpg-lite-loop.spec.ts` needs a live engine: every case is `@live` (excluded unless `E2E_LIVE=1`) and seeds through `pinChatToLocalEngine`, which needs the opt-in local engine connection that the scripted stack does not create. Not run.

WebKit CT (`pnpm test:ct:webkit`, `CT_PORT=3187`, load 35 to 43): platform-rule-action-groups, platform-remaining-action-groups (character), platform-context-recovery, platform-text-scale, platform-failed-art-memory, platform-connection-readout and platform-shell. 148 passed, 2 skipped.
