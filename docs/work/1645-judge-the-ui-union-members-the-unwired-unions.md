---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the ui union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `ui`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `WEAVE_CHARACTERS.lively` | `ui/src/art/web-weave/web-weave-character.ts:8` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `THEME_SCOPE_STATIC_SEED_VARS.--color-chart-1` | `ui/src/content/theme-scope/emit-vars.ts:154` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_STATIC_SEED_VARS.--color-chart-2` | `ui/src/content/theme-scope/emit-vars.ts:155` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_STATIC_SEED_VARS.--color-chart-3` | `ui/src/content/theme-scope/emit-vars.ts:156` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_STATIC_SEED_VARS.--color-chart-4` | `ui/src/content/theme-scope/emit-vars.ts:157` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_STATIC_SEED_VARS.--color-chart-5` | `ui/src/content/theme-scope/emit-vars.ts:158` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_STATIC_SEED_VARS.--color-input-border` | `ui/src/content/theme-scope/emit-vars.ts:159` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_NON_PALETTE_VARS.--font-sans` | `ui/src/content/theme-scope/emit-vars.ts:167` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `THEME_SCOPE_NON_PALETTE_VARS.--radius-card` | `ui/src/content/theme-scope/emit-vars.ts:167` | unbuilt | unknown (read) | exported and named by no production code: find the reader the export serves, else delete the tuple |
| `CLIPBOARD_OUTCOMES.insecure` | `ui/src/lib/clipboard.ts:6` | unbuilt | unknown (read) | built at `ui/src/lib/clipboard.ts:23` in an unannotated conditional the scan cannot type: keep, and teach the scan that flow |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
