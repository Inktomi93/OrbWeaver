---
kind: plan
status: active
updated: 2026-10-24
---

# One CSS system: ramps, aliases and a pinned owner-CSS surface

## Goal

Every design value comes from a closed ramp, every semantic token aliases a ramp step, and Tailwind exposes only the governed vocabulary. Owner custom CSS targets a declared, test-pinned surface that a refactor cannot break silently.

## Shape

Not yet built.

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

- Whether `stylelint.config.js` and `stylelint-rules.js` can be TypeScript under the installed Stylelint, so they are typechecked and linted like the rest of the repo.
- Whether the ramp primitives move from `@theme` to the served `:root` so owner CSS can reference them (leg 2 decides).
- The theme suites the law names (emit surface, palette contrast, theme emit pairing, seed theme pairing) exist only in the restoration register, not in the tree.

Tiers. tokens.json gains a primitive tier: radius sm/md/lg/xl/full, a space ramp on one grid, a type ramp on one ratio, and size steps for controls, avatars and glyphs. Only primitives hold raw values. Every semantic token (radius.control, spacing.row, text.label) becomes a DTCG alias to a primitive. Component sizes leave the spacing group for a size group. token-contract.ts refuses a raw value in the semantic tier and an alias that skips the ramp. DTCG 2025.10 supplies aliases, group $extends, $deprecated and the resolver's modifiers, which already carry the themes; density can become a resolver modifier instead of a hand-repointed tier.

Tailwind. theme.css resets each governed namespace to initial and keeps only the token values plus --spacing-0 and --spacing-px. A reset removes the default scale, so p-4, max-h-96 and size-19 stop compiling while p-0, inset-0, min-w-0 and w-px stay. better-tailwindcss no-unknown-classes is already an error, so each removed class becomes a lint finding: the reset is the migration list. Namespaces: spacing, text, leading, tracking, container, font-weight and breakpoint. Arbitrary values survive a reset; no-arbitrary-tw-values and better-tailwindcss no-restricted-classes cover them. Enable no-conflicting-classes and no-duplicate-classes.

Stylelint. The hand-written CSS files gain declaration-property-value-allowed-list entries for radius, gap, padding, margin, font-size and z-index that admit only var(--token) references and the structural literals the shell exception in client-architecture-lockdown.md allows. The existing orb rules keep colour and motion.

Conditions. Viewport, pointer, orientation and preference conditions get one vocabulary. The shell breakpoint is a token today and is also spelled as raw `@media` widths in CSS and as the Tailwind default `md:` in TSX; pointer conditions have two spellings in TSX and raw `matchMedia` strings in TS. CSS custom properties do not work inside `@media`, so the home is generated: tokens.build.ts emits the Tailwind `--breakpoint-*` namespace (defaults reset) and one `@custom-variant` per named condition (coarse, fine, reduced motion, reduced transparency, more contrast, portrait, landscape), and a typed TS module exports the same query strings for `matchMedia`. Hand-written CSS uses the generated variants or `@custom-media`-style named conditions instead of raw widths.

Owner CSS surface. The stable API is the data-slot values, the .shell-\* classes and the public custom properties (the THEME_SCOPE_EMIT_VARS colours plus the ramp primitives). A pinned manifest test lists them; removing or renaming one fails the test and requires a recorded deprecation. Owner custom CSS stays unlayered and validated by validateThemeCss.

Sprawl. shell.css and both globals.css files drop history comments, dead rules (found with the dead-css check in snap) and one-off literals, and shell.css splits by region.

Legs, in order:

1. Primitive tier plus aliases with every current value unchanged, and the contract rule. No pixel change.
2. The owner-CSS surface manifest and its pin test.
   2b. The conditions vocabulary, with no pixel change.
3. Tailwind namespace resets; the lint findings are the migration list, and each off-ramp class maps to a token.
4. Stylelint allow-lists over the hand-written CSS.
5. The ramp values themselves: an owner design decision, with side-eye before and after on the main surfaces.
6. The CSS file cleanup.

## Rejected

A second token vocabulary beside DTCG (cssValues is not one). Hand-authored theme blocks. Keeping the Tailwind default scale beside the tokens, which is how off-ramp values entered. Freezing current names for compatibility before any owner has written custom CSS.

## Coupled sites

The owner CSS and Tier A token-override contract in docs/law/UI-Theming-and-Content.md, whose dimension clamp snaps to the token scale. The CSS homes and shell exception in docs/law/client-architecture-lockdown.md. docs/law/ui-package-design.md, packages/ui/tokens.build.ts, packages/ui/token-contract.ts, packages/ui/src/styles/theme.css, eslint.config.ts and stylelint.config.js.

## Test plan

Leg 1: tokens:build output is byte-identical except for added primitives, and the contract refuses a planted raw semantic value. Leg 2: the manifest test fails on a planted rename. Leg 3: a planted p-4 fails lint, and CTs and snap on the main surfaces show no unintended change. Leg 5: side-eye before and after at desktop and phone.
