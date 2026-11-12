---
kind: decision
status: open
updated: 2026-11-11
priority: P3
area: ui
plan: cross-surface-consistency
---

# Apply or delete the text-prose-cap-pair codemod

## What

The `text-prose-cap-pair` codemod was never applied: a dry run of its script would still change client files. The codemod cleanup under item 2450 kept it for that reason and recorded the reason in its `codemod.yaml`.

## Why

A written rewrite that nobody applied is either unfinished UI work or a rejected idea, and the tree does not say which.

## Done when

Ruling: apply. A Text with the prose size and no prose measure runs a paragraph the full row, which is the line-length finding the design audit reports. The codemod is applied to every client site, a rendered check reads the changed surfaces at desktop and phone widths, and the codemod directory is deleted in the same commit. A lint rule or a Text prop type then refuses the prose size without the cap, so the pair cannot drift again.

## Evidence

Filled at landing: what ran and where its output is.
