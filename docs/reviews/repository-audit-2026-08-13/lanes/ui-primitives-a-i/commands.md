# UI primitives A–I — command receipts

- `sha256sum` reconciliation against `assignment.txt`: 124/124 owned paths matched the frozen snapshot; 0 dirty paths.
- Exact owned CT list: 26 `*.ct.tsx` files (captured at `/tmp/ui-primitives-a-i-owned-ct.txt`).
- `pnpm ast` (bare): completed in 2.0s; current repository-native instrument usage captured.
- `pnpm ast exports packages/ui/src/primitives/accordion`: complete, scanned 3 files (ts:2, tsx:1), 11 exports in 2 files.
- `pnpm ast jsx Accordion --in tests/ui/primitives/accordion`: complete, scanned 1 TSX file, 4 JSX mounts.
- `pnpm ast refs Accordion --in tests/ui/primitives/accordion --max 50`: complete, scanned 1 TSX file, 9 references.
- `pnpm ast jsx AriaAnnouncer --in tests`: complete, scanned 1,865 files (ts:1,431, tsx:434), 0 matches.
- `pnpm ast jsx AriaAnnouncer --in packages/client`: complete, scanned 940 files (dts:1, ts:434, tsx:505), 1 mount at `packages/client/src/routes/app-root.tsx:87`.
- Literal cross-check: `rg -n --glob '*.{ts,tsx}' 'AriaAnnouncer' tests` over 1,863 test source files: 0 matches. Direct mirror directory `tests/ui/primitives/aria-announcer` contains 0 files.
- `pnpm ast jsx BackgroundVideo --in tests/ui/primitives/background-video`: complete, scanned 1 TSX file, 5 mounts; `--in packages/client`: complete, scanned 940 files, 1 mount.

## Behavioral commands

- Exact owned CT command completed: `pnpm test:ct <26 owned .ct.tsx paths>`.
- Terminal result: PASS — 263 passed, 0 failed, 0 flaky, 0 skipped.
- Canonical reports inspected immediately: `reports/ct-report.json` records 26 suites, expected 263, skipped 0, unexpected 0, flaky 0, duration 26,687.62 ms; `reports/ct-results/.last-run.json` reports `status: "passed"` and no failed tests; `reports/ct-flaky.json` records `flakyCount: 0`.
- `pnpm test:types -- tests/ui/primitives/input/index.test-d.ts` completed 16 files / 65 tests / 0 type errors, but the configured types project ignored the positional file filter and escaped lane scope. It receives no scoped-lane verification credit.
- `pnpm ast apisurface ui --in packages/ui/src/primitives` produced only the launcher line after 30.3s and no epilogue; recorded as incomplete/tool failure, not evidence.
