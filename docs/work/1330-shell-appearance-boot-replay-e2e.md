---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: tests
plan: test-foundation
---

# The shell appearance boot replay runs as e2e

## What

0963 cases AS161, AS162 and AS200–AS202 (group G9) moved to e2e: the pre-mount appearance replay in `main.tsx` is a document-level flow, and a CT that calls `stampAppearanceBootHint` would rebuild the boot order in test code.

## Why

Only the production-served boot proves the replay lands before React mounts.

## Done when

`tests/e2e/corpus-shell.spec.ts` seeds the stored hint with `addInitScript` before the first navigation and asserts the replayed flag and theme on `<html>` before `data-app-ready`, with a control that fails when the replay is removed; the 0963 rows read Move (done).

## Evidence

Filled at landing: what ran and where its output is.
