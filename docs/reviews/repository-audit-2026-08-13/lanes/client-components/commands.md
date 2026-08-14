# Client shared-components audit command log

Formal rolling assignment: `assignment.txt` at snapshot
`41e18afe74afa570b67a3e670a1a38863c486a00`.

| Command / inspection | Result | Notes |
| - | - | - |
| Full `assignment.txt` read and receipt reconciliation | exact | 52 owned paths, 7,997 lines, 412,699 bytes, and every SHA-256 exactly match `read-receipt.tsv` and current bytes. |
| Full source and test reads | 52/52 files; 7,997 lines; 412,699 bytes | Receipt is current-working-tree SHA-256. |
| `pnpm ast` | completed in 0.6 s | Native instrument usage read; no tool error. |
| `pnpm ast orphans packages/client/src/components --max 200` | completed in 23.7 s; no results | Resolution-based export liveness lens; no orphaned component export reported. |
| `pnpm ast cycles client --max 200` | completed in 9.2 s; no results | Alias-resolved client-cycle lens. This is bounded to client sources, not an absence claim about all package graph mechanisms. |
| `pnpm ast refs` (BackgroundSourceField, CharacterPicker, EntryListEditor, RelationManagerSection, UserMacroEditorDialog, useRovingRadioGroup) | completed | Finds barrel exports and live feature consumers; receipts are in `report.md`. |
| Literal `rg` cross-check for the four selected untested component names in `tests/client/components` | nonzero coverage, only an EntryListEditor comment hit | Confirms only the owned-test-corpus gap; it does not assert siblings contain no feature-level coverage. |
| `./node_modules/.bin/playwright test -c playwright-ct.config.ts tests/client/components` | PASS: 120 passed, 0 failed/flaky/skipped; 18.4 s | Scoped current CT. Canonical `reports/ct-report.json` captured immediately: 120 passed. `reports/ct-flaky.json`: 0 flaky, generated 2026-08-14T06:17:17.889Z. |
| `pnpm exec playwright test -c playwright-ct.config.ts tests/client/components` | tool failure before runner started | Desktop tool guard injected cache deletion then rejected `rm -rf`; no product conclusion taken. The direct workspace Playwright binary above ran the same scoped runner/config successfully. |
| `pnpm exec vitest run --project unit tests/client/components/face-strip-fold.test.ts ...` | PASS: 1 file, 7 tests; 0.152 s | JSON post-processing query was malformed after the passing run; only the parser command failed, not Vitest. |

No AST command exceeded 30 seconds; each was allowed up to the required initial five-minute budget.
