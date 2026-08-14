# Codemods lane command receipt

Snapshot: `41e18afe74afa570b67a3e670a1a38863c486a00`; `HEAD` matched it during the audit. Scope is the six `OWNED` `scripts/codemods/**` rows plus nine `SHARED` records in `assignment.txt`; `ast.ts` intentionally appears once in each kind. No owned source path was dirty.

| Command / check | Exit | Duration | Receipt |
| --- | ---: | ---: | --- |
| Assignment-driven full read + `wc -l/-c` + SHA-256 reconciliation | 0 | <1s | 6/6 owned rows (8,266 lines / 405,834 bytes) and 9/9 shared records (5,234 record-lines / 318,852 record-bytes) matched. There are 14 unique paths because `ast.ts` is both owned and shared. |
| Full reads of paired tests | 0 | <1s | `tests/tooling/ast-lens.test.ts` (1,259 lines), `codemod-kit.int.test.ts` (310), and `migrate-macro-blocks.test.ts` (81) read before verification. |
| `pnpm ast` | 0 | 1.5s | Native ts-morph instrument advertised its 22 supported lenses and scope/error contract. |
| `pnpm ast importers scripts/codemods/codemod-kit` | 0 | <30s | Resolution-aware importers: two imports in `tests/tooling/codemod-kit.int.test.ts:23-24`. |
| `pnpm ast importers scripts/codemods/migrate-macro-blocks` | 0 | <30s | Resolution-aware importer: `tests/tooling/migrate-macro-blocks.test.ts:12`. |
| `pnpm ast ident PersonaMetadataWrite` | 0 | 20.1s | No code identifier occurrence. This is corroboration only; the direct dry-run abort below is the defect evidence, so no structural-negative claim is made from this command. |
| `pnpm vitest run tests/tooling/ast-lens.test.ts tests/tooling/codemod-kit.int.test.ts tests/tooling/migrate-macro-blocks.test.ts` | 0 | 9.02s | 3 files / 63 tests passed: 45 AST unit, 12 codemod-kit integration, 6 macro-migration unit; no type errors. |
| `pnpm codemod list imports` | 0 | 0.6s | Current CLI positive control rendered all ten import helpers. |
| `pnpm tsx scripts/codemods/export-rot-cleanup.ts` | 1 | 13.1s | Default dry-run aborted before write: stale `TAG_ROWS` item `PersonaMetadataWrite` has no current export. The script's own `runCodemod` error says no changes were written. This standalone codemod produces no `reports/**` artifact; stdout/stderr is its canonical result. |
| Canonical disposition/history check | 0 | <1s | `docs/reviews/misc/2026-08-03-export-rot-dispositions.md:85` retains the tagged row; commit `d1150f519` explicitly deleted `PersonaMetadataWrite` from the persona contract while not touching this runner. |

Structural coverage: the repository-native `pnpm ast` project scope is resolution-aware but does not print a scanned-file denominator for `ident`/`importers`; no clean negative conclusion relies on it. No direct `ast-grep` fallback was required. Long-running AST commands completed; no command timed out or had an uninspected official-artifact failure.
