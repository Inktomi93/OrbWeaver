---
kind: decision
status: open
updated: 2026-11-11
priority: P2
area: docs
---

# Rule the file header budget against the header's job as law

## What

`.claude/rules/comments.md` limits a file header to three lines. `AGENTS.md` says per-domain law lives in file headers. Most headers in `packages/server/src` and `packages/kit/src` exceed the budget. The same unit found two dead procedures in `.claude/skills/lane/SKILL.md`: the `legacy-main` branch section, for a branch that does not exist, and a test-hook naming convention with no use in `packages/`. `AGENTS.md` is over the line budget that `.claude/rules/writing.md` sets for it. Source: `reports/codebase-review/units/instruction-files.md`.

## Why

A reviewer who cites the budget trims rulings out of headers, and a builder who follows `AGENTS.md` writes headers the budget calls defects.

## Done when

Decided: the header budget in `.claude/rules/comments.md` is amended to match `AGENTS.md`: a header holds the purpose line and every ruling, invariant or trap, with no line cap. Still owed: the two dead sections in `.claude/skills/lane/SKILL.md` are deleted or shown live.

## Evidence

Filled at landing: what ran and where its output is.
