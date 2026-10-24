---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: ui
plan: css-system
---

# Logical sizing spellings outside className

## What

82 physical `w-`, `h-`, `min-`, `max-` spellings remain in strings the class lint does not see: lib constants, variant arrays, `cellWidthClass`. The class-merge registration in `packages/ui/src/lib/class-merge.ts` keeps them correct today.

## Why

One vocabulary; a mixed physical/logical pair is decided by source order unless the merger knows the pair.

## Done when

A codemod rewrites the 82 strings; a rule or test refuses physical sizing in ui and client strings; zero remain.

## Evidence

Filled at landing: what ran and where its output is.
