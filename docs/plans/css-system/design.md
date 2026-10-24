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

Tiers. tokens.json gains a primitive tier: radius sm/md/lg/xl/full, a space ramp on one grid, a type ramp on one ratio, and size steps for controls, avatars and glyphs. Only primitives hold raw values. Every semantic token (radius.control, spacing.row, text.label) becomes a DTCG alias to a primitive. Component sizes leave the spacing group for a size group. token-contract.ts refuses a raw value in the semantic tier and an alias that skips the ramp. DTCG 2025.10 supplies aliases, group $extends, $deprecated and the resolver's modifiers, which already carry the themes; density can become a resolver modifier instead of a hand-repointed tier.

Tailwind. theme.css resets each governed namespace to initial and keeps only the token values plus --spacing-0 and --spacing-px. A reset removes the default scale, so p-4, max-h-96 and size-19 stop compiling while p-0, inset-0, min-w-0 and w-px stay. better-tailwindcss no-unknown-classes is already an error, so each removed class becomes a lint finding: the reset is the migration list. Namespaces: spacing, text, leading, tracking, container, font-weight and breakpoint. Arbitrary values survive a reset; no-arbitrary-tw-values and better-tailwindcss no-restricted-classes cover them. Enable no-conflicting-classes and no-duplicate-classes.

Stylelint. The hand-written CSS files gain declaration-property-value-allowed-list entries for radius, gap, padding, margin, font-size and z-index that admit only var(--token) references and the structural literals the shell exception in client-architecture-lockdown.md allows. The existing orb rules keep colour and motion.

Owner CSS surface. The stable API is the data-slot values, the .shell-\* classes and the public custom properties (the THEME_SCOPE_EMIT_VARS colours plus the ramp primitives). A pinned manifest test lists them; removing or renaming one fails the test and requires a recorded deprecation. Owner custom CSS stays unlayered and validated by validateThemeCss.

Sprawl. shell.css and both globals.css files drop history comments, dead rules (found with the dead-css check in snap) and one-off literals, and shell.css splits by region.

Legs, in order:

1. Primitive tier plus aliases with every current value unchanged, and the contract rule. No pixel change.
2. The owner-CSS surface manifest and its pin test.
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
