---
kind: bug
status: doing
updated: 2026-10-08
priority: P1
area: testing
lane: codex/chat-filter-geometry
---

# Repair native chat filter geometry sampling

## What

Diagnose and repair the hosted containment failure in `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx`.

## Why

Retry-assisted geometry assertions do not establish correct filter layout.

## Done when

Prove the cause with a controlled native failure and repaired result. Preserve width, containment, inset and reset assertions. Require retry-free hosted qualification.

## Evidence

Filled at landing: what ran and where its output is.
