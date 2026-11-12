---
kind: tooling
status: doing
updated: 2026-11-12
priority: P1
area: tooling
lane: wt/agent-a672cae2c753c5fe3
---

# Whole-tree ESLint fits its heap in one process

## What

A plain whole-tree pnpm lint:eslint run exhausts its heap on main: it was reproduced on a clean tree, and the peak is far above the memory bar for one run. Pre-push runs that plain whole-tree form in one process (lefthook.yml), so a push cannot get a lint verdict. CI is not affected: it lints packages, tests, tooling and the root remainder as separate jobs with the default heap. The boxed script completes, but it raises the heap for the local box and is not a form pre-push or CI may use.

## Why

If pre-push cannot finish its lint step, nothing can be pushed with a verdict. Measured on main with the default heap, as the parts CI runs: packages peaks near fifteen gigabytes, tests near eleven, tooling and the root remainder under five each, so the packages part is already close to the memory bar for one run. The boxed script took far more than the bar in whole-tree runs beside other work and had its processes killed by the host's memory guard.

## Done when

Ruling: pre-push lints the same parts CI does, one process after another with the default heap, so each part's memory is released before the next starts. The list of parts has one home that the pre-push command and the boxed script read, and the CI matrix names it in a comment. Each part's peak is measured on main and recorded where the memory bar is stated; a part that does not fit the default heap is split further, never given a larger heap. lefthook.yml, the lane skill's line about pre-push, and D317 agree with the result, and a whole pre-push run completes on main.

## Evidence

Filled at landing: what ran and where its output is.
