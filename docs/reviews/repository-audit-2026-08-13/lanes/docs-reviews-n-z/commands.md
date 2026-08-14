# Command receipts

- Full-read barrier: streamed all 30 owned review documents and all 9 assigned shared prerequisites through `sed -n '1,$p'`; current byte receipts are in `read-receipt.tsv`.
- `pnpm ast` — completed, exit 0; read the current instrument usage and audit-epilogue contract.
- `pnpm ast ident spanAt --in packages` — completed, 0 hits; scanned 2,748 files (`dts:2, ts:2139, tsx:607`), 2,064 excluded by `--in`. Literal cross-check was not used for this structural question.
- `pnpm ast ident groupCharacterId --in packages` — completed, 18 hits in 6 files; same 2,748-file coverage.
- `pnpm ast ident recoverIfStaleSession --in packages` — completed, 5 hits in 3 files; same 2,748-file coverage.
- `pnpm ast ident refineryGuidanceSchema --in packages` — completed, 11 hits in 5 files; same 2,748-file coverage.
- `pnpm check:docs` — completed, exit 0: `check:docs — 104 file(s) formatted`.
- Hash reconciliation: all 30 owned review documents and 8 of 9 assigned shared prerequisites match `assignment.txt`; `scripts/codemods/ast.ts` drifted from the dispatch snapshot (expected `4099/223111/3fb787...`, current `4495/246175/7f8dd9...`). It was reread at its current bytes before use.

Tool failures: 0. Long-running AST commands: none exceeded 30 seconds; the multi-command shell was stopped at the 30-second caller yield before its final independent queries, so those queries were rerun individually and only the completed receipts above are used.
