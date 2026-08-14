# Command receipt — server-control-domains

Snapshot: `e777c47e5860a105c114e061dcf98bcab1baa952`; all 269 owned files matched the assignment hashes.

| Command | Exit / elapsed | Scope and result |
| --- | --- | --- |
| full-read loop (`cat` each OWNED path) | 0 / <1s | 269 files, 20,398 lines, 1,018,612 bytes; no unread or missing owned path. |
| prerequisite full-read loop | 0 / <1s | Nine shared law/audit controls and `scripts/codemods/ast.ts`; prerequisite-only, not lane ownership. |
| `pnpm ast` | 0 / 0.58s | Repository AST tool help read; source was read in full first. |
| `pnpm ast orphans packages/server/src/domain/admin` | 0 / 25.22s | No resolution-based orphan export candidates. |
| `pnpm ast orphans packages/server/src/domain/export` | 0 / 28.30s | No resolution-based orphan export candidates. |
| `pnpm ast unwired plugin` | 0 / 9.66s | 369 server procedures enumerated; exactly seven `plugin.*` procedures reported unwired in `packages/server/src/transport/trpc/routers/plugin.ts:37-63`. |
| literal client cross-check: `rg` for dot, optional-dot, bracket, and `Trpc[...]` plugin accesses | 1 / <1s | Zero matches across 932 TypeScript/TSX files under `packages/client`; this is an expected negative-search exit, not a tool failure. |
| `pnpm vitest run tests/server/domain/admin ... settings` | 0 / 40.90s | Current direct behavioral receipt: 99 files passed, 652 tests passed, 0 type errors. The 99 runnable files comprise 82 integration, 16 unit, and one type test; seven further owned test-tree files are `_support.ts` fixtures. |

## Canonical-artifact reconciliation

`reports/test-report.json` (22:38:17 MDT) and `reports/check-structure.json` (22:37:42 MDT) predate this lane's direct Vitest run (22:53 MDT), so they are stale for the scoped command and received no positive credit. The former records four failing assertions only in unowned `tests/server/infra/providers/vllm/engine/build-argv.test.ts:79,110,143,331`; the latter is a broad, pre-existing structure snapshot. `reports/verify.json` is older still (2026-08-10). No command run by this lane exited nonzero, so no narrow reproduction was required.

## Structural coverage and exclusions

The AST instrument is symbol-aware and resolution-based. `orphans` scope was limited to owned admin/export source paths; its explicit no-results output is valid only for each respective path. `unwired plugin` is intentionally cross-lane at the router/client boundary and supplies the mounted-procedure evidence; its client-usage negative is backed by the literal command above. No absence claim is made for the other six domains because their transport/client composition roots are outside this lane. Dynamic or non-tRPC consumers remain outside that procedure lens's stated scope.
