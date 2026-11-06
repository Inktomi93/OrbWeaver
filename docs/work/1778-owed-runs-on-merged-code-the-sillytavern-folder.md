---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tests
plan: test-foundation
---

# Owed runs on merged code: the SillyTavern folder import, CSRF gates and RPG lite loop e2e specs, e2e specs the lint and consistency branches edited, and WebKit CT on touched platform suites

## What

Run the e2e and WebKit component suites that merged code owes: the SillyTavern folder import, the CSRF gates and the RPG lite loop e2e specs, the e2e specs the lint and consistency branches edited, and the WebKit component suites for the touched platform suites.

## Why

A lane cannot run a whole-tree e2e command, so these suites were not run against the merged code. The Evidence lists what ran and what is still unproven.

## Done when

Every spec named in the Evidence has a recorded passing run on current code. The corpus specs, the guided-generations spec and the RPG lite loop have a run or a recorded reason they cannot run.

## Evidence

Not run: every e2e spec. The lane guard refuses `pnpm e2e <spec>` as a whole-tree run, so these stay owed to the orchestrator: `tests/e2e/sillytavern-folder-import.spec.ts`, `tests/e2e/csrf-gates.forward.spec.ts`, `tests/e2e/csrf-gates.local.spec.ts`, and the lint and consistency branch specs (card-import, corpus-editor-draft-recovery, corpus-workbench, corpus-shell, corpus-settings, corpus-cold-boot, smoke, browser-launch, draft-mode-options, guided-generations, event-sequence, scripted-chat).

`tests/e2e/rpg-lite-loop.spec.ts` needs a live engine: every case is `@live` (excluded unless `E2E_LIVE=1`) and seeds through `pinChatToLocalEngine`, which needs the opt-in local engine connection that the scripted stack does not create. Not run.

WebKit CT (`pnpm test:ct:webkit`, `CT_PORT=3187`, load 35 to 43): platform-rule-action-groups, platform-remaining-action-groups (character), platform-context-recovery, platform-text-scale, platform-failed-art-memory, platform-connection-readout and platform-shell. 148 passed, 2 skipped.

- E2E on 268a06a5bc passed: smoke, CSRF forward and local, scripted chat, SillyTavern folder import, card import, event sequence. Still unproven: the corpus specs (skipped under `pnpm e2e`), guided-generations (no tests found) and the RPG lite loop (needs a live engine).
