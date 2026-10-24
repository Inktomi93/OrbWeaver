---
kind: work
status: open
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

## Done when

An ESLint rule over `packages/**` and `tooling/**` source comments flags the history patterns, with planted controls; existing hits sit in a per-file baseline the rule reads, which only shrinks; the baseline count is reported, and a file that drops to zero leaves it.

## Evidence

Filled at landing: what ran and where its output is.
