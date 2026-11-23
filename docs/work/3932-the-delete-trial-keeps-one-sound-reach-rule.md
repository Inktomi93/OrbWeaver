---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The delete trial keeps one sound reach rule

## What

Since the 3892 review fix, graph-trial --reach=references checks every transitive importer of the files that name the candidate. The edited file is one of them, so the set always holds the imports set and adds only holder, key and owner-fallback files. Either retire --reach and make imports plus the holder, key and owner files the one rule, or build a sound narrowing from per-file export types that reach the holder, pruned along the import chain. A non-word name such as a quoted content-type key is never literal-searched; an escaped search could cover it.

## Why

The two reaches now differ only by extras, so the parity check in graph-trial.int.test.ts proves little, and the option promises a speed trade that no longer exists. The transitive set made the whole-tree compile phase about four times slower.

## Done when

One reach rule remains, or the narrowed one is proven sound against planted inferred-alias, satisfies, typeof and structural-assignment chains and is measurably smaller on the real tree.

## Evidence

Filled at landing: what ran and where its output is.
