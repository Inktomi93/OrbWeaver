# Client-state command receipts

Working directory for every command: /home/inktomi/inktomi-stack/development/orbweaver.

| Command | Result |
| --- | --- |
| pnpm ast | Completed. Printed the repo-native AST CLI verbs and scoped examples; this audit used that tool rather than inferring call paths from filenames. |
| pnpm ast cycles client --max 200 | Completed: RESULT ast cycles client (alias-resolved): no results. This is a non-cleanliness structural result only; no positive control was available. |
| pnpm ast orphans packages/client/src/state --max 200 | Completed in about 27 s: RESULT ast orphans ...: no results. No positive control; not elevated to a clean finding. |
| pnpm ast ident autosave --in packages/client | Completed. Located the preset declaration/mount, including packages/client/src/features/preset/surfaces/preset-editor-surface.tsx:211 and :226. |
| pnpm ast callers createAutosaveEntityForm --in packages/client --max 200 | Completed on the first run: 26 resolved callers (the concrete factory-consumer denominator). A later repeat was still running when the command transport ended; it is not used as evidence. |
| pnpm ast refs createAutosaveEntityForm --in packages/client | Completed: 54 references in 28 files. |
| pnpm ast refs GroupConfigForm --in packages/client --max 200 | Did not produce a terminal result before the 30 s command transport return. Recorded as incomplete, not a negative result. |
| rg -n --glob '*.{ts,tsx}' '<GroupConfigForm' packages/client/src | Literal cross-check only (not the call-path instrument): two source files contain the JSX token. The two mounts at group-config-form.tsx:195 and draft-context-tabs.tsx:52 each supply save. |
| pnpm exec vitest run --project unit tests/client/state --reporter=default | Passed twice: initially 20 files / 125 tests in 8.88 s, then after the snapshot advancement 20 files / 125 tests in 11.91 s. The latter is the final-current-tree receipt. |
| pnpm test:ct tests/client/state | Vite CT build completed (✓ built in 16.47s), but the tool transport returned before Playwright emitted its final pass/fail/count. Later process inspection found no matching lane runner; reports/ct-flaky.json timestamped 2026-08-14T07:02:15.074Z reported flakyCount: 0. This is not a terminal CT pass receipt. |
| pnpm exec playwright test -c playwright-ct.config.ts tests/client/state --list | Blocked by the execution guard because it prepended the sanctioned CT cache-clearing prefix and then rejected that destructive prefix. No retry; no list result claimed. |
| assignment hash reconciliation (Node fs/SHA-256 read-only script) | Initially completed with 0 drifts. Final reconciliation found **4** changed OWNED rows relative to the staged snapshot: character-library-store.ts, state/index.ts, _ct-stories.tsx, and character-library-store.ct.tsx. All four current files were re-read, and read-receipt.tsv was updated to their final current hashes. Exact git status for all OWNED paths was clean, so this is snapshot advancement, not uncommitted dirt. |

The source/test full reads occurred before the AST scans. Exact current file hashes are in
read-receipt.tsv.

## Coordinator exact-scope CT correction

- `pnpm test:ct tests/client/state` exited 0 with `73 passed · 0 failed · 0 flaky · 0 skipped`.
- Fresh `reports/ct-report.json` recorded `expected=73`, `unexpected=0`, `flaky=0`, `skipped=0`, duration 30.851s, and named exactly the 28 assigned `tests/client/state/**` CT files.
- This supersedes the earlier missing-terminal limitation; no extra `--` separator was used.
