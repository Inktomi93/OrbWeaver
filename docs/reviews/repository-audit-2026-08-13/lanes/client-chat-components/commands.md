# Command receipts — client-chat-components

Working-tree basis: snapshot `c93253a3f907fb7fd93d411c511a98ed378505db`; reconciliation at 2026-08-14T05:29:00Z found all 126 owned paths byte-, line-, and SHA-256-identical to the assignment (0 dirty owned paths).

| Command | Exit | Duration | Scope/result |
| - | -: | -: | - |
| `sed -n '1,$p' <each assigned path>` | 0 | 2026-08-14T04:00–05:29Z | Full-text sequential review of 76 source and 50 CT paths; see `read-receipt.tsv` for the per-path snapshot reconciliation. |
| `sed -n '1,4099p' scripts/codemods/ast.ts && pnpm ast` | 0 | 1.2s | Read the repository structural-search implementation and its bare usage before structural queries. Terminal display truncated the combined 59,182-token stream, but the source was read sequentially by the command. |
| `pnpm ast orphans packages/client/src/features/chat/components --max 300` | 0 | 25.555s | Resolution-based whole components directory lens; no orphan exports. Scope denominator: 76 owned source files. |
| `pnpm ast cycles client --max 300` | 0 | 20.6s (combined invocation) | Alias-resolved client package lens; no client cycles. This is a package-wide result, not evidence of absence outside the client scope. |
| `pnpm ast importers packages/client/src/features/chat/components --files` | 0 | 20.6s (combined invocation) | 143 resolved import hits in 49 files: live client composition and CT story imports reach the owned component directory. |
| `rg -n --glob '*.ts' --glob '*.tsx' 'from "./\\|from "../\\|import\\(' packages/client/src/features/chat/components tests/client/features/chat/components` | 0 | <1s | Independent literal cross-check across 106 owned TS/TSX source and CT files: 301 local/dynamic import sites; both `.ts` and `.tsx` glob arms included. This did not make an absence claim. |
| `time pnpm test:ct tests/client/features/chat/components` | 0 | 109.132s test run (16.30s CT build) | Official Playwright CT configuration, exactly the 50 owned `.ct.tsx` files. `reports/ct-report.json`: 464 expected, 0 unexpected, 0 flaky. The Vite `es2025` messages were warnings; no product failure was attributed. |
| `pnpm check:tests-membership` | 0 | 7.0s combined | 1,858 test files across four type programs; every test/playwright TS file belongs to at least one program. |
| `pnpm check:tests-execution-membership` | 0 | 7.0s combined | 1,689 runner-suffixed test files across three runner views; all matched. |
| `time pnpm --filter @orb/client exec node "$PWD/scripts/ts7.cjs" --checkers 8 --noEmit --pretty false` | 0 | 3.834s | Scoped client package typecheck, clean. |

No official command exited nonzero, so no canonical failure-artifact investigation or narrow rerun was required. `reports/ct-report.json` was read after the CT run; it reported 50 executed scoped files / 464 expected tests after normalizing its paths relative to `tests/`.

Structural negatives: the two AST negatives above have non-zero denominators (76 owned source files for orphan scan; the full `client` package for cycles) and an independent literal TS+TSX import cross-check. They are constrained to the stated scans and are not generalized to the repository.
