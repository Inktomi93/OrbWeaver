# UI-rendering lane report

## Lane identity

- Lane: `ui-rendering`
- Semantic scope: `@orb/ui` web-weave art, charts, code editor, diff, fuzzy search, layout, shared rendering helpers, and mirrored tests.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: current bytes at receipt time; all 118 owned hashes equal `assignment.txt`.
- Assigned files read: 118 / 118 (100%).
- Assigned lines read: 9,078 / 9,078 (100%).
- Assigned bytes read: 451,659 / 451,659 (100%).
- Dirty assigned paths: 0.
- Exclusions: nine shared prerequisite files were read as prerequisites but are analysis-owned elsewhere; no sibling-lane files were evaluated.

## Read receipt

`read-receipt.tsv` covers all assignment rows: 118 paths, 9,078 lines, 451,659 bytes. Every recomputed SHA-256 equals the frozen assignment SHA. No assignment-to-receipt drift was observed.

## Architecture observed

The lane remains inside the sealed `@orb/ui` leaf: it composes its own primitives and imports only lower-layer `@orb/kit` functionality, consistent with the UI package boundary in `docs/architecture/core/Core-0-Architecture-and-Structure.md:42-44` (R3 by resolved package boundary plus owned source imports). Browser verification is intentionally Playwright CT, with node-only pure logic in the unit project, per `docs/architecture/core/Spine-Testing.md:16-28` (R3). The owned barrels expose the public front doors—for example web-weave at `packages/ui/src/art/web-weave/index.ts:9-17`, chart at `packages/ui/src/charts/chart/index.ts:5-9`, layout at `packages/ui/src/layout/index.ts:7-22`, and code editor at `packages/ui/src/code-editor/index.ts:1-2` (R2).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Web-weave art (9 source / 4 tests) | 4 | 3 | 4 | 3 | 3 | high | `packages/ui/src/art/web-weave/weave-veil.tsx:38-119`; `tests/ui/art/web-weave/web-weave-geometry.test.ts:1-138`; CT run: web-weave cases passed. |
| Charts and meters (38 source / 22 tests) | 4 | 3 | 4 | 3 | 3 | high | `packages/ui/src/charts/chart/chart.tsx:1-70`; 58-assertion unit result; CT run’s chart/meter cases passed. |
| Code editor (2 source / 2 tests) | 3 | 3 | 3 | 3 | 3 | high | `packages/ui/src/code-editor/code-editor.tsx:167-174`; `tests/ui/code-editor/code-editor.ct.tsx:192-216`; canonical CT failure. |
| Diff and fuzzy search (5 source / 2 tests) | 3 | 2 | 4 | 2 | 2 | medium | `packages/ui/src/diff/diff.tsx:40-55`; `packages/ui/src/fuzzy-search/fuzzy-search.ts:73-117`; `tests/ui/fuzzy-search/index.test.ts` passed. |
| Layout and rendering helpers (30 source / 9 tests) | 4 | 3 | 4 | 3 | 3 | high | `packages/ui/src/layout/index.ts:7-22`; owned layout CT cases passed; `tests/ui/lib/class-merge.test.ts` passed. |

## Findings

### UI-RENDERING-01 — Code-editor autocomplete acceptance is nondeterministic

- Severity: P2
- Class: behavior-defect
- Confidence: high for nondeterministic browser behavior; the root cause remains unproven.
- Evidence rung: R5
- Scope denominator: one completion-acceptance case in the 24-file owned CT run, one coordinator single-file rerun, and three repeated executions of that file. Across five executions of the target case, three failed and two passed; the source surface is `packages/ui/src/code-editor/code-editor.tsx` (284 lines) and its two owned mirrored test/fixture files.
- Receipts: completion configuration is installed at `packages/ui/src/code-editor/code-editor.tsx:167-174`; the test types the matching prefix and invokes acceptance at `tests/ui/code-editor/code-editor.ct.tsx:192-216`. The lane run failed with expected `--color-primary`, received `--color-p`; a coordinator single-file rerun passed 15/15; `--repeat-each=3` then failed the target case twice and passed it once (43 passed / 2 failed overall).
- Established fact: under identical current browser-test inputs, Enter sometimes commits the displayed completion and sometimes leaves the typed prefix unchanged. The original deterministic-defect wording is therefore rejected; the interaction is demonstrably unreliable.
- User or system impact: a keyboard user cannot rely on the inline completion interaction to enter a listed theme variable consistently.
- What remains unverified: whether the nondeterminism originates in CodeMirror startup/keybinding timing, the controlled-value synchronization loop, or the test fixture. An interaction trace is required before assigning the fault to one layer.
- Suggested next check or fix: reproduce only this CT with CodeMirror transaction logging, then ensure the selected-completion command/keymap is present and its resulting document transaction survives the controlled `onChange → value` round trip.

## Proven strengths

- The pure owned rendering/option suite currently passes 58 assertions across all 10 owned unit files (R4): `pnpm exec vitest run --project unit …` exit 0; canonical `reports/ui-rendering-unit.json` reports `numTotalTests:58`, `numPassedTests:58`, `numFailedTests:0`.
- 117 owned component-test cases passed in a current browser execution, including web-weave, charts, meters, diff, layout, and reduced-motion coverage (R5): `pnpm test:ct <24 owned paths>`; canonical `reports/ct-report.json` and its terminal summary.

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| --- | --- | --- |
| WebWeave / WeaveVeil public surface | R5 CT plus geometry unit coverage | Tested component behavior. |
| Chart/meter public surfaces | R5 CT plus option-builder unit coverage | Tested component and pure-option behavior. |
| CodeEditor completions | R5 mixed CT results | Declared and wired, but acceptance is demonstrably nondeterministic. |
| DiffView | R4 component test | Tested at component level. |
| Fuzzy-search core | R4 unit test | Pure behavior tested. |
| Layout surface | R5 CT | Tested browser behavior for owned CT-covered primitives. |

## Tests and gates

The lane follows the mandated central mirror layout (`docs/architecture/core/Core-0-Architecture-and-Structure.md:125-140`; `docs/architecture/core/Spine-Testing.md:31-46`). Unit coverage is meaningful for the pure geometry, option, merge, search, and class-merging paths (58 assertions, current R4). Component coverage is meaningful because it runs in Playwright rather than a static or mocked browser (R5), but it is not clean: repeated current runs oscillate on completion acceptance. No claim of a passing enforcement gate is made; a static/lint/type pass would not discharge that behavioral result.

## Cross-lane edges

- The code-editor defect is source-owned here, while any generalized Playwright/config remediation belongs to the verification-harness lane. Vite warned that `es2025` is an unrecognized esbuild target throughout compilation, but the build completed and 117 tests passed; this is not classified as the cause of the completion failure.

## Tool receipts

`pnpm ast` was run bare and its full lens contract was inspected. `pnpm ast prodonly ui --max 300` reported no prod-unreachable files with `ts:205`, `tsx:102`, scanned 307, excluded 4,615, status complete; its nonzero process result is logged without treating the result as an absence finding. Full commands, durations, artifact inspection, scope bounds, and exit codes are in `commands.md`.

## Lane verdict

All 118 assigned files are checksum-reconciled to the frozen assignment, with no rolling drift. The pure unit surface is green (58/58), and the non-target component cases passed. The lane is not behaviorally clean: the same CodeEditor completion interaction passed twice and failed three times across five current executions. The largest remaining uncertainty is whether the race lives in the component, CodeMirror timing, or the fixture; the nondeterminism itself is current R5 evidence.
