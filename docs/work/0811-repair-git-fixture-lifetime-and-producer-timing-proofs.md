---
kind: tooling
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/seed-readback-prerequisite
---

# Repair Git fixture lifetime and producer timing proofs

## What

Make Git fixture cleanup deterministic and repair the qualification producer and commit-hook timing proofs.

## Why

Weekly tests report a pack-directory cleanup race and timeouts in real child-process proofs.

## Done when

Native controls prevent automatic pack writers from outliving scratch repositories. Qualification generation and hook exclusion assertions remain intact. Named checks and hosted weekly qualification pass without weaker budgets.

## Evidence

Filled at landing: what ran and where its output is.
