---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/sessions union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `server/domain/sessions`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ROLE_POLICY_ENV_KEYS.DEFAULT_USER_HANDLE` | `server/src/domain/sessions/contract/role-policy.ts:9` | unbuilt | unknown (read) | keep: `substrate/role-policy.ts` reads the key; the tuple now holds constants, which `tupleOf` skips, so the scan needs no teaching |
| `ROLE_POLICY_ENV_KEYS.OWNER_HANDLES` | `server/src/domain/sessions/contract/role-policy.ts:10` | unbuilt | unknown (read) | keep: `substrate/role-policy.ts` reads the key; the tuple now holds constants, which `tupleOf` skips, so the scan needs no teaching |
| `ROLE_POLICY_ENV_KEYS.OWNER_GROUP` | `server/src/domain/sessions/contract/role-policy.ts:11` | unbuilt | unknown (read) | keep: `substrate/role-policy.ts` reads the key; the tuple now holds constants, which `tupleOf` skips, so the scan needs no teaching |
| `ROLE_POLICY_ENV_KEYS.OIDC_ADMIN_GROUPS` | `server/src/domain/sessions/contract/role-policy.ts:12` | unbuilt | unknown (read) | keep: `substrate/role-policy.ts` reads the key; the tuple now holds constants, which `tupleOf` skips, so the scan needs no teaching |
| `ROLE_POLICY_ENV_KEYS.OIDC_ALLOWED_GROUPS` | `server/src/domain/sessions/contract/role-policy.ts:13` | unbuilt | unknown (read) | keep: `substrate/role-policy.ts` reads the key; the tuple now holds constants, which `tupleOf` skips, so the scan needs no teaching |
| `ROLE_POLICY_ENV_KEYS.RE_DERIVE_ROLE_ON_LOGIN` | `server/src/domain/sessions/contract/role-policy.ts:14` | unbuilt | unknown (read) | keep: `substrate/role-policy.ts` reads the key; the tuple now holds constants, which `tupleOf` skips, so the scan needs no teaching |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Counts: 6 rows = 6 kept.

- `ROLE_POLICY_ENV_KEYS.DEFAULT_USER_HANDLE`, `.OWNER_HANDLES`, `.OWNER_GROUP`, `.OIDC_ADMIN_GROUPS`, `.OIDC_ALLOWED_GROUPS`, `.RE_DERIVE_ROLE_ON_LOGIN`: kept, 6 rows, judged in [1698](1698-judge-the-unwired-auth-members-authseamresolution-csrfheaderpresent-identityresolution.md). `SessionsRolePolicyConfig` (`packages/server/src/domain/sessions/contract/role-policy.ts:26`) is the config `createSessionsRolePolicy` reads (`packages/server/src/domain/sessions/substrate/role-policy.ts:25`), and the env parse builds each key.
- The scan needs no teaching: the tuple's members are now constants, which `tupleOf` in `tooling/src/unwired/unions.ts` skips.
- Survey: codegraph_explore `ROLE_POLICY_ENV_KEYS createSessionsRolePolicy` (`createSessionsRolePolicy` has 13 callers incl. `packages/server/src/entry/lifecycle.ts` and `packages/server/src/entry/compose/services.ts`); rg `ROLE_POLICY_ENV_KEYS|SessionsRolePolicyConfig` over `packages tests tooling`; the whole of `contract/role-policy.ts` was read; ast-grep `ROLE_POLICY_ENV_KEYS` over `packages tests tooling` (5913 `.ts`, 1524 `.tsx`): 2 ts matches (declaration and the `Pick`), 0 tsx.
- No code change.
