# Client-data command log

- `git rev-parse HEAD` → `786503e783a618474dd926bd8381ba398e29ce1f`; assignment snapshot is `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Recomputed SHA-256 for all 84 owned files and compared with `assignment.txt`: 84/84 match. `read-receipt.tsv` byte-for-byte matches the owned assignment rows.
- Read the required audit controls, shared law/test prerequisites, every owned source and paired test/stories file, and `scripts/codemods/ast.ts`; no owned source drift was observed.
- `pnpm ast` (bare) completed and documented the repository-native structural lenses.
- `pnpm exec vitest run --project unit <18 assigned .test.ts files>` → PASS: 18 files, 118 tests, 2.02s.
- First direct CT command was blocked by the repository hook because it omitted the cache-clear prefix. A direct `rm -rf` retry was rejected by the execution safety wrapper. The sanctioned package script was then used: `pnpm run test:ct -- <19 assigned .ct.tsx files>`; it cleared the CT cache, built successfully (`✓ built in 16.83s`), and continued under concurrent Playwright load. The command stream could not retain its final completion line in this shell after the 30-second yield. This is a tool-output/runner-contention limitation, not a product failure; it receives no R5 credit.
- `pnpm ast cycles client` printed `RESULT ast cycles client (alias-resolved): no results`; the instrument does not print a scanned-file denominator, so this is bounded structural output, not a clean-negative finding.
- `pnpm ast exports packages/client/src/data --max 200` → 96 exports in 43 files. This establishes declaration inventory only (R2).
- `pnpm ast orphans packages/client/src/data --max 200` was allowed to continue past the initial 30-second yield and completed without a retained result stream; no absence/conclusion is drawn from it.
- `pnpm ast importers @orb/client/data --max 200` was queued behind the long liveness scan and likewise produced no retained result stream; no reachability conclusion is drawn from it.

Structural coverage: 43 source files represented by the exports lens; 0 excluded source files for that lens. No structural negative is reported because the available command receipts do not include the required denominator plus independent literal check.

## Coordinator exact-scope CT correction

- `pnpm test:ct <the 19 OWNED .ct.tsx paths from assignment.txt>` — exit 0; terminal summary `73 passed · 0 failed · 0 flaky · 0 skipped`.
- Fresh `reports/ct-report.json` recorded `expected=73`, `unexpected=0`, `flaky=0`, `skipped=0`, duration 40.961s, and named exactly all 19 assigned `tests/client/data/**` CT files.
- This supersedes the earlier missing-terminal limitation. The sanctioned package command accepts file paths directly; no extra `--` separator was used.
