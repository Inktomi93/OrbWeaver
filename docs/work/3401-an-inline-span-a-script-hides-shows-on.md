---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# An inline span a script hides shows on the held and inert paths

## What

On the held run and the inert fallback, an inline '<span style="display:none">' is dropped by the allowlist but its text is kept, so a hidden spoiler word prints. The frame draws it hidden.

## Why

The held and inert paths should never show what the frame hides.

## Done when

The held and inert paths drop the text of an inline element whose style hides it, proven in tests/client/features/chat/components/styled-reply-frame.ct.tsx.

## Evidence

Filled at landing: what ran and where its output is.
