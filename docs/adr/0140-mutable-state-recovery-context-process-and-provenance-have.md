---
kind: adr
status: active
updated: 2026-09-24
---

# mutable state, recovery context, process, and provenance have four distinct homes

## Context

Not recorded in the ledger row.

## Decision

GitHub Project 1 owns Ready/Running/Blocked/Verify/Done and every mutable planning field. The cold-start recovery index is the SessionStart onboard hook (`.claude/hooks/session-onboard.sh`: the bridge inbox and the worktree count; `.claude/hooks/orchestrator-inject.mjs` injects the `orchestrator` skill body, read from the skill file); it routes an amnesiac agent to current authority and contains no executable backlog. The `orchestrator` skill (`.claude/skills/orchestrator/SKILL.md`) is the one source for current delegation and agent-operations policy; Codex reaches every path rule through the rule list in root `AGENTS.md`, which `pnpm check:agents` checks against the rule files. The `lane` skill (`.claude/skills/lane/SKILL.md`) is the one home for worktree-lane discipline. Do not mirror Project status into prose, resume an archived checkbox, or turn the recovery index back into a second board.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
