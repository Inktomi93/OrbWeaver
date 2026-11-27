---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
---

# The doc formatter's header matches how the snap flag index is maintained

## What

The header above CLASS_2_TREES in tooling/src/doc/ops/format.ts says .claude/skills/snap-driving/reference/flags.md is derived by a generator with a freshness check, but the file says it is maintained by hand and no generator writes it.

## Why

A comment that names a generator that does not exist sends the next author looking for it.

## Done when

The comment states how flags.md is kept current, or a generator from snapFlagDescriptors owns the file with its check.

## Evidence

Filled at landing: what ran and where its output is.
