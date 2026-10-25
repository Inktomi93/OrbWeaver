# CSS closeout

## Outcome

Stylesheet ownership and repeated recipes are corrected. The layout-only className drain already exists. The missing text-axis enforcement and remaining typography sites are corrected here.
The scoped browser selection passes after the recorded runtime corrections. Final committed-source captures and the classic-scrollbar boundary investigation remain pending.

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

- Preserve layer rank and source order within each layer. Consolidate blocks, not declarations across competing scopes.
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
| 1337 | Already implemented; static qualification passed | `CLASS_SELECTORS` and the better-tailwindcss patch reach bindings, recipe arrays and named-function returns. Native-token controls pass; UI/client lint is clean. |
| 1316, 1335, 1336 | Already implemented; static qualification passed | Feature className rules enabled at error; full UI/client lint clean; feature-className controls pass. |
| 1334, 1338, 1340 | Already implemented; scoped rendered qualification passed | Text voices, shared semantic tone map, Icon tone and className-drain props; existing variant CTs selected. |
| 1326 | Fixed; scoped qualification passed | The import-aware text-voice rule refuses internal axes, including aliases and static spreads. The client census reaches zero after the voice migration. |
| 1321 | Already implemented; native qualification passed | Shell paint rule and planted controls; shipped stylesheet test passes. |
| 1343 | Already implemented, including appearance channels; scoped rendered qualification passed | Surface generator, appearance attributes and property rosters, rename/warning tests and editor CT. |
| 1345 | Already implemented; scoped rendered qualification passed | Textarea fallback and native-versus-fallback height CT. |
| 1333 | Unresolved rendered qualification | Rule fixes are present; headed classic-scrollbar boundary checks remain pending. |
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
- `pnpm typecheck tooling/src/codemods/tsconfig.json`: passed for both transforms.
- `pnpm typecheck tsconfig.json packages/ui/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json`: passed; the runner also checks the server router dependency.
- UI/client and owned tooling/CT ESLint: passed with no warnings or errors; exact invocation in `reports/css-closeout/eslint.log`.
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
Final captures will be recorded after the committed-source stage runs.

## Limits

Main owns integration, independent review and board transitions. No push is authorized.
RTL expansion, ViewTransition changes, Trusted Types and whole-tree ESLint performance work are outside this assignment.
Real iPhone and macOS behaviors remain device checks; Chromium captures do not establish them.
