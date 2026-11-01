---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the kit parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `kit`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `trimContent.opts` | `kit/src/macro/content.ts:73` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `queryMacros.q.prefix` | `kit/src/macro/metadata.ts:142` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `queryMacros.q.category` | `kit/src/macro/metadata.ts:142` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `createTimeLib.config.now` | `kit/src/time/index.ts:424` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `createTimeLib.config.locale` | `kit/src/time/index.ts:424` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

5 rows: applied 3, handed off 2, kept 0, owner questions 0.

Applied: `trimContent.opts` (and `TrimContentOptions`); `queryMacros.q.prefix` and `.q.category` (both props gone, so `q` went; the filter loop was dead and the two callers passed `{}`).

Handed off (only a test file supplies them): `createTimeLib.config.now` and `.config.locale`. The one supplier is `tests/client/lib/platform-polyfills.test.ts:78`; production, scripts and tooling callers (`packages/client/src/lib/time.ts:23`, `scripts/corpus-fixture-lifetime.ts:9`, `tooling/src/floor/browser/browser-diagnostics.ts:27`, `tooling/src/floor/browser/browser-diagnostic-events.ts:8`) pass `timeZone` only. The test is not rewritten.

Survey: codegraph_explore on trimContent, queryMacros, createTimeLib. ast-grep over packages, tests, tooling, scripts (5929 .ts and 1524 .tsx files scanned each): trimContent 1 call, queryMacros 2 calls, createTimeLib 9 calls. Literal `rg` for trimContent, trimIndent, TrimContentOptions, queryMacros: no other writer; no macro router takes a prefix or category input.
Ran: `pnpm typecheck packages/kit/tsconfig.json packages/client/tsconfig.json tsconfig.tests-iso.json tsconfig.tests-dom.json` exit 2 on a single error, `tests/support/node/portability-box.ts(58,128)` TS2322, a file this change does not touch; every other program is clean. `pnpm test` argument-enforcement, variable-rendering, platform-polyfills: passed.
