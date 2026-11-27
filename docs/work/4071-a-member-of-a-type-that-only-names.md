---
kind: tooling
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-aa44702c7ee3d87c4
plan: unwired-code
---

# A member of a type that only names a type error is judged by nothing

## What

docs/law/unwired-fields-scan.md lists as open that a member of a type existing only to name a type error, such as the members of NamesEvery in packages/kit/src/guards/index.ts, reports member-untouched.

## Why

Such members carry a compile-time message, not data, so a cleanup that deletes them weakens the guard they spell.

## Done when

The graph classes these members as shape-only with a red-first case, the open-class line leaves the law doc, and a fields-scan row states the ruling.

## Evidence

Filled at landing: what ran and where its output is.
