---
kind: bug
status: doing
updated: 2026-11-13
priority: P2
area: client
lane: wt/agent-a9a004f98f3d7c671
plan: cross-surface-consistency
---

# Message actions are always visible at a touch pointer on every chat style

## What

On a chat style whose action bar stands alone, such as document, a touch reader sees the message actions only on the last row. The focus reveal mode in `packages/client/src/features/chat/lib/message-actions-reveal.ts` hides them where the primary input cannot hover, while the hover mode shows them there. `actionsRevealFor` in `packages/client/src/features/chat/lib/row-placement.ts` picks the mode.

## Why

Owner ruling: touch message actions are always visible. A reader on a phone cannot hover or focus a row to reach edit, fork or the menu on an earlier message.

## Done when

At a touch pointer every row shows its actions on every chat style with the setting at its default; desktop hover and keyboard focus behaviour is unchanged; a component test at a touch pointer on document style finds the actions on an earlier row and is red on the current source; the reveal module's header states the rule with no comparison to another product.

## Evidence

Filled at landing: what ran and where its output is.
