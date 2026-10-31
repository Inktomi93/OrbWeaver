---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the inference union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `inference`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `HOST_SECRET_ENV_KEYS.OPENROUTER_API_KEY` | `inference/src/backends/agent-sdk/env.ts:21` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `HOST_SECRET_ENV_KEYS.OIDC_CLIENT_SECRET` | `inference/src/backends/agent-sdk/env.ts:24` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `HOST_SECRET_ENV_KEYS.DEBUG_TOKEN` | `inference/src/backends/agent-sdk/env.ts:25` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `HOST_SECRET_ENV_KEYS.LOCAL_INITIAL_PASSWORD` | `inference/src/backends/agent-sdk/env.ts:26` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `NESTED_GENERATION_KEYS.turns` | `inference/src/capability/synthesize.ts:28` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
