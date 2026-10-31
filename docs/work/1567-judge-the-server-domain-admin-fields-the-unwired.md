---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/admin fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/admin`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `RestartParams.confirm` | `server/src/domain/admin/contract/params.ts:37` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/routers/admin.ts:83`) |
| `RevokeUserSessionsResult.revoked` | `server/src/domain/admin/contract/results.ts:16` | never-read | delete | delete the field and its writes (`server/src/domain/admin/verbs/sessions.ts:45`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Both rows applied. `RestartParams.confirm` dropped (the router input keeps `confirm: z.literal(true)` as the wire guard). `revokeUserSessions` now resolves void: the router output schema, `RevokeUserSessionsResult` and the test-support capture of the count went with it; the audit row still records the count. The client reads the mutation result as `unknown`.

Ran `pnpm test tests/server/domain/admin/verbs/session-policy.int.test.ts tests/support/node/factories/admin-views.int.test.ts` (exit 0). Typecheck and the rescan run once at the end of the lane.
