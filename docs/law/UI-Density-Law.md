---
kind: law
status: active
updated: 2026-09-13
---

# UI density law — the assignment law for the token scales

> Scope: visual density in `packages/ui/src` + `packages/client/src`. Not IA, not color (D71 owns palettes), not motion. § numbers are STABLE — code comments, gate messages and the `density-tier` reviewed-grant rows cite them by number.

## 1. Why this law exists

The token scales exist, but nothing states which surface class uses which step. Without an assignment, a feature picks by taste and converges on the loosest, boxiest option. Three habits recur:

| habit | what it looks like |
| - | - |
| box-in-box chrome stacking | a bordered/rounded card inside a bordered/rounded card inside a panel |
| form primitives building instrument surfaces | an instrument pane composed from settings-row / `Card` airiness |
| uniform visual weight | nothing recedes, so everything competes |

This law follows the 8pt grid with a 4pt sub-grid (4pt inside a component, 8pt between components, a non-linear widening scale) and a named shape scale with a per-component-class assignment.

## 2. The scales

### 2.1 Radius — every step is assigned

`--radius-card` is NOT the default; it is the ELEVATED-only step (D6).

| step | value | the only legal consumers |
| - | - | - |
| `--radius-inset` | 0.25rem / 4px | sub-control marks INSIDE a component: keycap, qty badge, segment tick, ghost socket, swatch |
| `--radius-control` | 0.375rem / 6px | anything you operate: button, input, tab cell, item cell, icon button, menu item |
| `--radius-base` | 0.5rem / 8px | grouped content INSIDE a surface: instrument card, portrait, selected list row |
| `--radius-card` | 0.625rem / 10px | ELEVATED / floating islands ONLY: modal, popover, drawer, toast, composer, chat bubble, top-level form group |
| `--radius-full` | pill | chips, badges, avatars, pills, orbs |

### 2.2 Spacing — six steps, assigned per nesting level

| step | value | intent |
| - | - | - |
| `--spacing-tight` | 0.25rem / 4px | atom gaps INSIDE an island: label↔bar, glyph↔text, value↔caption |
| `--spacing-field` | 0.375rem / 6px | related controls within one field group |
| `--spacing-row` | 0.5rem / 8px | between rows / island inner padding at instrument tier |
| `--spacing-block` | 0.75rem / 12px | between blocks / surface inset |
| `--spacing-section` | 1.5rem / 24px | between sections |
| `--spacing-gutter` | 2rem / 32px | page/region gutters |

**Do NOT re-tune `--spacing-field` to 4px "to fix the grid"** (D3): with `tight` present, 6px is the deliberate 2pt sub-step between 4 and 8.

### 2.3 Type — the closed `voice` axis

The seven type sizes are correct and are NOT re-derived (D4 — no measured defect, and a re-derivation churns every surface).

The defect was the KNOB SPACE: `size` (7) × `weight` (4) × `tone` (6) × `transform` (2) = 336 legal combinations, chosen per call site by taste — the mechanism by which nothing recedes. **The law is one CLOSED `voice` axis.** `size`/`weight`/`tone`/`transform` are `@orb/ui`-INTERNAL; a feature passes `voice` and nothing else (enforced: `density-tier` case A3).

The founding grammar — a surface's copy is one of four things:

| voice | means |
| - | - |
| `kicker` | a section's NAME; never a datum. Paired with `<Section kicker>`'s hairline rule, it is the CD1 replacement for a box |
| `label` | the name of ONE datum |
| `datum` | the value — the thing you came to read (mono + tabular, so figures do not jitter as they tick) |
| `gloss` | the quiet explanatory second line |

**The tuple in `packages/ui/src/primitives/text/variants.ts` is the truth, not a list here** — the axis has grown past four (the content voice, the display voices, the receded twins, the decorative monogram), and a doc table of entries rots the day a voice lands. Each entry's meaning and its discriminator live beside its class string in that file.

**Adding a voice is a RULING, not a convenience.** A new entry enters only with a stated discriminator against its NEAREST existing neighbour — which axis differs (step · face · tabularity · ink · weight · tracking) and why the neighbour's entry is wrong for the case. A voice that resolves to an existing entry's class set is a rename, not a voice. The failure this prevents is real and recurring: a feature one axis short of an existing voice spells `size`/`weight` through `className` instead, which case A3 structurally cannot see.

`datum` rides `text-label` rather than a new 11px step (D5): 11px is a 4.8% ratio move off `micro` — too fine to be a real scale step, and mono + tabular already separates it visually.

## 3. The tier map

**Top axis: `instrument` vs `form`.**

- **instrument** — read-mostly, glanceable, many data per cm². You SCAN it. Density is the feature; chrome is subtracted until only the data is left.
- **form** — write-mostly, one decision per row, airy. You OPERATE it. Chrome carries grouping and affordance.

A surface has exactly ONE tier. A `form` island inside an `instrument` surface is legal and common (an inline-edit popover), and the reverse is too (a readout inside a settings pane) — it is a nested `<Surface tier="form">`. **Nesting a Surface inside a Surface of the SAME tier is RED** (it means someone wrapped for no reason).

### 3.1 Surface class → tier → steps

| surface class | tier | surface inset | between blocks | island pad | atom gap | island radius | islands carry border+bg? |
| - | - | - | - | - | - | - | - |
| CONTEXT panel viewport (rpg tabs, meta tabs) | instrument | `p-block` | `gap-row` | `p-row` | `gap-tight` | `rounded-base` | only interactive cells |
| LIST panes (collection rows) | instrument | `p-field` | `gap-tight` | `p-row` | `gap-field` | `rounded-control` | no — selection is a bg tint, not a box |
| chat transcript | instrument | `p-block` | `gap-row` | `p-block` (bubble) | `gap-field` | `rounded-card` (the bubble IS the elevated island) | yes — one box, never nested |
| composer | instrument | `p-row` | `gap-field` | `p-row` | `gap-field` | `rounded-card` | yes — it floats |
| settings panes | form | `p-section` | `gap-section` | `p-block` | `gap-row` | `rounded-card` (group card only) | group card yes; a setting row never |
| entity editors (character / preset / world-info) | form | `p-section` | `gap-section` | `p-block` | `gap-row` | `rounded-card` | group card only |
| modals / dialogs / popovers / drawers | form | `p-block` | `gap-block` | `p-block` | `gap-row` | `rounded-card` | yes — they float by definition |
| library grid cards | form | `p-block` | `gap-block` | `p-block` | `gap-field` | `rounded-card` | yes — a grid cell IS an interactive island |
| toolbars / chrome rows / strips | instrument | `px-block` | `gap-row` | — | `gap-field` | `rounded-control` (cells) | no |

### 3.2 The chrome diet — three rules

- **CD1 — border + radius + background is reserved for INTERACTIVE ISLANDS and ELEVATED surfaces.** A read-only grouping gets a `kicker` (caps label + hairline rule) and nothing else. If you cannot click it, drag it or select it, and it does not float above the page, it is not a box.
- **CD2 — one box deep, maximum.** A bordered/rounded/filled element whose ancestor is also bordered/rounded/filled is RED. Alignment and separation INSIDE a box are done with hairlines (`border-t` on siblings) and gaps, never a nested card.
- **CD3 — one focal element per surface.** Exactly one element per surface may carry accent fill, glow, or elevated shadow at rest. The visual twin of the one-`intent="primary"`-per-region rule: everything around the focal is deliberately quiet so it stays the one bold thing.

## 4. Mechanism — impossible by construction

Features cannot express the wrong thing because they never express spacing or radius at all (the D44 pattern). Three moving parts.

### 4.1 The tier attribute — ONE writer

`<Surface tier="instrument" | "form">` (`packages/ui/src/layout/surface.tsx`) is the ONLY code in the repo that writes `data-surface-tier`. It renders a containment-neutral wrapper — it does not duplicate `<Container>`'s `container-type`, it composes with it.

**An attribute, not a prop or a context**: the `no-layout-context-props` gate bans `density`/`compact`/`inDrawer` PROPS, and `UI-Architecture-and-Layout.md` §4 states density is the `data-*` attribute axis. This tier is the SURFACE-CLASS axis; the `data-density="comfortable|compact"` USER-PREF axis is orthogonal and untouched (D9).

### 4.2 The tier stylesheet — the map made executable

`packages/ui/src/styles/tiers.css` — hand-authored (it maps SLOT names to steps; slot names are not token data), UNLAYERED, imported beside `theme.css`.

```css
[data-surface-tier="instrument"] [data-slot="card-root"] {
  padding: var(--spacing-row);
  border-radius: var(--radius-base);
}
```

Two properties make it a SEAL rather than a suggestion:

1. **Unlayered beats layered.** Tailwind emits utilities into `@layer utilities`; unlayered CSS wins over any layered rule regardless of specificity (`theme.css` already relies on this). A primitive's own utility default is the tier-LESS fallback; the tier layer overrides it.
2. **`data-slot` already exists** on every primitive, so the map needs no new plumbing.

**The mechanism is proven by COMPUTED VALUE, never by reading this file or the stylesheet** — mount the primitive and assert `getComputedStyle(...)` equals the document-RESOLVED custom property, never a hardcoded px (§5.3).

### 4.3 Primitive API deltas the law forced

| primitive | delta | why |
| - | - | - |
| `Surface` | `tier` (required) | the one tier writer |
| `Card` | NO `padding` variant; `elevated?: boolean` | padding is tier-resolved; `elevated` is the explicit opt-in to `rounded-card` + shadow. **`Card` has no `padding` prop; that absence IS the enforcement** (D7) — a surviving prop is a surviving escape hatch |
| `Text` / `Heading` | `voice` (§2.3); `size`/`weight`/`tone`/`transform` are `@orb/ui`-internal | collapses 336 taste combinations to named intents |
| `Section` | `kicker` (caps micro label + hairline rule) + `kickerLayout: "stacked" \| "inline"` | the CD1 replacement for a box. The INLINE spelling makes the rule the section's own `border-top` and lets the kicker LEAD the control line — naming two groups costs +2px inline against +22px stacked |
| `Stack` / `Row` / `Grid` | `gap` carries `tight` | the small-end step |
| `ListRow` | no per-row border; selection is a bg tint + `rounded-control` | CD1 for the LIST class |
| `Button` | `intent="outline"` · `size="chip"` · the `selection: none \| on \| negated` state layer | `ghost`'s ink with `secondary`'s edge is what a filter chip needs and neither could spell it; a TRI-STATE facet cannot be a `Toggle` (`aria-pressed` has two values) |
| `Toggle` | `intent="outline"` + `intent="command"` · `size="chip"` · `shape` (`control`/`pill`) | a scope filter and a tag filter share one rail and must share one box; a view COMMAND that redraws the pane is not one of the words beside it |
| `lib/control-size.ts` | `CHIP_BOX` beside `CONTROL_SIZE` | the rail cell in ONE home for both pressable primitives. Its height is `--spacing-touch-target`, not a control step: pointer-conditional, so the box IS the tap floor |

Features keep composing `<Stack gap>` / `<Row gap>` explicitly — the gap union is already token-only. What is NOT a feature-level choice is ISLAND padding and radius.

**A radius differentiates nothing unless an edge draws it.** The chip pill radius was live and invisible for months because at rest the chips were transparent with a zero-width border — the measured defect that forced the `outline`/`chip`/`selection` deltas above.

## 5. Enforcement

### 5.1 The `density-tier` policy family

Two final `defineGate` policies share `tooling/src/verify/lib/density-tier.ts`. What they make RED, in one line each: `rounded-card` at a class-string site (A1) · a border+radius+background triple nested inside another (A2, = CD2) · a `features/**` call site passing the `@orb/ui`-internal type axes to `<Text>`/`<Heading>` instead of `voice` (A3) · `data-surface-tier` wherever it is written (A4) — all four in `density-tier`, each a reviewed grant where the site is a ruling · a tier-mapped `data-slot` stamped outside `packages/ui/src`, or a mapped slot no primitive emits, in the `hard` sibling `density-tier-slot-map`. **The case-by-case contract is `Core-Enforcement-Active-Gates.md`'s two rows plus each module's own header** — not restated here.

Two standing properties of its construction:

- **The population is the two declared roots `@client` + `@ui`**, which is where the fixtures' shallow and deeply nested `files` paths come from. A wrong path format must never read as a silent green instead of a red, so the fixtures keep both path depths.
- **The slot vocabulary is parsed out of `tiers.css` AT RUN TIME**, through the declared `product-css` resource, so the policy can never police a stale copy of the map. Comments are blanked before the sheet is parsed, so an illustrative `[data-slot="…"]` selector in a comment is not a mapping.

**Declared blind spot (also in the gate header):** a className assembled from a variable, a conditional, or a `cn(cond && X)` expression is INVISIBLE to a literal-shape reader — the gate scans string literals, template parts, and `tv()`/`cva()` object literals only. An AST reader blind to computed shapes reports a silent GREEN, which is why §5.3's computed-value CTs are a REQUIRED second check, not a nice-to-have.

### 5.2 The ruled sites are reviewed grants

A ruled call site is one exact `(subject, operation)` row in `tooling/src/verify/lib/reviewed-grants.ts` — the file it lives in and the act it performs — carrying a `why` and an `endsWhen`. A file ruled for two axes is two ruled acts. A grant names one exact file; no directory or path prefix is honored.

- **An unruled site is a blocking finding with no door.** There is no budget to land inside.
- **A ruled act with no live site is consumed zero times.** Central reconciliation raises `stale-reviewed-grant` for it.
- **A grant matching more than one finding is over-broad.** Central reconciliation raises `over-broad-reviewed-grant` for it.
- **A grant retires when its `endsWhen` comes true and its last live site disappears.**
- **Grants carry no per-file count.** Another site of an already-granted act in the same file is licensed by the existing grant; the gate header records this as a measured trade.

### 5.3 Computed-value CT assertions

`tests/ui/density-tier.suite.ct.tsx`. Authored-STRING assertions stay green through visual regressions; every assertion here reads back the RENDERED value:

1. `getComputedStyle(card).paddingTop` equals the document-resolved `--spacing-row` under `tier="instrument"` — resolve the var from the same document, never compare to a hardcoded px.
2. RELATIONAL: for the same primitive, form-tier padding > instrument-tier padding. This survives any future token retune; an absolute assertion does not.
3. `borderRadius` under `tier="instrument"` equals resolved `--radius-base`, and a nested elevated card equals `--radius-card`.
4. CD3: a fixture surface contains exactly ONE focal-marked element.
5. Nesting: a `form` Surface inside an `instrument` Surface resolves form steps for its own subtree — this proves the descendant selector, not just the root.

Mount once per test (a second `mount()` throws) — N tests, never N mounts in one.

## 6. Extending the map

Adding a surface class, a step, or a voice touches a fixed set. Land them together or the addition is half-registered.

| you are adding | coupled sites |
| - | - |
| a surface class row (§3.1) | the §3.1 row · the `tiers.css` rules for its slots · the surface's `<Surface tier>` call site · a §5.3 CT case if the class introduces a new slot |
| a token step (§2.1/§2.2) | `packages/ui/src/tokens/tokens.json` (with its `$description` stating the assignment) · `pnpm --filter @orb/ui tokens:build` (theme.css + tokens/index.ts are GENERATED) · the §2 table · the primitive variant union that exposes it. **A dead/unused token is a build error** |
| a `voice` entry (§2.3) | `text/variants.ts` (the tuple IS the truth) with the discriminator stated beside the class string · the §2.3 discriminator rule, NOT a new doc row · the `density-tier` grants that entry retires struck from `lib/reviewed-grants.ts` in the same commit |
| a `data-slot` the map keys on | the primitive that EMITS it · the `tiers.css` rule · A6 reds either half alone |

A sweep stage that converts call sites ends with a `side-eye` pass against the surface, and side-eye findings are fixed in full before the stage closes — side-eye is the polish authority here, not an advisory.

## 7. Ruled decisions (owner, standing)

| # | decision | ruling |
| - | - | - |
| D1 | instrument island padding: `row` (8px) or `field` (6px) | `row` — the approved mocks measure 8px vertical |
| D2 | add `--spacing-tight` (4px), or round the 3–5px cases up to `field` | ADD it — 4px is the 4pt-grid floor and the instrument internals live in that band |
| D3 | `--spacing-field` = 6px is off the 4pt grid; retune to 4px? | LEAVE it — with `tight` present it is the deliberate 2pt sub-step |
| D4 | re-derive the type scale on a 1.2 minor-third ratio | NO — no measured defect; a re-derivation churns every surface for aesthetics |
| D5 | `datum` voice = `text-label` + mono, or a new 11px step | `text-label` + mono — 11px is a 4.8% step off micro, too fine to be real |
| D6 | demote `rounded-card` to ELEVATED-only | YES — the single highest-leverage line in this law, and the biggest visible change |
| D7 | retire `Card.padding` (a breaking primitive API change) | RETIRE — a surviving prop is a surviving escape hatch |
| D8 | two tiers, or a third `gallery` tier for library grids | TWO — library grids map cleanly onto `form` |
| D9 | keep the user-pref `data-density="comfortable\|compact"` axis alongside tiers | KEEP, orthogonal |
| D10 | the exact instrument paddings in §3.1 are taste-level | ship the table; tune from a side-eye pass, never in the abstract |
| D11 | preset editor's compressed type ramp (10.5/13/15/16px, ratio 1.524:1) — accept and record, or widen a step | ACCEPT AND RECORD — a dense `form` may run a compressed size ramp (≥1.5:1 across its body sizes) when grouping is carried by the `kicker` voice + `Section` rules, not by size. Measured on the preset editor (`e51663b49`): `13px/500` ×28 (control labels), `15px/400` ×12 (body), `13px/400` ×5, `10.5px/600` ×5 (kickers), `16px/600` ×1 (the h2); the kicker's discriminating class string is `packages/ui/src/primitives/text/variants.ts:51` (`font-sans text-micro leading-micro tracking-micro font-semibold uppercase text-muted-foreground`). The page-level design-audit `flat-type-hierarchy` floor (`FLAT_HIERARCHY_MIN_RATIO = 2.0`) is UNCHANGED and still applies to the PAGE census — it clears when a display-tier voice (a `24px` section title, a preset-name h2) supplies the top step; this ruling exempts only a dense form BODY's own internal ramp, never the page-level floor |
