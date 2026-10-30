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

- `corpus-shell.spec.ts` stores a remembered motion preference, font scale and seed theme in the device hint with `addInitScript` before the first navigation, records every `<html>` attribute write and React's first write into `#root` in order, and asserts the hinted values are on `<html>` before that first write and with no `data-app-ready`. The control boots a device with no hint and asserts the schema defaults and no `data-theme`.
- Green: both cases pass on `corpus-desktop-bubble` and `corpus-phone-bubble`.
- Control: with the `stampAppearanceBootHint()` call in `main.tsx` disabled, both cases fail on `corpus-desktop-bubble` (motion channel read `undefined` before mount); the call is restored.
- Density has no root channel (it renders on the shell's theme scope after the first commit), so the cases do not assert it; the 0963 rows say so.
