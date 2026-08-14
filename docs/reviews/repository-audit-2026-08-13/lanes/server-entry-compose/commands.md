# Server-entry-compose command receipts

Working tree snapshot checked at `2026-08-13T23:16:53-06:00`: all 45 owned hashes, 12,998 lines, and 755,693 bytes matched `assignment.txt`; `git status --short -- <owned paths>` returned no paths. Reconciliation was repeated before reporting (see final command below).

## Read barrier

- `sed -n` full-file reads of each owned path (chunked only where needed), `2026-08-13T23:16:53-06:00`–`23:20:00-06:00`; 45/45 paths. The per-path line/byte/hash receipt is `read-receipt.tsv`.
- Audit controls read in full: `README.md`, `RUBRIC.md`, `REPORT-TEMPLATE.md`, and `WORKFLOW.md`.
- `scripts/codemods/ast.ts` was read before structural commands; `pnpm ast` exit 0, 2.1s, printed the supported resolution-based lenses.

## Structural work

- `pnpm ast exports packages/server/src/entry/compose --files --max 200` — exit 0, 41.0s total (initial 30.0s poll, final 11.0s); 71 exported symbols in 27 source files.
- `pnpm ast orphans packages/server/src/entry/compose --max 200` — exit 0, 42.8s total (initial 30.0s poll, final 12.8s); no orphan exports. This is a resolution-based result; no source files were excluded by the supplied path scope.
- `pnpm ast testonly packages/server/src/entry/compose --max 200` — exit 0, 23.4s; no test-only exports. Same scope and resolution caveats as the orphan lens.
- Literal cross-check: `rg -n 'createRunChatTurnBridge|buildAutomationPlugin|loadPluginMessages' packages/server/src/entry/compose tests/server/entry/compose` found the named compose surfaces and their assigned tests; this was a positive cross-check, not an absence claim. TSX denominator is zero in the owned set (all code/test files are `.ts`); direct ast-grep was not needed because `pnpm ast` supplied the required resolved lenses.

## Behavioral and membership checks

- `pnpm exec vitest run --project unit --project integration --project integration-serial tests/server/entry/compose` — exit 0, 29.34s; 16 test files / 172 tests passed. Scope was exactly the 16 assigned test files; no CT/e2e/type project was requested by this runner.
- `pnpm check:tests-membership && pnpm check:tests-execution-membership` — exit 0, 5.42s. Type membership: 1,858 test files across four type programs, all present. Execution membership: 1,689 test files across three runner views, every suffixed test matched.

No command exited non-zero, so no canonical failure artifact required inspection. No long-running command hit its 300s ceiling. Reconciliation after checks: all assigned source/test hashes remain those in `read-receipt.tsv`; no owned working-tree drift.
