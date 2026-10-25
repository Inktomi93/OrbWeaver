# Ramp and styling-bypass audit

## Verdict

The token ramps have a coherent structure. The source census identified static paint outside the system through scope gaps, spreads, alternate class props and JavaScript styling APIs.
The approved repairs and their qualification are recorded in [Ramp enforcement closeout](ramp-enforcement-closeout.md). The tables below identify the audited source revision, not outstanding violations in the repaired tree.
The repair preserves the existing ramps. It does not impose a new spacing grid or create one token for each escaped literal.

## Population and method

The source census starts at `e92cfb07c4` and is reconciled to `e81e308737`. The intervening product change only guards MessageList event channels; it changes none of these styling findings.

| Population | TS | TSX |
| - | - | - |
| `packages/client/src` | 785 | 828 |
| `packages/ui/src` | 282 | 114 |
| Total | 1067 | 942 |

`rg --files` inventories the population. Native `ast-grep 0.45.0` runs separately with `--lang ts` and `--lang tsx`, `--inspect summary`, and zero skipped files.
Structural passes inspect string/template nodes, object pairs, JSX attributes and dot/computed style access. Literal `rg` passes independently cover style/CSSProperties, class carriers, raw units/colors, sheet injection and DOM mutations.
Generated token outputs remain in the population but are excluded from the raw-literal candidate list; their authored source and generator contract are checked separately.

The proposed all-client class census uses the retained classifier and built-string rule, unchanged. Non-feature filenames are projected under the feature guard for this diagnostic only: 39 relevant findings in 20 files, comprising 18 paint findings and 21 built-string findings across 828 TSX files.
This is not a passing native lint claim. Parser-only controls do not claim typed or arbitrary cross-module flow coverage. Unrelated unused-disable messages from the narrowed rule selection are not counted.
Artifacts are `/tmp/css-closeout-ramp-{census,confirmed-census,rule-probe}.json`, their logs, and the language-specific ast-grep JSON and scan logs.

Full reads follow the confirmed producer/consumer modules, including the shared client paint composites, feature spread sites, TrackerValue/RowToggleAction, CodeEditor, chart label/theme and live chart callers, glyph sizing, Textarea, theme defaults and relevant retained rules.
The prior CSS closeout supplies the full stylesheet, DTCG source and generator reading census. This is not a line-by-line review of all 2009 TS/TSX files.

## Findings at the audited revision

| Finding | Source evidence | Enforcement gap and bounded correction |
| - | - | - |
| Paint in shared client tiers | `components/face-strip.tsx:249`, `components/setting-teach-row.tsx:121`, `forms/editor/capped-field.tsx:35`, `data/skeleton-rows.tsx:47`, `routes/route-pending.tsx:16` under `packages/client/src` | `eslint.config.ts:1259` and `ui-feature-classname.ts:147` limit the two class rules to features. Apply the existing policy across client composition and migrate to existing primitive tones, numeric/shape/edge/reveal props. Keep layout classes. |
| Painted object spreads inside features | `features/config/components/config-list-group.tsx:252`, `features/preset/components/readout/prompt-readout.tsx:288`, `features/rpg/components/rpg-quests-tab.tsx:197` | The classifier visits explicit JSX `className` attributes, not spread members. Resolve supported static spread objects and aliases, and use semantic variants at the three current sites. |
| Alternate class props forward paint | `components/row-toggle-action.tsx:30,82`; four `pressedClassName` callers in databank, preset, character and chat rows; `features/rpg/components/rpg-act-rail.tsx:96,108` through `tracker-blocks/tracker-value.tsx:158` | Inspect class-bearing JSX props, not only the spelling `className`. Replace pressed paint strings with typed state/tone choices. TrackerValue already has a tone prop; retain its layout-only rest override. |
| Text axes hidden in a selected local table | `features/rpg/components/rpg-act-rail.tsx:34,54` | `text-voices.ts` resolves object/identifier spreads but not this member selection. The current table contains `weight: semibold`. Close bounded static table-member flow and select an existing voice; do not introduce a compatibility weight prop. |
| CodeMirror JavaScript skin uses raw design values | `packages/ui/src/code-editor/code-editor.tsx:45,56,61,66,76,88` | `EditorView.theme` is not a JSX style object or a stylesheet file, so neither retained style rule nor Stylelint sees its raw border/decoration/radius/dimensions. Keep the vendor seal, route its design values through existing tokens, and extend existing ESLint recognition for this supported API. |
| Chart typography and default geometry are standalone | `packages/ui/src/charts/chart/label-metrics.ts:15,17`; `histogram/histogram.tsx:27`; `heatmap/heatmap.tsx:16`; `bar-list/bar-list.tsx:41,42` | The measured and painted font is fixed at 12px sans-serif. Histogram/Heatmap defaults and per-row chart geometry are live through `features/stats/components/analytics-time-tab.tsx:64,88`. Use resolved semantic typography for both measurement and paint, and adjudicate shared chart sizing rather than minting each old height. Colors already use the live token store. |
| Icon and loading-mark values are not token-derived | `packages/ui/src/primitives/icons/icon.tsx:27–42`; `primitives/spinner/spinner.tsx:29`; `art/web-weave/weave-glyph.tsx:37`; client `routes/route-pending.tsx:17` | Named constants are still a second authored size/weight home. Preserve pinned icon values through canonical semantic aliases over existing primitive steps. The `size.glyph-*` tokens are glyph-button boxes, not these icon sizes; substituting them blindly would enlarge icons. |
| A static border amount is embedded in runtime Textarea sizing | `packages/ui/src/primitives/textarea/textarea.tsx:35` | The formula combines runtime rows and token padding with a fixed `2px`. Use twice the existing `border-width.control` ingredient and keep the painted border coupled. A `var()` elsewhere in a formula must not exempt unrelated raw design literals. |
| New-theme defaults duplicate the Hearth palette | `packages/client/src/features/config/lib/theme-editor-model.ts:23–38`; live create use in `components/appearance-looks-section.tsx:154–155` | The defaults are source-authored design inputs, not an owner-authored CSS payload. Derive them from the generated token/seed source. Font/radius/density enum choices remain typed vocabulary, not arbitrary CSS. |

The non-feature census also reaches `form-dialog`, `content-dialog`, `library-row`, `user-macro-editor-dialog`, `connection-role-slot`, `setting-row-actions`, `tag-editor-body`, `row-actions-menu`, `band` and `relation-manager-section`. Their exact candidate lines are in the native census. Class-building findings require semantic adjudication; a count is not permission to flatten component contracts.

### Actual retained-rule controls

| Control | Findings |
| - | - |
| Explicit feature `className="bg-primary/10"` | 1 |
| The same class through a conditional JSX spread | 0 |
| Feature `pressedClassName="text-primary"` | 0 |
| The same direct paint in a shared client composite | 0 |
| Direct imported Text `weight` | 1 |
| Text weight through a selected local table member spread | 0 |
| UI direct `style={{ borderRadius: "9999px" }}` | 1 |
| UI style-object alias or `EditorView.theme` radius | 0 |
| Client width derived from a component parameter | 0, correctly admitted |

These controls describe the audited revision before repair. Retained red/green controls now cover the corrected forms; see the closeout report. No finding list grants an exemption.

## Supported runtime and structural cases

- `appearance-carrier-manifest.ts:311` writes the registered appearance channel. It is the owning writer, not an unregistered theme override.
- `CustomThemeStyle` validates and inserts owner CSS. That is user data, not permission for source-authored off-token styles.
- ThemeScope's clamped palette, identity-derived avatar/speaker color, selected color-field values, chart data colors and image URLs are runtime data. Their static calibration constants still need their recorded derivation contract; this audit does not silently retune them.
- Gallery dimensions, QueryBoundary reservations, row edit minima, media intrinsic aspect ratios, chart measured gutters, textarea native fallback and Tabs FLIP deltas are measurements/content geometry.
- ScrollArea's inline zero overrides Base UI's inline `min-width: fit-content`; the installed vendor implementation confirms that conflict. Zero and full-host percentages are structural, not new design steps.
- SVG preview/mark/meter viewBox coordinates describe drawing geometry. They are not CSS pixels for a control's outer box. The preview uses currentColor and leaves its readable labels outside the art.
- Native color-picker `#808080` is a non-committing display seed for an unset/non-hex value, not application chrome. Dev-console `%c` colors and dev fixture tag colors are not product CSS.
- Popover/Select token-only collision-width formulas are governed values but remain static inline recipes. Move them into the primitive's variant/mechanism home where possible; preserve the vendor available-width and override behavior. Do not call them off-ramp literal colors or erase the collision clamp.

## Ramp design and standards

The DTCG format is an interchange specification, not a spacing or typography design system. It supports typed values, aliases and composites; the published community specification explicitly is not a W3C Recommendation. [DTCG format 2025.10](https://www.designtokens.org/TR/2025.10/format/).

| Family | Actual organization | Judgment |
| - | - | - |
| Spacing | 4, 6, 8, 12, 16, 24, 32px at a 16px root; semantic tight/field/row/block/section/gutter aliases, snapped output | Coherent density vocabulary. Six pixels is a deliberate shared step, not a violation of a universal four-pixel rule. |
| Type | 10.5, 13, 15, 16, 20, 24px primitive steps; semantic voices consume them | Coherent compact hierarchy, not an exact geometric progression. No normative minimum body-font size follows from WCAG. The chart's separate 12px font is a consumer bypass, not a reason to change this ramp. |
| Line height | 13, 16, 20, 22, 23, 24, 26, 30px steps, paired with semantic type and snapped | Body 15/23 and label 13/16 serve different jobs. WCAG text-spacing values are supported user overrides, not mandatory authored defaults. |
| Radius | 4, 6, 8, 10px and a full-pill sentinel, mapped to inset/control/base/card/full | Logical shape roles. The 9999px primitive is a geometric pill sentinel; a second CodeMirror literal is not another canonical home. |
| Control/display size | Shared size steps; coarse/fine control choices; distinct avatar, glyph-button and meter roles | Distinct semantic aliases are useful even at equal values. Icon ink boxes and glyph-button boxes intentionally differ; keep that distinction when tokenizing icons. |
| Container/viewport | Rem-named 20–96 container choices; shell 48rem, dock 64rem, short-height 20rem | Names state their measure. The scrollbar closeout establishes that the query owner's content box matters; viewport width is not interchangeable. |
| Motion | Fast/base/layout 130/220/360ms; longer shimmer/breathe/precip/transit/ambient roles | Functional roles, not a numeric fashion scale. Preserve named reduced-motion behavior; no standard requires round 100ms increments. |
| Z order | 0, 10, 40, 50, 65, 68, 70 for base/raised/overlay/modal/popover/toast/tooltip | Ordered ownership, not a magnitude ramp. The gaps do not imply missing steps. |

`tokens.json` uses DTCG types and one-hop primitive aliases for the governed ramp families. CSS-runtime formulas remain validated `orb.cssValues`, not invented portable token types.
The retained token-contract suite passes and rejects unused primitive steps. Equal semantic values are not automatically duplicate concepts. This audit does not claim every semantic token is live: generated utilities, dynamic recipes and the public owner-CSS vocabulary prevent a text-count-only deletion verdict.

WCAG 1.4.4 requires supported enlargement to 200% without losing content/function; an application font slider is not the only permitted mechanism. This audit does not certify every composed surface under zoom. [Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
WCAG 1.4.12 requires surviving user overrides of line height 1.5, paragraph spacing 2em, tracking .12em and word spacing .16em. It does not require those as the default design. [Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).
WCAG 2.2 AA target size is 24×24 CSS pixels or an applicable spacing/other exception. The 44×44 criterion is AAA; Orbweaver's coarse floor is a stronger project policy. [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

### Runtime qualification

Production-mounted coarse-pointer checks confirmed 36px Button, Switch and Select boxes at fontScale .8. The existing `orb.rootFloor` mechanism now protects their coarse dimensions and coupled Switch geometry. Fine-pointer dimensions remain unchanged. This corrects the project's 44px promise; it is not an automatic WCAG-AA failure claim.
The editable field tokens already emit `max(1rem, 16px)` on coarse pointers. Their source therefore retains the 16px floor at .8; actual iOS focus-zoom behavior remains a device check.
Zoom, user text-spacing overrides, chart label fit after token resolution and the icon/mark size migration require affected rendered qualification before claiming complete consistency.

## Approved implementation scope

Own the existing style/class/text ESLint modules, their retained controls, one pinned codemod batch, the enumerated client composites/callers, and the coupled UI variants/vendor adapters.
Coordinate the narrow `eslint.config.ts` scope changes with main. Do not edit testkit/E2E configuration or the separate stability-matrix lane's files.

1. Close all-client scope, static spread/member-table and alternate class-prop channels in existing rules, with real red/green controls and a runtime-data admission control.
2. Preview a codemod against an independent census, then migrate mechanical tone/numeric/shape/reveal/edge sites. Adjudicate each semantic wrapper rather than blindly replacing text.
3. Token-source CodeMirror, textarea border arithmetic, theme defaults and pinned icon/mark inputs. Preserve existing primitive/ruling values; request any genuinely missing semantic family explicitly.
4. Resolve chart typography and sizing through the live token mechanism, keeping label measurement and paint identical. Choose one coherent size policy, not one token for every former height.
5. Run affected compiler/lint/Node/CT and rendered checks under the shared slot. Reuse unchanged evidence. No baselines, finding exemption lists or suppressed real violations.

Main approved semantic icon aliases over existing primitive sizes, a shared optical-stroke family, and the existing medium height for charts. Glyph-button tokens remain distinct from icon ink.

## Coverage exclusions

The initial audit was static. The closeout report records subsequent compiler, lint and rendered qualification; this document is not standards certification. No owner screenshots were read. The rule probes are bounded parser/static-flow controls, not whole-program resolution of arbitrary dynamic keys, functions or third-party code.
The source census covers every inventoried TS/TSX path, but full semantic reads concentrate on confirmed candidates and their consumers. Security validation of owner CSS/card sandboxes, external plugin documents, vendored styles and art/simulation algorithms are not re-audited here.
The standards assessment does not rerule existing ramp values or add voices.
