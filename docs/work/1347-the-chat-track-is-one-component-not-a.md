---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: client
plan: css-system
---

# The chat track is one component, not a copied class string

## What

The drain rules forbid importing a class constant, so the `CHAT_TRACK` string from `packages/client/src/features/chat/lib/chat-track.ts` is now hand-copied at about eight carrier sites while `shell/motion.css` still names the carriers.

## Why

A copied class string drifts: a change to the track misses the copies. The no-magic-strings rule forbids it.

## Done when

One chat track component (or a primitive prop) owns the class and every carrier renders through it; no copy of the string remains outside its home; the drain rules stay clean; the shell motion CT still passes.

## Evidence

Filled at landing: what ran and where its output is.
