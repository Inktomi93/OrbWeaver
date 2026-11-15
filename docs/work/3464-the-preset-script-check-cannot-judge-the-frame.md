---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: test-foundation
---

# The preset script check cannot judge the frame's Markdown render

## What

The hand-run preset script check (the preset script probe under `tests/server/domain/import/persistence/`) runs every script of a preset file through the display pass and the kit readers. A stylesheet printing as prose happens one step later, in the frame's own Markdown render, which the check cannot reach. Add the render half as a component test that mounts the production transcript with each script's written text as display-script output, the way `tests/client/features/chat/components/styled-reply-frame.ct.tsx` does.

## Why

Without the render half the check reports only that a script writes a risky shape, never that the app prints it, so a second leaking shape in a real preset would pass.

## Done when

A component test reads a preset path from an environment variable, renders each display script's written text through the transcript's real frame path, and fails on a synthetic style-after-tag text with a blank line in its CSS when the frame lift is removed.

## Evidence

Filled at landing: what ran and where its output is.
