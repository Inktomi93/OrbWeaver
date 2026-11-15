---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
---

# Close the message text cap's remaining test gaps

## What

In `tests/server/domain/chat/persistence/message-text-cap.suite.int.test.ts`: the reasoning-edit refusal case never reads the reasoning back, so "stores nothing" is unasserted; the send case's title names the cap but it now asserts `message_macro_budget`, so it tests the macro budget; there is no at-cap import control (a row of exactly `MESSAGE_TEXT_MAX_CHARS` lands). Neither degraded bake (greeting bake in `packages/server/src/domain/chat/verbs/turn.ts`, alternate bake in `packages/server/src/domain/chat/verbs/edit.ts`) has a case proving it keeps the unbaked body. The selected-swipe fallback and the swipe after a refused import swipe are covered by this lane's last case.

## Why

Each gap is a regression the current suite would not catch: a reasoning edit that wrote before refusing, an off-by-one in the import check, a bake that stored empty text.

## Done when

Each gap has a case through the composed root, each proved red against a planted break.

## Evidence

Filled at landing: what ran and where its output is.
