---
kind: plan
status: active
updated: 2026-10-24
---

# One CSS system: ramps, aliases and a pinned owner-CSS surface

## Goal

Every design value comes from a closed ramp, every semantic token aliases a ramp step, and Tailwind exposes only the governed vocabulary. Owner custom CSS targets a declared, test-pinned surface that a refactor cannot break silently.

## Owner rulings

- No compatibility shims. A rename migrates every consumer and deletes the old name. No `$deprecated`, no tombstone ledger, no re-export of a retired name. `removed.json` and the removal-history check go with it.
- The ramp values are derived from the UI law, never from taste, and each step cites its clause (the Ramps section below).
- The type hierarchy in `integer-line-boxes.md` (24/20/16/15/13/10.5 px, fixed integer line boxes) is approved law; the type ramp is those steps.
- `@orb/ui` is in scope: a recurring feature re-style becomes a variant on the primitive; a one-off stays in the feature, on tokens. The theme engine (ThemeScope emit surface, derived chrome, D144 plate, density tiers, glass, elevation) keeps working through every change.
- Tailwind namespaces reset to the tokens (leg 3), so TSX cannot drift either.
- The system does not owe zero pixel change. Off-grid values snap to ramp steps, near-duplicates collapse, and like components share spacing and radius wherever the law allows. A law-pinned value stays pinned only while it has a reason a standard does not beat; a pinned value that a common standard (a type scale, a 4px or 8px grid step, the WCAG/Apple/Material touch floor) improves on changes, and its law clause changes in the same commit. Every change and every kept pin sits in the Ramps table with its reasoning.
- Every leg captures the main surfaces before and after at 1440 and 390 (coarse touch) under the load gate and lists each visible change with its reason.
- The shell boundary keeps its exact semantics: 768px and 1024px stay on the mobile and narrow sides. At 768px the desktop shell cannot fit, because `dimension.shell-content-floor` (46.625rem, 746px) plus the rail (3.5rem, 56px) exceeds the viewport.
- Lanes: legs 1 and 2b, then 3, then 5, then 2, 4 and 6, one commit each, so the review stays readable.

## Shape

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

### Leg 3: Tailwind namespace resets

`theme.css` resets `spacing` (keeping `--spacing-0` and `--spacing-px`), `text`, `leading`, `tracking`, `font-weight`, `container` and `breakpoint` beside the existing `radius` and `shadow` resets. Tokens that keep today's pixels: `font-weight.{normal,medium,semibold,bold}`, `tracking.normal` (0em) and the two display/caps trackings, container steps named by rem for every `@container` width in use (`cq-19 … cq-100`, replacing `cq-sm/md/lg`), and the reading measures for the `max-w-prose` sites. Each default-scale class maps to the semantic token its role names; a value with no semantic home becomes a `cssValues` entry (the switch thumb, the picker-cell art heights, the layout grid templates) rather than a primitive reference in a component. `better-tailwindcss/no-unknown-classes` turns the resets into the migration list; `no-conflicting-classes` and `no-duplicate-classes` are on. Numeric literals in inline `style` for a geometry property are rejected by `orb/no-off-token-inline-style`.

### Leg 5: the ramp values

Not yet built. The derivation below is the design; commit B records the outcome.

### Legs 2, 4 and 6

Not yet built. Leg 2: a typed manifest of the owner-CSS surface (the `data-slot` values, the `.shell-*` classes, `THEME_SCOPE_EMIT_VARS` and the public ramp primitives, which then move to a served block) with a pin test that fails on a planted rename or removal; the law's §12 points at the manifest. Leg 4: stylelint allow-lists over every hand-written CSS file for radius, gap, padding, margin, font-size, z-index, line-height and transitions, admitting `var(--token)` and the shell's structural literals (viewport units with their fallback line, `env(safe-area-inset-*)`, grid ratios, zero sentinels). Leg 6: the hand-written CSS drops history comments, dead rules and one-off literals, and `shell.css` splits by region.

## Ramps

Every step cites the clause that fixes it. "Off-grid" means off the 4px grid (`UI-Density-Law.md` §1).

| ramp | step | value | consumers | clause |
| - | - | - | - | - |
| space | 2 | 0.125rem | micro | shell rail glyph↔caption gap, below the 4px atom floor because the pair is one tab identity (`spacing.micro`) — off-grid |
| space | 4 | 0.25rem | tight | `UI-Density-Law.md` §2.2, D2 |
| space | 6 | 0.375rem | field, glyph-gap fine | `UI-Density-Law.md` §2.2, D3 — off-grid by ruling |
| space | 8 | 0.5rem | row | §2.2, D1 |
| space | 12 | 0.75rem | block, glyph-gap | §2.2 |
| space | 16 | 1rem | density-section-compact | compact arm of section, `tiers.css` |
| space | 24 | 1.5rem | section | §2.2 |
| space | 32 | 2rem | gutter | §2.2 |
| size | 6 | 0.375rem | switch-inset fine | knob inset = (32 − 2·1 − 18)/2 at the fine track (`size.switch-inset`) |
| size | 9 | 0.5625rem | switch-inset | knob ≈55% of the 44px track (`size.switch-inset`, the #1109/#1684 rulings in its description) — off-grid |
| size | 12 | 0.75rem | slider-inset | half the slider thumb (`size.slider-inset`) |
| size | 16 | 1rem | glyph-xs | the glyph ramp's tightest step |
| size | 18 | 1.125rem | checkbox | the Checkbox/Radio visible box, PP5 (D66) — off-grid |
| size | 20 | 1.25rem | glyph-sm | the glyph row step |
| size | 24 | 1.5rem | avatar-sm, slider-thumb, glyph-md | §13.9 display sizes |
| size | 28 | 1.75rem | touch-target fine | D62 P1, the fine floor |
| size | 32 | 2rem | avatar-md, glyph-lg, control-sm fine, switch-track-height fine | `UI-Architecture-and-Layout.md` §4b axis 3 |
| size | 34 | 2.125rem | control-md fine | §4b axis 3 — off-grid by law |
| size | 40 | 2.5rem | avatar-lg, control-lg fine | §4b axis 3 |
| size | 44 | 2.75rem | touch-target, control-sm, switch-track-height | the ≥44px touch floor, §4b axis 3 |
| size | 48 | 3rem | control-md, switch-track fine | §4b axis 3; the 48×32 fine switch |
| size | 56 | 3.5rem | control-lg | §4b axis 3 |
| size | 64 | 4rem | avatar-hero, switch-track | the 64×44 coarse switch silhouette (#420 in `size.switch-track`) |
| radius | sm | 0.25rem | inset | `UI-Density-Law.md` §2.1 |
| radius | md | 0.375rem | control | §2.1 |
| radius | lg | 0.5rem | base | §2.1 |
| radius | xl | 0.625rem | card | §2.1, D6 |
| radius | full | 9999px | full | §2.1 |
| type | 2xs | 0.65625rem | micro | `integer-line-boxes.md` §3a hierarchy; D11 |
| type | xs | 0.8125rem | label, code, field-dense fine, code-field fine | hierarchy; D5 |
| type | sm | 0.9375rem | body, field fine | hierarchy |
| type | md | 1rem | title, field, field-dense, code-field | hierarchy; the iOS focus-zoom floor (`text.field`) |
| type | lg | 1.25rem | headline | hierarchy |
| type | xl | 1.5rem | display | hierarchy |
| leading | 13 | 0.8125rem | micro | `integer-line-boxes.md` §3a table |
| leading | 16 | 1rem | label, field-dense fine | §3a |
| leading | 20 | 1.25rem | label-relaxed, field-dense, code-field fine | §3a |
| leading | 22 | 1.375rem | title | §3a |
| leading | 23 | 1.4375rem | body, field fine | §3a |
| leading | 24 | 1.5rem | field, code-field | `text.field` pair, 24/16 |
| leading | 26 | 1.625rem | headline | §3a |
| leading | 30 | 1.875rem | display | §3a |

Leg 5 is decided step by step against the rulings above: a step stays when its clause has a reason a standard does not beat, and moves when a standard improves on it, with the clause updated in the same commit. The table gains a decision column when leg 5 lands.

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
- Rendered: `pnpm snap` on an isolated stage at 1440 and 390 (coarse touch emulation) for home, a chat room, characters, config and refinery, before and after each commit, with `--diff` and a computed-geometry eval; any difference is a defect.
- Suites: `tests/ui/token-contract.test.ts`, `tests/tooling/native-token-scales.test.ts`, `tests/tooling/css-merge-parity.repo.int.test.ts`, `tests/ui/content/theme-scope/*`, `tests/kit/theme-derivation`, the shell and theme CTs, whole-tree `pnpm lint:eslint packages tooling tests`, `pnpm exec stylelint "packages/**/*.css"`, `pnpm typecheck`, `pnpm depcruise`.

## Open verification

WebKit behaviours Chromium cannot show: the iOS focus zoom floor (`text.field` at 16px), `env(safe-area-inset-*)` on a notched device, `interactive-widget=resizes-content` with the real keyboard, `-webkit-text-size-adjust` (set by Tailwind preflight). These are checked by structure (the literals survive every migration) and need a device pass.
