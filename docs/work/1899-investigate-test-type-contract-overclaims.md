---
kind: work
status: open
updated: 2026-11-03
priority: P3
area: testing
plan: restoration-register
---

# Investigate test type-contract overclaims

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`MAIN-AF3-KEYS-001`: Return native string keys for arbitrary objects, or remove keysOf; finite registry consumers should iterate the owning canonical tuple rather than asserting generic static membership.

Inspect `tests/ui/primitives/button/box-hit-area.dom.test.ts`, `packages/ui/src/primitives/button/box-hit-area.ts`, `tests/support/iso/keys-of.ts`.

`AF3-B012-finding-295`: Type metadata as a total canonical-ID keyed record and derive render order from the owning ID tuple, eliminating the asserted find result.

Inspect `tests/client/features/character/lib/facet-fill.dom.test.ts`, `tests/client/features/character/variant-payloads.dom.test-d.ts`, `tests/client/features/character/components/library-outline.ct.tsx`, `packages/client/src/features/character/lib/character-card-facets.ts`.

## Why

`MAIN-AF3-KEYS-001`: Object.hasOwn after Object.keys cannot prove keyof T. Numeric and structurally widened inputs violate the declared key union, although the inspected closed-record consumer is safe.

`AF3-B012-finding-295`: The current readonly element array does not enforce an entry per ID despite claiming native compiler completeness; current entries happen to be complete.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`MAIN-AF3-KEYS-001`: Affected compiler programs and callers pass with no asserted generic keyof predicate; numeric and widened inputs cannot obtain a falsely narrow key array. Preserve intentional invalid-input helpers as separate contracts.

`AF3-B012-finding-295`: An omitted canonical ID fails the affected native compiler program; existing fill-correlation and affected UI behavior checks remain intact. No new custom static checker.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
