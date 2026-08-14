# Command receipts — server-content-domains

Snapshot baseline: `e777c47e5860a105c114e061dcf98bcab1baa952`; the working tree is dirty outside this lane. Recomputed hashes reconcile: **0 / 216 owned files drifted** from `assignment.txt`.

| Command | Exit | Duration | Scope / result |
| --- | ---: | ---: | --- |
| `sed -n '1,$p'` over every assigned owned file | 0 | 1.5s | Full-read barrier: 216 files, 21,414 text lines, 1,085,492 bytes; mirrored tests included. |
| `sed -n '1,$p'` over shared law files and `scripts/codemods/ast.ts` | 0 | included above | Full-read prerequisites completed before AST. |
| `pnpm ast` | 0 | 0.36s | Repository-native AST help read; confirmed resolution-aware `orphans`, `testonly`, `apisurface`, and `unwired` lenses. |
| `pnpm ast orphans packages/server/src/domain/{assets,databank,imagery,import} --max 200` | 0 | 90.0s | All four scopes: no orphaned exports. Each resolution pass took about 30s. |
| `pnpm ast testonly packages/server/src/domain/{assets,databank,imagery,import} --max 200` | 0 | 91.5s | Assets: `DERIVED_ASSET_COLUMNS`; imagery: `PROMPT_TEMPLATES`, `CAPTION_INSTRUCTIONS`; databank/import: no results. |
| `rg -n --glob '*.{ts,tsx}' 'DERIVED_ASSET_COLUMNS|PROMPT_TEMPLATES|CAPTION_INSTRUCTIONS' packages tests` | 0 | 0.1s | Literal cross-check for the three test-only AST candidates; all server-path hits are definitions; test imports are the only consumers. |
| `pnpm exec vitest run --project unit --project integration --runInBand …` | 1 | 0.24s | Tool invocation error: Vitest 4 rejects unknown `--runInBand`; no tests executed. Canonical artifacts inspected immediately; `reports/verify.json` was stale (2026-08-10), while `reports/test-report.json` and `reports/check-structure.json` were fresh but contain unrelated whole-repo prior outcomes/fixture controls. The corrected narrow runner was used next. |
| `pnpm exec vitest run --project unit --project integration tests/server/domain/assets tests/server/domain/databank tests/server/domain/imagery tests/server/domain/import` | 0 | 19.89s | **83 files, 472 tests passed** (unit + integration; no owned serial or contract test files). |
| `pnpm check:tests-membership` | 0 | <1s | 1,858 test files are in at least one type-program closure. |
| `pnpm check:tests-execution-membership` | 0 | <1s | 1,689 runner-suffixed test files matched; each runner view nonempty. |
| `pnpm ast apisurface packages/server/src/domain/{assets,databank,imagery,import} --max 200` | 0 | 98.2s | Resolution-aware surface scans, 4,903 source files each: assets 93 (92 internal, 1 test-only); databank 83 internal; imagery 55 (53 internal, 2 test-only); import 94 internal. No unused exports. |
| `pnpm ast unwired` | 0 | 8.0s | 369 procedures enumerated; 33 candidates. Relevant cross-lane candidates: `databank.attachToCharacter`, `databank.detachFromCharacter`, `imagery.editImage`, `imagery.extractPrompt`, `imagery.readProvenance`. Router/client ownership is outside this lane. |

Structural notes:

- `pnpm ast` is ts-morph resolution-aware; it reports workspace-wide source coverage (4,903 files for each `apisurface` run). It intentionally has no TS/TSX split; direct ast-grep was unnecessary because the repository lens supplied the required resolution behavior.
- No broad structural absence is promoted beyond this lane: the `orphans` no-result outputs are recorded as lens receipts, not as a claim about unowned router/client reachability.
- `reports/verify.json` was stale and green. `reports/test-report.json` and `reports/check-structure.json` were not attributed to the failed argument-validation command and include unrelated whole-repository results/positive-control fixtures; neither was treated as a lane defect.
