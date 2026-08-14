# client-rpg-settings command receipt

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` on 2026-08-13 MDT. `assignment.txt` was the frozen byte snapshot.

## Snapshot and read barrier

- `awk ... assignment.txt > /tmp/orb_client_rpg_settings_paths; xargs wc -l -c` — 134 files, 20,171 text lines, 1,077,692 bytes.
- Assignment checksum comparison (`wc -c` + `sha256sum` for each owned path) at 23:30 MDT — 0/134 drifted. Repeated after audit at 23:55 MDT — 0/134 drifted.
- Full semantic read method: `sed -n '1,$p'` over assigned regex, RPG, settings/stats source and their mirrored tests; `scripts/codemods/ast.ts` was read in contiguous `1–750`, `751–1500`, `1501–2600`, and `2601–4099` ranges. Receipt: `read-receipt.tsv` (134/134, 20,171/20,171 lines, 1,077,692/1,077,692 bytes).

## Repository AST instrument

- `pnpm ast --help` — read repository-supported resolution-aware verbs.
- `pnpm ast exports` (regex/RPG/settings/stats) — structural declaration map. Regex: 46 exports/16 files; RPG: 124 exports/52 files. Settings/stats command output was cut off while the next long resolution jobs started; no absence claim relies on it.
- `pnpm ast orphans packages/client/src/features/regex --max 200` — no results.
- `pnpm ast orphans packages/client/src/features/rpg --max 300` — no results.
- `pnpm ast orphans packages/client/src/features/settings --max 200` — no results.
- `pnpm ast orphans packages/client/src/features/stats --max 200` — no results.
- `pnpm ast testonly packages/client/src/features/rpg --max 300` — no results.
- Some combined `testonly` commands were still in progress/outputless at the 30-second poll boundary; they are not used as negative evidence.

## Direct AST fallback

- `ast-grep run -p 'eval($$$)'` over the four owned source roots, separately for `ts` and `tsx`, with all ignore modes disabled. Scan receipts: TS 34 files, TSX 71 files, skipped 0 in both. No matches printed. Independent `rg -n --glob '*.{ts,tsx}' 'eval\\s*\\('` had no output. This is a narrowly-scoped structural/literal negative only.
- First attempt used an invalid comma-separated `--no-ignore` value; ast-grep rejected it before scanning. The corrected repeat above is authoritative.

## Behavioral execution

- `pnpm exec vitest run --project unit` with the seven assigned unit files — PASS: 7 files, 54 tests, 649 ms.
- CT target set: 18 exact assigned `.ct.tsx` files (4 regex, 6 RPG, 5 settings, 3 stats). No CT process was active immediately before launch. Two attempts (`pnpm exec playwright ...` then direct `npx playwright ...`, each one worker/retries=2) were stopped before Playwright execution because tool-guard injected `rm -rf playwright/.cache` and the execution policy rejected that injected deletion. No existing report was reused; `reports/test-report.json` predates this lane run (23:05 MDT), and no fresh CT artifact exists.

## Tool failures / exclusions

- Three command failures: one invalid ast-grep flag (corrected); two pre-execution CT guard rejections. No source/test/config/shared artifact was modified. CT is an explicit environmental limitation, not a test result.

## Coordinator exact-scope CT correction

- `pnpm test:ct <the 18 OWNED .ct.tsx paths from assignment.txt>` exited 0 with `229 passed · 0 failed · 0 flaky · 0 skipped`.
- Fresh `reports/ct-report.json` recorded `expected=229`, `unexpected=0`, `flaky=0`, `skipped=0`, duration 75.544s, and named exactly the 18 assigned regex/RPG/settings/stats CT files.
- This supersedes the earlier pre-execution tool-guard limitation; the sanctioned package command accepts paths directly.
