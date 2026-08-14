# Command receipt — server-providers-runtime

Working directory: `/home/inktomi/inktomi-stack/development/orbweaver`. All commands below used the current working tree.

## Read / snapshot barrier

| Command | Exit / duration | Result |
| - | - | - |
| `awk -F '\\t' '$1 == "OWNED" {print $5}' assignment.txt` | 0 / <1s | 86 owned paths. |
| `wc -l -c` + `sha256sum` over every assigned path | 0 / 1.0s | 11,565 current text lines; 555,483 bytes. Four paths differ from the assignment snapshot: `packages/server/src/infra/providers/vllm/engine/build-argv.ts`, `packages/server/src/infra/providers/vllm/engine/wake-budget.ts`, `tests/server/infra/providers/vllm/engine/build-argv.test.ts`, and `tests/server/infra/providers/vllm/engine/wake-budget.test.ts`. |
| Full sequential `sed -n '1,9999p'` read over assigned source and tests (chunked where output size required), followed by fresh line/byte/hash reconciliation | 0 / <1s per batch | Full read completed for all 86 assigned files; the reconciled current bytes are in `read-receipt.tsv`. |
| `sed -n '1,400p' ...` through `4001,4400p` over `scripts/codemods/ast.ts` | 0 / <1s | Read all 4,099 lines / 223,111 bytes of the repository AST instrument before structural work. |
| `pnpm ast` | 0 / 0.7s | Confirmed symbol-aware AST CLI verbs and scope semantics. |

## Structural receipts

| Command | Exit / duration | Scope / result |
| - | - | - |
| `pnpm ast exports packages/server/src/infra/providers --files` | 0 / 30.3s | 425 exports in 101 provider files. This is a wider discovery scope than this lane; no unowned-file conclusion was made from it. |
| `pnpm ast callers createProviderExecutor --in packages/server/src` | 0 / within 30.3s | One live caller: `packages/server/src/entry/compose/services.ts:319`. This proves the owned executor factory reaches boot composition (R3). |
| `pnpm ast orphans packages/server/src/infra/providers` | 0 / 25.5s | One candidate: `packages/server/src/infra/providers/contract/agent.ts:16` `AgentDialogKind`. It is explicitly declared future via the valid named marker at `packages/server/src/infra/providers/contract/agent.ts:13-16`; no defect claimed. |
| `rg -n --no-ignore 'AgentDialogKind'` across source and tests | 0 / <1s | Literal corroboration found only the declaration plus package-barrel re-exports at `packages/server/src/infra/providers/contract/index.ts:35` and `packages/server/src/infra/providers/index.ts:162`; this corroborates the AST candidate, not runtime absence. |
| `pnpm ast apisurface packages/server/src/infra/providers --files` | 0 / 30.2s | 408 exports / 4,903 source files: 39 public, 365 internal, 3 test-only, 1 unused. Candidate lens includes unowned backend files; retained as discovery only. |

The AST instrument resolves aliases/re-exports and reports its own exact output. No direct `ast-grep` negative was necessary, so no TS/TSX scan-count claim is made. The literal cross-check above is retained for the only owned orphan candidate.

## Behavioral and membership receipts

| Command | Exit / duration | Scope / result |
| - | - | - |
| `pnpm vitest run tests/server/infra/providers` | 0 / 20.3s | Escaped lane ownership by collecting 90 files (1,074 passed; 6 skipped). Logged only; it receives no lane verdict credit. |
| `pnpm vitest run $(awk -F '\\t' '$1 == "OWNED" && $5 ~ /^tests\\// {print $5}' assignment.txt)` | 0 / 9.7s | Exact owned direct test list: 39 files passed, 432 tests passed, 0 skipped, type errors none. This is R4 unit/type proof, not an integration/CT/live-vLLM receipt. |
| `pnpm check:tests-execution-membership` | 0 / 4.8s | 1,689 runner-suffixed tests across three runner views; every view matched a file and every `tests/**` runner-suffixed file was assigned to at least one runner. |

No official command exited non-zero, so no canonical failure artifact inspection was triggered. `reports/test-report.json` existed before the narrow run and is not treated as this lane's authoritative test artifact; the narrow Vitest stdout above is the current receipt. `reports/verify.json` was stale (2026-08-10) and was not used.
