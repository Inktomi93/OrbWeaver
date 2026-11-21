---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-a829f0f1e1a3617bb
plan: unwired-code
---

# Coverage from real runs names code nothing executes

## What

Branches behind settings nobody can toggle, fallbacks for states that never occur and handlers for events nobody emits are reachable by type and invisible to every static scan.

## Why

Only execution shows code that no real run reaches.

## Done when

A tooling command merges V8 coverage from the Node, CT and e2e suites and lists production functions and branches no run executed, the result is sized against the small-hardware bar, and the orchestrator judges its first report.

## Evidence

Filled at landing: what ran and where its output is.
