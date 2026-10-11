---
kind: tooling
status: open
updated: 2026-10-11
priority: P1
area: ci
---

# Restore mutation dry-run project collection

## What

Make the native project-selection control pass inside the Stryker sandbox before mutation measurement begins.

## Why

The mutation gate stops during its unmutated initial test run because native Playwright collection fails. No mutation score is measured.

## Done when

Native sandbox collection and meaningful refusal controls pass. The real unmutated dry run reaches mutation execution without dropping coverage, changing the frozen targets or threshold, or invoking weekly proof in the full tier.

## Evidence

Orphaned claim: its codex branch is fully merged into main and no session holds it. Done when still needs a hosted run to confirm.

Hosted check: the weekly tooling proof (non-corpus), which carries the Stryker run, failed on e88487bf62.

Filled at landing: what ran and where its output is.
