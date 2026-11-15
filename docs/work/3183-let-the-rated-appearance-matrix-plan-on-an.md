---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: snap-secret-hygiene
---

# Let the rated appearance matrix plan on an isolated stage

## What

`pnpm snap / --matrix --isolated` exits 2 on an isolated stage, printing `THEME SHIM WARNING --theme did not apply: settings.listThemes answered 403 with no theme list` and then `INSTRUMENT ERROR snap matrix discovery/planning failed: matrix discovery did not resolve its authenticated theme-catalog request`. It was seen on `/` and on a tokened route, and not tried on main.

## Why

The matrix cannot plan where it is required to run, because its theme-catalog request is refused.

## Done when

The command plans and runs on an isolated stage, or its refusal names the stage flag it needs.

## Evidence

Filled at landing: what ran and where its output is.
