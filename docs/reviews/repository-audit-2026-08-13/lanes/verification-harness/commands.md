# Command record

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` at commit `e777c47e5860a105c114e061dcf98bcab1baa952`. No command was escalated. No baseline, snapshot, source, harness, configuration, or test file was changed by this lane.

| Command | Elapsed | Result | Notes |
| --- | ---: | --- | --- |
| `pnpm ast` | 0.7s | pass | Bare native AST entry point printed usage and its no-zero-scope contract. |
| `pnpm ast exports scripts/verify` | 3.6s | completed; excluded | Returned `no results`; this lens is file-oriented rather than a directory inventory. It is not evidence of an empty verification surface. |
| `pnpm check:tests-membership` | included below | pass | 1,858 TS test files in four type-program closures. |
| `pnpm check:tests-execution-membership` | 10.69s, then 3.65s | pass, exit 0 | Coordinator reproductions with the Codex sandbox disabled: 1,689 test files across three runner views (union 1,689); both membership checks green. Tool guard recorded `pass` / emitted `allow` / `rule:null`, so it did not rewrite or block the command. |
| `pnpm exec vitest run --project integration tests/tooling/verify-run.int.test.ts` | 0.93s | pass | 1 file / 46 tests passed; this is the configured integration project, directly invoked. |

Historical environmental receipt: the original chained command ran inside the restricted Codex sandbox. Type membership passed, then execution membership exited 2 because its nested runner-list spawns produced invalid/failed output. That result is retained as context only; it is superseded by the two current unsandboxed reproductions above and is not a repository failure.

Canonical reconciliation for the non-zero historical command: `reports/verify.json` records `tests:execution-membership` as `ok:true`, exit 0, and `reports/verify/tests-execution-membership.log` contains the same current 1,689-file, three-runner-view green result. Neither canonical artifact supports a current failure.
