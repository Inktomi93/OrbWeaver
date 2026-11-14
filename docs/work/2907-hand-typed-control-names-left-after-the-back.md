---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Hand-typed control names left after the Back sweep

## What

Names still typed at the site. Back buttons in `packages/client/src/features/credentials/components/add-connection-form-body.tsx`, `packages/client/src/features/automation/components/rule-preset-picker.tsx`, `packages/client/src/features/preset/components/preset-fork-choice-dialog.tsx` and the default in `packages/client/src/features/app-shell/components/shell-topbar.tsx`. The later and latest message labels in `packages/client/src/features/chat/components/transcript-window.tsx`. The status card's door in `packages/client/src/features/rpg/components/rpg-status-tab.tsx` builds its label inline. The embedder sentences in `packages/client/src/components/connection-role-slot.tsx` pass the raw connection label instead of the shared summary, so they keep the plain separator and unbroken slashes.

## Why

A name typed at its site cannot be imported by a test or kept in step with its siblings.

## Done when

Each name comes from its feature's names module, each test that finds the control imports it, and the embedder sentences use the shared connection summary.

## Evidence

Filled at landing: what ran and where its output is.
