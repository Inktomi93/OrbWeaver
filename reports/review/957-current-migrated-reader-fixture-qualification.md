# 0957 migrated-reader fixture qualification

## Outcome

The five-file migrated-reader fixture batch passed on frozen source `4278d4abc8dec7528f04fc5634fb772d3523770f`: 5 files, 26 tests, no failures, pending tests, or todo tests. This qualifies only these existing fixtures; it does not close work item 0957 or establish universal codemod/native semantic parity.

## Frozen scope and SDK evidence

- Worktree: `.claude/worktrees/codex-ast-wrapper-lifetime-1002`, branch `codex/ast-wrapper-lifetime-1002`; initially clean at `13e9674c64ef6975059872af659fbc3bb0b122a5`, 664 commits behind and 0 ahead of `main`.
- Process ownership check: no process had this worktree as its current working directory. The process listing showed the separately running owner-policy `check:structure` on another worktree; it was left untouched.
- Fast-forward: `git -C .claude/worktrees/codex-ast-wrapper-lifetime-1002 merge --ff-only main` completed successfully, including `land-work-items`; resulting HEAD is `4278d4abc8dec7528f04fc5634fb772d3523770f`.
- The initial installed SDK was mismatched: ts-morph `28.0.0`; `@ts-morph/common@0.29.0` store instances had patch hashes `3dfce2339c755602f60d026b39533d68760eca1b0a2a966b9f0397ddaecd7b5e` and `e002ed069dbbfd55856b32f6a054d30a2549fe9d8d3a3fbd003ec9608ad09786`; the root TypeScript file SHA was `569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`. No test ran against that installation.
- Before refreshing dependencies, `node_modules` was proven to be a real directory, not a symlink, at the qualification worktree path. The authorized frozen install completed successfully with no lockfile resolution changes.
- After install, resolution through `ts-morph` gave ts-morph `28.0.0`, `@ts-morph/common` `0.29.0`, and the required `741062d8fcee1798fa2866ae0aa10e2caf0816322772c31316d4acdbc5e1bf0c` patch directory. Its actually bundled `dist/typescript.js` SHA-256 is `4afa5fddc430f2ddbfe513b0e0b5f78b85a67e516b1e7160d419d23bcf885e39`, identical to the same resolved package chain in main. The lockfile declares that patch hash.

## Existing fixture assertions inspected

The five requested fixture files exist and were read in full. Their assertions exercise these observable expectations:

- `tests/tooling/codemod/lib/imports.int.test.ts`: Vitest imported-binding identity, exact import admission/order, unchanged nonmatching module positions, touched-file preview/count, original-source preservation, `--apply` disk result, and routed import syntax/diagnostics.
- `tests/tooling/codemod/lib/export-origins.int.test.ts`: aliased/default/overloaded export declaration identities, public aliases, and subsequent reads of an unsaved native transaction; checks changed-file plan/output and original on-disk source.
- `tests/tooling/codemod/ops/deep-imports.int.test.ts`: same-module and cross-module plans, type/value door exports, narrow importer closure, alias origins, refusal notes for conflicts/missing exports, and static re-export versus dynamic-only closure.
- `tests/tooling/codemod/ops/relocate.int.test.ts`: relative/package/URL/joined-segment rewrites, manifest changes, same-prefix preservation, explicit refusal of data literals, role mismatch refusal, and the retained admitted module-position grammar.
- `tests/tooling/codemod/ops/test-subpaths.int.test.ts`: exact module-subpath rewrites/package map output, package-root exclusions, retained admitted relocation syntax, and refusal notes for file URLs and other data positions.

## Checks and results

- Worktree SDK refresh:

  ```sh
  env npm_config_verify_deps_before_run=false PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --config.verify-deps-before-run=false install --frozen-lockfile --ignore-scripts
  ```

  Passed; lockfile was up to date, 74 packages reused/downloaded as reported, and install completed with scripts disabled.
- SDK identity comparison: resolved the actually executing `@ts-morph/common` from ts-morph in the qualification worktree and in main. Both were common `0.29.0`, lock patch `741062d8…`, and bundled TypeScript SHA-256 `4afa5fdd…`. Passed.
- Scoped fixture batch:

  ```sh
  env npm_config_verify_deps_before_run=false PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm --config.verify-deps-before-run=false test:scoped --maxWorkers=1 tests/tooling/codemod/lib/imports.int.test.ts tests/tooling/codemod/lib/export-origins.int.test.ts tests/tooling/codemod/ops/deep-imports.int.test.ts tests/tooling/codemod/ops/relocate.int.test.ts tests/tooling/codemod/ops/test-subpaths.int.test.ts
  ```

  Passed: 5 admitted file results, 26/26 assertions passed, 0 failed, 0 pending, 0 todo, no snapshots, and every per-case `failureMessages` array was empty. The command supplied only the five named paths and `--maxWorkers=1`; it used no test-name filter. The JSON contains exactly those five file paths; their source assertion populations total 26, matching the native report, so the complete populations ran.
- Native result read in full: `reports/runs/test/codex-ast-wrapper-lifetime-1002-1268739-2026-10-18T10-06-29-621Z/test-report.json`. The harness also published the standard pointer `reports/test-report.json`.

The fixture assertions checked plan/output fields such as changed-file counts, preview filenames/descriptions, rewrite contents, untouched original files, manifest edits, and refusal notes. These passed as part of the native 26-case result.

## Remaining qualification gaps

- This proves the current canonical SDK and shared reader paths preserve the existing fixture plan/output expectations in this five-file population only.
- Native mutation, compiler diagnostics, and compiler relation queries retain their owners; caller-specific spelling decisions and other codemod families were not exercised here.
- The separate original public codemod transaction still has its reported 30-second failure; it was not included, retried, or re-budgeted here.
- No closure claim for work item 0957 is made.
