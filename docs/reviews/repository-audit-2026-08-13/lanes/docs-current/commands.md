# docs-current command log

Snapshot basis: working tree observed at `906d7aa125130e1c4691a7097c6725d8d31d113d` on 2026-08-14. The frozen assignment names `41e18afe...`, 4,802 lines, and 387,362 bytes. Current owned bytes total 4,961 lines and 403,614 bytes; the receipt is therefore the rolling byte authority.

## Full-read and integrity commands

- Read the audit controls (`README.md`, `RUBRIC.md`, `REPORT-TEMPLATE.md`, `WORKFLOW.md`, `SNAPSHOT-POLICY.md`), assignment, constitution/coordination material, and all nine assigned files in full. Reads were chunked only to avoid tool output truncation.
- `wc -l -c` over all owned paths: current total `4961` lines / `403614` bytes.
- Node `crypto.createHash("sha256")` over every owned path: values recorded in `read-receipt.tsv`.
- `git status --short <nine owned paths>`: no tracked owned-path modifications. The lane artifact directory itself is untracked audit output.

## Repository-native structural tool

- `pnpm ast` (bare): completed; current help includes the audit epilogue and reports `scanned`, `skipped`, and `status`.
- `pnpm ast ident RpgHud --in packages/client/src`: complete, 3 hits / 2 files; `rpg-hud.tsx:91` is imported by `rpg-hud-region.tsx:16` and rendered at `:27`; coverage `ts:434, tsx:505`, scanned 940, skipped 3872.
- `pnpm ast ident projectBodyForPreview --in packages/kit/src`: complete, declaration at `packages/kit/src/content/index.ts:987`; coverage `ts:54`, scanned 54.
- `pnpm ast ident speakerTagsToPlain --in packages/kit/src`: complete, import `content/index.ts:42`, call `:998`, declaration `speaker-label/index.ts:144`; coverage `ts:54`, scanned 54.
- One test-scope `pnpm ast ident projectBodyForPreview --in tests` did not finish within the 30-second command window and returned no epilogue. Logged as a tool timeout/non-verdict; it supports no negative claim.

## Reconciliation and checks

- Node inventory comparison of `docs/test-baseline/manifest.json`: manifest `testFiles=1657`; filesystem runner-suffix inventory `1652`; 1 listed-but-missing file; 25 current files absent from the manifest; 0 deletion-ledger paths returned to disk. The stale listed path is `tests/client/features/character/lib/filter-characters.test.ts`; it also appears in the ledger at `docs/test-baseline/manifest.json:1701`.
- Literal consumer scan for `test-baseline/manifest.json`: its generator is `scripts/check/gen-test-baseline-manifest.ts`; the active `monotonic-tests` gate reads it at `scripts/check/gates/monotonic-tests.ts:41`; active-gate law documents that contract at `docs/architecture/core/Core-Enforcement-Active-Gates.md:248`.
- `pnpm vitest run tests/tooling/monotonic-tests.residual.test.ts`: PASS, 1 file / 5 tests, 368ms. This proves the gate's missing/unledgered and stale-ledger arms, not that the manifest is a fresh full inventory.
- `pnpm check:docs`: PASS, `check:docs — 104 file(s) formatted`.
- `git log -1 -- docs/retro-workboard.md`: `de133f16c...`, 2026-08-14 01:49 -0600. `git log -1 -- docs/test-baseline/manifest.json`: `a870f860...`, 2026-08-14 01:07 -0600.

## Exclusions and tool failures

- No production source, test, law, or shared audit artifact was edited. No broad behavioral suite was run because this lane changed only audit documentation artifacts.
- No absence claim rests on the interrupted test-scope AST invocation.
