---
kind: work
status: doing
updated: 2026-11-11
priority: P2
area: tooling
lane: wt/agent-a1ab78c6e1083a746
---

# Remove Codex from the repository

## What

Codex no longer works on this repository. Its files remain: `.codex/`, the `.agents/skills` link, the Codex sections of `AGENTS.md`, the Codex rulings in `.claude/skills/orchestrator/SKILL.md`, `.claude/skills/lane/SKILL.md` and `.claude/skills/agent-authoring/SKILL.md`, the Codex line in `.claude/rules/writing.md` and `.claude/hooks/session-onboard.sh`, and Codex cases in tooling, scripts and tests. Mentions of OpenAI Codex models in product code are product data and stay.

## Why

Instructions for a harness nobody runs cost always-on context and send cold sessions to a peer that does not answer.

## Done when

No tracked file configures or instructs Codex, the instruction files and hooks name only harnesses in use, the tests that covered Codex worktrees are deleted or reduced with the suite green, and `AGENTS.md` meets its line budget.

## Evidence

Filled at landing: what ran and where its output is.
