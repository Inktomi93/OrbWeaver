---
kind: tooling
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/inherited-matrix-qualification
---

# Recognize native skipped matrices in inherited qualification

## What

Make inherited qualification recognize the exact skipped matrix job names emitted by GitHub, without weakening runtime shard or job provenance checks.

## Why

Release preflight rejects green main 2e111eae57 because GitHub emits one unresolved matrix job for each skipped matrix, while the qualifier requires expanded skipped shard jobs.

## Done when

Native skipped matrix records qualify only under inherited authority and the canonical workflow population; missing, mixed, duplicated, failed and partial-attempt jobs still refuse. Focused controls and the exact native release preflight pass.

## Evidence

Filled at landing: what ran and where its output is.
