---
kind: work
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-ad8b3feff6d47cb2a
plan: cross-surface-consistency
---

# Code review P3 bundle for the acceptance and shard 2 merges

## What

From the cb-p3ab code review report under reports/code-reviewer: regex-tier-row\.tsx:10 comment still names the old regex switches; tokens.json:3309 calls the new dialog gutter width a surface height; per-item switches outside 2273 still spell their own grammar (attachment-rows.tsx:64 and 107, regex-script-picker.tsx:290, connection-prompt-cache.tsx:118, 134, 165 and 283); alert-dialog/variants.ts:14 keeps the full gutter at enlarged text; the regex lever names read oddly (In this chat: Everywhere); dialogs widen at default text on 481 to 639px screens; the flat chat style's text column record carries a part with no geometry behind it.

## Why

Each leaves a family with a second spelling or a record that does not match what it measures.

## Done when

Each finding is fixed with a CT or capture, or answered with a cited reason in this item's Evidence; the dialog and regex name points get one ux-reviewer look.

## Evidence

Filled at landing: what ran and where its output is.
