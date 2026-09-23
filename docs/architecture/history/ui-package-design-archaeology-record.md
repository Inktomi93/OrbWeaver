---
kind: history
status: active
updated: 2026-07-13
---

# `@orb/ui` package design — archaeology record

> Frozen 2026-07-13, extracted from `../core/ui-package-design.md`. The build journey, dated audits,
> resolved doc-vs-API deltas, and rejected-alternative rationale that produced the shipped `@orb/ui`
> package. The STANDING law lives in the core doc + `packages/ui/src` (the code is the doc for
> anything built) + the D-ledger (`../../adr/`) + the active-gate registry
> (`../core/Core-Enforcement-Active-Gates.md`). This file is the how-we-got-here record only, not live
> law. `§`-numbers below refer to the core doc's sections as they stood before the 2026-07-13
> de-archaeology pass.

## Dependency version-migration deltas (extracted from §3)

At build time (2026-07-02) several sealed libs had moved major versions past what the original build
brief assumed. Recorded then; now moot because `packages/ui/package.json` pins every dep via
`catalog:` (the version is the catalog's job, not this table's). The APIs were verified live at build:

| Dep | brief assumed | shipped | note |
| - | - | - | - |
| `tailwind-variants` | v1 | 3.x | `tv()`/`slots`/`VariantProps` all present |
| `style-dictionary` | v4 | 5.x | v5 is ESM/async; DTCG support intact |
| `diff` (jsdiff) | v8+ | 9.x | same modern TS/async surface |
| `echarts` | v5 era | 6.x | seal wrapper unaffected |
| `@dnd-kit/react` | — | 0.x | the rewrite package; the legacy `@dnd-kit/core`/`sortable`/`utilities` stack is dead — never install |
| `@base-ui/react` | rc-era `@base-ui-components/react` | 1.6.x `@base-ui/react` | the RC-era package name is DEAD — never install it; v1 broke RC APIs, so every wrap was written against live per-component docs, never memory |

**DROPPED at D54 (do not re-add without a ledger decision):** `sonner` (→ Base UI Toast), `vaul`
(→ Base UI Drawer), `react-resizable-panels` (→ the §11.1 clamp-overlay shell), `cva`/`clsx`
(→ tailwind-variants), DOMPurify (sanitize is native inside Streamdown). NOTE: `tailwind-merge`
itself is BACK as a direct dep — `tailwind-variants`' `createTV` needs its `twMergeConfig` type to
register the custom `--text-*` size classGroup (see the core doc §5 `tv` factory); `cn` is still
tailwind-variants' merge, so the "no standalone tw-merge call sites" intent holds.

## Recorded deltas + flags for Nate (extracted §10 — resolved)

Decision-level notes surfaced during the build. Resolved unless marked otherwise; the live one-line
WHYs that survived promoted into the core doc (§1 react-dom peer, §5 `tv` factory, §7 ThemeScope
one-home, the markdown policy gotcha which now self-documents in `markdown/policy.ts`).

1. **Task-prompt vs law:** the mission brief listed `vaul`/`sonner`/`react-resizable-panels` seals and
   "toast via sonner" — D54 dropped all three (Base UI native toast + drawer; clamp-overlay shell).
   Law won; built accordingly.
2. **`react-dom` peer:** D54 said "peer react ONLY", but `@base-ui/react` declares `react-dom` a
   required peer, so `@orb/ui` peers BOTH. Intent preserved (the client stays the renderer/provider;
   ui never bundles React). Now stated in core §1.
3. **Version majors moved** since the brief — see the migration table above.
4. **`Meter` is a HYBRID over Base UI's `meter`** (revised 2026-07-02, endorsed). Base UI `Meter.Root`
   supplies the a11y shell — `role="meter"` + `aria-valuemin/max/now` + locale-aware `aria-valuetext`
   (`Intl.NumberFormat`, no hand-rolled ARIA) — plus the optional visible label/value row
   (`Meter.Label`/`Meter.Value`). The custom SVG/div geometry (arc gauge, bipolar center-origin fill,
   milestone ticks, the `dangerBelow` token swap) rides as the Root's **children** and stays
   hand-rolled, because Base UI's `MeterIndicator` hardcodes `width:%` (linear-DOM-only — verified) and
   cannot draw arcs. The geometry is nested as `children`, NOT injected via the `render` prop —
   `Meter.Root` always appends a visually-hidden `<span>` to its children and defaults to a `<div>`, so
   replacing the root with the arc's `<svg>` would nest that HTML span inside an `<svg>` (invalid). One
   Root, geometry as children, keeps every kind valid. The public API
   (`kind`/`value`/`max`/`min`/`milestones`/`dangerBelow`/`label`) is preserved;
   `showValue`/`formatValue` + the Base UI value-format passthrough
   (`format`/`locale`/`getAriaValueText`) are additive.
5. **`ThemeOverride` one-home tension:** the Zod clamp exists twice by design — the WIRE schema in
   `@orb/contracts/theme` (D44 §12.5) and the ui-local RENDER clamp in `<ThemeScope>` (ui cannot
   import contracts). Pairing is asserted by a client-phase type test. The rejected alternative
   (contracts importing a ui-exported shape) inverts the cake (ui is a LEAF of client; contracts must
   not know ui) — declined. Live one-liner kept in core §7.
6. **`Toolbar` double-listing** resolved: D42 §2 lists Toolbar under `layout/`; D54 adds Base UI
   Toolbar. Merged — `layout/toolbar` wraps Base UI Toolbar (roving tabindex) with the layout skin.
7. **`tabs` added** to the Base UI wrap set (not in the original D42 §2 primitive list, but required by
   the committed game-panel/crew-panel designs and native to Base UI). Additive.
8. **Streamdown security API doesn't exist as originally assumed:** the mission's markdown obligation
   was drafted against `allowedImagePrefixes`/`allowDataImages` — verified against the live Streamdown
   2.5 API that neither exists. The real surface is `allowedElements`/`disallowedElements` +
   `urlTransform`; the seal is built against that. No behavior gap — same containment, different API
   shape. `markdown/policy.ts` self-documents this at the top of the file.

## Build order — the waves (extracted §9)

`@orb/ui` was built green-to-commit per chunk. All waves are DONE (2026-07); the record:

- **Wave 0 — scaffold:** `package.json` · tsconfig · the token pipeline + seed `tokens.json` +
  generated theme + freshness test · gates (§8) · CT wiring · the `tests/ui` mirror. Checkpoint:
  workspace `pnpm check` green with the empty-but-real package; an illegal `@orb/ui → @orb/contracts`
  import FAILS (biome undeclared-dep + depcruise).
- **Wave 1 — pure primitives** (subagent-parallel, disjoint dirs): Base UI wraps (controls:
  button/field/input/select/switch/slider/number-field/tabs · overlays:
  dialog/popover/tooltip/menu/toast/drawer · identity: avatar) · layout
  (Stack/Row/Section/Toolbar/Container) · icons · Meter + SegmentedClock · virtual-list seal ·
  code-editor seal · diff seal.
- **Wave 2 — security primitives** (D44 trio + markdown, sequenced after Wave 1 since lightbox/media
  compose Dialog): ThemeScope · MessageMedia · sandbox-frame · `@orb/ui/markdown` two-policy pipeline +
  `toPlainText`. CT asserts containment (§7).
- **Wave 3 — the display/form gap** (the neo-parity sweep): the domain-agnostic primitives every
  committed feature design needs but waves 1–2 didn't cover. Three batches: form controls
  (checkbox · radio-group · toggle/toggle-group · textarea · autocomplete) · structure/disclosure
  (separator · collapsible · accordion · scroll-area · alert-dialog · progress) · hand-authored
  display (badge/chip/pill · skeleton · spinner · empty-state · card).
- **Carve-out (un-parked 2026-07):** the originally-deferred chunks — `message-list` · `stream/` ·
  `command` · `sortable` · `charts` (ECharts: chart/bar-list/histogram/stat-figure) · `macro-textarea`
  - the carve-out set (media-grid · status-chip · compare-blocks · avatar-stack · file-dropzone ·
    highlighted-text · log-viewer · color-field · tool-call-block · crossfade-image · reveal-gate ·
    list-row · setting-row · selection-bar · save-bar) — were all BUILT by the primitive fleet.
- **§6.2 client factories:** originally deferred to Phase 6; landed with the client-foundation wave
  (verified in-tree 2026-07-09).

## §6.2 client-factory status detail (extracted)

The §6.2 inventory is BUILT — every factory exists at its pre-decided home
(`client/src/forms/`: `create-saved-entity-form.ts` · `create-autosave-entity-form.ts` ·
`use-app-form.ts`; `client/src/data/`: `create-entity-mutation.ts` · `create-collection-surface.ts` ·
`use-gated-query.ts` · `query-boundary.tsx` · `invalidation.ts` · `bus/apply-chat-bus-event.ts`;
`client/src/state/`: `create-entity-draft-store.ts` · `shell-store.ts` · `chat-handle.ts` (the
`ChatHandle` union, grown a third `{kind:"landing"}` member per D62 P4); `client/src/lib/time.ts`; the
`RAIL_SLOTS`↔`MODAL_SLOTS` registries + the live `registry-pairing` gate). The code is now the doc for
the built shapes. Several §6.2-obligation belts hold by construction+review, not yet by gate.

**Under-specified factories, SPECCED during the build (the "figuring out" half):**

1. `createSavedEntityForm`'s **group-submit obligation:** sections that save independently use
   `form.FormGroup` + per-group `onDynamic` schemas — the factory exposes `SectionGroup` so a preset's
   "sampling"/"prompt" tabs or the wizard's steps validate + submit per-group while ONE form owns all
   state.
2. `createEntityMutation`'s error-slot SHAPE (as-built, verified against
   `packages/client/src/data/create-entity-mutation.ts`): the return is FLAT, not a nested
   `mutation`/`errorSlot` pair — `{ mutate, mutateAsync, isPending, pendingVariables, error, clearError,
   retry }`. `error` is `mutation.error` (sticky until the next `mutate` — v5 behavior); `clearError` is
   `mutation.reset`. The dialog/banner binds to `error`/`clearError` directly, never a `??`-multiplexed
   pair.
3. The virtual-list tripwire: "unbounded window" = the scroll element measures taller than
   `visualViewport.height * 3` at mount → **throw** with the fix instruction (the neo 200ms-commit
   lesson, D43 §11.3).

## Gate-coverage inventory (extracted §11 — audited 2026-07-02)

Nate's flag ("a lot of our ui grit/custom rules aren't present or wired") audited. Verdict at the time:
**nothing wired is dark** — all grit files on disk were registered in `biome.json` AND pinned by
`tests/tooling/grit-plugins.int.test.ts` (a plugin that compiles-but-matches-nothing FAILS there);
same for dep-cruiser rules (`dependency-cruiser.int.test.ts`). The gaps were the D43/D54 belts
correctly PARKED for the client-foundation wave. The LIVE gate set is now the standing law in
`../core/Core-Enforcement-Active-Gates.md`; the 2026-07-02 snapshot follows for provenance:

| Gate (§8 registry) | Status (2026-07) | Where / when |
| - | - | - |
| ui/client package physics | ✅ LIVE | resolver + biome `noUndeclaredDependencies` + depcruise `ui-cake` |
| `virtualizer-only-in-seal` · echarts/codemirror/streamdown/cmdk/dnd-kit/diff/lucide seals | ✅ LIVE | depcruise `ui-satellite-seals` |
| `no-raw-value` family (color/spacing/typography/z-index) | ✅ LIVE, ui-covered | grit; widened to `packages/ui/src` + `tv()` arms |
| named non-token color ban (`bg-black/50` → `--scrim`) | ✅ LIVE | arm in `no-color-literals` |
| `no-layout-context-props` | ✅ LIVE | grit |
| `design-token-parity` | ✅ SUPERSEDED-BY-CONSTRUCTION | the codegen + freshness test (§4) |
| `touch-target-floor` | ◐ PARTIAL | token floor test-locked; per-component half rides review + CT computed-height + the design-audit probe (D62 P1) |
| `no-direct-useform`/`no-form-state-in-useeffect`/`no-chat-trpc-in-surface`/`no-inline-optimistic-in-surface` | ✅ LIVE (dormant→fires on client code) | grit — wired since Phase 0 |
| `tanstack-form-only-in-shared` | ◐ PARTIAL | `no-direct-useform` covers half; single-`createFormHook` half lands with `client/forms` |
| `no-media-queries-in-features`/`no-raw-container-widths`/`surface-in-a-container` | ✅ LIVE (2026-07-09) | first two grit; third a `scripts/check/gates/` gate |
| the client query/mutation/store gate family (`no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `bus-onData-no-store-write` · `no-form-reset-in-autosave` · `persist-partialize-and-total-migrate` · `check:registry-pairing` · typed-`testId` · `no-fake-disabled-id` · …) | ◐ PARTIALLY discharged (2026-07-11) | many LIVE in `scripts/check/gates/` + registered in `report.ts`; verify the remainder against the active-gate registry before relying on it |
| D44 quartet (`no-untrusted-html-in-main-dom` · `no-external-media-without-gate` · `theme-override-only-via-scope` · CSP-headers) | ✅ lint trio LIVE (2026-07-09); CSP on `entry/http` | grit rules wired in `biome.json`; CSP lands with `entry/http/security-headers.ts` |
| `@tanstack/eslint-plugin-query` + `eslint-plugin-react-hooks` | RESOLVED — LIVE | `eslint.config.js`, wired into `pnpm check` via `lint:eslint` |
| visual-regression screenshots (D42 §8) | ⏸ PARKED | Playwright screenshot gate — adopt when the first themed surfaces stabilize |

## Neo-parity primitive sweep (extracted §12 — audited 2026-07-02)

The domain-agnostic primitive set derived from BOTH (a) neo's `components/ui/` (the shadcn layer being
replaced) and (b) a grep of the whole `proposed/` tree for `@orb/ui/*` refs + primitive nouns. Rule for
inclusion: **domain-agnostic** (a `Button`/`Badge`/`Card`, never a `CharacterCard`) AND referenced by
≥1 committed design (or a neo staple). Every row is now ✅ built (the current inventory is
`packages/ui/package.json#exports`); kept here as the derivation record.

| Primitive | neo had | Base UI native | Home / wave |
| - | - | - | - |
| button · field · input · select · switch · slider · number-field · tabs | ✓ | ✓ | W1 |
| dialog · popover · tooltip · menu · toast · drawer(+sheet) · avatar | ✓ | ✓ | W1 |
| layout (Stack/Row/Section/Container/Toolbar) · icons | ✓ (shared) | — | W1 |
| meter (linear/arc/bipolar) + SegmentedClock | — | ✗ (hand) | W1 |
| virtual-list · code-editor · diff | ✓ (resizable dropped) | ✗ (seals) | W1 |
| ThemeScope · MessageMedia · sandbox-frame · lightbox · markdown (incl. KaTeX math) | — | ✗ (D44 owned) | W2 |
| checkbox · radio-group · toggle · toggle-group · textarea · autocomplete | ✓ (label/textarea) | ✓ | W3 |
| separator · collapsible · accordion · scroll-area · alert-dialog · progress | ✓ (partial) | ✓ | W3 |
| badge/chip/pill · skeleton · spinner · empty-state · card | ✓ (partial) | ✗ (hand) | W3 |
| message-list · stream pacer | ✓ (hand-rolled) | ✗ (seal) | carve-out |
| charts (ECharts: chart/bar-list/histogram/stat-figure) | ✓ (nivo→ECharts) | ✗ (seal) | carve-out |
| command (cmdk) · sortable (@dnd-kit) | ✓ | ✗ (seal) | carve-out |
| macro-textarea (minisearch fuzzy) | ✓ (hand-rolled, ported) | ✗ | carve-out item 18 |
| carve-out set (media-grid · status-chip · compare-blocks · avatar-stack · file-dropzone · highlighted-text · log-viewer · color-field · tool-call-block · crossfade-image · reveal-gate · list-row · setting-row · selection-bar · save-bar) | partial | mixed | carve-out |
| weave-glyph (brand) | ✓ | — | app-level `client/src/lib/weave-glyph.tsx` (§13.9 D62 re-home) |

**Deliberately NOT `@orb/ui` (neo `components/ui/` but app-shell/feature concerns):** `resizable`
(DROPPED — D54 clamp-overlay shell) · `sheet` (folded into `drawer` side variants) · `label` (folded
into `field`) · `app-splash`/`route-error-fallback` (app-shell chrome, `client`) ·
`macro-textarea-logic` (feature logic). The **proposal-diff** pattern (chat-crew 07) is a FEATURE
component over `@orb/ui/diff`, not a ui primitive.

## Primitive-authoring war stories (extracted §13 — the incidents behind R1–R8)

The R1–R8 rules in the core doc were codified after a full 27-seal review found the same class of miss
across agents. The incidents that named each rule:

- **R1** (read the `.d.ts` first): the 5-day autocomplete snipe-hunt was probe-archaeology in place of
  reading the type defs.
- **R3** (never hand-roll what the lib ships): the spinner shipped a hand-rolled SVG when lucide
  `Loader2` + the icon seal was right there.
- **R4** (pick the right primitive): A2's multi-select-with-chips is a Combobox, not an Autocomplete
  extension.
- **R6** (no root-cause claim without a failing test): the React-Compiler autocomplete story was
  fiction — the Compiler isn't even in the CT pipeline.
