---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# pnpm typecheck passes the compiler's extended diagnostics and trace through on request

## What

scripts/typecheck.ts has no way to ask tsc for its extended diagnostics or a generated trace per program, so a slow or heavy program cannot report its check time and memory without custom tooling.

## Why

The compiler already measures this; we should read it rather than guess.

## Done when

An opt-in flag passes extended diagnostics through per program and an optional flag passes a trace directory; a planted case shows the diagnostics lines with the flag and none by default; the pprof directory flag is documented as a manual option.

## Evidence

Filled at landing: what ran and where its output is.
