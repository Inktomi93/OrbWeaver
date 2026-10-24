---
kind: work
status: done
updated: 2026-10-24
priority: P3
area: tooling
---

# Code comments carry no history

## What

About 3,600 comment lines in 847 client files carry history that `.claude/rules/comments.md` bans: issue numbers (`#1789`), review dates (`side-eye 2026-08-19`), ticket ids (`HUD-1`, `RV-8`), "used to", "formerly", and the banned word `load-bearing`. No lint enforces the rule.

## Why

History rots and buries the reason; git holds history.

## Owner ruling

2026-10-24: build the rule. Existing hits are baselined per file; new hits fail.

2026-10-24: dropped — no comment hunting. `.claude/rules/comments.md` stays as review guidance, with no lint behind it.

## Done when

Dropped by the owner ruling above: no lint enforces the history rule, and no drain runs.

## Evidence

Dropped before landing; the rule, its test and its wiring were removed.
