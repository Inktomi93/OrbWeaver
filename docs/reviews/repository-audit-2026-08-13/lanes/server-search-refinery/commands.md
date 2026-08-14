# Server search/refinery audit command log

Snapshot: `e777c47e5860a105c114e061dcf98bcab1baa952`; audit work used current working-tree bytes. The final receipt reconciliation found `0` owned-path hash/size/line drifts. No owned path was dirty in `git diff --name-only`.

## Read barrier

| Command | Exit | Duration | Result / scope |
| - | -: | -: | - |
| `dd if=<each of 264 OWNED paths> of=/dev/null status=none` | 0 | 0.4s | Full-byte read completed for all 264 owned files before structural analysis. |
| `wc -l`, `wc -c`, `sha256sum` over each owned path | 0 | 4.4s | Produced `read-receipt.tsv`: 264 files, 21,858 lines, 1,063,509 bytes. |
| assignment/receipt reconciliation | 0 | 0.1s | 264 receipt rows; totals match manifest; mismatch count 0. |
| shared law/read set plus `scripts/codemods/ast.ts` | 0 | <1s each | Read shared architecture/testing law and the 4,099-line repository AST tool before the AST pass. |

Two preliminary `sed` reader probes exited 1 with `sed: ... missing command`; neither read source nor supplied evidence. They were replaced by the successful `dd` full-byte pass above. They are incidental shell syntax mistakes, not an official verifier/tool failure.

## Structural commands

`pnpm ast` was run bare (exit 0, 0.7s) and documents the repository resolution-based symbol/module tool. Its scope filter was then used against all assigned production sources: refinery 38 `.ts`/0 `.tsx`, regex 44/0, search 31/0, stats 33/0 (plus nine owned non-code `.gitkeep` files). The tool operates on the workspace TypeScript project; `--in domain/<name>` restricts emitted evidence to the named domain.

| Command | Exit | Duration | Result |
| - | -: | -: | - |
| `pnpm ast orphans server --in domain/refinery --max 240` | 0 | <30s | no results |
| `pnpm ast testonly server --in domain/refinery --max 240` | 0 | 28.1s | no results |
| `pnpm ast prodonly server --in domain/refinery --max 240` | 0 | 23.3s combined | no results |
| `pnpm ast unwired refinery --max 240` | 0 | 23.3s combined | no results; 369 server procedures enumerated |
| `pnpm ast orphans server --in domain/regex --max 240`; `pnpm ast testonly server --in domain/regex --max 240`; `pnpm ast prodonly server --in domain/regex --max 240`; `pnpm ast unwired regex --max 240` | 0 | 95.1s (polled) | first three no results; `unwired` reported `regex.getScript` at `packages/server/src/transport/trpc/routers/regex.ts:48`; 369 procedures enumerated |
| `pnpm ast orphans server --in domain/search --max 240`; `pnpm ast testonly server --in domain/search --max 240`; `pnpm ast prodonly server --in domain/search --max 240`; `pnpm ast unwired search --max 240` | 0 | 74.0s (polled) | all no results; 369 procedures enumerated |
| `pnpm ast orphans server --in domain/stats --max 240`; `pnpm ast testonly server --in domain/stats --max 240`; `pnpm ast prodonly server --in domain/stats --max 240`; `pnpm ast unwired stats --max 240` | 0 | 92.9s (polled) | all no results; 369 procedures enumerated |

The long-running regex/search/stats batches were polled every 30 seconds to completion; none timed out. `pnpm ast` reports result scopes/procedure denominators rather than ast-grep scanned-file counters, so no direct ast-grep fallback was needed.

## Independent negative cross-check

`find packages/client tests -type f \( -name '*.ts' -o -name '*.tsx' \) -print | wc -l` found 2,787 candidate client/test TS/TSX files. `rg -n -g '*.ts' -g '*.tsx' '(trpc(\\?\\.)?regex(\\?\\.)?getScript|trpc\\["regex"\\]\\["getScript"\\]|trpc\\?\\.\\["regex"\\]\\?\\.\\["getScript"\\]|Trpc\\["regex"\\]\\["getScript"\\])' packages/client tests` exited 1 (zero matches). It covers direct dot, optional-dot, direct bracket, optional bracket, and `Trpc["regex"]["getScript"]` forms; that independently corroborates `unwired` while excluding dynamic computed property names and non-TypeScript consumers.

## Behavioral and membership verification

| Command | Exit | Duration | Result / artifacts |
| - | -: | -: | - |
| `pnpm exec vitest run --project unit --project integration --project contract tests/server/domain/refinery tests/server/domain/regex tests/server/domain/search tests/server/domain/stats --reporter=default` | 0 | 26.1s | 103 files / 385 assertions passed. Deliberately direct Vitest command; no JSON artifact was requested, so it did not overwrite shared `reports/test-report.json`. |
| `pnpm exec vitest run --project types tests/server/domain/search/contract/service.test-d.ts --reporter=default` | 0 | 0.8s | 1 type test passed; no type errors. |
| `pnpm exec vitest run --project integration tests/server/domain/regex/verbs/scripts/get.int.test.ts --reporter=default` | 0 | 1.5s | 1 file / 2 assertions passed. |
| `pnpm check:tests-execution-membership` | 0 | 4.5s | 1,689 test files across 3 runner views; every runner view nonempty and every runner-suffixed test matched. |
| `pnpm check:tests-membership` | 0 | 1.9s | 1,858 test files across 4 type programs; every test/playwright TS file is in a type-program closure. |

No official command exited nonzero, so no fresh canonical failure artifact (`reports/verify.json`, stage logs, `reports/test-report.json`, or `reports/check-structure.json`) required attribution. The report excludes full-tree static, CT, e2e, and push verification: this is a read-only domain lane and those cross-lane gates are owned by the coordinator.
