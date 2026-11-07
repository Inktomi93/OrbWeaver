---
kind: work
status: open
updated: 2026-11-07
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

Passing runs on merged code. E2E on `268a06a5bc`: smoke, CSRF forward and local, scripted chat, SillyTavern folder import, card import, event sequence. WebKit CT: platform-rule-action-groups, platform-remaining-action-groups (character), platform-context-recovery, platform-text-scale, platform-failed-art-memory, platform-connection-readout and platform-shell, 148 passed, 2 skipped. Live specs through a local engine, `E2E_LIVE=1`, at `7ad4da1733`: guided-generations and the RPG lite loop among 25 passed. Corpus cells on their lane branches: corpus-conversation 32 passed, corpus-cold-boot and corpus-shell 256 passed, corpus-settings 112 passed.

On main at `6f11775509`: browser-launch and draft-mode-options, 4 passed. corpus-editor-draft-recovery and corpus-workbench, the `@smoke` selection across the corpus cells, 88 passed, 72 skipped.
