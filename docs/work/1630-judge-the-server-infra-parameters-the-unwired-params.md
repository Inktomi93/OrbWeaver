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

8 rows: applied 5, handed off 2, left and flagged 1, owner questions 0.

Applied: `isAllowedImageBuffer.caps.maxDimension`, `.maxPixels`, `.allowedMime`, `.requireDimensions`. The three callers (`domain/assets/verbs/materialize-background.ts:55`, `domain/assets/verbs/store-inline-reply-image.ts:52`, `infra/plugin-host/net-egress.ts:48`) pass `{ maxBytes }` only. The decompression-bomb limits keep their names (`MAX_DIMENSION` 8192, `MAX_PIXELS` 40_000_000), unparseable dimensions are still always rejected, and `ImageGuardCaps` is `{ maxBytes }`. The now-unbuildable `"mime-not-allowed"` reject reason went with `allowedMime` (no reader in packages, tests, tooling or scripts), and two kit comments that named `requireDimensions` were corrected. `createLocalPluginHost.seams.spawn`: `LocalPluginHostSeams` now omits `spawn` (`infra/plugin-host/contract/port.ts:46`); the Worker-local host never launches a broker, and the process runtime that reads `seams.spawn` (`process-runtime.ts:474`) uses `PluginHostSeamDeps`, which keeps it.

Handed off (only a test file supplies them; tests not rewritten): `serveHttpServer.serverOptions` and `.serveAdapter`, supplied by `tests/server/infra/network/http-server.int.test.ts` (calls at 26, 108, 174, 265); production (`entry/lifecycle.ts:105`) and the support doors (`tests/support/node/http.ts:132`, `physical-peer.ts:17`) pass neither.

Left and flagged (secrets, lane rule; 1698): `loadOrCreateKeyfile.generate` (`packages/server/src/infra/crypto/key.ts:129`). Not touched.

Survey: codegraph_explore on serveHttpServer, isAllowedImageBuffer, createLocalPluginHost; literal `rg` for isAllowedImageBuffer, maxPixels, requireDimensions, allowedMime, maxDimension, mime-not-allowed, serverOptions, serveAdapter, spawn, LocalPluginHostSeams across packages, tests, tooling, scripts (ts and tsx; 5929 .ts, 1524 .tsx files in scope). No test calls `isAllowedImageBuffer` directly; the guard is exercised through the plugin and asset suites below.
Ran: `pnpm typecheck packages/server/tsconfig.json packages/kit/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm lint:eslint` on image-guard.ts and port.ts exit 0; `pnpm test` corpus-plugin, guest-call-floors, gc-import-overlap: 3 files, 11 passed.
