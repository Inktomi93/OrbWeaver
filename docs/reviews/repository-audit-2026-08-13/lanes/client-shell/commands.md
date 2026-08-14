# client-shell command receipts

All commands ran from `/home/inktomi/inktomi-stack/development/orbweaver` against working-tree bytes. The lane began from assignment snapshot `41e18afe74afa570b67a3e670a1a38863c486a00`; final receipt reconciliation used `a73d7272dc95ba93f85251121902a79858f47255`.

## Read and receipt barrier

- Read all 26 owned files and all assigned shared prerequisites in full, including `scripts/codemods/ast.ts`; initially wrote a 26-row receipt totaling 2,378 lines / 130,629 bytes.
- Final SHA reconciliation detected concurrent drift in `packages/client/src/agent-nav/index.ts` and `packages/client/src/agent-seed/index.ts`. Both were reread in full and their receipt rows were refreshed to current working-tree values. Final receipt: 26/26 files, 2,385 lines, 131,389 bytes; all final receipt hashes match current files.
- `git status --short`: the tree already contained untracked work outside this lane, including the audit tree. No owned source/test path was dirty in the initial status. The two later owned-file drifts above are disclosed rather than attributed.

## Repository structural instrument

- `pnpm ast` — exit 0, 0.8s; read its full usage after reading `scripts/codemods/ast.ts`.
- `pnpm ast cycles client` — exit 0, 14.6s; `no results`. Scope denominator: 932 client `src` TS/TSX files (independent inventory: `rg --files -g '*.ts' -g '*.tsx' packages/client/src | wc -l`). This is not presented as a standalone absence proof because literal import enumeration cannot independently establish graph acyclicity.
- `pnpm ast orphans client` — PTY completed in about 30.1s; one hit: `packages/client/src/features/refinery/hooks/use-refinery-schemas.ts:54 useDeleteRefinerySchema`. It is outside this lane's owned source and handed off as a cross-lane edge.
- `pnpm ast testonly client` — PTY completed in 42.2s; 27 hits in 19 files, none owned by this lane.
- `pnpm ast prodonly client` — exit 0, 18.2s; `no results` from package-export/index.html entry closure. Scope denominator: 932 client `src` TS/TSX files; used as contextual structural evidence, not a stronger absence claim.
- `pnpm ast refs buildAgentNav`, `buildAgentSeed`, `AppRoot`, and `RoutePending` — completed (combined PTY about 66.5s): the first two have definition → `main.tsx:433`; `AppRoot` has route + CT-story references; `RoutePending` has router + direct CT references.
- `pnpm ast unwired clientError` — exit 0, 369 procedures enumerated, no result.
- `pnpm ast unwired auth` — exit 0, 369 procedures enumerated, no result.
- `pnpm ast unwired chat` — exit 0, 14.1s, 369 procedures enumerated, no result.
- `pnpm ast unwired rpg` — exit 0, 16.1s, one result: `packages/server/src/transport/trpc/routers/rpg.ts:89 rpg.rollDice`.
- `pnpm ast ident rollDice --in packages/client/src` — exit 0, no result. Independent literal cross-check: `rg -n --glob '*.{ts,tsx}' 'rollDice' packages/client/src tests/client` exited 1 with no hits. Denominator: 1,369 client source/test TS/TSX files (`932 + 437` from `rg --files` inventories). This only establishes no owned-client spelling; it does not establish the server procedure's intended audience.

## Behavioral command

- `pnpm test:ct -- tests/client/routes/app-root.ct.tsx tests/client/routes/route-pending.ct.tsx` — the package script expanded to `rm -rf playwright/.cache && playwright test -c playwright-ct.config.ts -- <two files>`. Its initial CT bundle build completed in 21.63s, but the runner emitted no per-test terminal output for 11 minutes. Process inspection confirmed active Playwright workers/Chromium; no `test-results` or `playwright-report` files existed while it ran. To release the stalled run, it was interrupted. Terminal result: `CT SUMMARY — INTERRUPTED · 1743 passed · 0 failed · 0 flaky · 1103 skipped`; exit 1. Because the count shows the invocation escaped the two-file intended scope, it receives **no scoped behavioral credit**.
- Narrow rerun attempted with `pnpm exec playwright test -c playwright-ct.config.ts tests/client/routes/app-root.ct.tsx tests/client/routes/route-pending.ct.tsx`. It never started: the tool boundary prepended a cache-removal prefix and then rejected its own `rm -rf .../playwright/.cache` command. This is a tool failure, not a product verdict.

## Coordinator exact-scope correction

- `pnpm test:ct tests/client/routes/app-root.ct.tsx tests/client/routes/route-pending.ct.tsx` — exit 0 in 22.3s wall time. Terminal summary: `7 passed · 0 failed · 0 flaky · 0 skipped`.
- Fresh `reports/ct-report.json` recorded `expected=7`, `unexpected=0`, `flaky=0`, `skipped=0`, duration 20.965s, and named exactly `client/routes/app-root.ct.tsx` and `client/routes/route-pending.ct.tsx`.
- This supersedes CLIENT-SHELL-01. The earlier command inserted an extra `--`, which changed Playwright's filtering behavior; the sanctioned package command accepts paths directly.

## Exclusions and limits

- No production code, tests, config, law, or another lane's artifacts were changed.
- No whole-tree static gate was run; this is an audit lane and scoped CT evidence was unavailable as above.
- The first CT run's 1,743-pass global-like summary is recorded for operational context only and is not claimed as a current pass of either owned CT file.
