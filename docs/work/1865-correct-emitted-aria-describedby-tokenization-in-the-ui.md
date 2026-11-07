---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: tooling
plan: test-foundation
---

# Correct emitted aria-describedby tokenization in the UI audit walker

## What

Fix the whitespace split at tooling/src/ui-audit/ops/walker/census-interactive-navigability.ts and its twin at tooling/src/ui-audit/ops/walker/census-text.ts. Group P8 in docs/plans/test-foundation/finding-triage.md holds the evidence.

## Why

`AF3-B036-2507`: The current literal-s split can report valid description wiring as an unreachable tooltip.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B036-2507`: Controlled native walker resolves two valid IDs and one s-containing ID; classifier excludes them as reachable; missing-ID control remains a finding. No new analyzer.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
