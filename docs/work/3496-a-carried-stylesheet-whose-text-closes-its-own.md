---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# A carried stylesheet whose text closes its own element can run a script once per reply run

## What

A run's carried stylesheet is written into each other run's frame as raw element text in `packages/client/src/features/chat/lib/reply-parts.ts`. A sheet whose text holds a closing style tag followed by a script leaves the style element in every frame it is carried into, so on the interactive posture the script runs once per run. The reply could write the script directly, so the reach is not new.

## Why

Carried text should stay a stylesheet in every frame; replicated script runs multiply a reply's cost.

## Done when

A sheet whose text holds a closing style tag is not carried, or is carried as escaped text, and a test in `tests/client/features/chat/lib/` shows no script element reaches another run's frame.

## Evidence

Filled at landing: what ran and where its output is.
