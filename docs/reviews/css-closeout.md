# CSS closeout

## Outcome

Stylesheet ownership and repeated recipes are corrected. The layout-only className drain already exists. The missing text-axis enforcement and remaining typography sites are corrected here.
The scoped browser selection passes after the recorded runtime corrections. The same-cohort numeric comparison and synthetic captures pass. The headed scrollbar investigation confirms or refutes each named boundary. Independent visual review reports SHIP for the supplied slice. Main owns whole-tree checks.

## Reading coverage

The complete tracked CSS inventory was read before restructuring:

- `packages/client/src/features/app-shell/surfaces/shell.css`
- `packages/client/src/features/app-shell/surfaces/shell/chrome.css`
- `packages/client/src/features/app-shell/surfaces/shell/content.css`
- `packages/client/src/features/app-shell/surfaces/shell/grid.css`
- `packages/client/src/features/app-shell/surfaces/shell/mobile.css`
- `packages/client/src/features/app-shell/surfaces/shell/motion.css`
- `packages/client/src/features/app-shell/surfaces/shell/panels.css`
- `packages/client/src/features/app-shell/surfaces/shell/rail.css`
- `packages/client/src/styles/appearance-channel.gen.css`
- `packages/client/src/styles/globals.css`
- `packages/client/src/styles/platform.css`
- `packages/ui/src/markdown/katex.css`
- `packages/ui/src/styles/fonts.css`
- `packages/ui/src/styles/globals.css`
- `packages/ui/src/styles/layers.css`
- `packages/ui/src/styles/motion-floor.css`
- `packages/ui/src/styles/primitives.css`
- `packages/ui/src/styles/theme.css`
- `packages/ui/src/styles/tiers.css`
- `packages/ui/src/styles/waystone.css`
- `packages/ui/src/styles/weave.css`

Full DTCG reads cover `tokens.json`, `token-contract.ts` and `tokens.build.ts`.
Full generator reads cover `appearance-channel.build.ts` and `owner-css-surface.build.ts`.
The generated theme and appearance CSS were read completely. The owner-CSS roster is checked through its generator and pin test, not a manual review of every slot.
Full enforcement reads cover `stylelint.config.ts`, `stylelint-rules.ts`, `stylelint-custom-properties.ts`, `stylelint-browser-support.ts` and `tooling/src/css-names/custom-properties.ts`. ESLint reading covers the class selectors, feature className classifier and relevant rule configuration, not unrelated server policies.
The CSS plan, lane and codemod skills, matching path rules, testkit contract and Testing spine guided the work.
UI reading covers the architecture router, paint law, package design, primitive contract, density law and theme composition.
No vendored font binary, upstream KaTeX minified stylesheet or unrelated product module received a line-by-line review.

## Structural decisions

- Preserve layer rank and source order within each layer. Consolidate blocks, not declarations across competing scopes. Root preference matches and descendant surface matches retain separate variant contexts.
- Keep glass formulas on their consumers. Root-resolved formulas would lose carried-theme and density overrides.
- Keep the wallpaper fade-depth policy in client appearance. Move the reusable message-list mask to UI.
- Keep Streamdown normalization beside its existing content-visibility override in UI.
- Express the wordmark halo through Text and a shadow recipe whose color remains a served variable.
- Move fixed art masks, stripes, reservations and initial sizes into primitive choices. Keep measured sizes and identity-derived values inline.
- Share the existing derived custom-property inventory between native Stylelint checks. Add no finding baseline or exception list.

## Acceptance map

| Item | Classification | Source and proof |
| - | - | - |
| 1356 | Fixed; scoped rendered qualification passed | Client globals, UI primitives, token generator and `orb/no-duplicate-layer-block`; planted duplicate control fails before the rule and passes after. |
| 1337 | Already implemented; static qualification passed | `CLASS_SELECTORS` and the better-tailwindcss patch reach bindings, recipe arrays and named-function returns. Native-token controls pass; CSS-owned UI/client lint is clean. |
| 1316, 1335, 1336 | Already implemented; static qualification passed | Feature className rules enabled at error; CSS-scoped UI/client lint clean; feature-className controls pass. |
| 1334, 1338, 1340 | Already implemented; scoped rendered qualification passed | Text voices, shared semantic tone map, Icon tone and className-drain props; existing variant CTs pass. |
| 1326 | Fixed; scoped qualification passed | The import-aware text-voice rule refuses internal axes, including aliases and static spreads. The client census reaches zero after the voice migration. |
| 1321 | Already implemented; native qualification passed | Shell paint rule and planted controls; shipped stylesheet test passes. |
| 1343 | Already implemented, including appearance channels; scoped rendered qualification passed | Surface generator, appearance attributes and property rosters, rename/warning tests and editor CT. |
| 1345 | Already implemented; scoped rendered qualification passed | Textarea fallback and native-versus-fallback height CT. |
| 1333 | Qualified | Existing rule fixes remain; headed native-gutter results below answer each named boundary. |
| 1362 art sites | Fixed; scoped rendered qualification passed | Art decorations and column measures use primitive props. New art recipe CTs and existing chat skin CTs cover geometry and paint. |

## Codemods and semantic edits

`consolidate-css-layers` preserves order within each named top-level layer. Its fixture pair passes, workflow validation passes, and its bounded preview matches the independent layer search.
`extract-glass-filter` changes only the complete and half-strength appearance recipes. Its fixture pair, compiler and workflow validation pass; the preview matches the independent recipe search.
Those transforms each applied to `packages/client/src/styles/globals.css` only.

`text-axes-to-voices` applies reviewed opening-element replacements with exact source and location guards. Its fixtures, compiler and workflow validation pass. The preview matches the independent AST census.
The initial rule census finds 85 forbidden attributes in 34 files among 828 client TSX files. The migration changes 73 openings in 36 files: 67 Text/Heading openings and six coupled TrackerValue callers.
TrackerValue implementation and inline sentence emphasis are separate semantic edits. The final isolated-rule census scans the same client population and reports no findings.
Eight refusal controls fail against the unmodified config; the updated rule passes all refusal and admission controls.
Unknown dynamic spreads and arbitrary cross-module aliases are not claimed as fully resolved by this bounded local rule.

Semantic hand edits: skin ownership moves; panel/modal/grain variant grouping; root-versus-descendant colorization; consumer-local recipe scope; generator assembly; wordmark and artwork primitive APIs and callers.
These sites differ in cascade or product meaning and are not a repeated token migration.

## Intentional typography changes

| Choice | Visible effect | Reason |
| - | - | - |
| CountText and ordinary TrackerValue use `label` | The label step and line box stay; regular weight becomes medium | Readable census and stable editor geometry |
| Promoted TrackerValue uses `promoted` | The title step stays; regular weight becomes semibold | The stat tile's value and editor keep the same step |
| Section identities use `masthead` | Display size stays; tracking tightens | These are section names, not arbitrary display-sized body text |
| Explanatory label-size copy uses `gloss` with `prose` | The label size stays; the line box relaxes | Sentences need the prose modifier, not an axis override |
| Micro notes use `gloss` | Size stays; prose loses micro-label tracking | Notes are explanatory text rather than caps labels |
| Directory and interactive captions use `label` | Body labels shrink to the label step; micro controls grow to it | Control names keep a readable, consistent hierarchy |
| Independent counts use `datum` | Readouts use sans tabular figures at the gloss step | Numeric values follow the ruled datum voice; editable-control counterparts keep their control voice |
| Inline emphasis uses `strong` inside the surrounding voice | Native emphasis strengthens the name without changing its size | Emphasis is semantic markup, not another voice |
| Read notification summaries use prose gloss | Read rows recede; both states keep a common prose line box | Unread or actionable summaries remain labels |

These are typography changes, not stylesheet reorganization regressions. No voice is added and no compatibility size prop remains on TrackerValue.

## Checks

- `pnpm worktree:bootstrap`: passed.
- `pnpm typecheck tooling/src/codemods/tsconfig.json`: passed for each transform.
- `pnpm typecheck tsconfig.json packages/ui/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json`: passed; the runner also checks the server router dependency.
- The initial UI/client lint selection passes (`reports/css-closeout/eslint.log`). The integrated CSS-owned selection passes (`final-eslint-corrected.log`). Main owns whole-tree ESLint; neither result is a claim about unrelated integrated rules.
- `pnpm test:tools tests/tooling/eslint-feature-classname.test.ts tests/tooling/native-token-scales.test.ts`: passed in the combined tooling selection.
- `pnpm test:tools tests/tooling/stylelint-rules.test.ts`: passed, including every shipped stylesheet.
- `pnpm test:tools tests/tooling/generated-css-drift.repo.int.test.ts`: passed in the generator/stylelint selection.
- Token contract, class merge, owner-CSS surface, rewrite and warning suites: passed; exact selection in `reports/css-closeout/token-tests.log`.
- Final root/tooling and UI/client/DOM compiler selections pass; the final token-contract correction also passes the root program. Logs: `final-rule-typecheck.log`, `halo-typecheck.log`, `halo-contract-typecheck.log`.
- Final corrected ESLint selection passes without ignored-file warnings (`final-eslint-corrected.log`); affected runtime and halo files pass their scoped reruns.
- Final generated-drift and Stylelint controls: 22 passed (`final-generated-style-tests.log`); native Stylelint passes.
- Text-voice alias controls: 16 passed, including red-first namespace-destructuring aliases and the legitimate own-component control.
- Token contract: 20 passed after the text-shadow namespace control fails against the unchanged predicate.
- Both generators: `pnpm --filter @orb/ui tokens:build` and `pnpm --filter @orb/client surface:build` passed.

The initial `pnpm test` tooling invocation collected no files because that script excludes tooling. No passing result is claimed from it.
Compiler corrections addressed a PostCSS parent type and the Stack type export. Stylelint corrections addressed class-written variables and selector nesting under Tailwind utilities.

## Rendered evidence

Before captures use an isolated stage at `241a3cf45413`, cloned from the owner container without writing to it.
Home, chat, characters, appearance settings and refinery each pass at desktop 1440×900 and coarse-touch 390×844.
The first cold stage boot passes without a retry. These are deterministic visual captures, not motion or performance evidence.
The first immutable run is `closeout-css-2407117-2026-10-25T13-01-02-645Z`; subsequent run paths are recorded in `reports/css-closeout/before-*.log`.
The browser selection covers 157 cases. The first run passes 142 and fails 15; its complete report and artifacts remain in `reports/css-closeout/ct-first/`.
The affected appearance, chat skin and artwork selection passes 81 of 82 after root preference, fallback layer and initial line-height corrections.
The remaining nested-theme halo assertion exposes root-resolved recipe ingredients. The native `text-shadow-wordmark` utility fixes consumer-local color resolution.
The final artwork selection passes all four cases. Together with the unchanged 75 first-run cases and 78 appearance/chat cases, every selected case has matching passing evidence.
`ct-final-1.log`, `ct-runtime-fix.log` and `ct-halo-green.log` hold the native outputs. No failed startup is converted into a passing cold-start claim.

Root preference variants sit inside `:root`; descendant surface variants stay outside. Reduced transparency follows contrast and wins when both are enabled.
The Whisper fallback has one gradient layer, so owner background-size/repeat/position overrides retain their semantics.
The initial-size variant precedes the explicit solid line-height variant. Mask assertions accept equivalent angle serialization while preserving mirrored direction and intersection.
The halo recipe uses the native text-shadow namespace. Its ingredient validation shares the existing shadow predicate; the planted text-shadow frozen-color control fails before the extension and passes after.
A failed halo test attempt used the wrong generated registry key; its report remains under `ct-halo-key-error/`. The corrected key and affected DOM compiler pass.
The owner surface regenerates against the published contract at `8bf53165a6`, not a token introduced only in this lane's checkpoint. Normal generator validation preserves all published hooks.

TrackerValue's no-shift editor geometry is qualified on fine pointers. The coarse editor deliberately retains its larger 16px focus-zoom floor; this evidence does not claim coarse-pointer no-shift.
The final source stage serves `8ada4e87db3c29d9d79beffa71d2444610b1e780`. Its first cold navigation passes without retry.
The matching capture set passes at 1440×900 and coarse-touch 390×844. SSIM ranges from 0.990234 to 0.998889, above the instrument threshold of 0.98.
These comparisons use the same private owner-container clone as the before set. The observed root uses a 16px font, system accessibility preferences, panel/composer/modal blur, and no shadow, texture or colorization. The artifacts remain only under gitignored `reports/`; no private pixels were inspected or published.
This numeric result is not a synthetic-corpus or pixel-identical verdict. The typography changes listed above remain intentional.
The isolated private stage is stopped and removed after the comparisons. Human-readable final captures use the maintained synthetic corpus wrapper and are recorded separately.

## Limits

Main owns integration, independent review and board transitions. No push is authorized.
RTL expansion, ViewTransition changes, Trusted Types and whole-tree ESLint performance work are outside this assignment.
Real iPhone and macOS behaviors remain device checks; Chromium captures do not establish them.

## Same-cohort numeric captures

| Surface | Desktop SSIM | Coarse phone SSIM |
| - | - | - |
| home | 0.990234 | 0.99569 |
| chat | 0.996324 | 0.998815 |
| characters | 0.998168 | 0.992297 |
| settings | 0.998889 | 0.990537 |
| refinery | 0.998844 | 0.992852 |

## Synthetic final views

The maintained `scripts/corpus-fixture.ts snap` wrapper owns the canonical synthetic clone, provider, stage and teardown.
Every run serves committed source `8ada4e87db3c29d9d79beffa71d2444610b1e780`; none uses a dirty stage or compares synthetic data with private before pixels.

| Run slot under `reports/runs/snap/` | Scope | Native result |
| - | - | - |
| `closeout-css-3231519-2026-10-25T16-04-38-963Z` | Headed 1440×900; Home, chat, characters, appearance and refinery, plus discovery maps | Exit 0 |
| `closeout-css-3237533-2026-10-25T16-06-07-791Z` | Coarse 390×844; the same sections | Exit 0 |
| `closeout-css-3274239-2026-10-25T16-16-16-039Z` | Maximal appearance at coarse 390×844; Home, chat, appearance and selected refinery workbench | Exit 0 |

The bare phone refinery view is its session finder, the responsive entry state. The maximal view selects the map-observed Branch ledger keeper session and shows its workbench.
Core captures have no focus or contrast measurement. The completed list-pane-header CT covers census hierarchy, constrained fit and keyboard Back; the appearance CT covers contrast seams and over-art contrast.
These are deterministic visual checks, not motion or performance evidence. Headed software-renderer timing remains withheld. Every wrapper stage and provider retires after native completion.

Exact capture commands use `pnpm exec node scripts/corpus-fixture.ts snap -- --ref 8ada4e87db` with scenario files under `reports/css-closeout/`.
Desktop adds `--viewport 1440x900 --vnc` under `xvfb-run -a`; phone adds `--mobile --viewport 390x844`; the maximal run also adds `--appearance-preset maximal`.
All add `--probe --scenario <file> --scenario-summary --json --out <name>`. Native outputs are `synthetic-desktop.log`, `synthetic-phone.log` and `synthetic-maximal-phone.log`.

The independent review is `reports/side-eye/2026-10-25-css-closeout.md` in the `closeout/css` worktree. It reads all fourteen synthetic PNGs and reports SHIP for this supplied CSS slice.
It does not certify the scrollbar probes, every-label contrast, a full keyboard walk or real devices. The separate Home long-title clipping observation is tracked as 1371; regression attribution remains unresolved and main excludes it from this acceptance.

## Classic-scrollbar boundaries

Headed Chromium under Xvfb renders the real production surfaces and a measured 10px native gutter at a 16px root.
The probe temporarily sets the actual outer query owner's content width and forces the actual scroller's `overflow-y: scroll`.
It records the nearest query owner, computed branch and target bounds, then removes its styles. This is a controlled boundary test, not a viewport-wide overflow audit.

| Surface | Outer width and scroll content | Actual query result | Conclusion |
| - | - | - | - |
| Corpus home, 40rem | 645px / 635px | Outer query is 645px; masthead is a row. At 635px outer width it becomes a column. | The branch crosses 10px before scroll-content width; the target fits the scroller. |
| Refinery content, 64rem | 1029px / 1019px | Outer query is 1029px; workbench lanes form a row. At 1019px outer width they form a column. | The branch crosses 10px before scroll-content width; the target fits the scroller. |
| Preset editor, 64rem | 1029px / 1019px | Inner Tabs container queries 1019px and keeps the 720px cap. At 1039px outer / 1029px inner it selects the 896px cap. | Inner containment accounts for the gutter; the asserted early crossing is refuted. |
| Tag member, 64rem | 1029px / 1019px | Inner editor container queries 1019px and keeps the 720px cap. At 1039px outer / 1029px inner it selects the 896px cap. | Inner containment accounts for the gutter; the asserted early crossing is refuted. |
| Labels library | 1029px / 1019px, measured 10px gutter | The populated library has no active query consumer at this boundary; its target fits. | There is no observed breakpoint to shift in this case, not a claim of missing functionality. |

The Labels runtime scans cover 1857 and 1882 attached DOM nodes, filtering query candidates to visible boxes; both find no active query candidates.
The independent literal scan covers seven source files: the library surface, suggestions, Table implementation and skin, and Section/Stack/Row implementations.
The library and suggestions author no query variants. Section defaults `container` to false and its selected skin contains no query; the Table skin contains no query.
This absence conclusion is limited to the rendered populated library case and these source paths.

Evidence lives in `closeout-css-3245942-2026-10-25T16-08-16-852Z` (Corpus, preset and refinery), `closeout-css-3254986-2026-10-25T16-10-51-848Z` (Labels and tag member), and `closeout-css-3269250-2026-10-25T16-15-05-231Z` (settled preset positive control).
The middle run exits 1 because its additional preset eval ran before the asynchronous editor appeared; its Labels and tag readings remain available, not a whole-run pass.
The corrected tape waits for the visible query target and the bounded preset rerun exits 0. This is an interaction-readiness correction, not a warm retry of failed cold startup.
Native logs are `classic-discovery.log`, `classic-final.log` and `classic-preset-settled.log`; their matching scenario JSON files contain the exact probes.

The confirmed width difference is recorded, not removed. The acceptance criterion asks whether it occurs; no measured contract violation requires a layout rewrite.
These checks qualify Linux Chromium's native thin scrollbar. They do not establish Windows gutter size, macOS overlay settings or real iPhone/Safari behavior.

## Main verification and remaining scope

Main integrated the CSS source, the DOM and test-authoring corrections, and the reviewed phone consent-row fix.
The corresponding evidence remains in `dom-closeout.md`, `test-enforcement-closeout.md` and `rendered-closeout.md` beside this report.

| Native check | Result | Output |
| - | - | - |
| `pnpm lint` | Exit 0; informational diagnostics only | `/tmp/ui-closeout-main-biome.log` |
| `pnpm lint:css` | Exit 0 | `/tmp/ui-closeout-main-stylelint.log` |
| `pnpm depcruise` | Exit 0 | `/tmp/ui-closeout-main-depcruise.log` |
| `pnpm lint:eslint` | Exit 0 after the supported input-channel guards and canonical theme-label import | `/tmp/ui-closeout-main-eslint-final.log` |
| `pnpm knip` | Exit 0 after removing an unused public testkit type forwarding | `/tmp/ui-closeout-main-knip-final.log` |
| `pnpm knip:prod` | Exit 0; informational tag hints only | `/tmp/ui-closeout-main-knip-prod.log` |
| `pnpm typecheck tsconfig.json` | Exit 0; affected UI, client, tooling and DOM programs retain their matching lane results | `/tmp/ui-closeout-main-root-typecheck.log` |

These checks qualify their configured populations. They do not prove the absence of styling forms the rules never examined.
The expanded audit finds client-tier scope gaps, alternate class carriers, static spreads and standalone vendor design inputs.
Items 1299, 1316, 1326, 1335, 1336 and 1374 remain open until that migration and its stronger enforcement are qualified.
The completed independent items can close without claiming that the entire client is already governed.
Full application CI, the future browser-score matrix and real-device qualification are not claimed by this report.
