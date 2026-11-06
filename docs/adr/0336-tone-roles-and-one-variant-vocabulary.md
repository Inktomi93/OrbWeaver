---
kind: adr
status: active
updated: 2026-11-05
---

# Intent colors derive tone roles, and primitives share one tone, variant and size vocabulary

## Context

Each primitive hand-mixes its own intent tints with opacity modifiers, so one meaning paints differently on Badge and Card. The same axis name means color on one primitive and fill style on another, and Button's `intent` mixes both. A translucent tint has no fixed contrast: its pair depends on the host under it.

## Decision

Tones. A tone is an intent color: `primary`, `neutral`, `destructive`, `warning`, `success`, `info`. The intent tokens keep their names and stay hand-tuned `light-dark()` bases under D71. `secondary` is not a tone, because its fill is the neutral ramp.

Roles. Every tone has the roles `solid`, `solid-hover`, `solid-active`, `text`, `text-on-tint`, `tint`, `tint-active`, `edge` and the paired `foreground`. A colored tone derives them from its base `B`, its foreground token and the scope's colors:

| Role | Value |
| - | - |
| `solid` | `B` |
| `solid-hover`, `solid-active` | `color-mix(in oklab, B 90% or 80%, light-dark(black, white))`, away from the page ink |
| `text` | `color-mix(in oklab, B 80%, var(--color-foreground))` |
| `text-on-tint` | `color-mix(in oklab, B 62%, var(--color-foreground))` |
| `tint`, `tint-active` | `color-mix(in oklab, B 14% or 22%, H)` |
| `edge` | `color-mix(in oklab, B 30%, H)` |
| `foreground` | the intent's `-foreground` token |

Hosts. `H` is the surface under the wash, `var(--tone-host, var(--color-background))`. [D338](0338-tone-hosts-and-carried-scope-literals.md) owns the hosts and the `tone-host-<host>` utilities.

`neutral` binds the derived ramp instead: `solid` is `foreground`, its foreground is `background`, `text` is `foreground`, `tint` is `muted`, `tint-active` is `accent`, `text-on-tint` is `accent-foreground` and `edge` is `border`. Its hover and active steps mix toward `background` by their own knobs. The ramp's inks stay solved by D202, and `accent-foreground` covers both neutral tints.

The mix space is OKLab, because OKLCH interpolates hue toward the background's hue. An opaque tint has one fixed contrast pair. A seed palette's roles use `color-mix()` only: a mix over a `light-dark()` intent already ships on every supported browser through Tailwind's opacity modifier. A carried scope also emits literal role colours, under D338.

Scope. `tokens.build.ts` emits one `[data-tone="<tone>"]` block per tone that declares each `--color-tone-<role>` with its formula. The role resolves on the stamped element, so it follows the nearest ThemeScope or seed palette. A role is never a `:root` variable, because a root formula freezes to the root palette. The mix amounts are percentage tokens, `--tone-mix-<role>`. `--color-tone-*` is registered in `@theme reference`, which mints the `*-tone-*` utilities and serves no root variable. A primitive that reads a tone utility stamps `data-tone` on its root, `neutral` by default. The stamp overrides the variant-axis stamp; a displaced axis value moves to `data-variant`.

Contrast. Foreground on `solid`, `solid-hover` and `solid-active` clears 4.5:1. `text` clears 4.5:1 on `background`, `surface-raised`, `card`, `popover` and `sidebar`, the hosts `--color-foreground` covers under D202. `text-on-tint` clears 4.5:1 on `tint` and `tint-active`. A tint or an edge never carries meaning alone, so neither has a floor as a mark; a mark that does, such as a meter fill or a status box's border, paints `solid`. A colored tone's tints carry the page inks instead: `foreground` and `muted-foreground` clear 4.5:1 on `tint` and `tint-active`, because a selected row, an active tab and a compare panel keep their title and meta inks on a tint. Each tint recipe names them as its `pageInks`. The neutral tone's tints are the ramp's `muted` and `accent`, whose ink is `accent-foreground`, so a call site that keeps a page ink on a neutral tint paints `text-on-tint` instead. So does a hovered interactive Card: `card-foreground` is solved for the card alone. [D338](0338-tone-hosts-and-carried-scope-literals.md) sets the hosts each floor is judged on. The token build fails a shipped palette under a floor or a separation.

Vocabulary. Every primitive spells color as `tone`, fill style as `variant` and control scale as `size`.

- `variant` is one of `solid`, `soft`, `outline`, `ghost`, `link`; a primitive admits the subset its box can draw. Card admits `surface` (the card fill with the tone edge), `soft` and `outline`. A variant paints only with `*-tone-*` utilities, so every tone works with every variant without compound variants.
- `size` is the control scale `chip`, `sm`, `md`, `lg` in `CONTROL_SIZE`: height, inline padding and type step. Every control takes it. `chip` keeps the touch-target height, never a `--size-control-*` step.
- A box that is not a scale step leaves `size`. Button takes `square` for icon-only and `wrap` for multiline. Its glyph, inline-text and picture boxes become named components.
- Text, Icon and the fill-less Button variants take `tone` for intent color and `ink` for the named inks: `muted`, `foreground`, `accolade`, the transcript inks, `prose`, `toneForeground` and `inherit`. The prop types make `ink` and a non-neutral `tone` exclusive, except `toneForeground`, which names the tone it is the ink of.
- State keys off `data-disabled`, `data-pressed`, `data-open`, `data-selected`, `aria-busy`, `aria-invalid`, `aria-current` and `aria-expanded`. No boolean prop restates one.
- Button `variant="solid" tone="primary"` is the focal action under CD3 and draws the CTA lift unless the call site passes `focal={false}`. It is the default Button.
- Use-specific values leave Card, Text, Button, ListRow, Badge and the layout boxes for named components. Each primitive's `variants.ts` holds its subset.

This amends D62 P5. A bordered secondary action is `variant="outline" tone="neutral"`. `outline` is a variant of every pressable primitive. `ghost` inherits its host ink unless the call site names an `ink`. It also amends the primitive axis table in [UI-Density-Law](../law/UI-Density-Law.md) §4.3 for these primitives.

Constraint. `RESTRICTED_CLASSES` in `eslint.config.ts` refuses an opacity modifier on an intent or tone color in any class string. An ESLint rule refuses `color-mix()` or relative color naming an intent or tone color in TypeScript. A Stylelint `orb/` rule refuses the same in authored sheets. Generated CSS and the generators that emit it are exempt. A pigment recipe that uses an intent hue for art moves into `orb.pigments` in tokens.json, emitted on a `[data-pigment]` block its art root stamps. Neutral glass mixes over appearance channels stay under D144.

Homes: `packages/ui/src/tokens/tokens.json` (the tone tuple, role recipes and mix tokens), `packages/ui/tokens.build.ts` and `packages/ui/tokens.tones.ts` (the scoped blocks and the build contrast and separation check), `packages/ui/src/lib/control-size.ts` (the scale), each primitive's `variants.ts` (the subset).

## Consequences

A custom theme gets correct tints and inks with no new user field. A new tone is one tuple member and its base token pair. Every literal call site of the renamed axes moves in one step per primitive.

## Alternatives rejected

- Per-intent role variables on `:root`: they resolve once at the root and ignore a nested palette.
- Relative color over a `light-dark()` intent: no shipped evidence on the supported browsers.
- Mixing in OKLCH: a destructive tint over Hearth lands at hue 55 instead of 30.
- Translucent tints: their contrast depends on the host, so the build cannot check them.
- One fixed hover direction toward the foreground: it fails the Light palette's solid-active pairs.
- A `secondary` tone: its soft fill is the neutral tone's tint.
- An `xl` control step: no control uses it.
- A scoped feature stylesheet keyed by a feature attribute: lockdown §4.1 closes the CSS homes to features.
- Renaming the per-component shadow utilities: no measured defect, and D200 already derives them from ingredients.
