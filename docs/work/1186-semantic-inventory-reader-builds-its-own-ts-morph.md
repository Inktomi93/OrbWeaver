---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Semantic inventory reader builds its own ts-morph projects

## What

tooling/src/floor/code-facts/semantic-inventory-reader.ts:184 and :218 construct new Project outside getWorkspace(), so tooling-plumbing-family's retained-policies case fails on main: a second ts-morph loader with no reviewed grant naming what it loads and what ends it.

## Why

The tooling law allows one workspace loader; an ungranted second loader is either a duplicate walk or an unreviewed construction.

## Done when

The reader reuses the shared workspace, or each construction is a reviewed non-workspace parser with a grant naming what it loads and what ends it; tooling-plumbing-family.suite.test.ts passes on main.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
