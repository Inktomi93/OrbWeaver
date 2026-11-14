---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# Two cases in the turn plugin macros suite time out in a directory run of the chat verbs tests

## What

tests/server/domain/chat/verbs/turn-plugin-macros.int.test.ts fails two cases, "two plugins resolve to their own values in the turn, and the stored slice names each under its own plugin id" and "a legacy spelling two plugins both claim stays with the live name in the turn, not with either hyphenated plugin", with a test timeout of about 22 seconds when the whole tests/server/domain/chat/verbs directory runs at default workers. Every other file in that run passed.

## Why

A timeout in a directory run reads as a regression and costs a rerun to tell apart.

## Done when

Each case is measured alone, then tagged slow with its runtime proven or made faster, and the directory run at default workers passes.

## Evidence

Filled at landing: what ran and where its output is.
