---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: test-enforcement
---

# Recognise act brackets by their import, not their name

## What

ACT_BRACKETS in tooling/src/eslint/test-recorders.ts matches helper names only, so a file-local function named wireOf, quietOf or appendedBy is exempt whatever it returns.

## Why

A same-named local helper can carry a tail read past the rule.

## Done when

A bracket counts only when imported from its testkit home, or a same-named local function is refused, with a plant row.

## Evidence

Filled at landing: what ran and where its output is.
