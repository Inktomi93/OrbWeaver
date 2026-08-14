# Command log — server-providers-backends

Snapshot: `e777c47e5860a105c114e061dcf98bcab1baa952`. All commands ran from the repository root on 2026-08-13 MDT.

## Receipt barrier

| Command / scope | Exit | Duration | Result |
| - | -: | -: | - |
| Manifest reconciliation: 112 paths from `assignment.txt`; `wc -l -c`, SHA-256, and scoped `git status` | 0 | 1.4s | 112/112 files present; 20,870/20,870 lines; 969,632/969,632 bytes; 0 hash mismatches; 0 dirty owned paths. |
| Full text-read pass over every owned path, including source, paired unit/integration/contract tests, fixture `.mts`, and fixture `.json` | 0 | 3.2s | 112/112 assigned paths completed before structural analysis; the resulting per-file reconciliation is `read-receipt.tsv`. |
| `sed -n '1,4099p' scripts/codemods/ast.ts` | 0 | 0.2s | Read the repository-native AST instrument before using it. |
| `pnpm ast` | 0 | 0.4s | Read the complete usage contract and confirmed resolution-aware lenses. |

## Structural evidence

| Command / scope | Exit | Duration | Result / limits |
| - | -: | -: | - |
| `pnpm ast exports packages/server/src/infra/providers/backends --max 500` | 0 | 32.3s | 214 exports in 52 implementation files; declarations include each backend factory. |
| `pnpm ast callers createAgentSdkBackend --max 100` | 0 | included above | 33 callers in 7 files; live registry composition at `packages/server/src/infra/providers/index.ts:131`. |
| `pnpm ast callers createOpenRouterBackend --max 100` | 0 | included above | 3 callers in 3 files; live registry composition at `packages/server/src/infra/providers/index.ts:130`. |
| `pnpm ast callers createCustomByoBackend --max 100` | 0 | included above | 3 callers in 3 files; live registry composition at `packages/server/src/infra/providers/index.ts:132`. |
| `pnpm ast callers createLocalLightBackend --max 100` | 0 | included above | 9 callers in 8 files; live registry composition at `packages/server/src/infra/providers/index.ts:137`. |
| `pnpm ast importers packages/server/src/infra/providers/backends --max 300; pnpm ast reaches agent-sdk --max 300; pnpm ast orphans packages/server/src/infra/providers/backends --max 300; pnpm ast testonly packages/server/src/infra/providers/backends --max 300` | 0 | 59.8s (initial 30s poll + 29.8s completion; 300s allowance) | Resolution-aware broad lens completed. `orphans`: no results. `testonly`: one intentional test seam, `buildClaudeAnthEnv` at `packages/server/src/infra/providers/backends/agent-sdk/env.ts:239`; its paired tests exercise it. Broad output was large; no absence claim relies on a truncated display. |
| Literal corroboration: `rg -n 'create…Backend' …` | 0 | 0.2s | Independently confirms the four registry calls at `packages/server/src/infra/providers/index.ts:130`, `:131`, `:132`, and `:137`. |

No direct `ast-grep` fallback was needed: the native `pnpm ast` lenses resolve aliases and relative imports. The owned TypeScript surface contains no TSX files; no TS/TSX structural negative is asserted beyond the repository-native, workspace-wide liveness lens. The only non-TypeScript assigned files are `tests/server/infra/providers/backends/local-light/fixtures/orphan-survival-child.mts` and `tests/server/infra/providers/backends/local-light/fixtures/partial-model-cache/jinaai/jina-clip-v2/config.json`, both full-read and checksum-reconciled.

## Behavioral and membership commands

| Command / scope | Exit | Duration | Result / artifact |
| - | -: | -: | - |
| `pnpm exec vitest run --project unit --project integration --project integration-serial --project contract tests/server/infra/providers/backends --reporter=default --reporter=json --outputFile.json=reports/test-report.json` | 0 | 11.8s | Narrow owned suite: 51 files passed, 3 files skipped; 642 passed, 6 skipped of 648 tests. Fresh `reports/test-report.json` written at 2026-08-13 23:05:22 MDT (252,475 bytes); the runner’s 54-result list is the authoritative narrow scope. |
| Fresh-artifact inspection: `jq … reports/test-report.json; stat … reports/test-report.json` | 0 | included below | JSON reported `success: true`, 642 passed / 6 pending; reconciled against the runner stdout above. Its top-level suite counters are aggregate-project fields (205) and do not supersede the 54 narrow `testResults`. |
| `pnpm check:tests-membership` | 0 | 2.2s | 1,858 test files across four type programs; every `tests/**` and `playwright/**` TS file belongs to at least one closure. |
| `pnpm check:tests-execution-membership` | 0 | 5.1s | 1,689 test files across three runner views; every runner view matched at least one file and every runner-suffixed test matched a view. |

No official command exited non-zero; therefore no `reports/verify.json`, `reports/verify/<stage>.log`, or `reports/check-structure.json` failure artifact was applicable. The three skipped integration files are deliberately opt-in real-model checks gated by `ORB_LOCAL_LIGHT_E2E=1` at `tests/server/infra/providers/backends/local-light/embed.int.test.ts:19`, `tests/server/infra/providers/backends/local-light/image-embed.int.test.ts:22`, and `tests/server/infra/providers/backends/local-light/rerank.int.test.ts:17`; they require Hugging Face downloads and were not enabled in this offline audit.
