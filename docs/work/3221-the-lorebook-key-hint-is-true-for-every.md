---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: world-info
---

# The lorebook key hint is true for every key kind

## What

The hint in `packages/client/src/features/world-info/components/entry-editor.tsx` says keys match case-insensitively and whole-word, which a regex key and a key in a script without word separators do not. Say the rule per key kind, and check whether a regex key can be authored from the editor and is marked as one.

## Why

An author who reads the hint writes a pattern or a non-Latin key that does not behave as described.

## Done when

The hint states the rule for plain, regex and unspaced-script keys, and a regex key can be authored and is marked in the editor.

## Evidence

Filled at landing: what ran and where its output is.
