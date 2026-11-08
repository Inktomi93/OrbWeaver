---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# Keep URL credentials out of snap run files

## What

snap --base userinfo reaches run.json argv and SessionRow\.binding.url, on a value redactNetworkUrl already knows how to clean.

## Why

It is the same class as the argv secret fix, on a value the tool can already clean.

## Done when

A planted user:pass base URL reaches no run file or session log.

## Evidence

Filled at landing: what ran and where its output is.
