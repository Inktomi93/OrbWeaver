# server-rpg command log

Snapshot: `e777c47e5860a105c114e061dcf98bcab1baa952`. Commands ran against working-tree bytes on 2026-08-13.

## Read / receipt controls

- Read the required audit controls and shared law in full before source analysis: `README.md`, `RUBRIC.md`, `REPORT-TEMPLATE.md`, `assignment.txt`, `docs/architecture/core/AGENTS.md`, `docs/Mission.md`, `Core-0-Architecture-and-Structure.md`, `Spine-TypeScript-and-Patterns.md`, and `Spine-Testing.md`.
- Read the 133 assigned source and test files; `read-receipt.tsv` contains the assignment's exact line/byte/SHA-256 ledger.
- Current-byte reconciliation: `awk '$1=="OWNED" {print $5}' assignment.txt | xargs -r sha256sum`; all 133 current digests matched the ledger. The working tree is dirty outside this lane; no owned path appeared in `git status --short`.

## Repository AST instrument

- `pnpm ast` — completed in 0.8s. It documents the available symbol/module-graph lenses and their liveness caveats.
- `pnpm ast importers packages/server/src/domain/rpg --files` — 380 resolved static/dynamic importer hits in 128 files. This proves broad consumption, not full end-to-end behavior.
- `pnpm ast callers createRpgService --files` — 2 calls: production composition and the local support factory.
- `pnpm ast callers publishRpgEvent --files` — 9 calls in the production composition and tests.
- `pnpm ast callers subscribeRpgEvents` — 5 calls in 3 files, including `packages/server/src/transport/trpc/stream/sources/rpg.ts:54`.
- `pnpm ast callers createRpgChatOps` — production composition at `packages/server/src/entry/compose/rpg.ts:1646`, plus the support factory.
- `pnpm ast callers flushTurn` — one direct internal caller at `packages/server/src/domain/rpg/chat-ops/index.ts:95`.

One chained AST invocation was cut off at the 30s outer tool yield after completing the first three lenses; it was not used for an absence claim. The later individual caller lenses completed.

## Vitest membership and behavioral execution

- Read `vitest.config.ts`. All owned `.test.ts` files are in `unit`; all owned `.int.test.ts` files are in `integration`; no owned path is listed in `SERIAL_INT`. No owned contract/type/CT/e2e test exists.
- Attempted `pnpm exec vitest --list --project unit tests/server/domain/rpg` (with corresponding integration projects). Vitest 4.1.10 rejects `--list` as an unknown option; logged as an instrument mismatch, not a membership clean result.
- `pnpm exec vitest run --project unit tests/server/domain/rpg` — PASS, 14 files / 216 tests, 2.83s.
- `pnpm exec vitest run --project integration tests/server/domain/rpg` — PASS, 44 files / 376 tests, 19.22s.

No test command timed out. No root verification wrapper, snapshot update, or source/test/config mutation was run.

The only non-zero command was the unsupported direct Vitest `--list` invocation. It is not an official verification wrapper and generated no canonical report artifact; `reports/verify.json`, `reports/test-report.json`, and stage logs were therefore not attributed to it or used as evidence. The two subsequent direct scoped runs exited zero and printed their complete file/test totals.
