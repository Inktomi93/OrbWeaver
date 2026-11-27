---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: unwired-code
---

# orb-guard lets a lane run scoped unwired graph verbs

## What

The orb-guard rule in ~/.claude/skills/orb-guard/hooks/rules.ts counts every pnpm unwired verb except targeted coverage as a whole-tree run and refuses it in a lane, including graph verbs scoped with --files=<prefix> and light verbs such as procedures and hits.

## Why

The owner ruled that lanes run scoped real-tree unwired runs in their own worktree and only whole-tree runs stay with the orchestrator; the guard predates the ruling, so every scanner fix waits on the orchestrator to run its proof.

## Done when

A lane may run a graph verb with --files=<prefix>, graph-why, hits and the git-based verbs; an unscoped graph verb still gets the whole-tree refusal; a guard case covers each form.

## Evidence

Filled at landing: what ran and where its output is.
