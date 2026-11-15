---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: chat
lane: wt/agent-ab44fb1e85a108193
---

# A reply a display script styles renders in a 300px column

## What

A reply that a display script styles moves into its reply frame, and the frame's iframe falls back to its intrinsic 300px because FRAME_SURFACE.reply is inline-full inside a bubble that shrinks to its content (packages/ui/src/content/sandbox-frame/sandbox-frame.tsx). Styled replies render 324px wide beside 600px unstyled replies.

## Why

A panel preset styles nearly every reply, so the transcript becomes a thin strip; the look the user imported the preset for reads as broken.

## Done when

A styled reply's bubble takes the same reading measure as an unstyled reply of the same length at 1280, 1920 and phone, checked with snap geometry on a room with a panel script.

## Evidence

Filled at landing: what ran and where its output is.
