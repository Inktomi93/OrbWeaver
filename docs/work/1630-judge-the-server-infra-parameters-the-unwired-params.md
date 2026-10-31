---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/infra parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/infra`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `loadOrCreateKeyfile.generate` | `server/src/infra/crypto/key.ts:129` | unsupplied | delete | delete the parameter and its default path (2 calls) |
| `serveHttpServer.serverOptions` | `server/src/infra/network/http-server.ts:104` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `serveHttpServer.serveAdapter` | `server/src/infra/network/http-server.ts:104` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `isAllowedImageBuffer.caps.maxDimension` | `server/src/infra/network/image-guard.ts:38` | unsupplied-prop | delete (read) | no caller sets this cap, so the default constant always applies: delete the cap and read the constant |
| `isAllowedImageBuffer.caps.maxPixels` | `server/src/infra/network/image-guard.ts:38` | unsupplied-prop | delete (read) | no caller sets this cap, so the default constant always applies: delete the cap and read the constant |
| `isAllowedImageBuffer.caps.allowedMime` | `server/src/infra/network/image-guard.ts:38` | unsupplied-prop | delete (read) | no caller sets this cap, so the default constant always applies: delete the cap and read the constant |
| `isAllowedImageBuffer.caps.requireDimensions` | `server/src/infra/network/image-guard.ts:38` | unsupplied-prop | delete (read) | no caller sets this cap, so the default constant always applies: delete the cap and read the constant |
| `createLocalPluginHost.seams.spawn` | `server/src/infra/plugin-host/port.ts:204` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
