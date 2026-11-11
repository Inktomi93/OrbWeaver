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

`tooling/src/codemods/text-prose-cap-pair/` was never applied: a dry run of its script would still change client files. The codemod cleanup under item 2450 kept it for that reason and recorded the reason in its `codemod.yaml`.

## Why

A written rewrite that nobody applied is either unfinished UI work or a rejected idea, and the tree does not say which.

## Done when

The rewrite is applied with a rendered check of the changed surfaces and the codemod is deleted in that commit, or the idea is rejected with its reason and the directory is deleted.

## Evidence

Filled at landing: what ran and where its output is.
