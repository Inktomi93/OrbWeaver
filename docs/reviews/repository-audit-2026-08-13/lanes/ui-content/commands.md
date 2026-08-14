# ui-content command log

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` on 2026-08-14. Durations are
wall-clock receipts from the terminal. “No tool failure” means the command exited zero and its final output
was inspected; a static success is not treated as behavior proof.

| Command | Duration | Exit | Scope / result |
| --- | ---: | ---: | --- |
| `pnpm ast` | 0.7s | 0 | Bare usage inspected; it documents the scan ledger and typed/syntactic corpora. |
| `pnpm ast importers @orb/ui/markdown --max 200` | 22.0s | 0 | 8 matches / 8 files; scanned 4,812 (ts 3,769, tsx 1,041, dts 2), skipped 0, complete. |
| `pnpm ast importers @orb/ui/sandbox-frame --max 200` | <30.3s | 0 | 4 matches / 4 files; same 4,812-file complete corpus. |
| `pnpm ast importers @orb/ui/tokens --max 200` | <30.3s | 0 | 61 matches / 60 files; same 4,812-file complete corpus. |
| `pnpm ast importers @orb/ui/theme-scope --max 100` | 10.9s | 0 | 18 matches / 15 files; same 4,812-file complete corpus. |
| `pnpm ast importers @orb/ui/stream --max 100` | 17.0s | 0 | 3 matches / 3 files; same 4,812-file complete corpus. Literal cross-check: `rg -n --glob '*.{ts,tsx}' … packages tests` returned the same 3 paths. |
| `pnpm ast apisurface ui --public --max 200`; `orphans ui`; `testonly ui` | each allowed to continue beyond the initial 30s terminal yield | 0, process completion observed | Broad typed-lens commands were not used for claims because their capped terminal output was not retained. No timeout/zero-scan verdict was inferred. |
| `pnpm exec vitest run --project unit <13 owned .test/.suite.test paths>` | 0.927s | 0 | 13 files, 153 tests passed. |
| `pnpm test:ct <10 owned .ct.tsx paths>` | build 15.83s; terminal completed after Playwright run | 0 | Exact required CT invocation (no manually added `--` or cache deletion). Canonical `reports/ct-report.json` immediately inspected: 10 owned spec files, 110 expected/passing results, 0 unexpected; `reports/ct-flaky.json`: flakyCount 0. |
| `xargs -a /tmp/ui-content-owned-paths pnpm exec biome check --diagnostic-level=error --reporter=concise` | 3.1s | 0 | 65 files checked; the 3 JSON inputs are outside Biome’s file set. |
| `pnpm exec node scripts/ts7.cjs --checkers 8 --noEmit --pretty false -p packages/ui/tsconfig.json` | 1.1s | 0 | Scoped @orb/ui type program passed; static only. |

## Read and checksum operations

- Parsed `assignment.txt` into exactly 68 OWNED and 9 SHARED paths. Read every listed current file to EOF,
  then calculated `wc -l`, `wc -c`, and SHA-256 for each OWNED path before writing
  `read-receipt.tsv`.
- Current OWNED total: 8,738 lines and 462,715 bytes, with all 68 current hashes equal to the lane
  assignment’s pinned values.
- Shared prerequisite drift: current `scripts/codemods/ast.ts` is 4,495 lines / 246,175 bytes /
  `7f8dd900e44392ef66f4482bc9de6ad0412a1b2cea82ad7ab71bd910f7d69bef`, versus the assignment’s
  4,099 / 223,111 / `3fb787…`; it was reread on the current bytes. The other eight SHARED hashes matched.

## Exclusions and scope escapes

- No assigned path was excluded; binaries were not assigned.
- The Playwright canonical artifact is shared mutable state. It was inspected immediately after this exact
  command, and its JSON `config.argv` named the ten owned CT paths; later writers may replace it.
- The lint/type commands are static receipts only. No full-tree gate was run, per lane discipline.
