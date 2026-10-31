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

Filled at landing: what ran and where its output is.
