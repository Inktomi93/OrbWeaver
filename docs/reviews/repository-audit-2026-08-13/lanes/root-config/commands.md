# Commands — root-config

Working-tree commit at audit start: `2215f8d32703c3b0cb787a8faeedd991d4fb8fdc`.

| Command | Duration / result | Coverage / notes |
| - | - | - |
| `pnpm ast` | exit 0, 0.56s | Bare repository instrument read. It exposes 22 verbs and requires an epilogue containing language, scanned, skipped, match, and completion data for every actual lens invocation. |
| `pnpm depcruise` | exit 0, 11.367s | `2967` modules and `16659` dependencies cruised; no violations. This is R5 only for the import-boundary rules represented by `.dependency-cruiser.cjs`, not behavioral proof. |
| `pnpm verify --list` | exit 0, 1.282s | Inspected all named current verification stages. `quality:mutation-gate` is present only in `full`; the command itself does not run a behavioral surface. |
| `pnpm exec vitest run --project integration-serial tests/tooling/dependency-cruiser.int.test.ts tests/tooling/verify-run.int.test.ts tests/tooling/ast-observability.int.test.ts` | process continued after the 30s terminal yield; first reported file passed: dependency-cruiser, `54` tests, `4079ms`. Final combined exit was not captured by this terminal transport. | Exact config/tooling behavioral scope. Do not treat the partial console receipt as a green verdict. |
| `pnpm check:tests-membership` | exit 0, 2.256s | `1866` test files across `4` type programs; all are in at least one type-program closure. |
| `pnpm check:tests-execution-membership` | exit 0, 3.397s | `1697` runner-suffixed test files across `3` runner views; union `1697`; no unassigned files and no empty runner view. |
| `pnpm check:structure` | process continued after the 30s terminal yield; no final exit captured before report close. | Whole-project gate; it was run concurrently with the official mutation command on a live shared tree, so it is not a clean lane verdict. |
| `pnpm test:mutation:gate` | started 02:31:12 MDT; still active after the five-minute required polling window; no final score/exit yet. | Official command read `4/7707` source files, instrumented `1115` mutants, and emitted a `DisableTypeChecksPreprocessor` parse warning for `scripts/probes/st-goldens/sillytavern-runtime/.../edit.html`. A timeout/noncompletion is tool state, not absence evidence. |

## Structural/literal scan inventory

`pnpm ast` was used bare as required. It is not a source-config scanner for root config files: its syntactic corpus is package source, tests, and gates; typed corpus adds scripts and package-root TypeScript. Direct config facts therefore use full reads plus the native commands above. Literal reconciliation used `rg` only for code/config identifiers, never law. The repository denominator was `5711` tracked files, including `4935` tracked TS/TSX/JS/CJS/MJS files; mutation target/test references were checked against the actual four target paths and four matching tests. Exclusions: binary assets, sibling-owned source/test semantics, untracked agent/audit artifacts, and the gitignored SillyTavern runtime except where Stryker itself demonstrably reached it.

## Tool failures / scope escapes

No completed command returned a tool-error exit. Two long commands outlived this terminal bridge; their incomplete receipts are explicitly non-verdicts. Stryker's live parse warning is recorded above and assessed in the report.
