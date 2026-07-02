# The @orb/ui Primitive & CT Contract — canonical structure + machine enforcement

> **Status: PROPOSED — the rigor pass for `@orb/ui`.** Ratified by delegation (Nate, 2026-07-02:
> "create the rigor… lock in what needs locking"). Once the gate lands and the tree is green, this
> graduates to `core/` and the gate is law. The ledger D-entries + [`ui-package-design.md`] win on any
> conflict; this doc is the *structural* contract those docs assume but never enforced.

---

## 1. Why this exists

`@orb/ui` is the one package built **fast, by a fleet of parallel agents across multiple waves** — and
it shows. The bones are disciplined: 30/34 primitives follow the same `{name}.tsx` + `index.ts` +
`variants.ts` trio, test coverage is ~complete, and the component internals (`cn(variants(), className)`,
the Base-UI seal, `data-slot` locators) are uniform. But under that, **each wave picked its own
micro-conventions and never reconciled with the others** — producing competing "dialects" that a
cold-reading implementer (or the next fleet) will copy at random.

Every other package in the stack has **physics-level enforcement** (dep-cruiser one-directional flow,
`check:structure`, the biome plugin gates). `@orb/ui` is the only one that shipped *without* a structure
gate — which is exactly why it drifted. This contract is that missing gate: the single canonical shape,
plus the `check:structure`-class check that makes every divergence below a **build failure**, not a code
-review maybe.

The measured divergences this contract closes (ast-grep / structural audit, 2026-07-02):

| # | layer | divergence (as-found) | decision |
|---|---|---|---|
| 1 | primitive | `variants.ts` export name: **bare** (`export const button`) vs **`{name}Variants`** (~50/50) | `{name}Variants` |
| 2 | primitive | `variants` **leaked** through public `index.ts` (14) vs kept **internal** (~20) | internal-only |
| 3 | primitive | control glyphs: inline `<svg>` (checkbox, number-field, select) vs the **lucide seal** | lucide seal |
| 4 | test | color assertions: 15 hardcoded `oklch()` literals + split `getComputedStyle`/`toHaveCSS` | `expectToken` |
| 5 | test | providers: 6 inline `<XProvider>` wraps vs `beforeMount` (used **0** times) | `CtProviders` |
| 6 | test | surface fixtures — already `*.fixtures.tsx` (7), one outlier (`support/ct/icon-story.tsx`) | document + gate |

---

## 2. The primitive file contract

A **styled primitive** (`packages/ui/src/primitives/<name>/`) is EXACTLY:

```
<name>/
  <name>.tsx      # the component — named export, no default
  index.ts        # the public front door — the ONLY file consumers import
  variants.ts     # the styling contract (tailwind-variants)
  handle.ts       # OPTIONAL — imperative createHandle (dialog/popover/tooltip/alert-dialog)
```

### 2.1 `variants.ts` — LOCK: `export const {camelName}Variants = tv({…})`

One `tv()` (tailwind-variants) export, named **`{camelName}Variants`** — `buttonVariants`,
`numberFieldVariants`, `switchVariants`. **WHY the suffix (over the bare-name camp):** it's greppable and
unambiguous (a bare `button` collides conceptually with the component and its props), it handles reserved
words uniformly (`switch` *had* to be `switchVariants` already — the bare camp couldn't stay consistent),
and it signals "this identifier is the styling contract, not the component." *(Migration: ~24 bare-name
exports rename to the suffix form. Rejected: bare-name — terser but non-uniform and reserved-word-hostile;
the anal-codebase tiebreak is explicit > terse.)*

### 2.2 `index.ts` — LOCK: public API only; NEVER re-export `variants`

```ts
export type { ButtonProps } from "./button";
export { Button } from "./button";
// NO `export … from "./variants"` — the cva is an implementation detail.
```

`variants.ts` is **internal**. Consumers use `<Button intent="…">`, never `button({intent})`.
**WHY:** re-exporting the cva lets a feature compose raw variants and bypass the component skin — the
exact "config leaks out of its owner" vector that rotted neo. If a *sibling primitive* genuinely needs to
compose another's variants (e.g. `toggle-group` over `toggle`), it imports via a **relative path**
(`../toggle/variants`), never the public `@orb/ui/*` subpath — intra-package composition stays inside the
package wall. *(Migration: 14 `index.ts` files drop their `./variants` re-export; verify none are consumed
cross-primitive via the PUBLIC path first — those convert to relative imports.)*

### 2.3 Component internals (already uniform — codified so they stay)

- **Named function export**, typed `ReactElement` return; no default export.
- Props: `interface XProps extends {BaseUIProps | ComponentProps<"tag">}, VariantProps<typeof xVariants>`.
- Class composition: `cn({name}Variants({…variantProps}), className)` from `#lib` — `className` last so
  callers can override.
- Base-UI primitives are **sealed** behind the token skin (D42 §2) — the component is the only export;
  the raw Base UI component never escapes.
- Slots carry `data-slot="<name>-<part>"` (the CT locator surface — 66 uses today; keep it).

### 2.4 The variants-exempt allowlist (NOT every dir has `variants.ts`)

Legitimately variants-less — the gate exempts these explicitly (silence is not exemption):

- **`primitives/icons`** — a lucide re-export + sizing wrapper (§3), no skin.
- **`primitives/virtual-list`**, **`code-editor`** — sealed satellites (their skin is the wrapped lib).
- **`content/*`** (`lightbox`, `message-media`, `sandbox-frame`, `theme-scope`) — behavior/security
  surfaces, not styled pills; helpers (`clamp.ts`, `srcdoc.ts`) instead.
- **`markdown`** (`policy.ts`, `to-plain-text.ts`), **`lib`** (pure utils).
- **`layout`** — a multi-component module (container/row/section/stack/toolbar) with one shared
  `variants.ts`; the "one component per dir" rule does not apply to the layout kit.

---

## 3. Icons — LOCK: the lucide seal, never inline `<svg>` for glyphs

`@orb/ui/icons` is the ONE icon home: a curated `lucide-react` re-export + the `<Icon>` sizing wrapper
(`ICON_SM/MD/LG` = 16/20/24 px pinned to the type scale). `lucide-react` is imported **only** inside
`primitives/icons/` (dep-cruiser `icons-lucide-only`).

**The gap this closes:** three primitives hand-inline `<svg>` control glyphs — checkbox (checkmark),
number-field (`+`/`−` steppers), select (chevron + item-check) — and `select.tsx` even documents it as
"the established seal pattern." That's a **second competing convention** the `icons-lucide-only` gate
misses (it checks *imports*, not inline `<svg>`). Every one of those glyphs already exists in the curated
set (`Check`, `Plus`, `Minus`, `ChevronDown`). **Migrate them to the lucide seal.**

- These are **12px indicator marks**, below `ICON_SM`. Add **`ICON_XS = 12`** (pairs with `--text-label`)
  and render the lucide glyph at `size={12}` inside the Base-UI `Indicator`/`ItemIndicator` slot.
- **`<svg>` stays legal ONLY in the data-viz allowlist:** `charts/meter`, `charts/meter/segmented-clock`
  (they draw arcs/segments — geometry, not icons). The gate bans inline `<svg>` in every other primitive.

*(Rejected: keep hand-SVG for indicator marks — the polish argument (a lucide `Check` at 12px reads
slightly heavier than a purpose-drawn tick) loses to one-icon-source + zero hand-maintained path data.)*

---

## 4. The CT test contract (`tests/ui/**`)

### 4.1 Co-located coverage — LOCK

Every styled primitive has a co-located `tests/ui/**/<name>.ct.tsx`. Exempt: `icons` (trivial re-export).
A new primitive without a test is a gate failure.

### 4.2 Token color assertions — LOCK: `toHaveCSS(prop, TOKENS[path].value)`, no literals

The canonical color assertion is Playwright's **`toHaveCSS`** against the generated **`TOKENS`** map —
the pattern **5 files already use** (`dialog`, `alert-dialog`, `drawer`, `popover`, `separator`):

```ts
import { TOKENS } from "@orb/ui/tokens";
await expect(backdrop).toHaveCSS("background-color", TOKENS["color.scrim"].value);
```

**No bespoke helper.** `toHaveCSS` already auto-retries + normalizes, and `TOKENS[path].value` is the
DTCG-generated source of truth. *(Rejected a probe-based `expectToken` wrapper — it reinvented an in-repo
precedent; the one already there is simpler, auto-waiting, and used by 5 files. The migration makes the
12 drifted files match the 5 correct ones — consistency with precedent, not a new abstraction.)*

- **Bans:** hardcoded `oklch(…)` (or any raw color) literals in `.ct.tsx` (15 across 12 files), and
  hand-rolled `evaluate(() => getComputedStyle(el).<colorProp>)` for token colors.
- **WHY:** token values are DTCG-generated and not unique (7 collide) — a literal passes against the OLD
  color after a `tokens.json` tweak (silently no longer testing what it claims), and a same-valued *wrong*
  token passes too. `TOKENS["color.primary"].value` breaks loud on a real regression, updates free on a
  rename.
- **Not banned:** `toHaveCSS` for non-token CSS (sizes, `font-size`, padding, `z-index`) — right tool for
  layout; only *token colors* route through `TOKENS`.
- **Coverage note:** `no-color-literals.grit` catches only HEX in Tailwind-utility/`cn`/`tv` STYLING
  contexts — it does NOT see `oklch()` nor `.toContain()` assertion strings, so the test-oklch ban is a
  genuinely new gate surface, not a duplicate.

### 4.3 Providers — LOCK: `CtProviders` via `beforeMount`

`playwright/index.tsx` wires `beforeMount(({ App, hooksConfig }) => <CtProviders {...hooksConfig}><App/></CtProviders>).`
`tests/support/ct/ct-providers.tsx` stacks the pure-context global providers **always-on**:
`Toast.Provider`+`Toaster`, `Tooltip.Provider`. Plus **`ThemeScope` applied per-case ONLY when a theme
override is supplied** (`hooksConfig.theme` non-empty) — because ThemeScope renders a real wrapping
`<div>` (not pure context), so always-on it shifts the mount root and breaks the ~42 tests that read the
mounted element directly (`mount().evaluate(el => getComputedStyle(el))`); with empty tokens it is a
no-op anyway (base tokens resolve at `:root`).

- **Bans:** inline provider wraps in `.ct.tsx` — see gate clause 6 (fail-closed: any `<*Provider>`).
- **Local exception:** `drawer`'s own `DrawerProvider` / `DrawerVirtualKeyboardProvider` are
  drawer-scoped context, not global chrome — they stay in the drawer fixture, NOT in `CtProviders`
  (allowlisted in clause 6).
- **Direction/RTL seam: DEFERRED.** No test exercises RTL yet (Base UI defaults to `ltr`), and pulling
  raw `@base-ui/react` into `tests/` for a `DirectionProvider` would crack the Base-UI seal (D42) this
  pass is hardening. When an RTL test appears, expose direction THROUGH `@orb/ui`, not a direct Base UI
  import in tests.
- This is the `@orb/ui`-scoped sibling of Spine-Testing §7's client provider harness (minus
  QueryClient/tRPC — `@orb/ui` is domain-agnostic).

### 4.4 Surface fixtures — LOCK the existing convention

Overlay/surface primitives that don't render standalone (need an anchor/trigger/positioner/portal root)
keep a **co-located `*.fixtures.tsx`** — this is already the norm (7 files). Standardize:

- Plain fixture: `<name>.fixtures.tsx`. Imperative-handle fixture: `<name>-handle.fixtures.tsx`.
- Shape: a small stateful "story" component exporting one harness (autocomplete's is the model).
- **Do NOT centralize fixtures** — the surface is intrinsic to each primitive; a mega-factory is the
  wrong abstraction. Only the *providers* (§4.3) centralize.
- Relocate/rename the outlier `tests/support/ct/icon-story.tsx` to the convention (it's the current
  `check:structure` irritant); `support/ct/` is for shared HELPERS (`tokens.ts`, `ct-providers.tsx`),
  not per-primitive stories.

---

## 5. Enforcement

### 5.0 What is ALREADY enforced — the gate does NOT duplicate these

Before adding anything, note biome + existing gates already cover a naive contract's easy half:

- **named export / no default** → biome `noDefaultExport`. **no `forwardRef`** → `noReactForwardRef`
  (React 19 ref-as-prop). **kebab filenames** → `useFilenamingConvention`.
- **hex color in styling** → `no-color-literals.grit` (hex-only, styling contexts — §4.2 coverage note).
- **Playwright best-practice** → the nursery `noPlaywright*` set (no `waitForTimeout`/`force`/`eval`/
  missing-await/…). **Base-UI `@deprecated` drift** → `noDeprecatedImports` + `@typescript-eslint/no-deprecated`.
- **token drift** → `tests/ui/tokens/freshness.test.ts` (index.ts/theme.css vs tokens.json).
- **touch floor (partial)** → per-component CT `boundingBox().height >= 44` assertions (§7 gap).

### 5.1 Biome — block the dead package (do NOW)

Biome `noRestrictedImports` (biome is the primary linter) → ban **`@base-ui-components/react`** (the
rc-era dead package; use `@base-ui/react`, D42) via a `patterns.group` of
`["@base-ui-components/react", "@base-ui-components/react/**"]` so both the bare import AND every subpath
(`.../toast`, etc. — the realistic vector) fail with "Dead rc-era package. Use @base-ui/react (D42)."
Neither installed nor imported today — a pure **preventive** so the recurring "is this the rc package?"
confusion can never happen again. Zero false-positive risk. *(Biome 2.5's `patterns` supports the
subpath glob cleanly, so no ESLint fallback is needed.)*

### 5.2 The structure gate (`scripts/check/gates/ui-primitive-structure.ts`)

A check in the `pnpm check` set (same tier as `check:structure`). Each clause = a hard fail with the
offending path. These are the GAPS biome can't see:

1. **Trio present** — every `primitives/<name>/` has `<name>.tsx` + `index.ts` + `variants.ts`, OR is on
   the §2.4 variants-exempt allowlist. *(filesystem)*
2. **Variants naming** — `variants.ts` exports exactly one `tv()` const named `{camelName}Variants`. *(ast-grep)*
3. **No variants leak** — no `index.ts` re-exports from `./variants`. *(ast-grep)*
4. **Co-located test** — every styled primitive has `tests/ui/**/<name>.ct.tsx` (except `icons`). *(filesystem)*
5. **No token color literals** — no `oklch(`/`rgb(`/`#hex` color literal in any `.ct.tsx` (§4.2). *(ast-grep)*
6. **No inline provider wrap** — **fail-closed**: no inline `<*Provider>` JSX (ANY identifier ending in
   `Provider`) in a `.ct.tsx`/`.fixtures.tsx`, EXCEPT the drawer-local `DrawerProvider` /
   `DrawerVirtualKeyboardProvider` allowlist. A future primitive that introduces a NEW global provider
   is thereby forced to add it to `CtProviders` (or justify an exception) rather than silently
   re-drifting inline — the exact allowlist-maintenance gap that caused the original drift. *(ast-grep)*
7. **No inline glyph SVG** — no `<svg` in a `primitives/*` component outside the data-viz allowlist
   (`charts/**`). *(ast-grep)*
8. **Overlay anatomy** — TWO sub-families (verified 2026-07-02; a naive "all overlays need a Positioner"
   clause false-fires on the modals):
   - **Anchored** (popover / menu / select / autocomplete / tooltip) — a file with `X.Popup` MUST also
     have `X.Positioner` (the Portal→Positioner→Popup rule for trigger-anchored floats).
   - **Modal** (dialog / alert-dialog / drawer) — centered/edge-docked, NOT anchored: they use
     `X.Backdrop` + `X.Popup` and correctly have **no** Positioner. The gate requires `Backdrop` here and
     must NOT demand a Positioner.
   Non-overlay primitives (checkbox/switch/…) are unaffected. *(ast-grep)*

## 6. Migration to green (bulk ops)

Order — each step reconcile→green→commit:

1. **Harness first** (unblocks the test bans): `ct-providers.tsx` + wire `beforeMount`; add `ICON_XS=12`.
   (No `tokens.ts` helper — §4.2 uses `toHaveCSS`+`TOKENS` directly.)
2. **Test retrofit** (ast-grep/ts-morph): 15 color literals → `toHaveCSS(prop, TOKENS[path].value)` (the
   semantic map, §4.2); 6 provider wraps → drop; relocate `icon-story.tsx`.
3. **Primitive retrofit** (ts-morph): ~24 `variants` renames → `{name}Variants`; 14 `index.ts` de-leaks;
   3 icon inlines → lucide.
4. **Land the gate + the ESLint rule** last (tree already green), so they go in enforcing, not retroactively red.

## 7. Candidate NEW gates (flagged to Nate — NOT auto-building; YAGNI until wanted)

Genuinely-new mechanisms surfaced by the audit, each a real gap but net-new work — decide per-item:

- **Contrast-ratio (WCAG AA) gate** — compute relative luminance for each `color.X` / `color.X-foreground`
  pair, fail `freshness.test.ts` if a future token edit drops below AA. Today the OKLCH pairs are
  hand-picked and assumed legible; nothing checks. Net-new script.
- **Component-level 44px touch floor** — ban raw `h-*`/`size-*` on interactive primitives so a future one
  can't set `h-8` instead of `h-(--spacing-control-md)`. Today rides per-component CT `boundingBox` + review.
- **Harden `no-color-literals.grit`** — (a) extend beyond hex to catch `-[oklch(…)]` / `-[rgb(…)]`
  arbitrary Tailwind values; (b) **fix its STALE messages** — they reference neo-tavern paths
  (`src/client/styles/globals.css`, Catppuccin/Hearth/Loom) that don't exist in orbweaver, which use the
  OKLCH token set in `packages/ui/src/styles/theme.css`. The rule works; the guidance misdirects. *(the
  message fix is cheap and worth doing regardless.)*

---

## 6. Migration to green (bulk ops)

Order — each step reconcile→green→commit:

1. **Harness first** (unblocks the test bans): build `tokens.ts` (`expectToken`) + `ct-providers.tsx` +
   wire `beforeMount`; add `ICON_XS`.
2. **Test retrofit** (ast-grep/ts-morph): 15 `oklch` literals → `expectToken` (semantic map, §4.2); 6
   provider wraps → drop (beforeMount covers them); relocate `icon-story.tsx`.
3. **Primitive retrofit** (ts-morph): 24 `variants` renames → `{name}Variants`; 14 `index.ts` de-leaks;
   3 icon inlines → lucide.
4. **Land the gate** last (tree already green), so it goes in enforcing, not retroactively red.
