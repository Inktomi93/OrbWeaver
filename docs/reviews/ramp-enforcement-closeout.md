# Ramp enforcement closeout

## State

The approved styling-bypass migration is implemented and passes its affected native floor. Synthetic application captures and independent visual acceptance remain pending at the source checkpoint.
The checkpoint precedes captures because Snap must serve a committed source revision. A later evidence-only commit records those captures; no second implementation phase is planned.

The [audit](ramp-bypass-audit.md) records the initial population, source findings and standards assessment. The [CSS closeout](css-closeout.md) records the prior full stylesheet and DTCG reading census.
Main owns integration, whole-tree checks and work-item closure. This report does not claim CI, whole-application standards certification or a real iPhone result.

## Population and enforcement

The initial census covered 1067 TS and 942 TSX files. Removing the duplicate client reveal helper leaves 1066 TS and 942 TSX files.
Both languages were scanned with native ast-grep and independently searched with `rg`. Semantic full reads followed confirmed producers, consumers and governing token/rule modules; this is not a full line-by-line read of every TS/TSX file.

| Check | Result |
| - | - |
| Retained class and typography rules over all client TSX | 828 scanned; zero target findings |
| Retained static-style, off-token and theme-carrier rules over client/UI TS and TSX | 2008 scanned; zero findings |
| Effective scoped ESLint | 100 changed source, configuration and test paths; zero errors or warnings |
| Retained rule controls | 211 pass |

The shared local-static resolver handles aliases, object spreads, selected local tables, conditionals, destructured imports and object defaults. Missing or known-undefined members use defaults; supplied safe values and null do not.
Class rules apply to every client TSX tier and class-bearing props. The shell retains its existing ruled intrinsic mechanism.
Style rules recognize authored CSSProperties objects, supported CodeMirror theme calls, typed chart option objects, imported UI visual props and partial string/template design literals.
A token reference does not excuse a raw color or dimension elsewhere in the same expression. Token-only gradients remain valid for the UI painter; static client paint still fails the separate ownership rule.

Independent review found a token-gradient false positive, a destructuring-default miss and a raw color in a mixed runtime gradient. Planted controls failed before their fixes and pass afterward.
No violation baseline, grandfathered finding, new suppression or exemption list was added.

## Migration and semantic decisions

Pinned codemods applied adjudicated JSX props/anatomy and glyph choices, renamed generated numeric-token consumers, and normalized logical/canonical icon classes.
Previews were compared with independent literal searches before application. The exact maps, event logs and previews are retained under `reports/css-closeout/ramp-*`.

| Batch | Scope |
| - | - |
| Semantic JSX props and dialog anatomy | 63 nodes across 27 client files |
| WeaveGlyph named sizes | 8 openings across 7 client files |
| Numeric token companion rename | 4 import consumers |
| Logical icon/spinner/mark classes | 3 UI variant files |
| Deleted reveal-home comment references | 5 source files; one split-line reference receives a semantic reflow |

Hand edits are semantic exceptions: primitive variant/API ownership; ConnectionRoleSlot status mapping; FaceStrip overflow anatomy and transparent layout forwarding; chart policy and live metrics; CodeMirror diagnostics; Textarea chrome arithmetic; theme defaults; SandboxFrame reservation; token/generator/rule implementation; and deletion of the five obsolete glyph-size declarations after the codemod.
The transformations are retained with fixtures. They are not hand-written repetitive file migrations.

- Client paint moves to typed primitive tone, numeric, shape, edge, selection, reveal and dialog-body choices. DialogBody adds no wrapper DOM.
- The named setting-group reveal is owned by the shared UI recipe. Hover, keyboard focus, popup-open persistence and coarse visibility retain their existing mechanisms.
- Icon ink preserves 12/16/20/24px through aliases to existing primitive steps. Spinner and display marks reuse 32/48/64px steps. Optical strokes preserve 1/1.75/2.5px with per-shape non-scaling stroke.
- Wordmark and rail marks move from standalone 26px to the approved 24px step. Internal SVG drawing coordinates remain art geometry. The nested clock icon keeps a fixed drawing-coordinate viewport.
- Chart defaults share `height.chart`, an alias of the existing 256px medium step. Fill-host mode and data-derived BarList height remain supported. Sparklines reserve three label lines.
- Chart label measurement and painting use the same live label font, weight and size. The existing live-token store watches density changes and font loading as well as its previous channels.
- The existing generated numeric companion becomes `LENGTH_BASE_PX`, covering served dimension fallbacks. Browser-computed padding resolves live lengths without a second unit parser or width-layout quantization.
- Chart padding, radii, strokes and marker sizing consume existing roles. Scatter dots use the existing dot step; sparkline area uses the existing accent fill. These are intentional appearance changes, not pixel-equivalence claims.
- CodeMirror borders, diagnostic decoration and marker geometry use tokens. Textarea rows and painted borders share the same border token; bare textareas add no fictitious border.
- New-theme defaults derive from the generated seed values. This also removes the duplicate user-bubble chroma discrepancy.
- SandboxFrame changes only its unmeasured reservation to the shared medium height. CSP, sender authentication, message handling and security clamps are unchanged.

## Runtime findings and corrections

Actual coarse-pointer boxes at fontScale .8 measured Button 350×36, Switch 52×36 and Select 350×36 CSS pixels.
The existing `orb.rootFloor` extension now floors touch/control tokens and the coupled Switch width, height and inset. No ramp value changed.
Production-mounted controls now meet the project touch floor. Switch aspect, equal insets and thumb share pass in both states; fine-pointer dimensions remain unfloored.

A density-only chart update retained 8px padding when the live token resolved to 10px. Adding the actual `data-density` carrier to the existing observer fixes it.
A width probe rounded a 10.4px font to 10.3906px. Reading computed padding preserves the exact length. The retained test compares the actual chart option to rendered label typography, including owner-authored `calc()` values.

## Rendered corrections

Committed-source synthetic captures identified two remaining defects before visual acceptance.
CodeMirror's scroller overrode the tokenized root: editable text used generic monospace and an 18.2px line height while the root used Geist Mono and 20px.
The vendor theme now inherits both values from the root. The public control verifies the default values and a live owner-font override.

At 390px and fontScale 1.25, the compact NewChat label occupied x182–328 inside a button at x198–304.
The footer now wraps, and each action retains its max-content minimum. Both narrow actions occupy x86–304 with their text inside; the wider 900px layout retains natural widths.
The control measures rendered text ranges, button bounds, footer content bounds and the touch-height floor through the production modal registry.

The correction touches the existing CodeMirror theme and NewChat footer, plus their retained controls.
Scoped ESLint and UI/client/browser-test compilers pass. The two affected CT cases pass with retries disabled.
Artifacts: `ramp-editor-typography-red.log`, `ramp-footer-red.log`, `ramp-visual-fix-eslint-final.log`, `ramp-visual-fix-typecheck.log`, and `ramp-visual-fix-ct-report.json` under `reports/css-closeout/`.

The editor captures retain a separate instrument false positive. The dead-CSS scanner reports `cm-editor`, `ͼ1`, `ͼ3`, `ͼ4` and `ͼo`.
The actual CSSOM contains selectors for every reported Unicode class. Installed CodeMirror assigns `cm-editor` as its identity marker and mounts the generated style classes.
The scanner's shared class-token pattern admits ASCII names only (`packages/kit/src/dead-css/index.ts`). No scanner exemption, suppression or repair is included here.
The native capture aggregates remain exit 1; the rendered editor evidence is not relabelled as a passing scan.
The proof is `reports/runs/snap/closeout-css-872255-2026-10-25T20-10-46-330Z/evidence/regex-editor-evals.json`.

## Completed checks

All paths below are local artifacts in this worktree. Failed aggregates remain retained; their passing cases are reused only where behavior and inputs match.

| Native command or selection | Result and artifact |
| - | - |
| `pnpm typecheck tsconfig.json tooling/tsconfig.json packages/ui/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json` | Pass; `reports/css-closeout/ramp-final-typecheck.log` |
| Scoped `pnpm lint:eslint` over the changed paths | Pass; `ramp-scoped-eslint-final.log` records every argument |
| Rule, native token, generated CSS and ramp Node selection | Initial 218/219; only owner-CSS artifact drift failed. `ramp-final-node-tools.log` |
| `pnpm --filter @orb/client surface:build` and affected drift suite | Regenerated 11 new hooks, removed none; 3/3 pass. `ramp-owner-surface-build.log`, `ramp-generated-final.log` |
| `pnpm test tests/ui/token-contract.test.ts` | 20/20 pass; `ramp-final-token-contract.log` |
| `pnpm lint:css` | Pass; `ramp-final-stylelint.log` |
| Pinned JSX anatomy, import-name and class-token codemods | Fixtures, compiler, workflow validation, independent preview and apply evidence in `ramp-anatomy-*`, `ramp-length-*`, `ramp-logical-*` |
| Public Icon computed sizes, optical strokes, compact cut and drawing-coordinate ratio | Pass after canonical class normalization; `ramp-icon-final.log` |
| Owner size, CodeMirror border/marker and Textarea row-box overrides | Pass in the first four-case run; `ramp-runtime-first.log` |
| Coarse .8 hit floors and fine-pointer dimensions/Switch geometry | Both pass; `ramp-runtime-floor-green-attempt.log` and `ramp-runtime-floor-report.json` |
| Real chart font, density, reservation, fit and owner-calc updates | Pass; `ramp-chart-final.log` and `ramp-chart-final-report.json` |
| Textarea autosize plus bounded SandboxFrame reservation/layout/security-preservation selection | 10/10 pass; `ramp-field-frame-final.log` |
| RowToggleAction, FaceStrip refs, login-pending-join and join-invite-dialog suites | 14/14 pass; `ramp-client-final.log` |

The first runtime run had one passing case and three failures. The public small-button floor was a real defect; the compact-viewBox and diagnostic-output overflow assumptions were test errors.
The bounded diagnostic run preserved the complete coarse measurements and reproduced density staleness. The next run passed the pointer cases and exposed the font precision defect. No unchanged warm retry is reported as a fix.

## Boundaries

The retained analysis is bounded local-static resolution, not arbitrary execution or whole-program interpretation of imported dynamic functions.
Runtime measurement, content geometry, registered appearance channels and validated owner CSS remain distinct from authored design choices.
The census includes generated outputs; their generators own those bytes. Vendor internals, external plugin documents and art simulation algorithms are not recast as token consumers.
The prior fine-pointer TrackerValue no-shift proof remains fine-pointer-only. Coarse inline editors intentionally retain the 16px focus-zoom floor; real iOS behavior is not certified here.
Synthetic application captures and visual review are pending at this source checkpoint. No owner-data pixels are part of this assignment's new artifacts.
