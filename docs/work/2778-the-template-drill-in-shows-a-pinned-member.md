---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# The template drill-in shows a pinned member's display word, not its raw kind

## What

The template drill-in shows a raw kind chip for a system-pinned member. `docs/law/client-architecture-lockdown.md` §3 says a system-pinned member is a wire word and shows its display word. The kept-site entry that excused it was removed, so the census reports the site.

## Why

A raw wire word in the interface breaks the vocabulary law and reads as jargon.

## Done when

The chip shows the display word from the production label module, with a component test, and the census reports no finding for the site.

## Evidence

Filled at landing: what ran and where its output is.
