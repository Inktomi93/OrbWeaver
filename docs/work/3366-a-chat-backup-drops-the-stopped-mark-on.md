---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# A chat backup drops the stopped mark on a kept reply

## What

The chat-bundle serde in packages/server/src/primitives/serde carries tokenProvenance but not terminalReason, so an exported chat re-imports a stopped reply as a finished one.

## Why

Backup round-trips must keep what the room showed.

## Done when

terminalReason rides the chat bundle and an export-then-import case keeps terminalReason user on the variant.

## Evidence

Filled at landing: what ran and where its output is.
