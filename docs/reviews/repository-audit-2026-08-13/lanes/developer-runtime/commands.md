# Command receipt — developer-runtime

Working directory: `/home/inktomi/inktomi-stack/development/orbweaver`; frozen assignment snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`.

## Read and snapshot barrier

| Command | Exit / duration | Result |
| - | - | - |
| `awk -F '\t' '$1 == "OWNED" {print $5}' assignment.txt` | 0 / <1s | 19 owned paths. |
| `wc -l -c` + `sha256sum` over every owned path | 0 / <1s | All 19 current SHA-256 values and all 230,853 bytes match the assignment. Current text-line total is 4,764. |
| Diffing the assignment's `(lines, bytes, SHA-256, path)` rows with the current values | 1 / <1s | One metadata-only discrepancy: `scripts/dev/qwen3_gen_thinking_serve.jinja` has 330 newline-terminated lines versus assignment's 331, while its 19,262 bytes and SHA-256 are identical. |
| Full sequential `sed -n '1,9999p'` reads, chunked for the two large stack sources and template | 0 / <1s per batch | Read all 19 assigned files, including shell scripts, Jinja templates, JSON, and comments, before analysis. |
| Full reads of `tests/tooling/stack-mode.test.ts`, `spawn-lock.int.test.ts`, `stack-dispatch.int.test.ts`, and `seed-demo.int.test.ts` | 0 / <1s | Four direct tooling tests discovered by repository AST/file inventory and read in full. Assignment had no test rows. |
| Full chunked read of `scripts/codemods/ast.ts` | 0 / <1s per batch | Read the repository AST instrument (4,099 lines / 223,111 bytes; shared hash matched assignment). |
| `pnpm ast` | 0 / 1.2s | Confirmed supported symbol-aware lenses, scope semantics, and output contract. |

## Structural receipts

| Command | Exit / duration | Scope / result |
| - | - | - |
| `pnpm ast importers scripts/dev/_kit/stack-mode --files` | 0 / 30.2s | Two resolved import hits in `tests/tooling/stack-mode.test.ts`; establishes test reach for the pure stack decision module. |
| `pnpm ast callers runFullSeed --files` | 0 / within the same 30.2s command | One call in `tests/tooling/seed-demo.int.test.ts`; establishes direct integration-test reach for the demo seed core. |
| `pnpm ast exports scripts/dev --files` | 0 / 30.3s | Zero hits. The workspace AST project does not enumerate standalone script roots; this is not treated as a negative product claim. |
| `pnpm ast importers scripts/dev/engines --files` | 0 / 30.4s | Zero hits for the standalone launcher path. The result is discovery-only; entry-point reach is via package-script/shell invocation, not a TypeScript import. |
| `ast-grep run -p 'Number(readFileSync($$$).trim())' -l ts scripts/dev/engines.ts --inspect summary` | 0 / 2.9s | One exact positive at `scripts/dev/engines.ts:196`; `scannedFileCount=1`, `skippedFileCount=0`. Literal `rg` corroborated the same expression. This fallback was used because `pnpm ast` has no expression-pattern lens. |

## Behavioral receipts

| Command | Exit / duration | Scope / result |
| - | - | - |
| `pnpm vitest run tests/tooling/stack-mode.test.ts tests/tooling/spawn-lock.int.test.ts tests/tooling/stack-dispatch.int.test.ts tests/tooling/seed-demo.int.test.ts` | 0 / 20.6s | Exact tooling scope: 4 files passed, 56 tests passed, 0 skipped, no type errors. Unit: 38; integration: 18; contract/CT/e2e/type: 0 assigned. |

No official command exited non-zero. The two `pnpm ast` invocations that reached the 30-second command-yield boundary produced completed output for their listed subcommand; no timeout result is used as evidence of absence. No current live GPU/vLLM, real production stack, CT, or e2e command is credited to this lane.
