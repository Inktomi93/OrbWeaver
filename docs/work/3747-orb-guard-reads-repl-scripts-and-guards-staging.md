---
kind: tooling
status: open
updated: 2026-11-21
priority: P2
area: tooling
---

# orb-guard reads REPL scripts and guards staging and sqlite in lanes

## What

orb-guard hooks Bash, Read and agent spawn (~/.claude/skills/orb-guard/hooks/register.ts) and sees each $ command a REPL script runs, but not the script. An audit of the last day's transcripts found, in REPL scripts: .cwd(<worktree>) and cd inside $ that moved the session's working directory, a git commit chained after checks with no exit-code stop, git add -A from lanes, eval attempts, and oversized returns. git add -A is only a note today, and the sqlite3 refusal does not name the copy-then-read-only route.

## Why

Lanes ignore the lane skill's Scripts rules, and a chained commit after a failed check landed items whose code was not on main.

## Done when

Find whether the mod engine lets orb-guard hook the REPL tool; if it does, a REPL rule reads the script text and hints or denies on .cwd into a worktree, cd inside $, git add -A, a git commit with no exit-code check before it, and eval, each with the exact next step; git add -A, --all and . are denied for subagents with the pathspec form named; the sqlite3 refusal names copying the db, wal and shm to the scratchpad and opening the copy read-only; each rule has a test in the guard's own suite and a false-positive control.

## Evidence

Filled at landing: what ran and where its output is.
