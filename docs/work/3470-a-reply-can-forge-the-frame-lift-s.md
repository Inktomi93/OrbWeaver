---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# A reply can forge the frame lift's stand-in and copy a stylesheet once per forged reference

## What

The framed reply's raw-text lift (beside `packages/ui/src/markdown/frame/frame-markdown.tsx`) picks its stand-in character before character references decode, so reply text can spell the stand-in as a character reference. The restore step puts the whole lifted body into every match. A reply with many forged references makes the app document build a frame document many times its own size. The fault is on the lane branch only and has not shipped.

## Why

A member's message, a card greeting or a preset script can exhaust memory in a viewer's tab, outside the sandbox, and the row stays in history so the room fails again on reopen.

## Done when

Each lifted body is restored at most once and output size is bounded by a constant times the input. A forged or repeated reference never copies a body. A test with forged references fails before the fix and asserts the size bound, and a component test renders the case without a large frame request. A security-builder review confirms it.

## Evidence

Filled at landing: what ran and where its output is.
