---
kind: plan
status: active
updated: 2026-10-24
---

# One CSS system: ramps, aliases and a pinned owner-CSS surface

## Goal

Every design value comes from a closed ramp, every semantic token aliases a ramp step, and Tailwind exposes only the governed vocabulary. Owner custom CSS targets a declared, test-pinned surface that a refactor cannot break silently.

## Shape

### Owner rulings

These bind every leg. A lane that disagrees reports the clause and a proposal; it does not work around a ruling.

- Clean system over current rendering. Pixels may move; zero pixel change is not a goal, because it assumes today's values are right. Every leg captures snap before and after at 1440 and at 390 with coarse touch, and lists each visible change with its reason for side-eye.
- No compatibility shims. Nothing stays because it is legacy: no deprecated aliases, tombstones or re-exports of renamed variables or utilities. Rename, migrate every consumer, delete the old. No one has used the app yet, so there is no stored owner data to protect.
- Ramp values are derived from the UI law (touch-target floors, the density law, the reading measure, integer line boxes and the approved type hierarchy). A law-pinned value stays unless it is wrong and a more standard alternative exists (a common type scale, a 4px or 8px grid step, the WCAG, Apple or Material touch minimums). A changed pin names its clause, the standard, why the old value was worse and its visible effect, and updates the law clause in the same commit. The Ramps table records every change and every kept pin with its reason.
- TSX does not drift. Every governed Tailwind namespace is reset, arbitrary values are refused, numeric inline styles and raw values in tailwind-variants definitions are refused, and runtime-built class strings are judged under `no-concatenated-classes`.
- `@orb/ui` is in scope. Primitives expose visual choices as tailwind-variants variants on the ramps; feature code picks a variant, never a raw class or value. A restyle that recurs becomes a variant; a one-off stays in its feature on tokens. The system is built for the theme engine and appearance layers: the ThemeScope emit surface, derived chrome, the over-art plate law, density tiers, glass and elevation, grain, wallpaper, appearance profiles and per-character overrides.
- Typography goes through the text voices in `docs/law/UI-Density-Law.md`; adding a voice is a ruling. Hand-applied `tabular-nums` moves to the `datum` voice where it fits.
- Fonts: Geist and Geist Mono are the shipped faces; `THEME_FONT_ALLOWLIST` is the one source for owner-pickable fonts, each with one derived fallback stack. A font-smoothing or text-rendering rule is added only if the law calls for it.
- Owner custom CSS is a supported feature. Its stable surface is one typed manifest with a pin test, and the law points at the manifest.
- iPhone and WebKit platform rules stay legal under every lint: `dvh` and `svh` with their fallback line, `env(safe-area-inset-*)`, `overscroll-behavior: contain`, `interactive-widget=resizes-content`, input types and the input zoom floor. WebKit behavior Chromium cannot check is listed as open, not claimed.
- The shell boundary keeps its comparison semantics: 768px is on the mobile side, because the desktop shell cannot fit there (the content floor plus the rail exceeds the viewport). 1024px keeps its side too. A check pins both widths.
- No dead vocabulary: no breakpoint or orientation token without a consumer.
- Bulk TSX rewrites use the pinned codemod tool with fixtures and a dry-run set compared against an independent search.
- This plan runs on forge, an exception to the no-forge rule, and one lane builds every leg so the system lands together, with a verifier and side-eye on the whole branch before merge.
- Heavy runs (snap, CT, e2e, broad tests) start only when the one-minute load is under the core count. No lane generates artificial load; a browser-side slow-hardware check uses snap's per-page `--cpu-throttle`.

### Open questions

- Stylelint config in TypeScript: verified possible under Stylelint 17.16. Its CLI lists `stylelint.config.ts` among the discovered files; cosmiconfig 9 loads a `.ts` config by transpiling it with the installed `typescript` into a temporary `.mjs` beside it, and that module's `./stylelint-rules.ts` import resolves to the real file, which Node loads with native type stripping. The root `tsconfig.json` already includes `*.config.ts`, so the config and its import join the typecheck program; `knip.ts` names the rules file and moves with it. Leg 4 makes the move, with `Config` and `Rule` types and unit tests for the custom rules.
- Whether the ramp primitives move from `@theme` to the served `:root` so owner CSS can reference them (leg 2 decides).
- The theme suites the law names (emit surface, palette contrast, theme emit pairing, seed theme pairing) exist only in the restoration register, not in the tree.

### Legs 1 and 2b: built in commit A

Tiers. `tokens.json` carries a `primitive` group with five ramps: `space`, `size`, `radius`, `type`, `leading`. Only a primitive holds a raw dimension. Every dimension token in `spacing`, `size`, `radius`, `text` and `leading` is a one-hop DTCG alias (`{primitive.space.8}`) to a step of its ramp, and a token's `orb.pointerFine` arm is an alias as well. Component sizes (`control-*`, `avatar-*`, `switch-*`, `slider-*`, `checkbox`, `glyph-xs/sm/md/lg`, `touch-target`) live in the `size` group, emitted as `--size-*`; `spacing` keeps the gap intents (`micro`, `tight`, `field`, `row`, `block`, `section`, `density-section-compact`, `gutter`, `glyph-gap`). `size` is not a Tailwind namespace, so consumers spell `h-(--size-control-sm)`, the form `--width-*` and `--dimension-*` already use.

Step names. `space`, `size` and `leading` steps are named by their CSS px at the 16px root (`space.8`, `size.44`, `leading.23`): under `integer-line-boxes.md` every step is an integer px, and a px name cannot lie about its value, so a leg 5 move repoints aliases instead of changing a step's value under its name. `radius` and `type` are ordinal (`sm md lg xl full`, `2xs xs sm md lg xl`) because `type` has a fractional step (10.5px) and the law assigns radius by role, not by size.

Contract (`token-contract.ts`). In a ramped group a dimension token must alias a primitive of its own ramp; a raw value, an alias to another semantic token, or an alias into a foreign ramp is a diagnostic. A primitive must be a raw dimension. A primitive step nothing aliases is a diagnostic, which keeps each ramp exactly the set of steps in use. Semantic-to-semantic chains are refused because one hop keeps the step readable at the token and a leg 5 move of one semantic cannot drag another with it. The structural families (`dimension`, `width`, `container`, `immersive`, `border-width`, `blur`, `breakpoint`) are one-off geometry, not ramps, and keep raw values.

Style Dictionary resolves every `{alias}`, including the one inside `$extensions.orb.pointerFine`, so the generated `theme.css` keeps literal values for every semantic variable and the `round()`/`max()` serialisations keep working. Primitive variables are emitted into `@theme` beside the semantics.

Conditions. `tokens.json` carries `breakpoint.shell` (48rem) and `breakpoint.shell-dock` (64rem), and a root `$extensions["orb.conditions"]` map of named media conditions to their query: `pointer-coarse`, `pointer-fine`, `motion-reduce`, `transparency-reduce`, `contrast-more`, `shell-desktop` (`width > {breakpoint.shell}`), `shell-mobile` (`width <= {breakpoint.shell}`) and `shell-narrow` (`width <= {breakpoint.shell-dock}`). The pointer and preference names are Tailwind's own variant names; `tokens.build.ts` emits one `@custom-variant` per condition, which replaces a built-in of the same name, so each query string has one home, and resets the `--breakpoint-*` namespace so no stock `md:` exists. The generated `src/tokens/index.ts` exports the same map as `MEDIA_QUERIES` for `matchMedia`. The one `prefers-color-scheme` read stays a literal in its hook: polarity is `light-dark()`'s job (`client-architecture-lockdown.md` §4.6), not a condition.

Hand-written CSS spells a condition as `@variant <name> { … }`. `shell.css` opens with `@reference "@orb/ui/styles/globals.css"` so the variants resolve there; the ui and client globals already sit under the Tailwind root. The generated `pointer-fine` override block reads the same condition string.

Boundary. The shell conditions keep the closed-at-the-top comparison the CSS always used (`width <= 48rem` is mobile), not Tailwind's half-open breakpoint variants, for the reason in the rulings above: a 768px viewport cannot hold the desktop shell. The snap batch pins 768px and 1024px before and after each commit.

Lint. `orb/no-raw-media-condition` (stylelint) rejects any `@media` in authored CSS and any `var(--primitive-*)` outside `theme.css`. `orb/no-raw-matchmedia` rejects a string argument to `matchMedia`, so a query is always a `MEDIA_QUERIES` member. `orb/no-arbitrary-tw-values` also rejects arbitrary breakpoint and container variants (`min-[…]:`, `@max-[…]:`) and a `(--primitive-*)` reference in a class. The one arbitrary container variant in the tree (`@max-[19rem]`, the character list's labelled Create arm) moved to `container.cq-20`, the first rem-named container step; the arm now swaps at a 320px pane instead of 304px.

Visible changes in commit A: the Create arm swap above. Every other variable keeps its value (the variable diff: 0 changed, 25 renamed with the same value, 1 removed `--dimension-shell-breakpoint`, 45 added).

Lesson: a token path rename must also sweep `TOKENS["…"]` and `SNAPPED_LENGTH_BASE_PX["…"]` keys in TS, which the class codemod does not see; typecheck catches them, a CT run alone does not.

### Leg 3: Tailwind namespace resets, built

`theme.css` resets `spacing`, `text`, `leading`, `tracking`, `font-weight`, `container` and `breakpoint` beside `radius` and `shadow`, and re-adds `--spacing-0` and `--spacing-px` as structure. New token families keep the vocabulary closed: `font-weight` (400/500/600/700), `tracking` (`normal`, `display`, `caps` beside `micro`, as em inputs serialised by `cssValues`), `height.scroll-sm/md/lg` (10/16/24rem) for every bounded scroller, `width.title-floor`, `field-floor`, `popup-narrow`, `lane`, `cell-auto`, `cell-wide` and `cell-tile`, `size.dot-sm/dot/dot-lg`, `preview-line`, `preview-strip` and `meter-sm/md/lg/hero`, `border-width.accent` (the rail marker, the context band binding and the tab indicator share one 2px edge), and `container.cq-<rem>` for every container width in use (20 to 96), replacing `cq-sm/md/lg`. Formulas that were arbitrary class values are `cssValues` outputs: the switch thumb and travel, the dialog glyph bleed, the name-row minimum, the prose cap, the three picker apertures and the two lead grid templates.

Spellings. A `size`, `height` or `width` token is spelled `<utility>-(--<namespace>-<name>)` on every axis; the compiler also accepts the bare `size-<name>`, `h-<name>` and `w-<name>` on some axes, and lint refuses those so there is one form. An arbitrary bracket value is legal only when it carries no design number (`grid-cols-[auto_minmax(0,1fr)]`, `repeat(auto-fill, var(--width-cell-fixed))`); a length, a decimal or a track share other than `1fr` inside brackets is refused. Stock line-heights and the stock breakpoint and container variants are refused. Inline `style` numerics are refused for every geometry property, not only the token-backed paint properties. `no-conflicting-classes`, `no-duplicate-classes` and `no-concatenated-classes` are on.

Visible changes in this leg, each with its step:

| surface | before | after | reason |
| - | - | - | - |
| labelled Create arm swap (character list) | 304px pane | 320px | `container.cq-20` |
| landing figures beside heading, config landing band | 42rem container | 40rem (`cq-40`) | the 4rem container ladder |
| lead column's second breath | 100rem container | 96rem (`cq-96`) | the 8rem container ladder |
| `wide` auto-fit grid cells | 22rem min | 24rem (`width.cell-wide`) | the 8rem ladder |
| waystone stones and the ambient meter | 120/96/76/60px | 120/96/80/64px (`size.meter-*`) | the 8px grid |
| skeleton gloss lines | 12px | 13px (`leading.micro`) | the line box the line stands in for |
| skeleton blocks (labels panes, config landing) | 64px | 56px (`size.control-lg`) | the control row they stand in for |
| scroll caps: document section, summary peek, picker list, databank area, insights, hero art, command list default and `grow` | 384/320/288px | 384px (`height.scroll-lg`) | one cap for a tall scroller |
| scroll caps: gallery grids, log viewers, macro listbox, tag vocabulary, suggestions, composer growth, background field, tag rows | 256/192/288px | 256px (`height.scroll-md`) | one cap for a medium scroller |
| scroll caps: inline autocomplete list, short log viewers, command list `compact`, section body floor | 160/192px | 160px (`height.scroll-sm`) | one cap for an inline scroller |
| recall popover width | 224px | 192px (`width.popup-narrow`) | one narrow popover width |
| refinery lanes | 240/272px | 256px (`width.lane`) | one lane width |
| token count column (prompt assembly) | 48px | 80px (`width.number-inline`) | one numeric column |
| avatar stack overlap | 12/14/18/28px | half the face (12/16/20/32px) | one rule for every size |
| `tracking-tight`, `tracking-wide` | stock values | `tracking.display`, `tracking.caps` at the same em | token names |
| `tabular-nums` beside `datum`/`datumMono`/`hero` | duplicated | dropped | the voice carries it |

`tabular-nums` stays on 40 sites whose voice is `gloss`, `quiet`, a `size="label"` span or a bare `Input`; a tabular figure outside the datum voices needs a voice ruling (UI-Density-Law §2.3) and is reported rather than invented here.

### Leg 5: the ramp values, built

Every step was judged against the Owner rulings: a step stays when its clause has a reason a standard does not beat, and moves when a 4px or 8px grid step, a common scale or a touch minimum beats it. The Ramps table carries the decision per step. Two steps moved; the law clauses moved in the same commit.

| surface | before | after | reason |
| - | - | - | - |
| every `size="md"` and `size="icon"` control at a fine pointer (buttons, icon buttons, the `face-strip` and `row-toggle-action` boxes) | 34px | 36px (`size.control-md` fine) | the fine ramp is 32/36/40, a 4px ladder (D62 P1, `UI-Architecture-and-Layout.md` §4b axis 3, `ui-package-design.md` §4); 34 was the one control step off the grid, and a 2px step above `control-sm` is below the 4px atom (D2) and a 6% move, which D5's own test calls too fine to be a scale step |
| mobile rail tab, glyph to caption | 2px | 4px (`spacing.tight`) | `spacing.micro` was the one step below the 4px atom floor (D2) and outside the six density steps (§2.2); 4dp is the Material navigation-bar icon-to-label gap; the token and `primitive.space.2` are deleted |

`token-contract.ts` now refuses a `space`, `size` or `leading` step whose name is not its integer px at the 16px root (`primitive.name`), so the px name cannot lie about the value; `radius` and `type` stay ordinal.

### Legs 2, 4 and 6

Not yet built. Leg 2: a typed manifest of the owner-CSS surface (the `data-slot` values, the `.shell-*` classes, `THEME_SCOPE_EMIT_VARS` and the public ramp primitives, which then move to a served block) with a pin test that fails on a planted rename or removal; the law's §12 points at the manifest. Leg 4: stylelint allow-lists over every hand-written CSS file for radius, gap, padding, margin, font-size, z-index, line-height and transitions, admitting `var(--token)` and the shell's structural literals (viewport units with their fallback line, `env(safe-area-inset-*)`, grid ratios, zero sentinels). Leg 6: the hand-written CSS drops history comments, dead rules and one-off literals, and `shell.css` splits by region.

## Build state

Lane `cb-css`, worktree `.claude/worktrees/agent-a93838f44c69f2f8c`, branch `wt/agent-a93838f44c69f2f8c`. A successor continues from this section.

### Done

- Commit `f00689848e` (legs 1 and 2b): primitive ramps, one-hop aliases, the `size` group, the named conditions, `MEDIA_QUERIES`, the stylelint and ESLint rules, the `rewrite-class-tokens` codemod (`tooling/src/codemods/rewrite-class-tokens`, kept because leg 3 reuses it). Evidence: `theme.css` variable diff 0 changed / 25 renamed / 45 added / 1 removed; snap before (`2ca0a3baba6e`) and after (`f00689848e`) on the real-db isolated stage, ten surfaces, every `--diff` SSIM 1 PASS; boundary pins at 768 and 1024 identical before and after (768 mobile, 1024 narrow). Run slots are under `reports/runs/snap/agent-a93838f44c69f2f8c-*` in the worktree; the capture scripts are in the session scratchpad (`cb-css-snap-batch.sh`, `cb-css-snap-boundary.sh`, `cb-css-geometry.js`).
- Merge commit `ceec202f83`: main merged; the plan conflict resolved by keeping main's Owner rulings and Open questions.
- Leg 3 (`5f891cad43`, fix-up `319c7e73d6`): every governed namespace reset (`spacing`, `text`, `leading`, `tracking`, `font-weight`, `container`, `breakpoint`, `radius`, `shadow`); the new token families and `cssValues` listed under "Leg 3"; every default-scale, container-variant and arbitrary-value site migrated (codemod map at `reports/cb-css/leg3-class-map.json` in the worktree, gitignored, with the capture scripts beside it; 116 files, plus the hand edits named in the leg-3 table); ESLint rules on (`no-conflicting-classes`, `no-duplicate-classes`, `no-concatenated-classes`, `no-restricted-classes` with the numeric-arbitrary, stock-leading and bare-namespace patterns; `orb/no-off-token-inline-style` over every geometry property); `tabular-nums` dropped beside `datum`/`datumMono`; the font stacks one `Map` in `clamp.ts`; the avatar stack overlap one rule.
- Leg-3 checks run: `tokens:build`; `tests/ui/token-contract` (17 pass); `tests/tooling/native-token-scales` and `css-merge-parity` (8 pass); `pnpm exec stylelint "packages/**/*.css"` clean; `pnpm typecheck` green after the two merge-brought `TOKENS["spacing.control-lg"]` keys were repointed; 119 component tests green (`tests/ui`, touch-floor, scene-cards, first-boot-boxes, config-search-input, background-upload, durable-local-binding, media-lifetime, design-audit-walker, login-pending-join, join-invite-dialog); the planted controls (`p-4`, `max-h-96`, `size-19`, `text-sm`, `leading-tight`, `@min-[100rem]:`, `size-control-sm`, `h-[8.5rem]`, `grid-cols-[1.55fr_1fr]`, a duplicate and a conflicting class, numeric `height` and `minBlockSize` inline) each fail lint. Whole-tree `pnpm lint:eslint packages tooling tests` green (0 findings).
- Leg-3 captures on `319c7e73d6` against the `f00689848e` baselines, real-db isolated stage, ten surfaces (run slots `agent-a93838f44c69f2f8c-587254-2026-10-24T16-11-29-527Z` through `-605418-2026-10-24T16-13-11-851Z`): eight surfaces SSIM 1; `home-desktop` 0.9828 PASS, the only difference the roster avatar stacks (half-size overlap row in the leg-3 table); `refinery-desktop` 0.9379 FAIL on threshold, the only difference the character picker list growing from 320px to 384px (`height.scroll-lg`, the scroll-caps row), card and lane positions unchanged. Every phone capture SSIM 1. Both differences are named in the table; no defect. Boundary pins at 768 and 1024 (`-606994-…`, `-607681-…`) identical to the baseline (768 mobile, rail 56px, grid `768px`; 1024 narrow, grid `56px 0px 968px 0px`).

- Leg 5 (the commit after `e8a3e29a5e`): `size.control-md` fine 34 → 36 (`primitive.size.34` → `36`), `spacing.micro` and `primitive.space.2` deleted (the rail tab gap is `spacing.tight`), the `primitive.name` contract check, the Ramps table decision column, the law clauses (ADR 0062 P1, `UI-Architecture-and-Layout.md` §4b axis 3, `ui-package-design.md` §4, `integer-line-boxes.md` §2) and the code comments that spelled 34px. Checks run: `tokens:build`; `tests/ui/token-contract` (18 pass, with the planted misnamed, fractional and ordinal steps); `tests/tooling/native-token-scales` and `css-merge-parity` (8 pass); stylelint over the four hand-written CSS files clean; scoped ESLint over the edited files clean; whole `pnpm typecheck` green. Leg-5 baselines were taken on `e8a3e29a5e` (run slots `-651641-2026-10-24T16-21-38-955Z` through `-669046-2026-10-24T16-24-25-805Z`).

### In progress

- Leg-5 after-captures. Next exact step: under the load gate run `bash <scratchpad>/cb-css-snap-batch.sh after5 <sha> --diff` and `bash <scratchpad>/cb-css-snap-boundary.sh after5 <sha>`; every desktop difference must be a 2px-taller md/icon control and every phone difference the rail caption 2px lower; record the verdicts here.

### Decisions since the Owner rulings

- A `size`, `height` or `width` token is spelled `<utility>-(--<namespace>-<name>)` on every axis; the bare forms the compiler accepts on some axes (`size-<name>`, `h-<name>`, `w-<name>`) are refused by lint.
- An arbitrary bracket value is legal when it carries no design number; a length, a decimal or a track share other than `1fr` is refused. Grid templates of `auto`/`1fr`/`max-content`/`var(--token)` stay as classes; the two ratio templates are `cssValues` (`--grid-lead`, `--grid-lead-wide`).
- The transcript bubble cap is its own token (`reading.bubble-cap-ch`, `--reading-bubble-cap`, 65ch): the reading floor is a min-width and the transcript measure belongs to the column.
- Container steps are rem-named (`cq-20` to `cq-96`); the list-row `stackActionsAt` prop values follow (`cq-24`, `cq-32`).
- Primitives stay in `@theme` (Tailwind drops an unreferenced one from served CSS); leg 2 decides the served owner-CSS surface.
- The pointer and preference conditions carry Tailwind's own variant names and replace the built-ins; `portrait`/`landscape` and the `sm`/`xl`/`2xl` breakpoints were not minted (no consumer).

### Open forks

- `tabular-nums` on 40 sites whose voice is `gloss`, `quiet`, a `size="label"` span or a bare input: a tabular figure outside the datum voices needs a voice ruling (UI-Density-Law §2.3); not invented here.
- Font smoothing: no `-webkit-font-smoothing`, `text-rendering`, `font-synthesis` or `text-size-adjust` rule exists in the packages or the law; Tailwind preflight sets `-webkit-text-size-adjust: 100%` on `html`. Nothing added.
- The theme suites the law names (emit surface, palette contrast, theme emit pairing, seed theme pairing) are not in the tree; `tests/ui/content/theme-scope/*` and `tests/kit/theme-derivation` are what runs.
- A cold isolated stage's first navigation fails as docs/work/1296 describes; every capture cited above is a warm capture, and the real-db boot is retried until the clone survives (`cb-css-snap-batch.sh`).
- The pre-commit hook's typecheck is scoped; `5f891cad43` landed type-red in the client program (a `cn()` result on a Button `className`, an untyped `Map`), and the dev stage's native TypeScript overlay then covered every snap capture (SSIM 0.3 on all ten). Run the whole `pnpm typecheck` after the last edit, before a commit and before a capture; `319c7e73d6` is the fix-up.
- The `scene-cards` component suite failed on the leg-1 tree until the `TOKENS["spacing.control-lg"]` key in `skeleton-row-metrics.ts` was repointed; a token path rename must sweep `TOKENS[...]` and `SNAPPED_LENGTH_BASE_PX[...]` keys, which the class codemod does not see.

### Remaining legs

5 (the ramp values against the rulings; the Ramps table gains a decision column), 2 (the owner-CSS surface manifest and pin test; decide whether primitives move to the served `:root`), 4 (stylelint allow-lists over every hand-written CSS file, and the move of `stylelint.config.js`/`stylelint-rules.js` to TypeScript with `Config`/`Rule` types and unit tests), 6 (history comments, dead rules and one-off literals out of `shell.css` and both `globals.css`; `shell.css` split by region). Each is its own commit with snap before/after at 1440 and 390 under the load gate and a change list.

## Ramps

Every step cites the clause that fixes it and carries its leg-5 decision. "Off-grid" means off the 4px grid (`UI-Density-Law.md` §1). A step moves only when a 4px or 8px grid step, a common scale or a touch minimum beats the clause.

| ramp | step | value | consumers | clause | decision |
| - | - | - | - | - | - |
| space | 4 | 0.25rem | tight, the mobile rail glyph-to-caption gap | `UI-Density-Law.md` §2.2, D2 | kept: the 4px atom floor; the rail gap moved here from the deleted 2px `spacing.micro` (Material navigation-bar icon-to-label gap is 4dp) |
| space | 6 | 0.375rem | field, glyph-gap fine | `UI-Density-Law.md` §2.2, D3 — off-grid by ruling | kept: D3 rules the 2pt sub-step with `tight` present |
| space | 8 | 0.5rem | row | §2.2, D1 | kept: the mocks measure 8px |
| space | 12 | 0.75rem | block, glyph-gap | §2.2 | kept: 4px grid |
| space | 16 | 1rem | density-section-compact | compact arm of section, `tiers.css` | kept: 8px grid |
| space | 24 | 1.5rem | section | §2.2 | kept: 8px grid |
| space | 32 | 2rem | gutter | §2.2 | kept: 8px grid |
| size | 6 | 0.375rem | switch-inset fine | knob inset = (32 − 2·1 − 18)/2 at the fine track (`size.switch-inset`) | kept: derived from the 32px track and the 18px knob |
| size | 9 | 0.5625rem | switch-inset | knob ≈55% of the 44px track (`size.switch-inset`, the #1109/#1684 rulings in its description) — off-grid | kept: derived, (44 − 2 − 24)/2 with the ruled 24px knob on the 8px grid; moving the inset moves the ruled knob |
| size | 12 | 0.75rem | slider-inset | half the slider thumb (`size.slider-inset`) | kept: derived from the 24px thumb |
| size | 16 | 1rem | glyph-xs | the glyph ramp's tightest step | kept: the common 16/20/24/32 icon ramp |
| size | 18 | 1.125rem | checkbox | the Checkbox/Radio visible box, PP5 (D66) — off-grid | kept: Material's checkbox box is 18dp |
| size | 20 | 1.25rem | glyph-sm | the glyph row step | kept: icon ramp |
| size | 24 | 1.5rem | avatar-sm, slider-thumb, glyph-md | §13.9 display sizes | kept: icon ramp, Material small avatar |
| size | 28 | 1.75rem | touch-target fine | D62 P1, the fine floor | kept: WCAG 2.5.8 AA's fine-pointer floor is 24px and the design audit's `TAP_FINE_MIN_PX` is 24 (`checks-a11y.ts`); 28 clears it on the 4px grid, and `CHIP_BOX` sets the chip rail pitch on it. The 32px hard floor is the coarse one |
| size | 32 | 2rem | avatar-md, glyph-lg, control-sm fine, switch-track-height fine | `UI-Architecture-and-Layout.md` §4b axis 3 | kept: 8px grid |
| size | 36 | 2.25rem | control-md fine | §4b axis 3, D62 P1 | moved from 34: the only control step off the 4px grid; the 32/36/40 ladder is the common one; the 2px step above `control-sm` was a 6% move |
| size | 40 | 2.5rem | avatar-lg, control-lg fine | §4b axis 3 | kept: 8px grid |
| size | 44 | 2.75rem | touch-target, control-sm, switch-track-height | the ≥44px touch floor, §4b axis 3 | kept: WCAG 2.5.5 and Apple's touch minimum |
| size | 48 | 3rem | control-md, switch-track fine | §4b axis 3; the 48×32 fine switch | kept: Material's touch minimum, 8px grid |
| size | 56 | 3.5rem | control-lg | §4b axis 3 | kept: 8px grid |
| size | 64 | 4rem | avatar-hero, switch-track | the 64×44 coarse switch silhouette (#420 in `size.switch-track`) | kept: 8px grid |
| radius | sm | 0.25rem | inset | `UI-Density-Law.md` §2.1 | kept: Material extra-small is 4dp |
| radius | md | 0.375rem | control | §2.1 | kept: the common 6px control radius |
| radius | lg | 0.5rem | base | §2.1 | kept: Material small is 8dp |
| radius | xl | 0.625rem | card | §2.1, D6 | kept: the common 10px card default; D6 assigns it |
| radius | full | 9999px | full | §2.1 | kept |
| type | 2xs | 0.65625rem | micro | `integer-line-boxes.md` §3a hierarchy; D11 | kept: D4 forbids re-deriving the hierarchy and §1 allows a fractional size under an integer box |
| type | xs | 0.8125rem | label, code, field-dense fine, code-field fine | hierarchy; D5 | kept: D4 |
| type | sm | 0.9375rem | body, field fine | hierarchy | kept: D4 |
| type | md | 1rem | title, field, field-dense, code-field | hierarchy; the iOS focus-zoom floor (`text.field`) | kept: D4 and the 16px zoom floor |
| type | lg | 1.25rem | headline | hierarchy | kept: D4 |
| type | xl | 1.5rem | display | hierarchy | kept: D4 |
| leading | 13 | 0.8125rem | micro | `integer-line-boxes.md` §3a table | kept: the smallest-delta integer box for 10.5px |
| leading | 16 | 1rem | label, field-dense fine | §3a | kept: the ratified floor pair 16/13 |
| leading | 20 | 1.25rem | label-relaxed, field-dense, code-field fine | §3a | kept: §3a |
| leading | 22 | 1.375rem | title | §3a | kept: §3a |
| leading | 23 | 1.4375rem | body, field fine | §3a | kept: §3a's smallest-delta box for 15px; a 24px box was weighed there and rejected |
| leading | 24 | 1.5rem | field, code-field | `text.field` pair, 24/16 | kept: 8px grid |
| leading | 26 | 1.625rem | headline | §3a | kept: §3a |
| leading | 30 | 1.875rem | display | §3a | kept: §3a |

## Rejected

- Keeping the moved sizes in the `spacing` namespace so `h-control-sm` survives: the namespace move is the point, and a `@utility h-*` over `--size-*` would be one generated functional utility per spacing-driven utility root.
- Index-named steps (`space.1`, `space.2`): a step's value could change under a stable name, which is the drift the ramp exists to stop.
- `@custom-media` in hand-written CSS: not a shipped browser feature; `@variant` compiles in every CSS file under the Tailwind root or a `@reference`.
- Custom `coarse:`/`fine:` variants beside `pointer-coarse:`/`pointer-fine:`: a second spelling. The tree has no `coarse:` spelling today.
- `portrait`/`landscape` conditions and `sm`/`xl`/`2xl` breakpoints: zero uses; a vocabulary entry nothing uses is dead.
- A second token vocabulary beside DTCG (`cssValues` is not one). Hand-authored theme blocks. Keeping the Tailwind default scale beside the tokens. Freezing current names for compatibility.

## Coupled sites

`docs/law/UI-Theming-and-Content.md` §12 (the Tier A clamp's `radius` snap keeps reading `--radius-*`), `docs/law/client-architecture-lockdown.md` §4 (CSS homes, the shell `@media` exception becomes a `@variant`), `docs/law/ui-package-design.md` §4, `docs/law/UI-Density-Law.md` §4.3 and `docs/law/integer-line-boxes.md` (the `--spacing-touch-target` spelling), `packages/ui/tokens.build.ts`, `packages/ui/token-contract.ts`, `packages/ui/src/styles/theme.css`, `packages/ui/src/lib/class-merge.ts`, `tooling/src/eslint/*`, `stylelint-rules.js`, `stylelint.config.js`, `eslint.config.ts`, `tests/ui/token-contract.test.ts`, `tests/tooling/native-token-scales.test.ts`, `tests/tooling/css-merge-parity.repo.int.test.ts`, `tests/support/browser/touch-floor*`.

## Test plan

- Contract: a planted raw value in `spacing.row`, a planted `{spacing.field}` alias on `spacing.row`, a planted unreferenced primitive step, and a planted raw `orb.pointerFine` each fail `tokens:build`; the shipped vault passes.
- Variable diff: a script resolves every `--*` in `theme.css` before and after; the only differences are added `--primitive-*`, `--spacing-<size>` renamed to `--size-<size>`, added `--breakpoint-*`, and the leg 3 additions.
- Conditions: `MEDIA_QUERIES["max-shell"]` equals the media params Tailwind compiles for `max-shell:`; a planted `matchMedia("(pointer: coarse)")` literal fails lint; a planted `@media (width > 48rem)` fails stylelint; a planted `md:`, `p-4` or `@min-[100rem]:` fails lint; a planted numeric inline height fails lint.
- Rendered: `pnpm snap` on an isolated stage at 1440 and 390 (coarse touch emulation) for home, a chat room, characters, config and refinery, before and after each commit, with `--diff` and a computed-geometry eval; every difference must match a row in that leg's change table, and a difference no row names is a defect.
- Suites: `tests/ui/token-contract.test.ts`, `tests/tooling/native-token-scales.test.ts`, `tests/tooling/css-merge-parity.repo.int.test.ts`, `tests/ui/content/theme-scope/*`, `tests/kit/theme-derivation`, the shell and theme CTs, whole-tree `pnpm lint:eslint packages tooling tests`, `pnpm exec stylelint "packages/**/*.css"`, `pnpm typecheck`, `pnpm depcruise`.

## Open verification

WebKit behaviours Chromium cannot show: the iOS focus zoom floor (`text.field` at 16px), `env(safe-area-inset-*)` on a notched device, `interactive-widget=resizes-content` with the real keyboard, `-webkit-text-size-adjust` (set by Tailwind preflight). These are checked by structure (the literals survive every migration) and need a device pass.
