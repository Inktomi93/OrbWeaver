---
kind: work
status: doing
updated: 2026-10-30
priority: P1
area: testing
lane: surface_walk
plan: surface-walk
---

# Build and qualify the native automated surface walkthrough

## What

A local, opt-in Playwright walkthrough of the production-built app with axe, web-vitals and the existing geometry and design collectors, over synthetic data or a disposable copy of the owner snapshot. The plan is `docs/plans/surface-walk/design.md`.

The work sits on branch `wt/surface-walk` in the worktree `/home/inktomi/.codex/worktrees/surface-walk/orbweaver`: one squashed commit on main that folds in the parked Codex lane copies. Those copies are preserved on `wt/codex-surface-{walk,error,static,collector,home,character}-qualification`; delete them after this branch merges. The launcher is `scripts/surface-walk.ts` (`pnpm e2e:surface`, `pnpm e2e:surface:controls`, `pnpm e2e:surface:read`).

### Owner ruling: two phases

Phase A, now: land the infrastructure and stop.

1. The walkthrough lane builds the fast development loop: a single-journey run (`-- --project=<p> -g "<case>"`), the measurement pass without axe, design census or screenshots, and reuse of an up-to-date production build so a one-case run starts in seconds. It reports one-case wall time before and after.
2. It writes the working method into the plan (below) and a per-surface status table and driver triage into `reports/surface-walk-status.md`.
3. A `verifier` reviews the branch; then it merges. The existing journey drivers merge frozen: no extension until phase B.
4. This item then moves to `parked`, blocked on the UI program.

Phase B, parked until the UI program settles (the tone role tier and variant vocabulary, the page-template tier in the cross-surface acceptance item, and importing test labels from production): rework the journeys, then qualify.

### Method for phase B

- Coverage comes from the generic walker (tab bodies, disclosures, menus, scroll windows) over production registries, rendered controls and the walk's own unvisited-control inventory. A control that is only opened or navigated gets no bespoke code.
- Bespoke driver code exists only for an action with an outcome to assert: create, rename, delete, run, generate, and persistence across reload. Forms that need valid input, destructive actions and multi-step flows stay bespoke.
- Accessible names come from production copy modules, never hand-typed strings.
- Discover a surface's controls and success signals before writing its journey, from the unvisited-control inventory and Snap machine output (`pnpm snap ... --report`), not screenshot review.
- Iterate on one case at a time with the measurement pass. Run the full evidence pass once per surface when its journeys pass.
- Group evidence findings by rule per surface and board one item per rule per surface. Findings do not gate the walkthrough.
- Run one walk at a time on the box.
- Split lanes by driver file on Sonnet: chat (`tests/e2e/support/surface-chat.ts`), config (`tests/e2e/support/surface-config.ts`), and the rails (`tests/e2e/support/surface-sections.ts`). One owner holds the shared runner, collectors, spec registry and `tests/e2e/support/surface-character.ts`.

### Known state at parking

- The drivers are hand-scripted per control and hard-code hundreds of accessible names, so UI copy or flow changes break them. The triage in `reports/surface-walk-status.md` lists each driver function as delete (generic coverage), keep (outcome check) or shared helper.
- Collector controls pass. A synthetic desktop evidence run reached Characters, Chat and part of Config; almost every case failed on product findings, led by label and accessible-name mismatches, heading order, promoted-layer offsets and text over art. Rails were not reached.
- Chat's polish, oracle and arcade journeys are empty and pass vacuously. Chat menu items, plugin-page actions, Refinery runs, Databank ingestion and several Config categories are not exercised.
- On a phone, the bottom navigation stays focusable under the full-screen context sheet; board it with the phase A findings.

## Why

Repeated manual navigation and separate measurements consume model calls and leave fragmented review evidence. Journeys written before the UI program would be rewritten after it.

## Done when

Phase A: the fast loop, method, status table and triage are committed; the branch passes independent review and merges; this item is parked with the UI program as its blocker.

Phase B: the agreed surface, flow, device and pane coverage runs through one documented local command; Base UI, Suspense and Activity handling, the measurement lifecycle and complete accessibility output are proven; no data or artifacts reach GitHub; applicable native checks and independent review pass; coverage gaps and product findings stay explicit.

## Evidence

Filled at landing: what ran and where its output is.
