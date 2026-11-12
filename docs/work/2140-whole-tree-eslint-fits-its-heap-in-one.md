---
kind: tooling
status: open
updated: 2026-11-11
priority: P1
area: tooling
---

# Whole-tree ESLint fits its heap in one process

## What

A plain whole-tree pnpm lint:eslint run exhausts its heap on main: it was reproduced on a clean tree, and the peak is far above the memory bar for one run. Pre-push runs that plain whole-tree form in one process (lefthook.yml), so a push cannot get a lint verdict. CI is not affected: it lints packages, tests, tooling and the root remainder as separate jobs with the default heap. The boxed script completes, but it raises the heap for the local box and is not a form pre-push or CI may use.

## Why

If the single-process run exceeds the default heap on a contributor box or a CI runner, pre-push and CI fail with no lint verdict.

## Done when

Ruling: pre-push lints the same parts CI does, one process after another with the default heap, so each part's memory is released before the next starts. The list of parts has one home that the pre-push command and the boxed script read, and the CI matrix names it in a comment. Each part's peak is measured on main and recorded where the memory bar is stated; a part that does not fit the default heap is split further, never given a larger heap. lefthook.yml, the lane skill's line about pre-push, and D317 agree with the result, and a whole pre-push run completes on main.

## Evidence

Filled at landing: what ran and where its output is.
