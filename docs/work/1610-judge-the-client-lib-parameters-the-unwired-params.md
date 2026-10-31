---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/lib`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `publicBugReportIssueUrl.maxLength` | `client/src/lib/bug-report-public.ts:290` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `downloadTextFile.mime` | `client/src/lib/download-json.ts:57` | unsupplied | delete | delete the parameter and its default path (4 calls) |
| `downloadUrl.filename` | `client/src/lib/download-json.ts:69` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `logClock.d` | `client/src/lib/log-clock.ts:9` | unsupplied | delete | delete the parameter and its default path (12 calls) |
| `installDeadClassFlagger.#0.readDefined` | `client/src/lib/motion-dead-class-flagger.ts:186` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `recordSafeError.context` | `client/src/lib/safe-error-ring.ts:110` | unsupplied | delete | delete the parameter and its default path (3 calls) |
| `useFocusListArrival.enabled` | `client/src/lib/use-focus-on-mount.ts:50` | unsupplied | delete | delete the parameter and its default path (3 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
