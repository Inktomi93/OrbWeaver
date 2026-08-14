# client-lib command receipts

All commands ran from the repository root. Commands were read-only except the normal test runners' generated caches/results.

| Command | Result |
| --- | --- |
| `pnpm ast` | Exit 0; read the instrument's 22 verb families and scope semantics. |
| `pnpm ast orphans packages/client/src/lib --max 200` | Exit 0 in 1.9s after initial 30s poll; `no results`. Scope was the 45 owned `packages/client/src/lib` source files. |
| `pnpm ast testonly packages/client/src/lib --max 200` | Exit 0 in 56.2s; `no results`. |
| `pnpm ast cycles client --max 200` | Exit 0; `no results`. |
| `pnpm ast importers @orb/client/lib --in packages/client/src --max 200` | Exit 0; no results, correctly identifying that in-package users resolve through `#lib`, not the package export. |
| `pnpm ast importers '#lib' --in packages/client/src --max 200` | Exit 0 in 13.2s; live importers across client composition/data/features. The independent literal cross-check found 287 `from "#lib"` matches in 246 of 932 searched client source files. |
| `rg -l '^export ' packages/client/src/lib --glob '*.{ts,tsx}' \| wc -l` | 44 exporting source files (literal cross-check only; not a liveness verdict). |
| `rg -n 'from "@orb/client/lib"' tests/client/lib --glob '*.{ts,tsx}' --stats` | 18 matches in 14 of 20 searched test files. This omits deep imports and CT-story imports by design, so it is only a barrel-use denominator. |
| `pnpm exec vitest run --project unit tests/client/lib/{chat-title,client-error-report,log-clock,message-render,prompt-macros,regex-placement-labels,registry-contracts,registry,render-trust,row-qualifiers,tag-filter-state,tag-sort,trpc-devlog}.test.ts && pnpm exec vitest run --project types tests/client/lib/registry.test-d.ts` | Exit 0: 13/13 unit files, 89/89 tests; types: 1/1 file, 3/3 checks, no type errors. Duration 0.816s + 7.97s. |
| `pnpm exec playwright test -c playwright-ct.config.ts tests/client/lib/{agent-bridge,motion-flaggers,motion-stats,notify,weave-glyph}.ct.tsx` | Did not launch: the environment prepended the sanctioned `rm -rf playwright/.cache` cache clear, then rejected that destructive prefix before Playwright started. This is a tool-policy failure, not a test result. |
| `./node_modules/.bin/playwright test -c playwright-ct.config.ts tests/client/lib/{agent-bridge,motion-flaggers,motion-stats,notify,weave-glyph}.ct.tsx` | Exit 0 in 25.1s: CT summary `12 passed · 0 failed · 0 flaky · 0 skipped`. The build emitted repeated `Unrecognized target environment "es2025"` esbuild warnings before passing. |
| `rg -n -i 'es2025' tsconfig.base.json tsconfig.tests-dom.json packages/client/vite.config.ts` | Located the configured target at `packages/client/vite.config.ts:245` (and TS targets in root configs). |

No `pnpm ast` lens reports a scanned-file denominator. The path-limited liveness commands above were therefore bounded by the 45 owned source paths from `assignment.txt`; the literal cross-check supplies the independent 932-file client-import denominator where a clean importer claim is made.
