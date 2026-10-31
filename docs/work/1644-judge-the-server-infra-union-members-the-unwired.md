---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/infra union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `server/infra`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `IMAGE_FORMATS.jpeg` | `server/src/infra/image/contract.ts:4` | unbuilt | unknown (read) | the image library reports the detected format, so a JPEG upload builds it: keep |
| `CLOUDFLARED_TARGETS.linux-x64` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.linux-arm64` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.linux-arm` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.linux-ia32` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.darwin-x64` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.darwin-arm64` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.win32-x64` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `CLOUDFLARED_TARGETS.win32-ia32` | `server/src/infra/relay/contract.ts:7` | parsed | unknown (read) | keep: runtime input (a platform pair, an env key, an object key) is matched against the tuple, so any member can arrive |
| `RUNTIME_TOOLS.claude` | `server/src/infra/storage/contract.ts:9` | unbuilt | delete | delete the member |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
