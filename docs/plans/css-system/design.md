---
kind: plan
status: active
updated: 2026-10-25
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
- Font rendering: the standard set (`-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-synthesis: none;`) is one rule on the root in the `@orb/ui` base layer, recorded as a law clause in `ui-package-design.md` §4: thinner macOS text on the dark themes, and no faked bold or italic when a Geist face is missing. The visible effect is macOS-only.
- Elevation: no shadow or elevation token ramp. ADR 0200 composes every shadow from the five per-polarity colour ingredients because Tailwind inlines a composite `@theme` shadow into its utility at build time, so a per-theme override cannot reach it; `client-architecture-lockdown.md` §4.4 places specificity-ordered elevation in `shell.css`. The lane audits every surface's z step, shadow and glass treatment, fixes inconsistencies only within the ingredient model and the existing z ramp, reports the table in this plan, and reports a real gap with the ADR clause instead of building a mechanism. ADR 0200 is a constraint: nothing the lane lands may let a shadow stop resolving its colour through a served variable, and a check that fails on a frozen-colour shadow is wanted.
- Generated files (`theme.css`, `tokens/index.ts`, `themes.gen.ts`, `owner-css-surface.ts`): out of every formatter, since the generator owns their bytes and a regen must stay byte-identical; still under lint, so a generator bug fails. When `stylelint-config-standard` lands, `theme.css` passes it by fixing the generator's output, never by widening its override; only a rule that is true by construction of the ingredient definitions stays off for that file, with a reason. A check must fail when committed generated output differs from a fresh `tokens:build` and `surface:build`; the plan names that test or adds it.
- Leg 8, after leg 7: the platform baseline, set once. A "Platform baseline" section in this plan judges each candidate from primary sources (MDN, web.dev/baseline, the WebKit blog and Safari release notes, Tailwind's preflight, the Vite and Lightning CSS target docs), with the source and Baseline status: declared browser targets wired into Vite and Lightning CSS so prefixes come from targets, not hand-written twins; what preflight already covers; the adopt candidates (`accent-color` from the primary token, `interpolate-size`, `text-wrap`, `hanging-punctuation`, `caret-color`, `user-select` and `-webkit-touch-callout` on chrome only, `-webkit-user-drag`, `touch-action: manipulation`, `scroll-margin`, `overflow-anchor` judged against the transcript's pinning, `scrollbar-gutter`, `@starting-style` where Base UI does not own enter and exit, `font-variant-numeric` as voice tokens, `text-rendering` and `font-optical-sizing` against Geist's axes, underline offset and thickness, `image-rendering`); the accessibility and media arms (`forced-colors`, `@media print` for transcript and character export, `prefers-reduced-data` only if it changes something real); the compositor rules, linted where practical (animate only transform, translate, scale, rotate, opacity and filter; no permanent `will-change`; no `translateZ(0)` or `backface-visibility` hacks; `contain` and `content-visibility` only where measured; the integer-line-box compositing rules stay authoritative; `backdrop-filter` against Safari's cost); and the iOS specifics verified in WebKit through Playwright (the 16px input floor, safe-area coverage in landscape, `100dvh` with the keyboard, the standalone status bar and `theme-color` per theme, no `-webkit-overflow-scrolling`, `overscroll-behavior` on the shell), with what only real hardware can verify recorded. Each adopted property gets a token or named home, a CT or capture, and a lint guard where it can drift; the report lists adopted, rejected and deferred with reasons. WebKit verification: Playwright's WebKit on Linux is WebKitGTK with patches, not Safari (no iOS chrome, insets read 0, no soft keyboard, no standalone mode). Install it (`pnpm exec playwright install webkit`, recording any system deps), add an opt-in `webkit-iphone` project (the iPhone device descriptor) to `playwright-ct.config.ts` scoped to the layout and platform CTs and outside the default `pnpm test:ct` run, add a CT that reads `env(safe-area-inset-top)` under it to record what this WebKit reports, and list in the plan what only a real iPhone can confirm (insets on a notched device, the keyboard and `dvh`, the standalone status bar, rubber-banding, focus zoom). Leg 8 also judges, from the primary sources (web.dev/blog/interop-2026, webkit.org/blog/17818; the reset write-ups are anecdotal): reset only what is needed over preflight; `text-wrap: balance` on short headings and `pretty` on prose; `interpolate-size` gated on `prefers-reduced-motion: no-preference`; `overflow-wrap: break-word` on headings and prose; a `vendor` layer for third-party CSS (Streamdown, Shiki) so no rule beats it with `!important`, checking whether that removes the Streamdown `content-visibility` override; and the Interop 2026 areas: scroll-driven animations as a replacement for the JS-toggled `data-fade-*` scroll fades only with Safari support or an `@supports` fallback that keeps the JS path, `contrast-color()` noted and deferred since the theme engine owns contrast, anchor positioning not swapped because Base UI and floating-ui own positioning, and the Custom Highlight API only if a transcript search-highlight surface exists. The adopt, defer and reject table goes in the "Platform baseline" section.
- Leg 8, text size: the root stays `calc(100% * var(--font-scale))`, so the browser's default size is respected, and `fontScale` stays a multiplier on top of the OS and browser size (in leg 9 a registered `@property` over the contract's 0.8–1.5 range; its settings label reads as relative to the device's text size). Adopt `<meta name="text-scale" content="scale">` in `packages/client/index.html` after verifying it against MDN and the CSSWG explainer (Chromium makes rem follow the OS text scale; a no-op in Safari and Firefox), and check every shell dimension holds at 200% on the WebKit and Chromium projects. Evaluate, do not assume, iOS Dynamic Type through `font: -apple-system-body` on the root inside `@supports` with the family re-set to the tokens: it changes the iOS base size and moves the approved type hierarchy on iPhones, so the plan recommends adopt, defer or reject and an adopt goes to the owner; report what Playwright WebKit does with it and say so if it cannot emulate Dynamic Type.
- Leg 9 (owner, 2026-10-24), ruling 1: OS preferences are three-way. Reduced motion, glass (reduced transparency) and contrast each become `system | on | off`, defaulting to `system`; `system` follows `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`; `on` and `off` override the OS in either direction. Today `reducedMotion` is a boolean whose off cannot beat the OS floor, glass ignores `prefers-reduced-transparency` except through the fill knob, and contrast has no app setting. This is a contract change in `packages/contracts/src/settings/appearance.ts`; old booleans parse forward (`true` → `on`, `false` → `system`) through the schema's `.catch` or preprocess, not a migration, confirmed against the settings persistence with red-first contract tests for the old values. The `off` arm must beat the OS: the CSS floor keys on the resolved state, not the raw media query, resolved in CSS through the value attribute plus media queries so there is no JS listener. The boot replay in `main.tsx` and `useAppearanceRootEffects` write the same names. The settings UI shows the three options in the existing appearance patterns, with a side-eye pass at the end.
- Leg 9, ruling 2: one generated appearance-to-CSS channel. Numbers (`fontScale`, `blurStrength`, the `reading*` knobs, `backgroundDim`, `backgroundBlur`, `chatWidthPct`) are registered `@property` custom properties typed with `syntax`, `inherits` and `initial-value`, generated from the contract's min, max and default into the generated CSS. Enums and booleans are always-present value attributes `data-appearance-<key>="<value>"` on the root, with a generated Tailwind `@custom-variant` per setting. A setting whose value is itself a CSS value (`backgroundFit`, `avatarShape`, `justifyBodyText` and similar) passes through a var or maps to a token, never one rule per arm. JS-only keys (the `show*` toggles) are declared `none`. One manifest owns the channel per key: extend `packages/client/src/lib/appearance-carrier-manifest.ts`, already a typed Record over every key; the root-effects writer, the boot replay, the CSS and the lint read names from it, so the hand-typed `"--blur-strength"` and `"data-shadow"` literals in `use-appearance-root-effects.ts` go away. `.shell-grid[data-elevation]` and `[data-list-mode]` stay where scope needs them (shell state is not appearance); appearance attributes live on the root. The leg-7 token-name stylelint check also covers the generated appearance names, plus an `orb/` rule that a `data-appearance-*` or appearance var used in CSS or TSX must exist in the manifest. Proof: the appearance matrix tooling (`tooling/src/floor/appearance`) and CTs for each channel kind; captures SSIM 1 apart from the intended settings UI. Tests follow the test-foundation rules: production entry, no test-only exports.
- Owner ruling (2026-10-24): no committed screenshot regression suite. Lane captures stay the proof per leg.
- Owner rulings on leg 8 (2026-10-24): (1) Dynamic Type through `-apple-system-body` is deferred; the reasoning and the real-device list are under "Platform baseline (leg 8)". (2) The composer and the above-composer band never grow wider than the transcript column they sit under: they take the same reading-measure expression the content column uses (`orb-composer-track`), so the chat-width dial still narrows both and cannot stretch the composer past the text; the `chatWidthPct` channel itself belongs to leg 9 and is unchanged. (3) `shell-short` stays as built: the room scrolls and every control stays. (4) The browser floor is Safari and iOS 18; the other targets are unchanged.
- Owner ruling: every bulk transform in legs 7–9 and item 1316 (the className migrations, the `!` modifier removal, the class-string building sites, the raw-intrinsic moves, the appearance-name rewrites) runs through the pinned `codemod` CLI (the `codemod` skill; JSSG with ast-grep in a sandbox), written as a repeatable codemod with its own tests and examples under `tooling/src/codemods`, never by hand or sed; hand edits are for the judgment sites the codemod reports it cannot handle, listed in the report with each codemod's name and changed-file count.
- Owner ruling: item 1316 (the Feature className section below) joins the leg-7 ESLint half, so one lane owns all className lint. Feature `className` on a primitive is layout-only, with the allow-list derived from Tailwind's layout namespaces, never by hand; colour, type, border, radius and shadow come from props or variants. Template-literal, concatenated and imported class-string `className` values in features are banned. The paint sites (about 236) and built-string sites (about 46) migrate through the codemod where mechanical, with the variants they need added in `@orb/ui`. The sibling lane cb-uilint migrates `title=` props across the same client files (item 1317); merge main before each commit.
- Leg 8, viewport conditions: keep the model of a few named conditions defined once in tokens (`shell-desktop`, `shell-mobile`, `shell-narrow`, the pointer and preference variants), components on container queries, and wide screens handled by caps (the reading measure, `chatWidthPct`, the content column), never breakpoints; the plan records the condition set as the standard with each condition's reason and the rule "no device classes". Three gaps to verify and fill: phone landscape (about 844×390 and 932×430) rendered for the shell, a room with the composer and a settings pane on the Chromium and WebKit projects, adding one height condition (`shell-short`, `max-height` from a token) only if the topbar, tab bar and keyboard leave no usable content, since the landscape problem is height, not orientation; ultrawide (2560 and 3440) confirming every surface caps its measure, panes and grids included, with any stretch fixed by a cap token; and `hover`, adding `@custom-variant hover-capable (@media (hover: hover))` where a hover-only affordance (`messageActions: "hover"`) is keyed on pointer alone.

### Open questions

- Stylelint config in TypeScript: done in leg 4 (`stylelint.config.ts`, `stylelint-rules.ts`, `tests/tooling/stylelint-rules.test.ts`). Verified possible under Stylelint 17.16. Its CLI lists `stylelint.config.ts` among the discovered files; cosmiconfig 9 loads a `.ts` config by transpiling it with the installed `typescript` into a temporary `.mjs` beside it, and that module's `./stylelint-rules.ts` import resolves to the real file, which Node loads with native type stripping. The root `tsconfig.json` already includes `*.config.ts`, so the config and its import join the typecheck program; `knip.ts` names the rules file and moves with it. Leg 4 makes the move, with `Config` and `Rule` types and unit tests for the custom rules.
- Whether the ramp primitives move from `@theme` to the served `:root` so owner CSS can reference them: decided in leg 2, no. Primitives stay in the plain `@theme` block and are dropped from the served CSS; every semantic token is served from `@theme static`.
- The theme suites the law names (emit surface, palette contrast, theme emit pairing, seed theme pairing) exist only in the restoration register, not in the tree.
- A user custom-CSS layer (owner leaning maybe; proposal only, not built). Shape: one more layer, `user`, declared last in the ui entry's statement, into which the owner-CSS feature injects the user's sheet wrapped as `@layer user { … }`, so a user rule beats every house layer without `!important` and the house floor (`motion`, `!important`) still wins. Its public styling surface would be declared and versioned: the `data-slot` names, the `data-appearance-*` attributes from leg 9, and the semantic tokens; the owner-CSS manifest (`packages/client/owner-css-surface.build.ts`) is the seed, extended with a slot-name list generated from the primitives and a version field. What it would take: the manifest extension and its pin test, the layer wrapping at the injection site, a lint that a primitive's `data-slot` rename bumps the version, and a doc page listing the surface. Cost: small for the layer, moderate for the slot inventory (every primitive's `data-slot` becomes public API).
- CSS gates (owner leaning maybe; proposal only, not built). A built-CSS size budget: a test over the client build's CSS chunk size against a committed number with a tolerance, failing on growth past it (cost: one build in the test, so CI-only). An automated dead-selector check: compile the sheets, mount the full CT gallery and the snap surfaces, collect the selectors that matched no element across them, and report; selectors keyed on runtime state (`data-*` modes, preference arms) need an allow-list, so the check reports rather than fails until that list is curated (cost: a tooling script plus the allow-list, and a run per surface).

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

Numeric readouts use the ruled `datum` voice. Machine text uses `code`; primitive numeric controls retain their `numeric` modifier.

### Leg 5: the ramp values, built

Every step was judged against the Owner rulings: a step stays when its clause has a reason a standard does not beat, and moves when a 4px or 8px grid step, a common scale or a touch minimum beats it. The Ramps table carries the decision per step. Two steps moved; the law clauses moved in the same commit.

| surface | before | after | reason |
| - | - | - | - |
| every `size="md"` and `size="icon"` control at a fine pointer (buttons, icon buttons, the `face-strip` and `row-toggle-action` boxes) | 34px | 36px (`size.control-md` fine) | the fine ramp is 32/36/40, a 4px ladder (D62 P1, `UI-Architecture-and-Layout.md` §4b axis 3, `ui-package-design.md` §4); 34 was the one control step off the grid, and a 2px step above `control-sm` is below the 4px atom (D2) and a 6% move, which D5's own test calls too fine to be a scale step |
| mobile rail tab, glyph to caption | 2px | 4px (`spacing.tight`) | `spacing.micro` was the one step below the 4px atom floor (D2) and outside the six density steps (§2.2); 4dp is the Material navigation-bar icon-to-label gap; the token and `primitive.space.2` are deleted |

`token-contract.ts` now refuses a `space`, `size` or `leading` step whose name is not its integer px at the 16px root (`primitive.name`), so the px name cannot lie about the value; `radius` and `type` stay ordinal.

### Leg 2: the owner-CSS surface manifest, built

The design, as built:

- The manifest is `packages/client/owner-css-surface.ts`, generated by `packages/client/owner-css-surface.build.ts` (`pnpm --filter @orb/client surface:build`), the client's package-root devtime pair on the `tokens.build.ts` pattern. The client is the one package that may know every name. It exports `OWNER_CSS_SLOTS` (every `data-slot` literal under `packages/ui/src` and `packages/client/src`, plus the names built at runtime, which the build script lists beside their sites), `OWNER_CSS_SHELL_CLASSES` (every `.shell-*` class selector in `shell.css`), `OWNER_CSS_TOKEN_VARS` (derived live from `TOKENS`: every custom property the token build serves, excluding `--primitive-*`) and `OWNER_CSS_THEME_SCOPE_VARS` (`THEME_SCOPE_EMIT_VARS`, through a node-safe `@orb/ui/theme-scope/emit-vars` door so the manifest and its test never import a `.tsx` barrel).
- The served block. `theme.css` renders the primitives in `@theme` and every other token in `@theme static` (verified: the compiler drops an unreferenced plain `@theme` variable and serves every `static` one, per block). So every semantic token is served whether or not a utility references it, and owner CSS can read any of them; primitives stay private and unserved. The open question "do primitives move to `:root`" is answered no: a primitive step is renamed when a value moves, which is exactly what a public name must not do.
- The pin test, `tests/client/owner-css-surface.repo.int.test.ts` (in `pnpm test`): the regenerated manifest equals the committed file; a planted `data-slot` rename and a planted `.shell-*` rename each change the generated output; compiling `theme.css` with no candidates declares every `OWNER_CSS_TOKEN_VARS` member and no `--primitive-*`; every runtime-built slot name exists as a string literal in the tree.
- `UI-Theming-and-Content.md` §12.1 and `client-architecture-lockdown.md` §4.3 point at the manifest. `knip.ts` gains the client package-root row the ui workspace already has.
- Rejected: a hand-written list (the surface is several hundred names; a list nobody regenerates rots), a `@orb/ui` home (ui may not know client names), a runtime census over gallery stories (incomplete and slow), a curated subset of slots (the law names every `data-slot` value as the API; narrowing it is an owner ruling), primitives in a served `:root`.

### Leg 6: the hand-written CSS, cleaned, built

- Comments: every comment block carrying a date, a board number, a measurement narrative or a "used to" was rewritten to its reason (102 blocks across the four sheets); the files carry no history marker now.
- Dead rules: a census of every `data-*` attribute, `data-slot` value and class the four sheets select against the TypeScript sources found none unspelled; the three `.shell-*` names with no speller lived only inside history comments.
- Literals: the three named container queries in `shell.css` stay `@container` (a container condition cannot read a variable, and the compiler refuses a named `@max-cq-*` or `not-@cq-*` form inside authored `@variant`); the stylelint condition rule now binds every container length to the `container.cq-*` ladder (`cq-72` added for the identity budget), and the 30rem narrow-topbar budget moved to `cq-32`. The prose halo (`shadow.prose`) moved from a frozen-black DTCG shadow to a `cssValues` recipe derived from `--color-backdrop`, so it follows the palette's polarity.
- `shell.css` is an index importing seven contiguous region files under `surfaces/shell/` (grid, motion, rail, panels, chrome, content, mobile) in source order, so no cascade winner moved; the owner-CSS manifest harvests the region files, Biome's shell override covers them, and lockdown §4.2/§4.4 name the shape.
- Font rendering (owner ruling): the root rule in `@orb/ui` globals carries `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-synthesis: none;`; the law clause is `ui-package-design.md` §4. Geist ships real italic and 100-900 weight cuts, so nothing on the shipped faces was synthesised; the visible effect is macOS-only.

Visible changes in this leg:

| surface | before | after | reason |
| - | - | - | - |
| topbar identity at a content column between 480px and 512px | rich header cluster | plain screen title (`cq-32`) | 30rem is off the 4rem container ladder |
| prose halo over wallpaper (`appearance.shadowEffects`) | black at 0.45/0.25 | `--color-backdrop`'s hue and lightness at the same alphas | ADR 0200: a shadow colour follows the theme; on Hearth the backdrop is near-black, so the default capture does not move |
| macOS text | subpixel-antialiased | grayscale-antialiased | owner ruling; not visible on Linux Chromium |

ADR 0200, checked as a constraint:

- Leg 3's `--shadow-*: initial` reset predates the lane (it was in the reset list before leg 3); every served shadow recipe (`--shadow-overlay`, `--shadow-cta`, `--shadow-cta-glow`, `--shadow-glow`, `--shadow-shell-over-art`, and now `--shadow-prose`) composes its colours from `var(--color-*)` ingredients or a relative colour over one, so Tailwind's inlining of the recipe into `.shadow-*` keeps the ingredient variables live. `tests/ui/primitives/card/elevation-follows-theme.ct.tsx` proves it: an elevated Card's computed `box-shadow` ends with the served recipe's computed value under Hearth, and both change together under `[data-theme="light"]`.
- The one place that froze a colour was `shadow.prose` (a DTCG shadow with literal `oklch(0 0 0 / …)` colours, consumed through `var(--shadow-prose)` in client globals); converted. No TSX spells an arbitrary or inline shadow.
- Checks built: `token-contract.ts` refuses a DTCG shadow layer whose colour is not a `color.*` alias and a `cssValues` `--shadow-*` recipe with a hex or non-relative colour function (`shadow.ingredient`, planted controls in `tests/ui/token-contract.test.ts`); stylelint `orb/shadow-from-ingredients` refuses a `box-shadow`, `text-shadow`, `filter` or shadow-named custom property whose colour is not a served `--color-*` variable, a relative colour over one or a mix over one (planted controls in `tests/tooling/stylelint-rules.test.ts`; `theme.css` is exempt because it defines the ingredients).

Elevation audit (z step, shadow, glass), with the like-surface check:

| surface | z step | shadow | glass or scrim |
| - | - | - | - |
| popover, menu, select, autocomplete, combobox popups (`POPUP_SURFACE`) | `--z-popover` (65) | `shadow-overlay` | none |
| tooltip | `--z-tooltip` (70) | `shadow-overlay` | none |
| toast | `--z-toast` (68) | `shadow-overlay` | none |
| dialog | `--z-modal` (50); footer `--z-raised` | `MODAL_SURFACE` → `shadow-overlay` | `SCRIM("modal")` (`bg-backdrop`) + `backdrop-blur-sm` |
| alert-dialog | `--z-modal` (50) | `MODAL_SURFACE` → `shadow-overlay` | `SCRIM("modal")`, no blur (its header states the deliberate difference) |
| drawer (the phone's modal presentation) | `--z-modal` (50); swipe area `--z-overlay` | `shadow-overlay` | `SCRIM_BASE` at `--z-modal`, no blur (the mobile-perf ruling: no backdrop-filter below the breakpoint) |
| shell panels in overlay mode | `--z-overlay` (40); scrim one below | `shadow-overlay` | `.shell-scrim`; glass through `blurSurfaces` |
| command palette | hosted in a dialog | inherits | inherits |

Like surfaces agree: every anchored popup shares one recipe and one z step; tooltip and toast sit above popups by the z ramp's design; dialog, alert-dialog and drawer share `--z-modal`, `shadow-overlay` and the `bg-backdrop` scrim, and the one difference (dialog's `backdrop-blur-sm`) is deliberate and documented in both headers. No literal scrim exists (`bg-black/50` appears only in comments that forbid it). One stale comment fixed: `popover/variants.ts` said the positioner carries `--z-overlay`; it carries `--z-popover`. No gap needs a new mechanism.

### Leg 4

Built (`aa1495fc94`). Leg 4: stylelint allow-lists over every hand-written CSS file for radius, gap, padding, margin, font-size, z-index, line-height and transitions, admitting `var(--token)` and the shell's structural literals (viewport units with their fallback line, `env(safe-area-inset-*)`, grid ratios, zero sentinels). Leg 6: the hand-written CSS drops history comments, dead rules and one-off literals, and `shell.css` splits by region.

## Modern CSS organization (leg 7)

Sources read in full for this design: the stylelint 17 rules index (<https://stylelint.io/user-guide/rules>), `stylelint-config-standard` 40.0.0 and its `index.js` (<https://github.com/stylelint/stylelint-config-standard>; peer `stylelint ^17`), `stylelint-config-recommended`'s `index.js`, Tailwind's directives reference (<https://tailwindcss.com/docs/functions-and-directives>) and custom-styles guide (<https://tailwindcss.com/docs/adding-custom-styles>), `stylelint-plugin-logical-css` 2.1.0 (<https://github.com/yuschick/stylelint-plugin-logical-css>; published 2026-03, peer `stylelint ^14-^17`), and the installed `eslint-plugin-better-tailwindcss` 4.10.0 rule schemas plus its docs (<https://github.com/schoero/eslint-plugin-better-tailwindcss/tree/main/docs/rules>).

### Cascade layers

`packages/ui/src/styles/layers.css` declares the order before any stylesheet creates a layer: `theme, base, components, utilities, vendor, ui, shell, client, appearance, preference, motion`. The house layers follow Tailwind's utilities. `vendor` follows preflight so KaTeX borders survive its reset. `theme` holds generated defaults, seed palettes and pointer-fine overrides; `ui` holds primitive treatments and document floors; `shell` holds shell regions; `client` holds feature composition; `appearance` holds configurable paint; `preference` holds contrast and transparency; `motion` holds the motion floor. Tailwind places top-level `@utility`, `@custom-variant` and `@reference` directives. Each sheet has one block per named layer, enforced by `orb/no-duplicate-layer-block`. Owner custom CSS stays unlayered and wins over ordinary layered declarations. Important declarations reverse layer order; the dedicated motion-floor CT qualifies their interaction with inline styles. `client-architecture-lockdown.md` §4.5 names this mechanism.

The reduced-motion preference resolves through the leg-9 appearance channel. Client sheets use the generated `appearance-reduced-motion` variant, whose `&:where(:root[…], :root[…] *)` body also matches a pseudo-element rule. The ui sheets compile without the client, so they spell the `on` arm on the root attribute and the OS arm under `@variant motion-reduce` behind the `:root:not([data-appearance-reduced-motion="off"])` guard. The floor CT (`tests/ui/styles/reduced-motion-floor.ct.tsx`) pins every mode against both OS states.

Descending specificity under layers: neither Biome nor stylelint reads `@layer`. Biome compares every rule in a file; stylelint compares only rules under the same nearest at-rule (`lib/utils/findAtRuleContext.mjs`), so a `@layer` or `@variant` block is its own context, which matches the cascade. The Biome override for the shell sheets and the client globals is deleted; the six same-context pairs both tools reported are reordered (the overriding selector now follows the one it overrides), and the one cross-variant pair only Biome reported (`contrast-more` vs `transparency-reduce`, both in `preference`) is resolved by placing the transparency arm after the contrast arms. Preference root declarations keep their variants inside `:root`; descendant rules use outer variants. The appearance CTs qualify both scopes and the transparency-over-contrast ordering.

### Dedupe and literals (7b)

- Glass under-layer: one custom property, `--glass-under`, is the colour every glass tint mixes over. `.shell-grid` declares it `transparent`; under a wallpaper one selector list declares it `light-dark(var(--color-reading-plate), transparent)` on each shell-anchored glass consumer (the panes, `.shell-main`, the composer, the bubbles); the modal popups declare the same value unconditionally, since they composite over the scrim. The property is declared on the consumer, not inherited from the grid, because a `var()` inside a custom property resolves where the property is declared, and a bubble inside a carried `ThemeScope` must read that scope's plate. Every glass rule then mixes its tint over `var(--glass-under)` and the six wallpaper twin rules go. The over-art plate law (UI-Theming-and-Content.md §12.1) asks for the outcome, not the spelling (D333 ended static enforcement), and the outcome is unchanged: the light arm mixes over the plate under art, the dark arm stays plateless.
- Per-role bubble glass: one rule over `[data-role] [data-slot="message-bubble"]` mixing `var(--glass-tint)`; three one-line rules declare `--glass-tint` per role on the bubble itself (inside the carried scope, so the carried tint is the one read; `data-role` sits on the row root outside that scope).
- Gradient ring: `@utility orb-gradient-ring` in `primitives.css` carries the recipe once (the transparent padding-box fill over the primary-to-sheen border-box gradient) with two knobs, `--ring-head` and `--ring-foot`, defaulting to the CTA's alphas. The CTA, the active tab and the active rail button `@apply` it and set their own knobs, z-index and radius; the rail sheet reaches it through its `@reference`. A utility rather than a shared rule because the rail lives in another package's sheet, and a utility also serves a future TSX site as `after:orb-gradient-ring`.
- `-webkit-mask-image` twins go: the build target is es2025 and unprefixed `mask-image` is in every browser the app serves. `100vh` and its duplicate-property waiver go for the same reason.
- `drop-shadow(0 12px 32px …)`: the far ambient layer becomes a root cssValue, `--shadow-layer-ambient-far`, that both the overlay recipe and the filter read, so the geometry is one decision. Theme placement like every shadow value: the native-token-scales test treats every `shadow.*` entry as a minted utility, and a one-layer ambient utility is a legitimate member of that vocabulary; the name carries `shadow`, so `orb/shadow-from-ingredients` checks it.
- Ring alphas (0.55/0.04, 0.45/0.03, 0.3/0.02) become the ring knobs at each site. The scroll-mask stops (0.04, 0.2, 0.55), the aura alpha (0.14), the wallpaper empty-state plate (72%), the scrollbar thumb (22%) and the colorization mix (22%, 6%) stay as the shape of their one gradient or mix, spelled once: a custom property with one reader is a comment with indirection. The waystone keyframe offsets stay: `translate` is a motion channel the length law excludes on purpose, a `--orb-ws-*` custom property would put a raw length into the governed custom-property namespace, and a design token for an art piece's drift amplitude is wrong-sized. The web spinner's `84px` fallback goes: the component always writes `--orb-web-spiral-length`.
- Text owns the wordmark halo through the native `text-shadow-wordmark` utility. Its DTCG recipe keeps the existing geometry and resolves `--color-backdrop` at the consumer. The token contract checks both shadow namespaces for frozen color ingredients. The nested light/dark CT qualifies scope; the empty-state aura retains its existing recipe.
- Logical properties: every physical box property in the hand-written sheets becomes its logical form (`width` → `inline-size`, `height` → `block-size`, `min-`/`max-` likewise, `top`/`left` → `inset-block-start`/`inset-inline-start`, `margin-top` → `margin-block-start`, `padding-bottom` → `padding-block-end`). `transform: translateX()` on the panels stays: `translate` and `transform` add, and the FLIP keyframes own `translate` on the same elements (`motion.css`, `mobile.css`), so the resting offset must ride the other channel; there is no logical translate.

### One owner per check

| check | owner before | owner after | why |
| - | - | - | - |
| unknown property, unit, function, pseudo, at-rule; duplicate properties; descending specificity; `@import` position; shorthand overrides | Biome recommended CSS (pre-commit) and nothing in stylelint | stylelint (`config-standard`, with `at-rule-no-unknown` taught Tailwind's directives) | `lint:css` is the CSS gate in CI; Biome keeps the CSS formatter and `tailwindDirectives` parsing only, so no site carries two ignore comments. A `stylelint` step on staged `.css` joins pre-commit so the fast loop keeps a CSS lint. Biome 2.6.2 ignores `css.linter.enabled: false` in `check` and `lint`; the `**/*.css` override with `rules.recommended: false` is what silences it, and both are set |
| `!important` | Biome `noImportantStyles` (9 ignores) | stylelint `declaration-no-important`, off for `motion-floor.css`, one disable at the Streamdown site | one comment per named site |
| arbitrary values, breakpoint variants, primitive references, colour literals, raw widths, `max-w-prose`, viewport and pointer variants in features | `orb/no-arbitrary-tw-values`, `no-color-literals`, `no-raw-container-widths`, `no-banned-tw-utility`, `no-media-queries-in-features`, `no-pointer-variants-in-features` (regex selectors in `ui-policy.ts`) | `better-tailwindcss/no-restricted-classes` patterns, per file scope | the plugin matches whole class candidates with variants; each retired gate's planted control is re-run against the plugin rule before the gate goes |
| class token splice | `orb/class-token-splice` | `better-tailwindcss/no-concatenated-classes` (already on) | the plugin refuses every concatenation, a superset |
| logical properties | none | `better-tailwindcss/enforce-logical-properties` (TSX), `logical-css/require-logical-properties` and `require-logical-units` (CSS) | one rule per language, no custom code |
| skin-fragment purity, portal-float tokens, shell-chrome classes, dark variant, receded ink, inline token styles, theme override via scope, interactive intrinsics | `orb/*` | kept | house law no plugin expresses |
| history and ids in comments | none | stylelint `comment-word-disallowed-list` (`/#\d+/`, `/\b[A-Z]+-\d+\b/`, `former`, `previously`, `load-bearing`, `used to`, `measured`) | cheap, built in |
| every rule in a declared layer | none | `orb/rule-in-layer` | no built-in covers it |
| `className`, `style` or a spread on a raw HTML element in `packages/client/src` | `no-raw-interactive-intrinsics` covers interactive semantics | `orb/no-raw-intrinsic-paint` in `tooling/src/eslint/ui-intrinsics.ts`, enabled by `eslint.config.ts` | Raw-element paint belongs to primitives. The manifest-derived shell class exception remains bounded; `tests/tooling/eslint-raw-intrinsic-paint.test.ts` holds the controls. |

### stylelint rule set

Before: the four `orb/` rules, `orb/shadow-from-ingredients`, `property-disallowed-list`, `declaration-property-value-allowed-list`. After (`stylelint.config.ts`): `extends: stylelint-config-standard` 40.0.0 (which brings `recommended`, so `no-descending-specificity`, `no-duplicate-selectors`, `declaration-block-no-redundant-longhand-properties`, `selector-not-notation`, `font-family-name-quotes` and the rest now run), with Tailwind's at-rules declared to `at-rule-no-unknown` and `@apply` to `at-rule-prelude-no-invalid`, `import-notation: string` (the form Tailwind processes), the three colour notations set to `number` because the vault's DTCG components are numbers and the generator emits them unchanged, `custom-property-pattern` extended by the `-*` wildcard of Tailwind's namespace resets, `number-max-precision: 5` (a rem from a half pixel), `value-keyword-case` ignoring the font stacks, the five `*-empty-line-before` rules off because Biome formats, `selector-max-specificity: "0,9,0"` and `selector-max-compound-selectors: 5` at the measured maxima, `max-nesting-depth: 1` ignoring `@variant`, `selector-max-id: 0` and `selector-no-qualifying-type` (the appearance flags are `:root[data-*]` now), `declaration-no-important` (off for `motion-floor.css`, the file that exists for it; one disable at the Streamdown site), `property-no-vendor-prefix` and `value-no-vendor-prefix`, `declaration-property-value-no-unknown`, `comment-word-disallowed-list` with the measured list, `orb/rule-in-layer` (every style rule under a `@layer` block; `@utility`, `@theme`, `@custom-variant`, `@keyframes`, `@property` and `@font-face` place themselves), `csstools/value-no-unknown-custom-properties` 6.1.1 importing the served theme and the sheets plus the three runtime-written names with their writers (`--width-shell-content`, `--orb-web-spiral-length`, `--orb-ws-pitch`; every other runtime var carries a fallback), and `stylelint-plugin-logical-css` 2.1.0 (`require-logical-properties` and `require-logical-keywords` on; `require-logical-units` off because `dvh` and `dvw` are the platform rules the owner keeps). `stylelint-use-logical` 2.1.3 was not chosen: it is one rule with no keyword or unit coverage and no Tailwind at-rule handling in its README; the chosen plugin is maintained (published 2026-03, peer `stylelint ^14-^17`), splits the three concerns and autofixes each. `function-no-unknown` lists Tailwind's functions, but stylelint 17 already treats every dashed function as a custom function, so the list documents intent. The generator wraps its root block in `@layer theme` so `theme.css` passes `orb/rule-in-layer`; its override keeps only the authored-value rules off (the values are the token sources). Every added rule has a planted control in `tests/tooling/stylelint-rules.test.ts`, and that suite also lints every shipped sheet. Waivers: 11 `biome-ignore` and 18 `stylelint-disable` before; 0 and 3 after (`#root`, the Streamdown `content-visibility`, the reading line-height residual). Lefthook runs stylelint on staged `.css` files in pre-commit and pre-merge-commit. `tests/tooling/generated-css-drift.repo.int.test.ts` fails when `theme.css`, `tokens/index.ts`, `themes.gen.ts` or `owner-css-surface.ts` differ from a fresh generator run; its first run caught three stale shell classes in the manifest.

### motion-token-purity

A `infinite` iteration is a decorative loop with no partner to drift from, which is the reason every one of the 17 waivers gives; the rule now exempts an `animation` declaration whose value carries `infinite`. The remaining non-loop easings become tokens (`ease.spinner` for the web spinner's bezier; `ease-out` sites move to `--ease-out-expo` or a named token).

### better-tailwindcss

Installed 4.10.0 ships 15 rules; `enforce-motion-safe-variant` is not among them, so it cannot be turned on (reported). Chosen options: `enforce-consistent-class-order` `{ order: "official" }` (Tailwind's own order; component and unknown classes `preserve`); `enforce-consistent-variant-order` on; `enforce-shorthand-classes` and `enforce-canonical-classes` on (`collapse: false`, `logical` conversion off, since the logical rule owns that); `enforce-logical-properties` on; `no-unnecessary-whitespace` `{ allowMultiline: true }`; `enforce-consistent-important-position` `{ position: "recommended" }` (the trailing `!`), while the modifier itself is refused by `no-restricted-classes` so the position rule only governs a named exception; `enforce-consistent-line-wrapping` `{ printWidth: 160, group: "newLine", preferSingleLine: true, indent: 2 }`, matching Biome's `lineWidth` 160 so the two never fight (Biome's `useSortedClasses` stays off; the plugin owns class order). Autofixes land in one mechanical commit, captured.

### `!important`

CSS sites kept with a scoped reason: the reduced-motion floor (`declaration-no-important` off for `motion-floor.css`, the file that exists for it) and Streamdown's inline `content-visibility` (one disable). TSX: the `!` modifier sites became `Card padding="none"` and `Input width` (`auto`, `avatar-md`, `avatar-lg`), migrated through the `class-token-to-prop` codemod, and `!` is refused by `no-restricted-classes` with planted controls; the slider's `translate-none!` is the one site that names its reason (it beats Base UI's inline `translate` on the thumb).

### Feature className

Two `orb/` rules over `packages/client/src/features/**/*.tsx`, in `tooling/src/eslint/ui-feature-classname.ts`.

`feature-classname-layout-only` judges every static class token under a `className` on a component element (an uppercase or member JSX name; the raw-element case is `no-raw-intrinsic-paint`). Tokens come from string literals, template quasis, conditional and logical arms, `cn` arguments, array elements, object keys, and a local constant's initializer. The allow-list is not a class list: each token compiles through Tailwind's design system (the stock theme plus the generated `theme.css`, the same load as `native-token-scales`), and the token is layout when every declaration it emits is a layout property (display, positioned layout, box model, sizing, flexbox, grid, box alignment, overflow and line wrapping, multi-column, fragmentation, containment, pointer events, transforms) or a custom property. A token that does not compile is another rule's finding (`no-unknown-classes`) and is skipped. `sr-only` and `not-sr-only` are named exemptions: they reset `border-width`, a paint property, to hide an element visually. Rejected: a hand list of class roots (the done line forbids it, and it cannot judge variants or `(--token)` forms); Tailwind's `getClassList` (roots with suggestions, not an exhaustive set, and no category); deriving at token build time (a classifier over arbitrary candidates cannot be a generated list).

`no-built-class-string` judges the shape of a `className` value on any element in a feature: a string, a template without expressions, `cn(...)`, conditional and logical arms, arrays, objects and local constants are the legal forms; a template with expressions, a `+` concatenation, an identifier bound to an import, a member expression and a call to anything but `cn` are built class strings. Rejected: following imports into their modules (the import itself is the ban; the class lives in `@orb/ui` or nowhere).

Coupled sites: `tooling/src/eslint/index.ts` registers both and takes the classifier through `createOrbPlugin`; `eslint.config.ts` loads the design system once per lint and enables both rules as errors; `tests/tooling/eslint-feature-classname.test.ts` holds the controls (paint tokens in a literal, in `cn` arms and under a variant; a built template, a concatenation, an imported constant, a member expression, a foreign call) and the passes (layout tokens, `truncate`, `sr-only`, a viewport variant on a layout token, a local constant, an unknown class, a raw element). The migration runs the `class-token-to-prop` codemod with a map of (element, token, prop, value) rows for the tokens that already have a prop or variant on their primitive; the remaining semantic sites use primitive props and variants.

### Sub-legs

7a layers (with the Biome override deletion, the ui globals split into region files, the `!important` CSS classification, the floor CT, lockdown §4.5); 7b dedupe and literals (a shared glass under-layer property, the per-role bubble glass over a role tint, one gradient-ring recipe, no mask prefixes, no `100vh`, keyframe offsets and alphas as named properties or tokens, logical properties in CSS); 7c `@utility` conversions and the comment budget; 7d motion rule and waivers; 7e stylelint tightening; 7f the TSX variants and the `!` restriction; 7g better-tailwindcss rules and the custom-gate retirements; 7h the mechanical autofix commit. Each sub-leg commits on its own, is captured at 1440 and 390 under the load gate, and reruns `lint:css`, token-contract, the pin test and the CTs it touches; `knip:prod` runs before the final report.

## Implementation state

The implementation lives in the source homes below. [CSS closeout](../../reviews/css-closeout.md) records acceptance, current checks and limits.

| Concern | Source home | Maintained proof |
| - | - | - |
| Ramps, aliases, conditions and generated output | `packages/ui/token-contract.ts`, `packages/ui/tokens.build.ts` | `tests/ui/token-contract.test.ts`, `tests/tooling/generated-css-drift.repo.int.test.ts` |
| Layer order and stylesheet ownership | `packages/ui/src/styles/layers.css`, UI styles and client globals | `tests/ui/styles/layer-order.ct.tsx`, `tests/tooling/stylelint-rules.test.ts` |
| Feature layout-only classes and primitive skins | `tooling/src/eslint/ui-feature-classname.ts`, `packages/ui/src/primitives/` | `tests/tooling/eslint-feature-classname.test.ts`, className-drain CTs and chat-style-skins CT |
| Logical class vocabulary, including recipe arrays and function returns | `CLASS_SELECTORS` in `eslint.config.ts`, the better-tailwindcss patch | `tests/tooling/native-token-scales.test.ts`, `tests/ui/class-merge.test.ts` |
| Text voices and semantic tones | `packages/ui/src/primitives/text/variants.ts`, `packages/ui/src/lib/tone-ink.ts` | className-drain CTs; the client text-axis restriction in `eslint.config.ts` |
| Appearance channel and OS preferences | `appearance-carrier-manifest.ts`, `appearance-channel.build.ts` | preference contract tests, appearance shell CTs and reduced-motion-floor CT |
| Owner CSS contract | `packages/client/owner-css-surface.build.ts`, `packages/client/src/owner-css/` | owner-CSS pin and rewrite tests, theme-css-editor CT |
| Platform floors | `packages/client/browser-targets.ts`, platform styles, Textarea fallback | platform suites, textarea-autosize CT |

The feature className rules are enabled as errors. The drain includes the chat row skin table; no finding baseline or exemption list admits unresolved paint.
The owner-CSS surface includes appearance attributes, values and properties. Its generated manifest feeds completion, warnings and injection rewrites.
The root font-rendering rule lives in UI primitives.css, as the owner ruling requires.
`orb/text-voice-only` binds client Text and Heading usage to voices while retaining semantic tones. CountText and TrackerValue preserve their readable control steps through existing voices; the closeout report lists intentional typography changes.

### Stylesheet organization

Each sheet has one block per named layer. Stylelint refuses repeated blocks, including conditional and nested spellings.
The token generator emits root defaults, fine-pointer overrides and seed palettes within one theme block.
Client globals groups document and reading mechanisms, appearance treatments, then preferences.
UI primitives owns the message-list mask, Streamdown code treatments and art formulas. Client appearance retains the wallpaper-specific fade depth.
Glass has one consumer-local filter recipe. The empty-state plate selects its half-strength scale without copying the recipe.
The paint-carrier utility owns pseudo-element positioning. Text exposes the wordmark halo as a token-derived variant.
Art decoration and column measures are primitive choices; image URLs, speaker colors and measured edit reservations remain runtime data.

### Decisions since the Owner rulings

- A `size`, `height` or `width` token is spelled `<utility>-(--<namespace>-<name>)` on every axis; the bare forms the compiler accepts on some axes (`size-<name>`, `h-<name>`, `w-<name>`) are refused by lint.
- An arbitrary bracket value is legal when it carries no design number; a length, a decimal or a track share other than `1fr` is refused. Grid templates of `auto`/`1fr`/`max-content`/`var(--token)` stay as classes; the two ratio templates are `cssValues` (`--grid-lead`, `--grid-lead-wide`).
- The transcript bubble cap is its own token (`reading.bubble-cap-ch`, `--reading-bubble-cap`, 65ch): the reading floor is a min-width and the transcript measure belongs to the column.
- Container steps are rem-named (`cq-20` to `cq-96`); the list-row `stackActionsAt` prop values follow (`cq-24`, `cq-32`).
- Primitives stay in `@theme` (Tailwind drops an unreferenced one from served CSS); leg 2 decides the served owner-CSS surface.
- The pointer and preference conditions carry Tailwind's own variant names and replace the built-ins; `portrait`/`landscape` and the `sm`/`xl`/`2xl` breakpoints were not minted (no consumer).

### Remaining limits

- The panels' physical `translateX` channel remains intentional because FLIP owns `translate`. RTL expansion is outside this closeout.
- Playwright WebKit does not establish real-iPhone keyboard, notch, standalone-status-bar or focus-zoom behavior. The device list below remains open.
- Earlier warm-capture evidence does not establish cold-start behavior. Current cold-run evidence is recorded separately in the closeout report.
- Independent whole-tree and rendered review belongs to main.

## Platform baseline (leg 8)

Sources, each read in full for this section: MDN's `<meta name="text-scale">` page; the `web-features` 3.43.0 dataset, which is the data behind web.dev/baseline (Baseline status and first-support versions below come from it); web.dev/blog/interop-2026 and webkit.org/blog/17818; Tailwind preflight and the Lightning CSS pass inside `@tailwindcss/node` 4.3.3, read from the installed sources; Vite 8.3.5's `convertTargets`, read from the installed source. Playwright's WebKit is checked as described under "WebKit verification".

### Browser targets

`packages/client/browser-targets.ts` is the one declaration (Chromium and Edge 136, Firefox 138, Safari and iOS 18, by owner ruling). `vite.config.ts` feeds it to `build.target` and `build.cssTarget`, and Vite converts the CSS list into the Lightning CSS minifier's targets, so a vendor prefix is added or dropped by what those browsers need. The list began as the expansion of the previous `es2025` shorthand (Safari and iOS 26), and the built CSS was byte-identical. Lowering Safari and iOS to 18 changes no output byte: the CSS and JS chunks keep their hashes, so Lightning CSS and the JS lowering add no prefix and transpile nothing new at 18. A control build at Safari 14 does change the CSS hash, so the target does reach the minifier. Rejected: `css.transformer: "lightningcss"` (a second Lightning pass over every sheet; its only output change was duplicated `-webkit-text-decoration` lines). Tailwind's own optimize pass pins older targets (Safari 16.4, Chrome 111, Firefox 128) inside `@tailwindcss/node` and takes no option, so the prefixed twins that come from Tailwind's own utilities (`mask-*`, `line-clamp-*`, preflight) stay; hand-written sheets cannot carry a prefix, because `property-no-vendor-prefix` and `value-no-vendor-prefix` are on.

### Preflight and the reset

Preflight already sets `-webkit-text-size-adjust: 100%`, the border and box-sizing reset, `a { color: inherit; text-decoration: inherit }` and the form-control resets. The base layer in `packages/ui/src/styles/primitives.css` holds only what preflight lacks, under every utility, so a class such as `touch-none` still wins.

### Candidates

| candidate | decision | home and proof | Baseline status and source |
| - | - | - | - |
| `accent-color` | adopt | `:root` in the base layer reads `--color-primary`; `platform-baseline.suite.ct.tsx` compares it with the resolved token | not Baseline: Safari 26.2 (web-features `accent-color`) |
| `text-wrap: balance` | adopt, headings | base layer `h1`-`h6`; same suite | Baseline low (Safari 17.5, Firefox 121) |
| `text-wrap: pretty` | defer | prose streams token by token, and `pretty` re-balances the last lines on every token; measure on a real stream first | not Baseline: Chromium 117, Safari 26, no Firefox |
| `overflow-wrap: break-word` | adopt on headings; prose already carries `break-words` (`markdown.tsx`) | base layer, same suite | Baseline high |
| `interpolate-size` | reject | Chromium-only (129); Base UI's panel-height variables already animate disclosure height, so no site needs it; if one does, gate it on `prefers-reduced-motion: no-preference` | not Baseline: Chromium only |
| `hanging-punctuation` | defer | Safari-only (26.5); needs a real-Safari look at opening quotes inside the bubble padding | not Baseline: Safari 26.5 only |
| `caret-color` | reject | the default `currentColor` already contrasts on every palette | Baseline high |
| `user-select` and `-webkit-touch-callout` on chrome | already adopted | `select-none` sits on every chrome primitive (button, tab, badge, kbd, menu item, slider); the build adds the `-webkit-` twin | `user-select` is not Baseline for Safari (prefix needed); `-webkit-touch-callout` has no standard form |
| `-webkit-user-drag` | reject | media drags into the composer are a feature (`composer-drop-target.tsx`) | none |
| `touch-action: manipulation` | adopt | base layer on links and controls; the suite proves a `touch-none` class still wins | Baseline high |
| `scroll-margin` | reject | no sticky-header anchor target; the config scroll jump positions itself | no entry in web-features (long-standing) |
| `overflow-anchor` | reject | the transcript is a virtualized list that anchors to the end in script; its rows are absolutely positioned, so browser anchoring has nothing to hold | Baseline low from Safari 27 |
| `scrollbar-gutter` | defer | the app's scrollers use overlay or hidden bars (Base UI `ScrollArea`, `scrollbar-width: none` on the tab strip); no layout shift was measured | Baseline low (Safari 18.2) |
| `@starting-style` | reject | Base UI owns every enter and exit; no app-owned enter exists | Baseline low (Safari 17.5) |
| `font-variant-numeric` as voice tokens | already adopted | the `datum` voices carry `tabular-nums` (leg 3); numeric control internals use the numeric modifier | Baseline high |
| `text-rendering`, `font-optical-sizing` | reject | Geist ships a weight axis only, so optical sizing has nothing to select, and kerning is on by default | `font-optical-sizing` Baseline high |
| underline offset and thickness | adopt offset | base layer: `text-underline-offset: 0.18em` on links and `.underline`; thickness stays `auto` | Baseline high |
| `image-rendering` | reject | no pixel art | Baseline high |
| `forced-colors` | adopt | `platform.css`; `forced-colors.ct.tsx` (red without the arm) | Baseline high |
| `@media print` | adopt | `platform.css`; the platform suite print test (red without the arm) | Baseline high |
| `prefers-reduced-data` | reject | no engine ships it | not supported anywhere (web-features) |
| scroll-driven animations | adopt | the scroll fades; see "Interop 2026" | not Baseline: Chromium 115, Safari 26, no Firefox |
| `contrast-color()` | note, defer | the theme engine derives contrast; revisit when a theme needs a computed ink | Baseline low (Chrome 147, Firefox 146, Safari 26) |
| anchor positioning | reject | Base UI and floating-ui own positioning | not Baseline |
| Custom Highlight API | reject | no transcript search-highlight surface exists | Safari supports it (webkit.org/blog/17818) |
| `@scope` with a lower boundary | reject | would stop shell rules at component roots, but Firefox ships it in 146 against the Firefox 138 floor; `orb/shell-paint-law` binds the shell selectors by lint instead | Baseline low (Chrome 118, Firefox 146, Safari 26.4 for the at-rule; web-features `scope`) |

### Compositor rules

The tree holds no `will-change`, `translateZ`, `translate3d`, `backface-visibility`, `transform-gpu` or `translate-z-*`. Stylelint now refuses the first four in CSS (`property-disallowed-list`, `declaration-property-value-disallowed-list`), and the restricted-class patterns refuse the Tailwind spellings, each with a planted control (`stylelint-rules.test.ts`, `native-token-scales.test.ts`). `-webkit-overflow-scrolling` is refused for the same reason. Kept as written: the integer-line-box compositing rules (`integer-line-boxes.md`), `content-visibility` only on `orb-skip-offscreen` rows and Streamdown's code blocks, and the `backdrop-filter` glass, which the mobile-perf ruling already keeps off below the shell breakpoint. A lint that animations touch only `transform`, `translate`, `scale`, `rotate`, `opacity` and `filter` is not built: `orb/motion-token-purity` already routes every duration and easing through tokens, and a property allow-list over `transition` shorthands cannot read Tailwind's `transition-*` utilities.

### Text size

`<meta name="text-scale" content="scale">` is in `packages/client/index.html`. MDN lists it as Chromium 146 and later, not Baseline; it makes the root font size follow the OS and browser text scale, turns off mobile text auto-sizing, and warns that a page must hold up to 200% to over 300%. The root stays `calc(100% * var(--appearance-font-scale))`, so `fontScale` multiplies on top. `platform-shell.suite.ct.tsx` sets the scale to 200% (an `!important` root override, because the appearance writer owns the inline value) and checks the shell at 390 and 1440 wide for horizontal overflow, a rail inside the viewport and a rail that does not clip. The planted control (800%) fails the phone case with a 113px overflow. Not covered: 300%, and the topbar, panels and room at 200% (the suite mounts the ambient shell); the viewport audit below read the room at 1x only.

Dynamic Type, evaluated and not adopted. `font: -apple-system-body` on the root inside `@supports` would take the iOS base size (17px at the default Large setting, and up to roughly three times that at the accessibility sizes). Playwright's WebKit cannot emulate it: `CSS.supports("font", "-apple-system-body")` is false there, so the only evidence is by reasoning. The token `round()` snapping keeps line boxes whole at any root size, so the integer-line-box law does not forbid it. The cost is the visible one the ruling names: every iPhone's base size moves from 16 to 17px, which scales the whole approved type hierarchy by about 6% at the default setting, and the accessibility sizes need a layout pass that only a real device gives. Recommendation: defer, and decide after a device pass at the three largest accessibility sizes; owner call.

### Interop 2026

- Scroll-driven animations: adopted for `.scroll-fade-x` and `.scroll-fade-y`. Where `animation-timeline: scroll()` is supported (`@supports`), the band ramps over the first and last depth of scroll through registered private properties and no script runs in the loop. The `data-fade-*` attribute rules stay as the fallback, and the drivers in `@orb/ui/scroll-area` keep setting them for Firefox. `platform-scroll-fade.suite.ct.tsx` runs on Chromium and WebKit (red on the old stylesheet), including under reduced motion.
- `contrast-color()`: noted and deferred (table).
- Anchor positioning: not swapped (table).
- Custom Highlight API: no consumer (table).
- Vendor layer: `vendor` sits between `utilities` and `ui`, not before `theme`: KaTeX draws fraction rules and radicals with borders, and preflight's `border: 0 solid` reset would erase them below it. The app imports no Streamdown stylesheet (its classes are compiled by Tailwind through `@source`) and Shiki paints with inline styles, so KaTeX is the only imported vendor sheet. The Streamdown `content-visibility: visible !important` override stays: the library sets it as an inline style, which no cascade layer can beat, only `!important` can. CodeMirror injects its own unlayered `<style>` at runtime; a layer cannot reach it, so it is the one vendor sheet outside the layer. The order statement moved to `layers.css` because a bundle can place the KaTeX chunk's CSS before the ui entry, and a layer ranks by its first appearance.

### WebKit verification

Playwright's WebKit on Linux is WebKitGTK/WPE with patches, not Safari: no iOS chrome, every safe-area inset reads 0, no soft keyboard, no standalone mode, no Dynamic Type, no `interpolate-size`. `pnpm exec playwright install webkit` downloads it (the browser lives in `~/.cache/ms-playwright`). WebKit needs the `libavif16` system package (`apt-get install libavif16`). `pnpm test:ct:webkit <paths>` runs the `webkit-iphone` project (the iPhone 15 descriptor) over `platform-*.suite.ct.tsx`; the default `pnpm test:ct` never starts it.

| iOS specific | verified by | result |
| - | - | - |
| 16px input floor | `platform-fields.suite.ct.tsx` on both engines at a coarse pointer | holds |
| safe-area coverage in landscape | Chromium with `Emulation.setSafeAreaInsetsOverride`: the grid pays the top and both side insets at 844x390 and 390x844; WebKit records what it reports (0) | grid pays; the bottom edge reads `safe-area-max-inset-bottom`, which the override leaves at 0, so it needs a device |
| `100dvh` with the keyboard | the grid fills the dynamic viewport at both sizes on both engines | holds without a keyboard; the keyboard needs a device |
| standalone status bar and `theme-color` per theme | structure only: `index.html` carries the `default` status-bar style and the per-scheme pair, and `use-appearance-root-effects.ts` writes the per-theme value | device |
| no `-webkit-overflow-scrolling` | stylelint refuses it | none in the tree |
| `overscroll-behavior` on the shell | `html` and `body` carry `overscroll-behavior: none` and `overflow: clip`; the suite reads both on both engines | holds; rubber-banding needs a device |

Only a real iPhone can confirm: insets on a notched device (including the bottom edge), the soft keyboard and `dvh` together, the standalone status bar and `theme-color`, rubber-banding, focus zoom on a field, Dynamic Type, and the real Safari value of `hanging-punctuation` and `text-wrap: pretty`.

### Viewport conditions (the standard)

The conditions are defined once in `tokens.json` and generated into a `@custom-variant` and a `MEDIA_QUERIES` entry each. Components answer to their own pane through container queries; the viewport answers only for the shell, the platform's capabilities and the user's preferences. A wide screen is handled by a cap (the reading measure, `chatWidthPct`, `width.surface-cap`), never by a breakpoint. No condition names a device class: a condition names the fact a layout depends on.

| condition | query | reason |
| - | - | - |
| `shell-desktop`, `shell-mobile` | width above and at or below 48rem | the desktop shell cannot fit at 768px, so 768 is mobile |
| `shell-narrow` | width at or below 64rem | a docked side panel becomes a slide-over |
| `shell-short` | height at or below 20rem | the topbar, the composer and one transcript line no longer fit together |
| `pointer-coarse`, `pointer-fine` | pointer | touch-target budgets |
| `hover-capable` | `(hover: hover)` | a reveal that needs hover |
| `motion-reduce`, `transparency-reduce`, `contrast-more` | the `prefers-*` queries | the user's OS preferences |
| `forced-colors` | `(forced-colors: active)` | the forced palette |

`print` stays Tailwind's built-in variant: the condition contract admits parenthesised queries only, and `print` is a media type.

Audit results, on the real-database isolated stage:

- Phone landscape: at 844x390 and 932x430 the shell is the desktop shell (the width is above 48rem): a 56px rail, no tab bar, a 48px topbar. In a room the transcript keeps 172px at 390 high and the composer 48px, which is usable. With the on-screen keyboard open the layout viewport shrinks to 844x190 and the topbar plus the composer leave the transcript no box. `shell-short` is added for that case with one consumer: under it the room scrolls and the transcript keeps the `height.scroll-sm` floor (160px at 190 high; the room then scrolls 188px). `platform-shell.suite.ct.tsx` pins the rule through a probe that wears the public slot names.
- Ultrawide at 3440x1440: characters, config, refinery, databank, presets and plugin pages already cap their content. Home and Explore spread across the whole pane (two columns near 1650px each), so `width.surface-cap` (120rem) centres them; a 1920-wide window's pane is narrower than the cap, so nothing at or below that width moves. The chat transcript is capped by the reading measure (750px), but the composer and the above-composer band followed the `chatWidthPct` track (1720px at 3440). Owner ruling: they never exceed the content column. `orb-composer-track` (client globals) takes the dial's width capped by the column's own `calc(var(--reading-measure) * var(--appearance-reading-body-scale))`, on the prose font, because a `ch` resolves in the element's own font and rounds to whole pixels (15px gives 10px, 16px gives 11px, so no ratio reproduces the column's width from the room's 16px font). `COMPOSER_TRACK` in `chat-track.tsx` carries it for the composer, its strips, the next-turn line and the above-composer band. `platform-room.suite.ct.tsx` asserts at 3440 that the composer is no wider than the column (1720px against 750px on the old track) and that a dial narrower than the measure still narrows it. The dial's channel is leg 9's and is unchanged.
- Hover: Tailwind's own `hover` and `group-hover` variants are already wrapped in `@media (hover: hover)`. The gap was the reveals keyed on pointer size: `ROW_REVEAL`, `PIN_REVEAL`, the message-actions reveal and the inert-until-hover cluster used `pointer-coarse` (shown) and `pointer-fine` (inert), so a fine pointer without hover (a stylus tablet) kept them hidden for good. They are keyed on `hover-capable` now (`HOVER_REVEAL` and `INERT_UNTIL_HOVER` in `packages/ui/src/lib/hover-reveal.ts`); `hover-capable:` is refused in features by the pointer gate. Layout swaps that trade touch-target budget stay on `pointer-coarse`. The `float` arm of `listRowVariants` in `@orb/ui` keeps its `pointer-fine` twin (the primitives lane); `hover-reveal.ct.tsx` proves the client fragments through the compiled media conditions, because Chromium cannot emulate a fine pointer that cannot hover.

### Safari 18 floor

Each adopted property either has a Safari 18 fallback or degrades harmlessly (support from web-features 3.43.0 and MDN):

| property | Safari 18 | result |
| - | - | - |
| `text-wrap: balance`, `overflow-wrap`, `touch-action`, `text-underline-offset`, `@property`, `:has()`, `forced-colors`, `@media print`, the hover media feature | supported (17.5, 7, 13, 12.1, 16.4, 15.4, 16, 1, 9) | works |
| `accent-color` | the dataset lists 26.2 | native controls keep the system tint |
| scroll-driven fades | not supported (26) | `@supports` is false, so the `data-fade-*` attribute rules and the drivers carry the fade |
| `overflow-block`, `overflow-inline` | not supported (26) | the sheets spell the axes `overflow-y` and `overflow-x` (the shell-short rule, the panel body, the code block), and stylelint ignores those two properties in the logical-property rule |
| `forced-color-adjust` | not in the dataset | an unsupported declaration only drops the tab indicator's Highlight fill under forced colors |

`field-sizing: content` (Safari 26.2, Firefox 152): the `Textarea` primitive measures and sizes the box in script where `CSS.supports("field-sizing", "content")` is false (`use-field-sizing-fallback.ts`), within the same min and max rows. The topbar rename field declares the property, but its inline size is `100%`, so the property never sized it and it needs no fallback. Existing sites the floor puts at risk, not changed by this leg: `scrollbar-color` and `content-visibility` degrade to default scrollbars and no off-screen skipping.

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

`docs/law/UI-Theming-and-Content.md` §12 (the Tier A clamp's `radius` snap keeps reading `--radius-*`), `docs/law/client-architecture-lockdown.md` §4 (CSS homes, the shell `@media` exception becomes a `@variant`), `docs/law/ui-package-design.md` §4, `docs/law/UI-Density-Law.md` §4.3 and `docs/law/integer-line-boxes.md` (the `--spacing-touch-target` spelling), `packages/ui/tokens.build.ts`, `packages/ui/token-contract.ts`, `packages/ui/src/styles/theme.css`, `packages/ui/src/lib/class-merge.ts`, `tooling/src/eslint/*`, `stylelint-rules.ts`, `stylelint.config.ts`, `eslint.config.ts`, `tests/ui/token-contract.test.ts`, `tests/tooling/native-token-scales.test.ts`, `tests/tooling/css-merge-parity.repo.int.test.ts`, `tests/support/browser/touch-floor*`.

## Test plan

- Contract: a planted raw value in `spacing.row`, a planted `{spacing.field}` alias on `spacing.row`, a planted unreferenced primitive step, and a planted raw `orb.pointerFine` each fail `tokens:build`; the shipped vault passes.
- Variable diff: a script resolves every `--*` in `theme.css` before and after; the only differences are added `--primitive-*`, `--spacing-<size>` renamed to `--size-<size>`, added `--breakpoint-*`, and the leg 3 additions.
- Conditions: `MEDIA_QUERIES["max-shell"]` equals the media params Tailwind compiles for `max-shell:`; a planted `matchMedia("(pointer: coarse)")` literal fails lint; a planted `@media (width > 48rem)` fails stylelint; a planted `md:`, `p-4` or `@min-[100rem]:` fails lint; a planted numeric inline height fails lint.
- Rendered: `pnpm snap` on an isolated stage at 1440 and 390 (coarse touch emulation) for home, a chat room, characters, config and refinery, before and after each commit, with `--diff` and a computed-geometry eval; every difference must match a row in that leg's change table, and a difference no row names is a defect.
- Suites: `tests/ui/token-contract.test.ts`, `tests/tooling/native-token-scales.test.ts`, `tests/tooling/css-merge-parity.repo.int.test.ts`, `tests/ui/content/theme-scope/*`, `tests/kit/theme-derivation`, the shell and theme CTs, whole-tree `pnpm lint:eslint packages tooling tests`, `pnpm exec stylelint "packages/**/*.css"`, `pnpm typecheck`, `pnpm depcruise`.

## Open verification

WebKit and macOS behaviours Chromium on Linux cannot show: the iOS focus zoom floor (`text.field` at 16px), `env(safe-area-inset-*)` on a notched device, `interactive-widget=resizes-content` with the real keyboard, `-webkit-text-size-adjust` (set by Tailwind preflight), and the root font-rendering set (`-webkit-font-smoothing` / `-moz-osx-font-smoothing` change nothing on Linux; `font-synthesis: none` only shows where a requested face is missing). These are checked by structure (the literals survive every migration) and need a device pass.
