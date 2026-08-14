# UI-rendering lane command receipts

| Command | Duration | Exit | Result / scope |
| --- | ---: | ---: | --- |
| `pnpm ast` | 0.585s | 0 | Instrument usage read; the tool's supported lenses and epilogue contract were inspected. |
| `pnpm ast prodonly ui --max 300` | 29.906s | 1 | `RESULT … no results`; epilogue: `ts:205`, `tsx:102`, scanned `307`, excluded `4615` (`out-of-scope:4614`, declaration-file:1), complete. Exit 1 is recorded as returned by the command, not treated as absence evidence. |
| `pnpm exec vitest run --project unit tests/ui/art/web-weave/web-weave-geometry.test.ts tests/ui/charts/bar-list/option.test.ts tests/ui/charts/chart/merge-option.test.ts tests/ui/charts/heatmap/option.test.ts tests/ui/charts/histogram/option.test.ts tests/ui/charts/meter/waystone-treatment.test.ts tests/ui/charts/scatter/option.test.ts tests/ui/charts/stat-figure/option.test.ts tests/ui/fuzzy-search/index.test.ts tests/ui/lib/class-merge.test.ts --reporter=default --reporter=json --outputFile.json=reports/ui-rendering-unit.json` | 2.729s | 0 | 10 files; 58 passed / 0 failed. Canonical JSON inspected immediately: `reports/ui-rendering-unit.json`. |
| `pnpm test:ct tests/ui/art/web-weave/weave-veil.ct.tsx tests/ui/art/web-weave/web-weave.ct.tsx tests/ui/charts/bar-list/bar-list.ct.tsx tests/ui/charts/chart/chart.ct.tsx tests/ui/charts/heatmap/heatmap.ct.tsx tests/ui/charts/histogram/histogram.ct.tsx tests/ui/charts/labeled-chart-frame/labeled-chart-frame.ct.tsx tests/ui/charts/meter/meter.ct.tsx tests/ui/charts/meter/ring-gauge.ct.tsx tests/ui/charts/meter/segment-bar.ct.tsx tests/ui/charts/meter/segmented-clock.ct.tsx tests/ui/charts/meter/track-bar.ct.tsx tests/ui/charts/meter/waystone.ct.tsx tests/ui/charts/scatter/scatter.ct.tsx tests/ui/charts/stat-figure/stat-figure.ct.tsx tests/ui/code-editor/code-editor.ct.tsx tests/ui/diff/diff.ct.tsx tests/ui/layout/container.ct.tsx tests/ui/layout/layer.ct.tsx tests/ui/layout/row.ct.tsx tests/ui/layout/section.ct.tsx tests/ui/layout/stack.ct.tsx tests/ui/layout/toolbar.ct.tsx tests/ui/lib/use-prefers-reduced-motion.ct.tsx` | 36.25s | 1 | Canonical JSON inspected immediately: `reports/ct-report.json`; 117 passed / 1 failed / 0 flaky / 0 skipped. The sole failure is `tests/ui/code-editor/code-editor.ct.tsx:192` (assertion at :216). Vite emitted nonfatal `es2025` target warnings but completed its 2,854-module build. |
| Coordinator: `pnpm test:ct tests/ui/code-editor/code-editor.ct.tsx` | 19.5s | 0 | 15 passed / 0 failed. This disproved the original deterministic-failure characterization. |
| Coordinator: `pnpm test:ct tests/ui/code-editor/code-editor.ct.tsx --repeat-each=3` | 35.7s | 1 | 43 passed / 2 failed; the same completion-acceptance case failed twice and passed once. Across the lane run plus both coordinator runs, the target case failed 3 and passed 2 times. Classified as current nondeterministic interaction behavior, not a deterministic acceptance failure. |

## File and scan coverage

- Assignment read: 118 owned files, 9,078 text lines, 451,659 bytes.
- Receipt recomputation: 118/118 paths; 9,078/9,078 lines; 451,659/451,659 bytes; all assignment hashes match current working-tree bytes.
- Structural result above covers the whole `packages/ui/src` corpus admitted by `prodonly`; unrelated package, scripts, tests, and declaration files were excluded by that lens as reported in its epilogue.
- No negative behavior claim in the report relies on that `prodonly` output. No raw `rg` absence claim is made.

## Tool failures and scope escapes

- None. The Playwright CT run reached terminal completion; its one failed behavioral assertion is a test result, not a tool failure.
