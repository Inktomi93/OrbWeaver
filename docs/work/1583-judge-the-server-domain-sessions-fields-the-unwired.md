---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/sessions fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/sessions`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CreateSessionResult.token` | `server/src/domain/sessions/contract/results.ts:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CreateSessionResult.sessionId` | `server/src/domain/sessions/contract/results.ts:15` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CreateSessionResult.expiresAt` | `server/src/domain/sessions/contract/results.ts:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ValidatedSession.enabled` | `server/src/domain/sessions/contract/results.ts:32` | never-read | delete | delete the field and its writes (`server/src/domain/sessions/verbs/validate.ts:33`) |
| `SessionsServiceDeps.rolePolicy` | `server/src/domain/sessions/service.ts:34` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SessionsServiceDeps.logger` | `server/src/domain/sessions/service.ts:35` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SessionsServiceDeps.idSource` | `server/src/domain/sessions/service.ts:39` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SessionsServiceDeps.crypto` | `server/src/domain/sessions/service.ts:42` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: `ValidatedSession.enabled`. A disabled row never resolves, so the field was always true. The one assertion on it in `tests/support/node/factories/sessions.int.test.ts` is dropped.

Derived: `CreateSessionResult.token` and `.expiresAt`. `writeMintedSession` in `packages/server/src/entry/http/auth-routes.ts` read them through an inline twin; its parameter is now `Pick` of the `sessions.create` result.

Kept, reclassified to a named reader:

| Row | Reader |
| - | - |
| `CreateSessionResult.sessionId` | `tests/support/node/factories/sessions.int.test.ts:15` and `tests/support/node/factories/rows/sessions.ts:40` look the minted row up by it. No production reader. Owner question: keep it as the mint receipt, or drop it and have the factory find the row by token hash. |
| `SessionsServiceDeps.rolePolicy`, `.logger`, `.idSource`, `.crypto` | `createSessionsService` hands `deps` whole to `createSessionsContext` in `packages/server/src/domain/sessions/context.ts`, which reads `inputs.rolePolicy`, `inputs.logger`, `inputs.idSource` and `inputs.crypto` |

- Survey: `codegraph_explore` on the result, deps and verbs; `rg` over `packages`, `tests` and `tooling`.
- Ran: `pnpm typecheck tsconfig.node.json`; `pnpm test` on `tests/server/domain/sessions`, `tests/server/entry/auth`, `session-policy` and the sessions factory suite.
