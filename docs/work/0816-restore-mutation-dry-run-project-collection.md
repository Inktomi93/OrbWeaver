---
kind: tooling
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/nightly-mutation-repair
---

# Restore mutation dry-run project collection

## What

Make the native project-selection control pass inside the Stryker sandbox before mutation measurement begins.

## Why

The mutation gate stops during its unmutated initial test run because native Playwright collection fails. No mutation score is measured.

## Done when

Native sandbox collection and meaningful refusal controls pass. The real unmutated dry run reaches mutation execution without dropping coverage, changing the frozen targets or threshold, or invoking weekly proof in the full tier.

## Evidence

Filled at landing: what ran and where its output is.
