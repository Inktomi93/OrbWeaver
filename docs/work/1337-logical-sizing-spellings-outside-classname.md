---
kind: work
status: doing
updated: 2026-10-25
priority: P3
area: ui
lane: closeout/css
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

The expanded CLASS_SELECTORS and pinned better-tailwindcss patch reach variable bindings, recipe arrays and named-function returns. Existing native-token controls cover those carriers and pass; the full UI/client lint census is clean. This closeout does not repeat the already-applied logical-sizing migration.

See [CSS closeout](../reviews/css-closeout.md) for exact check selections, artifacts and remaining limits.
