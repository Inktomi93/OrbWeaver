---
kind: tooling
status: blocked
updated: 2026-09-23
priority: P2
area: tooling
blocked: on 12
plan: doc-migration
---

# Board tool removal: pnpm work:item and its spellings

## What

Delete `tooling/src/workboard/` and `tests/tooling/workboard/`, the `work:item` script in `package.json`, the tool's row in the roster of `docs/law/Core-Tooling-Law.md`, and every `pnpm work:item` spelling in `.claude/rules/*.md`, `.claude/skills/**`, `.claude/hooks/session-onboard.sh` and `AGENTS.md`, replacing each with the `pnpm doc` verb that does the job (`item`, `set`, `land`, `overview`, `drift`). The GitHub issue templates under `.github/ISSUE_TEMPLATE/` and `tests/tooling/issue-form-guidance-integrity.test.ts` go with it unless the owner keeps GitHub issues for outside reports.

## Why

The board is torn down; two lifecycle homes would drift, and the orchestrator skill must name one set of verbs.

## Done when

`rg -n 'work:item|workboard' package.json tooling tests .claude docs AGENTS.md` returns zero; `pnpm check` is green; the orchestrator skill's first actions name `pnpm doc overview` and `pnpm doc drift`.

## Evidence

Filled at landing: what ran and where its output is.
