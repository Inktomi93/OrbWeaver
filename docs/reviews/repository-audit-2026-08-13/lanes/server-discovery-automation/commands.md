# Command record

Working-tree audit against the assignment snapshot. No source, test, configuration, formatting, staging, or commit actions were performed.

| Command | Result | Notes |
| - | - | - |
| `sed -n '1,99999p'` over all assigned paths; `wc -l`, `wc -c`, `sha256sum` | pass | 191/191 files streamed; receipt matches the assignment ledger: 21,499 lines, 1,014,078 bytes. |
| `sed -n '1,99999p' scripts/codemods/ast.ts`; `pnpm ast` | pass, 0.7s | Read the repository AST instrument then established its supported lenses. |
| `pnpm ast unwired automation --max 200` | pass | 10 `automation.*` procedures reported unwired; provider-side router is outside this lane but is the cross-boundary consumer evidence. |
| `rg -n ... packages/client tests/client` | no matches | Literal corroboration: 1,369 TS/TSX client/test files scanned; no `trpc.automation` or bracket namespace use. A zero is a confirmed client-consumption absence for that spelling, not a claim about arbitrary runtime callers. |
| `pnpm ast callers createAutomationService --max 100` | pass | 25 call sites: production composition at `packages/server/src/entry/compose/automation-plugin.ts:205` plus direct harnesses/tests. |
| `pnpm ast importers '#domain/automation' --max 100` | pass | 7 importing files, including watcher, lifecycle, composition, tRPC context, and plugin contract. |
| `pnpm check:tests-membership` | pass, 2.2s | 1,858 test files are included in at least one type-program closure. |
| `pnpm vitest run --project unit --project integration --project integration-serial --project contract tests/server/domain/automation tests/server/domain/discovery tests/server/domain/embeddings --reporter=default` | pass, 26.86s | Direct scoped run, not root wrapper: 75 files / 362 tests passed. |

No command timed out or returned a non-zero status. The two `pnpm ast` discovery/call commands completed in 28.4s combined; the broad behavioral command was given a 30s initial poll and completed within it.
