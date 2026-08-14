---
kind: runbook
status: active
updated: 2026-08-14
---

# Orbweaver recovery index

This page is the cold-start entry point, not a backlog or a second source of status. Mutable work
lives in [Orbweaver Project 1](https://github.com/users/Inktomi93/projects/1); repository documents
hold durable law, programs, evidence, and history.

## Resume a session

1. Read the root `AGENTS.md`, then the task-specific reading set it names.
2. Inspect local truth: `git status --short --branch` and `git log -5 --oneline`. Local `main` may be
   ahead of `origin/main`; never substitute the remote branch for the current local tree.
3. Open Project 1's **Active board**, **Ready**, **Needs owner**, **Verify**, and **Parked** views.
4. Re-derive the issue against current code and evidence before claiming it. Use
   `pnpm work:item show <issue>` and `pnpm work:item claim <issue> --lane <lane>` for agent work.
5. Read the verification tier from `pnpm verify --list`; a static green does not prove behavioral
   completion.

## Authority map

| Need | One home |
| - | - |
| Mutable status, priority, dependencies, lane, review, evidence | [Project 1](https://github.com/users/Inktomi93/projects/1) + its issues |
| Architecture and standing product rulings | `docs/architecture/core/` and the D-ledger |
| Agent delegation, worktree, merge, and overnight process | `.Codex/rules/orchestration.md` (`.Codex/rules` is the tracked symlink to Claude's one file) |
| Committed future programs | `docs/architecture/proposed/INDEX.md` + one Project sprint issue per program |
| Re-derived reviews and reports | `docs/reviews/`, routed to a Work, Decision, or Program issue |
| Documentation inventory and fact-check receipts | `docs/catalog/catalog.json` + `docs/catalog/receipts/` |
| Frozen pre-Project workboard, owner-ruling provenance, and old queue | `docs/history/retro-workboard-2026-08-14.md` |

## Hard stops

- Never push `origin` without fresh owner authorization for that push.
- Never resume work from a checkbox or status line in the frozen workboard. Re-derive it and use the
  corresponding Project issue, or create one from current evidence.
- Never mirror Project status into prose. Leave a durable result or evidence link in Git and let the
  issue own the lifecycle.

If GitHub Project access is temporarily unavailable, continue safe read-only or local verification
work and record no substitute queue. Project state is authoritative again when access returns.
