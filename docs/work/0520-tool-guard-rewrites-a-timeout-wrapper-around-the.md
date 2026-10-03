---
kind: tooling
status: open
updated: 2026-10-03
priority: P3
area: tooling
---

# Tool guard rewrites a timeout wrapper around the test and verify harness

## What

The PreToolUse tool guard rewrites pnpm test, verify and check commands but passes them through when wrapped in timeout. A timeout wrapper adds a second kill path on top of the Bash tool's own timeout, can SIGTERM the runner mid-stage, and leaves forked workers and the host verify slot behind. Teach the guard to strip a leading timeout from a harness command and fold its duration into the tool call's timeout, telling the caller it did so.

## Why

A session ran timeout 600 pnpm test:scoped on main; the guard rewrote the pipe but kept the timeout wrapper.

## Done when

A Bash call of timeout N pnpm test or verify or check runs the harness unwrapped with the Bash timeout raised to cover N, prints one line saying so, and the guard's own tests cover the rewrite.

## Evidence

Filled at landing: what ran and where its output is.
