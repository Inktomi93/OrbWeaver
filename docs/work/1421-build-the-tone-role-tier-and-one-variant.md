---
kind: work
status: open
updated: 2026-10-30
priority: P1
area: ui
plan: css-system
---

# Build the tone role tier and one variant vocabulary for the ui primitives

## What

Give @orb/ui a derived role tier between the theme tokens and the primitives, and one axis vocabulary across the primitives, so every surface draws color and control size from the same few named roles.

Current defects:

- Primitives use the same axis names for different things. On Card, `tone` is color. On Badge, `intent` is color and `tone` is fill style. On Button, `intent` mixes fill style (`outline`, `ghost`, `link`, `bare`) with color (`destructive`, `primary`) and `tone` is an axis whose values are all empty.
- Each primitive hand-writes its own intent tints with opacity modifiers and `color-mix`. Badge soft success is `border-success/30 bg-success/8`; Card `successTint` is `border-success/40 bg-success/10`. The same concept paints differently.
- `CONTROL_SIZE` sets control heights only; Button adds many sizes of its own.
- Card, Text, Button, ListRow and Badge carry use-specific variant values (message bubbles, sidebar edges, drop targets, floating chips, field hosts) beside their generic axes. The layout variants in `packages/ui/src/layout/variants.ts` (`Stack`, `Row`, `Section` and the toolbar parts) carry visual-state axes (`receded`, `highlight`, `spoiler`, `lifted`, `stateFill`, `opacityMotion`, `slide`); layout primitives keep only layout axes. Other primitives are behavior-heavy with few axes and stay as they are.

Target structure:

1. Role tokens. For each intent (primary, secondary, neutral, danger, warning, success, info), eight roles: `solid`, `solid-hover`, `solid-active`, `text`, `text-on-tint`, `tint`, `tint-active`, `edge`. Author them in `packages/ui/src/tokens/tokens.json` with a new `orb.output.kind` value `derived` that `tokens.build.ts` emits as CSS formulas over the intent base and `--color-background`, for example `color-mix(in oklch, var(--color-destructive) 14%, var(--color-background))` for `tint` and `oklch(from var(--color-destructive) calc(l - 0.06) c h)` for `solid-hover`. Intent bases stay hand-tuned `light-dark()` tokens. Because roles derive from the live background, a custom theme set through ThemeScope gets correct tints with no new user fields.
2. Tone scoping. Generate `[data-tone="<intent>"] { --tone-<role>: var(--color-<intent>-<role>) }` blocks and register `--tone-*` in the Tailwind `@theme`, giving `bg-tone-tint`, `text-tone-text`, `border-tone-edge` and the rest. Text on a solid fill uses the intent's foreground token. A primitive's `tone` axis only stamps `data-tone`; its fill-style axis uses only `*-tone-*` utilities, so every tone works with every fill style without compound variants.
3. Axis vocabulary for every primitive: `tone` is color (an intent), `variant` is fill style (`solid`, `soft`, `outline`, `ghost`, `link`), `size` is the control scale. State styles key off the attributes Base UI and ARIA already set (`data-disabled`, `data-pressed`, `data-open`, `aria-busy`, `aria-invalid`, `aria-current`) instead of extra boolean props.
4. Shadows stay under D200: every shadow composes from the derived ingredient colors, resolved on the consumer, never an independent ramp with its own colors. Optional within that rule: rename the per-component shadow values (`shadow-cta`, `shadow-glow`, `shadow-prose`, `shadow-shell-over-art`) to purpose-named levels such as `card`, `raised`, `menu` and `overlay`, after confirming each existing value already composes from the ingredients.
5. Control scale: height, inline padding and text step per size (`sm`, `md`, `lg`, `xl`) shared by Button, Input, Select, Toggle and other controls so mixed rows line up.
6. Use-specific variant values move out of Card, Text, Button, ListRow and Badge into small named components or the page templates that own them. Card returns to a surface whose elevation follows interactivity and whose padding follows its container.
7. One scoped override layer per feature, keyed by a feature attribute, instead of ad hoc `className` overrides on primitives.

Migration uses repo codemods under `tooling/src/codemods/` (load the `codemod` skill):

- `rewrite-class-tokens` and `class-token-to-prop`: opacity-modifier tints and hand mixes to role utilities plus `data-tone`.
- `text-axes-to-voices`: the precedent for renaming primitive axes at every call site; copy it for the Badge and Button axis changes.
- `rename-css-custom-properties` and `consolidate-css-layers`: shadow, z and CSS-side renames.
- `root-attribute-to-variant`, `rename-identifier`, `move-import-names`: use-specific variant values to their own components.
  Ambiguous call sites (a Button that sets both a fill style and a color through `intent`) are flagged for hand review, never guessed.

Order: role tokens and tone scoping with contrast checks; axis vocabulary and lint; control scale; use-specific variant extraction. Each step lands alone and leaves the app working.

This is the next phase of the css-system plan (`docs/plans/css-system/design.md`); extend that plan, keep its one-vocabulary and no-alias constraints, and do not start a second system. It needs an ADR for the role tier and the axis vocabulary that also amends D62 P5 (which says Button has no `outline` intent; the code has one) (the token pipeline is ruled under D42; read `UI-Density-Law.md`, `client-architecture-lockdown.md` §4 and `ui-package-design.md` before drafting) and a plan under `docs/plans/` for owner sign-off before any lane starts.

## Why

Tokens, the type ramp and spacing are already governed, yet surfaces still drift because each primitive invents its own tints, shadows and use-case variants under inconsistent axis names. A derived role tier and one vocabulary remove those choices from callers, which is what makes a design system read as consistent.

## Done when

Every intent has the eight derived roles in each shipped theme and under ThemeScope custom themes, with contrast checked for every role pairing in the token build and in the ThemeScope clamp. Card, Text, Button, ListRow and Badge use only `tone`, `variant` and `size` color and fill axes over `--tone-*` utilities; their use-specific variant values live in named components. Control size comes from the control scale. ESLint and stylelint refuse opacity modifiers on intent and tone colors, `color-mix` and relative colors outside generated CSS, arbitrary color classes at zero findings with no waivers. Production-mounted CTs prove a tone and variant matrix in each shipped theme and a custom theme, and the codemods ship with fixtures.

## Evidence

Filled at landing: what ran and where its output is.
