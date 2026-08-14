# Command receipts — server-chat-assembly

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against current working-tree bytes.

## Read barrier and snapshot reconciliation

| Command / action | Result |
| - | - |
| Full-read shared prerequisites (excluding deferred `scripts/codemods/ast.ts`) | 8 files, 1,133 lines, 95,584 bytes. |
| Full-read each OWNED row, then `wc` + `sha256sum` | 71 / 71 files, 23,887 / 23,887 lines, 1,294,845 / 1,294,845 bytes; 0 SHA/line/byte drifts. Details are in `read-receipt.tsv`. |
| Re-read current audit `README.md` after protocol-freeze notice | Current 49-line README SHA-256 `738833fde2717dfb3bd6cd1f8bc436a327ca2dc773787a93752480516ced062b`; assignment expected `82036ce740936cdeffaecc9a67bb4f953f4b5ebbd64daac0b63b205504a22afd`. This is the acknowledged shared-protocol drift: one final synthesis line. |
| `git status --short --` over all owned source/test roots | No dirty owned paths. |

## Structural instrument

| Command | Elapsed / result |
| - | - |
| Full-read `scripts/codemods/ast.ts`; `pnpm ast` | 0.7s; completed; printed repository-native lens usage. |
| `pnpm ast flow chat/engine` | 6.137s; completed: `RESULT ast --focus chat/engine: no edges`. This is not used as an absence conclusion because the focus argument did not resolve to the owned path. |
| `pnpm ast apisurface packages/server/src/domain/chat --max 300` | 35.090s; completed after one 30s poll; 4,903 source files scanned. For package `server`: 550 own exports, 9 public, 531 internal, 10 test-only, 0 unused. Output capped at 300 of 541 actionable rows; it is candidate evidence only. |
| `pnpm ast callers assemblePrompt` | completed; 53 resolved call sites in 4 files, including production `packages/server/src/domain/chat/substrate/assembly-access.ts:35`. |
| `pnpm ast callers buildAssembleContext` | completed; 76 resolved call sites in 4 files, including production `packages/server/src/domain/chat/substrate/assemble-gather.ts:22`. |
| `pnpm ast callers runTurnPipeline` | completed; 123 call sites in 3 files, including `packages/server/src/domain/chat/engine/engine.ts` (2). |
| `pnpm ast callers createTurnEngine` | completed; 18 call sites in 11 files, including production `packages/server/src/domain/chat/service.ts:61`. |

Literal cross-check used only to locate the concrete source/test receipts cited in the report: `rg -n` searched the three owned test files `tests/server/domain/chat/engine/{engine.int.test.ts,pipeline.test.ts,managed-compaction.suite.int.test.ts}` (3 files, 235,859 bytes) for `expect`, rejection, abort, recovery, budget, and lock assertions; it returned 197 matching lines. It is not substituted for a structural absence claim.

## Behavioral suite

The actual root script selects Vitest `unit`, `integration`, `integration-serial`, and `contract` projects (`package.json:72`); `vitest.config.ts:140` defines those projects and inherits assertion/determinism defaults. This audit invoked Vitest directly, constrained to the owned test directories:

```sh
pnpm exec vitest run --project unit --project integration --project contract \
  tests/server/domain/chat/assembly \
  tests/server/domain/chat/contract \
  tests/server/domain/chat/engine
```

Result: exit 0 in 12.941s wall time (Vitest duration 11.04s), 29 test files and 748 tests passed; 19 unit files, 9 integration files, and 1 contract file. No snapshots were updated.

One prior direct invocation with quoted `**/*.test.ts` filters exited 1 in 0.657s with `No test files found`; Vitest treated those filters as nonmatching project filters. It was a command-construction tool failure, not a behavioral verdict; the directory-scoped direct invocation above is the final receipt.

## Scope and limitations

- Structural scans covered the repository scope selected by the native tool, not a repo-global audit conclusion.
- No direct browser/e2e or deployed-runtime session was available or attempted; no live provider was contacted.
- No gate positive-control probe was run: this read-only audit did not create a deliberate violation.
