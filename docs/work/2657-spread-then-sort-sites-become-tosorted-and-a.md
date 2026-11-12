---
kind: work
status: doing
updated: 2026-11-12
priority: P3
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# Spread-then-sort sites become toSorted and a lint rule holds the count at zero

## What

`docs/law/Spine-TypeScript-and-Patterns.md` names `[...x].sort(fn)` as a defect and `x.toSorted(fn)` as the spelling. `ast-grep` with the pattern `[...$X].sort($F)` finds sites in `packages` in both `.ts` and `.tsx`. Rewrite them with a codemod, sweep `tooling`, `tests` and `scripts` too, and turn on a lint rule that refuses the spread-then-sort form.

## Why

The law's own named example of a defect is live and nothing fails on it.

## Done when

No site spreads an array or tuple and then sorts it: a type-aware lint rule is on at zero with a planted control, the law's ADOPT entry states that the spelling binds for an array operand and that a spread of another iterable followed by a sort stays, and the affected tests pass.

## Evidence

Filled at landing: what ran and where its output is.
