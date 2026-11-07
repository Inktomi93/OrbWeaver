---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: unwired-code
---

# Union rows that are second vocabularies get one home, and subset tuples read as built

## What

pnpm unwired unions lists members of literal unions that production builds under another spelling. Where a package holds its own copy of a vocabulary, such as PROVIDER_ADJUSTMENT_KINDS against the infra adjustment codes that engine.ts maps across, give it one home and let the tuple be built directly. Where a tuple is a local subset of a built union, such as TERMINAL_STATUSES over WorkloadStatus, tie it to the parent so the scan reads it as built.

## Why

A second copy of a vocabulary is a defect here, and a false unbuilt row misleads a removal judgment.

## Done when

Each of these unions rows is wired to one home or reads as built, and no row reports a member production constructs.

## Evidence

Filled at landing: what ran and where its output is.
