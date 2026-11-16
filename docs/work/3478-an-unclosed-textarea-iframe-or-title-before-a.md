---
kind: bug
status: doing
updated: 2026-11-15
priority: P3
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# An unclosed textarea, iframe or title before a style element leaves that element unstripped

## What

The kit raw-text reader in `packages/kit/src/content/index.ts` skips a textarea, iframe or title to its close. When one is never closed, a style element after it is not read as an element, so the inert strip keeps it and its CSS prints as text on the plain path.

## Why

It is the stylesheet-as-prose fault in another shape on the plain path.

## Done when

An unclosed element of those kinds does not hide a later style element from the strip, and a kit test has a row for each.

## Evidence

Filled at landing: what ran and where its output is.
