---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A long speaker name stays on the avatar chip's line in a message header

## What

In the chat message header, when a long name cannot fit beside the avatar chip, the identity row wraps the chip onto a line of its own above the name. The outer row built in `renderRowIdentity` in `packages/client/src/features/chat/components/message-row-header.tsx` is set to wrap its chip and its name cluster.

## Why

A chip alone on a line separates the speaker's face from the name it belongs to.

## Done when

A component test in `tests/client/features/chat/components/` renders whisper, echo and hush rows with a long speaker name at 390px wide and 125% text. It asserts that the chip and the first line of the name share one line and that the name wraps or truncates inside its own box. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
