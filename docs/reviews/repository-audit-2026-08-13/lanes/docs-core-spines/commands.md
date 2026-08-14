# Commands and results

Snapshot assignment: `41e18afe74afa570b67a3e670a1a38863c486a00`. Working-tree HEAD at report: `356cd4b4fd0d524c4b027bc81d431aecf107e9e2`.

## Receipt reconciliation

`wc -l -c` and `sha256sum` were run for every assignment row. All 19 rows matched the assignment's line count, byte count, and SHA-256; the two duplicate shared rows (`Spine-Testing.md`, `Spine-TypeScript-and-Patterns.md`) intentionally repeat the same bytes. Totals: 19/19 rows, 6,369/6,369 lines, 476,751/476,751 bytes. Owned: 10 rows, 1,135 lines, 157,899 bytes. No owned path was dirty.

## Audit instruments

- `pnpm ast` exited 0 and printed the repository-supported lenses, including resolution-aware `refs`, `importers`, `orphans`, `unwired`, and `reaches`.
- `pnpm ast refs MODE_RESOLVERS --in packages/server/src/infra/auth --max 30` exited 0: declaration at `packages/server/src/infra/auth/dispatch.ts:31`; live indexing/call at `index.ts:42`.
- `pnpm ast refs PROVIDER_ROLES --in packages/server/src --max 30` exited 0: the tuple declaration and exported re-exports were found.
- `pnpm ast refs EffectiveAppConfig --in packages --max 30` exited 0: the current exported interface is at `packages/contracts/src/settings/index.ts:1141`, with server and client consumers.
- `pnpm ast ident RUNNER_OVERRIDE --in packages/server/src --max 30` exited 0 with no results. `pnpm ast ident anth --in packages/server/src/infra/providers --max 50` exited 0 with no results. Literal cross-check `rg -n --glob '*.{ts,tsx}' 'RUNNER_OVERRIDE|scripted-override|anth-direct' packages/server/src` had no matches across 98 tracked provider TypeScript files; direct path checks confirmed the two documented paths are absent.

## Safe documentation check

`pnpm check:docs` exited 0: `check:docs — 104 file(s) formatted`.

## Tool failures

Zero audit-tool failures. One ad-hoc receipt shell loop initially attempted to parse the assignment's commented column header as a path; it emitted a harmless `sha256sum` diagnostic, was not used as evidence, and was rerun with the actual data rows only.
