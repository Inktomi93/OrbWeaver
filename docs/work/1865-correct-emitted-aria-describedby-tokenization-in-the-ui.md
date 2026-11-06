---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: tooling
plan: test-foundation
---

# Correct emitted aria-describedby tokenization in the UI audit walker

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B036-2507`: Fix the raw-JS template separator so the emitted code splits whitespace, then extend existing native browser controls for multiple IDs and an ID containing s.

Inspect `tests/tooling/design-audit-walker.ct.tsx`, `tests/tooling/ui-audit/index.int.test.ts`, `tooling/src/ui-audit/ops/walker/census-interactive-navigability.ts`, `packages/ui/src/primitives/tooltip/tooltip.tsx`.

## Why

`AF3-B036-2507`: The current literal-s split can report valid description wiring as an unreachable tooltip.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B036-2507`: Controlled native walker resolves two valid IDs and one s-containing ID; classifier excludes them as reachable; missing-ID control remains a finding. No new analyzer.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
