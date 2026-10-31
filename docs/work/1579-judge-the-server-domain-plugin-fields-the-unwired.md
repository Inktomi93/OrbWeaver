---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/plugin fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/plugin`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PreviewFromGitParams.caller` | `server/src/domain/plugin/contract/params.ts:47` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/routers/plugin.ts:152`) |
| `PreviewFromUrlParams.caller` | `server/src/domain/plugin/contract/params.ts:72` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/routers/plugin.ts:139`) |
| `DistributedPluginApplication.skippedSlugs` | `server/src/domain/plugin/contract/results.ts:41` | never-read | delete | delete the field and its writes (`server/src/domain/plugin/verbs/apply-distributed-plugins.ts:49`) |
| `CreateInstanceInput.bridge` | `server/src/domain/plugin/contract/service.ts:108` | never-read | delete | delete the field and its writes (`server/src/domain/plugin/activation/activate.ts:217`) |
| `Subscriber.subscriberSlug` | `server/src/domain/plugin/substrate/plugin-event-bus.ts:34` | never-read | delete | delete the field and its writes (`server/src/domain/plugin/substrate/plugin-event-bus.ts:58`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: `PreviewFromGitParams.caller`, `PreviewFromUrlParams.caller`, `DistributedPluginApplication.skippedSlugs` and `Subscriber.subscriberSlug`. None sits in `packages/contracts/src/plugin/` or `packages/plugin-sdk/`, and no guest reaches any of them: the previews are authed tRPC mutations whose verbs destructure only `url`, the distribution result feeds only `installedSlugs` in `packages/server/src/domain/plugin/seeder/distributed.ts`, and the bus subscriber is a host-internal closure.

Kept: `CreateInstanceInput.bridge`. `PluginHost.createInstance` takes the whole object and the process host reads the bridge (`packages/server/src/infra/plugin-host/process-runtime.ts`, the `bridge` field of the create input).

Follow-up for the next scan: `PluginEventBus.register` still takes `subscriberSlug` (`packages/server/src/domain/plugin/contract/ops.ts`), and nothing reads it now.

- Survey: `codegraph_explore` on the five symbols; `ast-grep` and `rg` over `packages`, `tests`, `scripts`, `tooling`.
- Ran: `pnpm typecheck tsconfig.node.json`; `pnpm test` on `corpus-plugin`, `corpus-plugin-source`, `corpus-plugin-host` and `seed-consent`. The `corpus-plugin` assertion on the late application now names `installedSlugs` only.
