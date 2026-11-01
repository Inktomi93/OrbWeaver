---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/auth parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/auth`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `requireAuthed.wait` | `client/src/features/auth/lib/route-guards.ts:53` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `redirectIfAuthed.wait` | `client/src/features/auth/lib/route-guards.ts:62` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Two rows: two applied, none kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `requireAuthed.wait` | applied: parameter and the `WaitOp` injection seam removed in `packages/client/src/features/auth/lib/route-guards.ts`; `meOrNull` calls the one module-level `wait` |
| `redirectIfAuthed.wait` | applied: same file |

Callers: `packages/client/src/routes/router.tsx:40,47` call both guards with no arguments; the barrel `packages/client/src/features/auth/index.ts:11` re-exports them. Survey: `codegraph_explore` on `requireAuthed redirectIfAuthed route-guards wait`; literal `rg` for both names over `packages tests tooling scripts` (no test passes a wait). Proof: client typecheck clean; `tests/client/features/auth/components/login-pending-join.ct.tsx` result in the lane report.
