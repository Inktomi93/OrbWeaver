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

Counts: 10 rows = 1 deleted + 9 kept (6 `THEME_SCOPE_STATIC_SEED_VARS`, 2 `THEME_SCOPE_NON_PALETTE_VARS`, 1 `CLIPBOARD_OUTCOMES`).

- `WEAVE_CHARACTERS.lively`: deleted. No caller or test named `lively`, it was never stored or on the wire. Item 1633 landed on main and folded the presets into `CALM_CHARACTER` in `packages/ui/src/art/web-weave/web-weave-character.ts`; the merge kept main's form, which has no `lively`.
- `THEME_SCOPE_STATIC_SEED_VARS` (`--color-chart-1` to `--color-chart-5`, `--color-input-border`), 6 rows: kept. `packages/ui/tokens.build.ts:46` builds a set from it and `staticSeedResets` (line 529-530) emits one reset per member into the generated theme (`generateArtifacts`, line 676). The token build is a production consumer under the 0989 ruling (tooling and build scripts count); only the shipped runtime does not import it, as the file header says.
- `THEME_SCOPE_NON_PALETTE_VARS` (`--font-sans`, `--radius-card`), 2 rows: kept. `packages/ui/tokens.build.ts:10,540` builds `NON_PALETTE_EMIT_VARS` from it, and the build fails a seed block that restates a member.
- `CLIPBOARD_OUTCOMES.insecure`: kept. `writeClipboardText` builds it at `packages/ui/src/lib/clipboard.ts:23` in an unannotated conditional (`isSecureContext === false ? "insecure" : "refused"`), and the callers surface it. Handed off: teach the scan that flow (`tooling/src/unwired/`, outside this lane).
- Survey: codegraph_explore `THEME_SCOPE_STATIC_SEED_VARS THEME_SCOPE_NON_PALETTE_VARS WEAVE_CHARACTERS CLIPBOARD_OUTCOMES` (`THEME_SCOPE_STATIC_SEED_VARS` 3 callers and `THEME_SCOPE_NON_PALETTE_VARS` 2 callers, all in `packages/ui/tokens.build.ts`); ast-grep over `packages tests tooling scripts` (5913 `.ts`, 1524 `.tsx` under the first three): `"insecure"` 2 ts, `"--color-chart-1"` 5 ts, `"--radius-card"` 6 ts + 1 tsx, `"lively"` 0 after the edit; rg `lively|WEAVE_CHARACTERS|WeaveCharacter`.
- Checks: `pnpm typecheck packages/ui/tsconfig.json` exit 0; `pnpm test tests/ui/art/web-weave/variant-transitions.test.ts tests/ui/art/web-weave/geometry.dom.test.ts` 9 passed. No behavior change (the preset was unreachable), so no red test.
