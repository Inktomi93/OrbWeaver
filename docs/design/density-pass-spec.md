---
kind: spec
status: approved (owner-ruled 2026-08-01)
updated: 2026-07-31
---

# The density pass — tier map, mechanism, enforcement

The UI "feels bloated" because the token SCALES exist and the ASSIGNMENT LAW does not: nothing says
which surface class uses which step, so every feature picks by taste and converges on the loosest,
boxiest option. This spec ratifies the scales, writes the assignment law (the tier map), makes it
impossible-by-construction in the primitives, gates it, and orders the sweep.

Scope: `packages/ui/src` + `packages/client/src` visual density only. Not IA (the Tracker lane owns
duplication), not color (D71 owns palettes), not motion.

## 1. Motivation — the four habits and their receipts

| habit | what it looks like | measured receipt (2026-07-31) |
| - | - | - |
| box-in-box chrome stacking | a bordered/rounded card inside a bordered/rounded card inside a panel | `Card` defaults to `padding: "block"` + `rounded-card border bg-card`; features nest it inside panel bodies that already carry a border |
| FORM primitives building INSTRUMENT surfaces | the context panel composed from settings-row/Card airiness | `packages/client/src/features/rpg` + `components/tracker-blocks`: `rounded-card` **13/13** radius uses (zero `control`, zero `base`, zero `full`) |
| uniform visual weight | nothing recedes, so everything competes | same tree: **7 total** typographic-voice uses (`text-title` 3, `text-label` 3, `text-body` 1) across a 12-tab panel — the rest inherits default body |
| IA duplication | same datum in two places | out of scope — Tracker lane |

Whole-tree radius distribution (`packages/client/src`, all `.ts`/`.tsx`): `rounded-card` 45 ·
`rounded-full` 17 · `rounded-control` 6 · **`rounded-base` 0**. So 45 of 51 non-pill choices are the
largest step, and one defined step has never had a consumer. That is the assignment defect in one
number.

**Correction to the briefing receipt:** the claim "the five-step spacing scale has ZERO direct utility
uses in tsx" is FALSE as measured. `packages/client/src/**/*.tsx` uses the intent utilities ~108 times
(`px-block` 25 · `px-field` 22 · `py-row` 17 · `p-block` 15 · …) and `packages/ui/src` ~200 times. The
scale is adopted; what is missing is which step goes where. The rest of the brief's diagnosis holds.

Industry conventions this spec ratifies against: the 8pt grid with a 4pt sub-grid (Material 3 /
Carbon — 4pt INSIDE a component, 8pt BETWEEN components; a non-linear widening scale, not a linear
one), and M3's shape scale — named radius steps WITH a per-component-class assignment, which is
exactly the half we are missing.

## 2. Scale ratification

### 2.1 Radius — keep four steps, add one, assign every one

VERDICT: the values are right; the assignment is new. `--radius-card` stops being the default and
becomes the ELEVATED-only step.

| step | value | assigned to (the only legal consumers) |
| - | - | - |
| `--radius-inset` **(NEW)** | 0.25rem / 4px | sub-control marks INSIDE a component: keycap, qty badge, segment tick, ghost socket, swatch |
| `--radius-control` | 0.375rem / 6px | anything you operate: button, input, tab cell, item cell, icon button, menu item |
| `--radius-base` | 0.5rem / 8px | grouped content INSIDE a surface: instrument card, portrait, selected list row |
| `--radius-card` | 0.625rem / 10px | ELEVATED / floating islands only: modal, popover, drawer, toast, composer, top-level form group |
| `--radius-full` | pill | chips, badges, avatars, pills, orbs |

Evidence for `--radius-inset`: the approved mocks author 4–5px radii for exactly this class
(`.artifact .abar button` 4px, `.init span` 5px, `.choicebtn .k` 4px) with no token to land on.

### 2.2 Spacing — keep five steps, add one small-end step

VERDICT: values unchanged. The five steps are already correct for their intents; the tier map (§3)
assigns them per nesting level rather than retuning them.

| step | value | intent (unchanged) |
| - | - | - |
| `--spacing-tight` **(NEW)** | 0.25rem / 4px | atom gaps INSIDE an island: label↔bar, glyph↔text, value↔caption |
| `--spacing-field` | 0.375rem / 6px | related controls within one field group |
| `--spacing-row` | 0.5rem / 8px | between rows / island inner padding at instrument tier |
| `--spacing-block` | 0.75rem / 12px | between blocks / surface inset |
| `--spacing-section` | 1.5rem / 24px | between sections |
| `--spacing-gutter` | 2rem / 32px | page/region gutters |

Evidence for `--spacing-tight`: the mocks' instrument internals cluster at 3–5px (`.meter{gap:3px}`,
`.statcell{gap:1px}`, `.rel{gap:4px}`, `.chip{gap:4px}`) — below `field`, so today they either round
up (visibly loose) or go raw (gate-red). 4px is the 4pt sub-grid floor.

Do NOT re-tune `--spacing-field` (6px) to 4px to "fix the grid": with `tight` added, 6px is the
deliberate 2pt sub-step between 4 and 8, and Carbon ships the same shape (`spacing-01` = 2px). Owner
decision D3 records the alternative.

### 2.3 Type — no new sizes; the four-voice grammar becomes the axis

VERDICT: keep the seven sizes as-is. Do NOT re-derive the scale on a 1.2 modular ratio (owner
decision D4) — there is no measured defect that a re-derivation fixes, and it churns every surface.

The defect is the KNOB SPACE. `textVariants` exposes `size` (7) × `weight` (4) × `tone` (6) ×
`transform` (2) = 336 legal combinations, chosen per call site by taste — that is the mechanism by
which nothing recedes. Promote the panel-redesign mock's four-voice grammar from mock to law as a
single closed `voice` axis:

| voice | resolves to | means | mock evidence |
| - | - | - | - |
| `kicker` | `text-micro` + `tracking-micro` + caps + semibold + muted, with a hairline rule | a section's name; never a datum | `.kicker{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;font-weight:650}` + `.rule` |
| `label` | `text-label` + medium + foreground | the name of one datum | `.meter .mline` label half |
| `datum` | `text-label` + `font-mono` + tabular-nums + foreground | the number/value — the thing you came to read | `.statcell .v`, `.meter .mline .v`, all `.num` |
| `gloss` | `text-micro` + muted | the quiet explanatory second line | `.srow .what .truth`, `.beat`, `.orb .vals` |

**(AMENDED 2026-08-02, density S6 — owner-ruled)** a FIFTH voice, `monogram`, for the decorative display
glyph: `text-title` + semibold + **no color of its own** (the skin that paints the band owns the ink). The
chat transcript's immersive row skins paint a single-letter mark on a header band / echo tile; none of the
four content voices fits a glyph whose whole job is to be large, and the call-site alternative was spelling
`size`/`weight` through `className` — a literal-shape dodge the A3 arm structurally cannot see.

Prose voices (`title`, `body`) survive unchanged for CONTENT and form copy. `datum` rides
`text-label` (13px) rather than a new 11px step: an 11px step is a 4.8% ratio move off `micro`
(10.5px) — too fine to be a real scale step, and mono + tabular already separates it visually (owner
decision D5).

## 3. The tier map — the core deliverable

**Top axis: `instrument` vs `form`.**

- **instrument** — read-mostly, glanceable, many data per cm². You scan it. Density is the feature;
  chrome is subtracted until only the data is left.
- **form** — write-mostly, one decision per row, airy. You operate it. Chrome carries grouping and
  affordance.

A surface has exactly one tier. A `form` island inside an `instrument` surface is legal and common
(the Game tab's editors, an inline-edit popover) — it is a nested `<Surface tier="form">`. The reverse
is also legal (a tracker readout inside a settings pane). Nesting a Surface inside a Surface of the
SAME tier is RED (it means someone wrapped for no reason).

### 3.1 Surface class → tier → steps

| surface class | tier | surface inset | between blocks | island pad | atom gap | island radius | islands carry border+bg? |
| - | - | - | - | - | - | - | - |
| CONTEXT panel viewport (rpg tabs, meta tabs) | instrument | `p-block` | `gap-row` | `p-row` | `gap-tight` | `rounded-base` | only interactive cells |
| LIST panes (collection rows) | instrument | `p-field` | `gap-tight` | `p-row` | `gap-field` | `rounded-control` | no — selection is a bg tint, not a box |
| chat transcript | instrument | `p-block` | `gap-row` | `p-block` (bubble) | `gap-field` | `rounded-card` (the bubble IS the elevated island) | yes — one box, never nested |
| composer | instrument | `p-row` | `gap-field` | `p-row` | `gap-field` | `rounded-card` | yes — it floats |
| settings panes | form | `p-section` | `gap-section` | `p-block` | `gap-row` | `rounded-card` (group card only) | group card yes; SettingRow never |
| entity editors (character / preset / world-info) | form | `p-section` | `gap-section` | `p-block` | `gap-row` | `rounded-card` | group card only |
| modals / dialogs / popovers / drawers | form | `p-block` | `gap-block` | `p-block` | `gap-row` | `rounded-card` | yes — they float by definition |
| library grid cards | form | `p-block` | `gap-block` | `p-block` | `gap-field` | `rounded-card` | yes — a grid cell IS an interactive island |
| toolbars / chrome rows / strips | instrument | `px-block` | `gap-row` | — | `gap-field` | `rounded-control` (cells) | no |

### 3.2 The chrome diet — three rules

- **CD1 — border + radius + background is reserved for INTERACTIVE ISLANDS and ELEVATED surfaces.**
  A read-only grouping gets a `kicker` (caps label + hairline rule) and nothing else. If you cannot
  click it, drag it, select it, or it does not float above the page, it is not a box.
- **CD2 — one box deep, maximum.** A bordered/rounded/filled element whose ancestor is also
  bordered/rounded/filled is RED. Alignment and separation inside a box are done with hairlines
  (`border-t` on siblings) and gaps, never a nested card.
- **CD3 — one focal element per surface.** Exactly one element per surface may carry accent fill,
  glow, or elevated shadow at rest. This is the Waystone hierarchy lesson generalized ("everything
  around the waystone is deliberately quiet so it stays the one bold thing") and the visual twin of
  the existing UX rule 3 (one `intent="primary"` per region).

## 4. Mechanism — impossible-by-construction

The D44 pattern: features cannot express the wrong thing, because they never express spacing or
radius at all. Three moving parts.

### 4.1 The tier attribute — one writer

`<Surface tier="instrument" | "form">` — a NEW `@orb/ui/layout` primitive, the ONLY code in the repo
that writes `data-surface-tier`. It renders a containment-neutral wrapper (it does not duplicate
`<Container>`'s `container-type`; it composes with it).

Why an attribute and not a React context or a prop: the `no-layout-context-props` gate already bans
`density`/`compact`/`inDrawer` PROPS, and `UI-Architecture-and-Layout.md` §4 states density is the
`data-*` attribute axis, not a prop. This spec's tier is the SURFACE-CLASS axis; the existing
`data-density="comfortable|compact"` USER-PREF axis stays orthogonal and untouched (owner decision D9).

### 4.2 The tier stylesheet — the map made executable

`packages/ui/src/styles/tiers.css` — hand-authored (it maps slot names to steps; slot names are not
token data), UNLAYERED, imported by the `@orb/ui` style entry beside `theme.css`. Shape:

```css
[data-surface-tier="instrument"] [data-slot="card-root"] {
  padding: var(--spacing-row);
  border-radius: var(--radius-base);
}
```

Two properties make this a seal rather than a suggestion:

1. **Unlayered beats layered.** Tailwind v4 emits utilities into `@layer utilities`; unlayered CSS
   wins over any layered rule regardless of specificity. `theme.css` already relies on this
   ("Emitted UNLAYERED on purpose", `tokens.build.ts`). A primitive's own utility default is the
   tier-less fallback; the tier layer overrides it.
2. **`data-slot` already exists** on every primitive (`Card` emits `data-slot="card-root"` today), so
   the map needs no new plumbing.

**Build step 0 (blocking):** verify the mechanism before building on it — mount a `Surface` +
`Card` and read `getComputedStyle(...).padding` via `pnpm snap --eval`, asserting it equals the
resolved `--spacing-row`, never a hardcoded px. The in-repo precedent (`shell.css`'s
`[data-density="compact"]` block re-binding the four spacing vars) is unverified-live; do not inherit
its assumption, prove it.

### 4.3 Primitive API deltas

| primitive | delta | why |
| - | - | - |
| `Surface` (NEW, `ui/src/layout/surface.tsx`) | `tier` (required), `as`, children | the one tier writer |
| `Card` | RETIRE the `padding` variant; ADD `elevated?: boolean` | padding becomes tier-resolved; `elevated` is the explicit opt-in to `rounded-card` + shadow. A retired prop is the enforcement (owner decision D7) |
| `Text` / `Heading` | ADD `voice` (§2.3 closed union); `size`/`weight`/`tone`/`transform` become `@orb/ui`-internal | collapses 336 taste combinations to 6 named intents |
| `Section` | ADD `kicker` rendering (caps micro label + hairline rule) | realizes the mocks' `.kicker`; the CD1 replacement for a box |
| `Stack` / `Row` / `Grid` | `gap` gains `tight` | the new small-end step |
| `ListRow` | drop the per-row border; selection renders as bg tint + `rounded-control` | CD1 for the LIST class |

Features keep composing `<Stack gap>`/`<Row gap>` explicitly — the gap union is already token-only
and the gates already ban raw values. What changes is that ISLAND padding and radius stop being a
feature-level choice entirely.

## 5. Enforcement

### 5.1 The `density-tier` gate (ts-morph, `scripts/check/gates/density-tier.ts`)

`scanRoot`: `p.includes("packages/client/src/") || p.includes("packages/ui/src/")` — the
`no-off-token-radius-shadow` form, which makes no assumption about a leading slash (the two existing
gates disagree on this and a wrong path format is a SILENT GREEN, not a red). `mustPass`/`mustFlag`
fixtures MUST include an `at:` under both a shallow and a deeply nested path to prove the matcher.

Arms:

| arm | rule | scope | ratchet |
| - | - | - | - |
| A1 radius-by-class | `rounded-card` outside the ELEVATED allowlist (dialog/popover/drawer/toast/composer/library-grid-cell primitives) is RED | client + ui | baseline JSON, shrink-only |
| A2 box-in-box | a JSX element whose class string carries a border+radius+bg triple, nested under an ancestor in the same file that also does | client + ui | baseline JSON, shrink-only |
| A3 text-voice | `<Text>`/`<Heading>` in `packages/client/src/features/**` passing `size`/`weight`/`tone`/`transform` | features only | baseline JSON, shrink-only |
| A4 tier single-writer | `data-surface-tier` written anywhere but `packages/ui/src/layout/surface.tsx` | client + ui | zero, no baseline — born sealed |
| A5 stale-entry | an allowlist/baseline row whose file no longer violates | project scope only (`ctx.scope.kind === "project"`) | both-ways |

Reporting follows the `no-off-token-radius-shadow` idiom: per-token findings with a char offset into
the node text so the caret lands on the offending class, message + fix on the descriptor (printed
once), not per finding.

**Declared blind spot (write it in the gate header):** a className assembled from a variable, a
conditional, or a `cn(cond && X)` expression is invisible to a literal-shape reader — the gate scans
string literals, template parts, and `tv()`/`cva()` object literals only. AST readers blind to
computed shapes report a silent GREEN, so the computed-value CTs in §5.3 are the required second lens,
not a nice-to-have.

Registration is four coupled sites: the gate module, the `Core-Enforcement-Active-Gates.md` row, the
registry count, and the conformance fixtures — a half-registration is how a gate ships dead.

### 5.2 The transition ratchet

`scripts/check/gates/density-tier.baseline.json` — `path → count`, the `no-test-fabrication` idiom: a
file violates only when its LIVE count EXCEEDS its committed baseline, and only the excess is
reported. Consequences:

- Landing the gate at the current baseline is zero-friction and zero-new: nothing can regress, and no
  surface is blocked on the sweep.
- Every sweep stage regenerates the baseline DOWNWARD in the same commit. A baseline that grows in a
  diff is a review-blocking defect.
- `scopeSafety: "whole-project"` for the baseline arms (a per-file whole-tree count), matching
  `no-test-fabrication`.
- Terminal state: the baseline is `{}` and the file is deleted with the gate's status flipped to
  born-compliant.

### 5.3 Computed-value CT assertions

`tests/ui/density-tier.suite.ct.tsx`. Authored-string assertions stay green through visual
regressions (the Waystone lesson) — every assertion here reads back the RENDERED value:

1. `getComputedStyle(card).paddingTop` equals the document-resolved `--spacing-row` under
   `tier="instrument"` — resolve the var from the same document, never compare to a hardcoded px.
2. RELATIONAL: for the same primitive, form-tier padding > instrument-tier padding. This survives any
   future token retune, which an absolute assertion does not.
3. `borderRadius` under `tier="instrument"` equals resolved `--radius-base`, and a nested elevated
   card equals `--radius-card`.
4. CD3: a fixture surface contains exactly one focal-marked element.
5. Nesting: a `form` Surface inside an `instrument` Surface resolves form steps for its own subtree
   (proves the descendant selector, not just the root).

Mount once per test (a second `mount()` throws) — N tests, not N mounts in one.

## 6. Sweep order

Mechanism first, then surfaces, and never polish a demolition target.

| stage | work | gate posture | precondition |
| - | - | - | - |
| S0 | prove the unlayered-CSS-over-utilities mechanism with a computed-value probe | — | none |
| S1 | 2 tokens (`--spacing-tight`, `--radius-inset`) + `Surface` + `tiers.css` + `Text.voice` + `Section.kicker` + `Card` delta; land the gate at the current baseline | zero-new | S0 green |
| S2 | `@orb/ui` internal conformance (primitives emit the slots the map keys on; slot-name arm of the gate goes live) | baseline shrinks | S1 |
| S3 | CONTEXT panel surfaces (rpg tabs, meta tabs) | baseline shrinks | **AFTER Tracker stage 2 rebuilds them** — polishing a surface that is about to be rebuilt is wasted twice |
| S4 | settings panes | baseline shrinks | **AFTER the SET-SEAMS stages** (`docs/history/design/set-seams-spec.md`) — the seams move the rows before density touches them |
| S5 | LIST panes + library grids | baseline shrinks | S2 |
| S6 | chat transcript + composer | baseline → `{}` | last — highest regression risk, most-looked-at surface |

Every stage ends with a `side-eye` pass against the surface's mock, and side-eye findings are fixed
in full before the stage closes (side-eye is the polish authority, not an advisory). Stages S3–S6 are
independently shippable; S1 is not partially shippable (a half-written tier map renders a mixed
surface).

**(AMENDED 2026-08-01, HUD-1 H1)** S3's context-panel sweep runs AFTER HUD-1 lands; the HUD's own
rails/band are S3 CONFORMANCE targets, not restyle targets.

## 7. Owner decisions — RULED (owner, 2026-08-01)

> **ALL TEN RULED AS RECOMMENDED**, including the headline pair: **D6 YES** (rounded-card demotes to
> elevated-only — the 45-call-site sweep runs on the ratchet) and **D7 retire `Card.padding`** (tier-resolved;
> the removed prop is the enforcement). D1 row · D2 add `--spacing-tight` · D3 keep field=6px · D4 no
> type-scale re-derivation · D5 datum = `text-label`+mono · D8 two tiers · D9 keep the user density axis ·
> D10 instrument paddings tune via the S3 side-eye. The build is unblocked as specced.

| # | decision | recommendation |
| - | - | - |
| D1 | instrument island padding: `row` (8px) or `field` (6px) | `row` — the mocks' `.card{padding:8px 10px}` measures 8px vertical |
| D2 | add `--spacing-tight` (4px) or round the 3–5px cases up to `field` | add it — 4px is the 4pt-grid floor and the mocks use that band constantly |
| D3 | `--spacing-field` = 6px is off the 4pt grid; retune to 4px? | leave it — with `tight` added it is the deliberate 2pt sub-step (Carbon `spacing-01` precedent) |
| D4 | re-derive the type scale on a 1.2 minor-third ratio | NO — no measured defect; a re-derivation churns every surface for aesthetics |
| D5 | `datum` voice = `text-label` + mono, or a new 11px step | `text-label` + mono — 11px is a 4.8% step off micro, too fine to be real |
| D6 | demote `rounded-card` to elevated-only (45 client call sites change) | YES — this is the single highest-leverage line in the spec, and the biggest visible change |
| D7 | retire `Card.padding` (a breaking primitive API change) | retire — a surviving prop is a surviving escape hatch |
| D8 | two tiers, or a third `gallery` tier for library grids | two — library grids map cleanly onto `form` |
| D9 | keep the user-pref `data-density="comfortable\|compact"` axis alongside tiers | keep, orthogonal — but its live behavior is currently unverified; prove it in S0's probe |
| D10 | the exact instrument paddings in §3.1 are taste-level throughout | ship the table, tune from a side-eye pass on S3 rather than in the abstract |
