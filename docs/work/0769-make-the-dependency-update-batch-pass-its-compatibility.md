---
kind: bug
status: doing
updated: 2026-10-06
priority: P2
area: release
lane: codex/ci-dependency-upgrade
---

# Make the dependency update batch pass its compatibility checks

## What

Repair the proposed dependency update batch against the application contracts and component behavior.

## Why

The update changes schema projection, database connections and widget contracts. Incompatible tooling and pure-package updates remain held.

## Done when

The upgraded tree preserves application contracts and exact browser pins. Focused regression suites and shared checks pass. The branch remains unpublished until authorized.

## Evidence

Filled at landing: what ran and where its output is.
