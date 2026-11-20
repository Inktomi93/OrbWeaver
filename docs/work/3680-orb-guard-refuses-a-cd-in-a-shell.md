---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: tooling
---

# orb-guard refuses a cd in a shell command and names the -C form

## What

A script that runs cd inside a shell command moves the session's working directory, because the shell keeps it between commands. A later command then needs a second cd, and Claude Code asks for approval on a command with several directory changes. An unattended run stalls on that prompt until it is auto-refused.

## Why

An overnight run stops on a permission prompt nobody answers.

## Done when

orb-guard refuses a shell command that starts with or chains a cd and names the git -C or env -C form as the next step, the lane and orchestrator skills say the same, and a guard test covers a chained cd and a plain git -C.

## Evidence

Filled at landing: what ran and where its output is.
