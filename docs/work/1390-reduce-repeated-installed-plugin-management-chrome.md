---
kind: work
status: doing
updated: 2026-10-27
priority: P3
area: client
lane: composer_two_rows
---

# Reduce repeated installed-plugin management chrome

## What

Compact settled per-plugin lifecycle controls and remove redundant boxed settings chrome inside the owner-ruled installed-plugin consent card.

## Why

Update and collapsed management rows consume most of a phone screen per plugin. Research Familiar and Affinity Tracker settings add a second bordered attribution card inside the host card.

## Done when

Keep the outer consent boundary, mandatory attribution, attention states, grants, task-model bindings, activity and lifecycle actions. Use one shared host presentation across admitted rendering tiers. Verify sparse and populated installations on desktop and phone without plugin-specific CSS or guest API changes.

## Case map

Rendered owner: `tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx`.

| Behavior | Layer | Existing coverage | Decision |
| - | - | - | - |
| Attribution without nested settings cards across rendering tiers | CT | No maintained settings presentation case | Add production Settings registry mounts with real installed guests. |
| Settled management control reachability | CT | Consent layout covers unresolved actions | Add disclosure, grants, model, activity and lifecycle reachability checks. |
| Pending consent actions and focus | CT | tests/client/features/plugin/components/consent-layout.ct.tsx | Keep existing production coverage and the current approve-all/deny consent ruling. |

Execution remains pending. These are audit regressions, not wholesale legacy restoration.

## Evidence

Filled at landing: what ran and where its output is.
