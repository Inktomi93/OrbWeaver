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

Filled at landing: what ran and where its output is.
