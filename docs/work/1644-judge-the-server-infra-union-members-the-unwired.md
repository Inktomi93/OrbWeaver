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

Counts: 10 rows = 1 deleted + 9 kept (8 `CLOUDFLARED_TARGETS`, 1 `RUNTIME_TOOLS`). The deleted row differs from its recorded class (keep).

- `IMAGE_FORMATS.jpeg`: deleted, against the row's recorded class (unknown (read), keep). The recorded reason is that the image library reports the detected format. That is `ImageInfo.format`, a plain `string` returned by `probe` (`packages/server/src/infra/image/contract.ts:34`), not `ImageFormat`. `ImageFormat` is only the encoder output option of `ImageAdapter.transform`, and every caller passes a literal: `webp` at `packages/server/src/domain/assets/verbs/resolve-variant.ts:43,73,105`, `png` at `packages/server/src/entry/compose/services.ts:731` and `packages/server/src/domain/export/verbs/export-character.ts:55`. It is not stored or on the wire. Removed the tuple member (`contract.ts:4`), the `case "jpeg"` in `encode` (`packages/server/src/infra/image/index.ts:33`) and the two `webp/jpeg` doc mentions. An uploaded JPEG still probes and re-encodes to webp. Owner can revert by restoring both lines if a jpeg encode is wanted.
- `CLOUDFLARED_TARGETS` (8 members): kept. `isTarget` matches the runtime `${process.platform}-${process.arch}` pair against the tuple (`packages/server/src/infra/relay/binary.ts:29`), and `CloudflaredPin.assets` is a `Record<CloudflaredTarget, CloudflaredAsset>` (`packages/server/src/infra/relay/contract.ts:29`) that loses an entry per member.
- `RUNTIME_TOOLS.claude`: kept. It is the only member and `RUNTIME_TOOL_OF_WIRE = { "agent-sdk": "claude" }` builds it (`packages/server/src/infra/storage/contract.ts:15`); `packages/server/src/entry/compose/services.ts:685-687` reads it to remove the user's runtime dir when the last key on that wire goes. The scan misses a value written in a `Record` literal.
- Survey: codegraph_explore `IMAGE_FORMATS CLOUDFLARED_TARGETS RUNTIME_TOOLS` (`CLOUDFLARED_TARGETS`: 4 callers in `binary.ts` and `index.ts`); ast-grep over `packages tests tooling scripts` (5913 `.ts`, 1524 `.tsx` under the first three): `"jpeg"` 6 ts, `"linux-ia32"` 2, `"win32-ia32"` 2, 0 tsx; none of the 6 `"jpeg"` hits passes a `transform` format (magic-byte list, Google embed mime map, background mime map, CDP screencast). Both edited files were read in full.
- Checks: `pnpm typecheck packages/server/tsconfig.json` exit 0; `pnpm test tests/server/domain/assets/verbs/seed-art.int.test.ts tests/server/domain/assets/verbs/export-assets.int.test.ts` 3 passed. The repo has no adapter-level image test; the `switch` keeps its `never` exhaustive check, which the typecheck proves.
