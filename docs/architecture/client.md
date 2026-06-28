# Orbweaver — `@orb/client` + `@orb/ui` (the frontend) — authoritative spec

> **Status: authoritative spec (Phase 6 — deferred rebuild).** The single home for the client
> foundation; built against when Phase 6 lands (backend first). On any conflict with neo-tavern's
> client, THIS wins — neo's client is the source to *learn from*, not copy. Decisions here are recorded
> in `reports/DECISIONS-LEDGER.md` **D42**; this doc is the expansion, not a second authority.
>
> **The one-sentence thesis:** carry over neo's *structure* (feature-slice · surfaces/anchors ·
> state-files · intent tokens · the gate battery) and *dump* neo's *component foundation* (shadcn
> copy-paste + Radix + the react-markdown stack). The replacement is **one headless primitive (Base UI),
> hand-authored components in a `@orb/ui` package, and the lint rules promoted to package physics.**

---

## 0. Where this came from
Two inputs: (1) the Phase-4b audit-era client review (the neo-tavern client critique — the single-route
`this_chid` jank, the cross-lib footgun cluster); (2) the Claude-Design redesign handoff
(`~/Downloads/neo tsvern.zip` — the intent-token system, surfaces/anchors doctrine, the TanStack Form
toolkit). Both are *prior art*, not law. This doc is the law.

---

## 1. The cake gains a frontend arm
The backend cake (`kit ← contracts ← db ← server`) gains a parallel frontend arm:

```
kit ─┬─→ contracts ─┬─→ db ─→ server          (backend arm, unchanged)
     │              └─→ (client, type-only)
     └─→ ui ─────────────────→ client          (frontend arm — @orb/ui is NEW)
                                  ↑
client also imports kit + contracts(type-only) + ui
```

- **`@orb/ui` is domain-agnostic** — it knows `Button`/`Dialog`/`BarChart`, NEVER `Character`/`Chat`.
  Domain-aware components (a `<CharacterCard>`, a `<MessageRow>`) live in `client/features`, built FROM
  `@orb/ui` primitives + `@orb/contracts` *types* (type-only). This is the seam.
- **`@orb/client` imports** `@orb/ui` (runtime), `@orb/contracts` (type-only — `client-no-backend-runtime`),
  `@orb/kit` (pure utils: ids, tokens, time).
- **`#` subpath imports intra-package, package deps cross-package, ZERO `@/` aliases** (§7.5 / structure
  §2 — the shadcn `@/` tax is gone; neo kept it, orbweaver does not).

### 1.1 The headline win — neo's lint rules become package physics
neo enforced the UI boundaries with lint (`pnpm arch` + dep-cruiser rules). orbweaver makes them
**resolver physics** (the constitution: boundaries are packages, not lint):

| neo lint rule | orbweaver |
|---|---|
| `client-ui-is-pure` (UI imports no features) | `@orb/ui` has no dep on `@orb/client` — **resolver** |
| "app imports only the UI barrel, never raw primitives" | radix/cmdk/vaul/nivo/base-ui are NOT in `@orb/client`'s `package.json` — it physically cannot import them — **resolver** |
| "UI is domain-agnostic" | `@orb/ui` has no dep on `@orb/contracts`/domain — **resolver** |
| design-token parity check | the Tailwind theme is **codegen-derived** from `tokens.json` (§3) — drift is structurally impossible, not policed |

---

## 2. `@orb/ui` — the one home for components
A workspace package = the "one home" (no doubling, §7.4). In a monorepo this replaces shadcn's external
namespaced-registry mechanism entirely — the *package* IS the registry. (Publish a registry only if
cross-repo reuse outside orbweaver ever becomes real — defer until then.)

```
packages/ui/
  package.json          # the ONLY package depending on @base-ui/react, cmdk, vaul, sonner,
                        #   react-resizable-panels, @dnd-kit, @nivo/*, cva, clsx, tailwind-merge, streamdown
  src/
    tokens/             # DTCG single-source (§3) — promote to @orb/tokens only on a 2nd consumer
    primitives/         # each wraps ONE headless behavior behind an orbweaver API (seals the lib)
      button/  { button.tsx · variants.ts (CVA unions) · index.ts }
      dialog/ popover/ tooltip/ select/ switch/ slider/ menu/ field/   ← Base UI behind the seam
      command/   ← seals cmdk        drawer/   ← seals vaul
      toast/     ← seals sonner      resizable/ ← seals react-resizable-panels
      sortable/  ← seals @dnd-kit
    layout/             # Stack · Row · Section · Toolbar · Container (owns container-type — §4)
    charts/             # seals @nivo/* — app says <BarChart>, never imports @nivo
    markdown/           # seals Streamdown (§6.3) — the ONE markdown renderer
    lib/   { cn.ts }    # tailwind-merge config
    styles/ { globals.css }   # imports tokens/generated theme
    index.ts            # subpath exports per group ("./button", "./charts", "./markdown", …)
```

- **Base UI (`@base-ui/react`, 1.x) is THE headless primitive** (D42; ledger §3). It replaces Radix:
  the explicit `Positioner` part kills the portal weirdness, the `render` prop replaces the `asChild`/Slot
  footgun, exit-animation is built in. shadcn is NOT used (no copy-paste registry/CLI — components are
  hand-authored over Base UI; reference basecn.dev / Base UI docs as prior art only).
- **Variants are CVA union types** (`VariantProps<typeof button>`) — the ONLY styling-variation path; a
  bad variant is a `tsc` error. Ad-hoc `className` styling on a primitive is lint-banned.
- **Radix-vs-Base-UI stays reversible** — it's an impl detail *inside* `primitives/*`. The whole point of
  the seam: swapping the headless lib is a `@orb/ui`-internal change, app untouched. (So the Base UI
  `render`-vs-`asChild` API debate, mui/base-ui#3983, is a one-file concern.)

---

## 3. Tokens — DTCG single source, derived theme
The highest-leverage enforcement move, and engine-agnostic:

- Design values live ONCE in **W3C DTCG `.tokens.json`** (`$value`/`$type`; first *stable* spec 2025.10).
- **Style Dictionary v4** codegens BOTH the Tailwind v4 `@theme` block AND a typed TS token map.
- The Tailwind theme is therefore **DERIVED, never hand-authored** → "add a token" has one home, drift is
  impossible by construction (does the parity-check's job at the source).
- The token scale includes a **container-breakpoint scale** (`--cq-sm/md/lg`, §4) alongside spacing/color/
  type/height/z — so container queries also use named tokens, never raw widths.

**DEFERRED-with-a-default (token enforcement level):** the *default* is Tailwind v4 + DTCG + the
raw-value lint gate (top-decile; sufficient). **Panda CSS** (`strictTokens` → a raw value is a `tsc`
error, the most on-philosophy "won't compile > won't pass check") is the deferred upgrade — adopt only if
lint-bypass becomes a real, observed problem. Wiring the same DTCG source into Panda's `theme.tokens` is
the migration path if so. (ledger D42 / §3.)

---

## 4. The container model — 4-tier responsiveness
Responsiveness is **container-driven, not viewport-driven** (the 2026 model). A component adapts to the
*container it was dropped into*, not the screen — which realizes surfaces/anchors AND removes the
`compact`/`inDrawer`/`density` props neo threaded through everything. Physical constraint that drives the
shape: **a container queries its descendants, never itself** → the adapting element is always a *child* of
the container → maps onto parent/child = anchor/surface.

```
SHELL    — the ONLY viewport-aware layer (@media lives here, nowhere else). Macro layout:
           3-pane desktop ⇄ stacked-mobile, drawer ⇄ sheet. Establishes top-level named containers.
ANCHOR   — containment PROVIDER. Wraps the surface in `container-type: inline-size` + `container-name`.
           (Extends the anchor's existing job: it already CHOOSES the container; now it DECLARES it.)
SURFACE  — containment CONSUMER. Pure content; queries `@container` variants. NO layout-context props.
CARD/ROW — sub-container where it must adapt independently inside a grid/list.
```

- **`@media` is allowed ONLY in `app-shell`.** A feature surface using `@media` is RED — it queries its
  container (gate: `no-media-queries-in-features`).
- **`@orb/ui/layout` owns `container-type`** — feature code never writes raw `container-type`/`-name`; it
  uses `<Container name size>` / `<Section container>`. Default `container-type: inline-size` (querying
  both dims needs explicit height + stricter containment — avoid unless required).
- **Density is a SEPARATE axis** from container size: `data-density="comfortable|compact"` (a user/viewport
  pref, attribute-driven) vs the container query (layout space). A component reads both; neither is a prop.
- **Payoff:** "build the surface once, place it anywhere" (drawer · modal · grid cell · full pane) becomes
  literally true, with zero variants and zero layout props.

---

## 4a. React 19 / 19.2 — platform leverage (use these, skip those)
The client targets **React 19 + the React Compiler**. The platform does work you'd otherwise hand-code —
but several celebrated React-19 features are REDUNDANT with the TanStack stack and must be skipped so two
systems don't fight.

**USE:**
- **The React Compiler is ON — stop hand-writing `useMemo`/`useCallback`/`React.memo`.** It memoizes for
  you; manual memo is noise. The ONE blind spot is `useVirtualizer` → sealed in `@orb/ui/virtual-list`
  with `"use no memo"` (§7); feature code never opts out by hand.
- **`<Activity>` (19.2) for the single-route panes.** Keep a pane mounted-but-hidden when you flip away
  (chat ⇄ library) so returning is instant with scroll + form state intact — the principled realization of
  the single-route shell (§5.1). Replaces unmount/remount.
- **`useEffectEvent` (19.2) is THE fix for the effect footguns.** It separates an effect's non-reactive
  part from its deps (read latest values without re-triggering). It is the correct tool for the seam
  effects neo hand-rolled with `prevRef` bookkeeping (the right-drawer sync; the seed-clobber guard, §7) —
  prefer it over ref-juggling.
- **View Transitions API for single-route navigation.** Animate landing⇄chat / library⇄editor while
  preserving spatial context — no router needed (pairs with `<Activity>`). Transition utilities live in
  `@orb/ui` styles.
- **`ref` as a prop (no `forwardRef`).** `@orb/ui` primitives take `ref` like any prop — cleaner authoring.

**SKIP (redundant with the TanStack stack — do NOT bolt on):**
- **React 19 form Actions / `useActionState` / `useFormStatus`** — TanStack Form owns form state (§6.1).
  Two form systems fighting is worse than one.
- **`useOptimistic`** — TanStack Query's `optimisticOptions` owns optimistic updates. No second path.
- React 19 `<form action>` / server-action pattern — orbweaver is tRPC + Query, not server actions.

**BASELINE (non-negotiable):** WCAG 2.2 AA (4.5:1 body contrast · visible focus · keyboard-operable ·
persistent labels — much of it free from Base UI), and `prefers-reduced-motion` respected on every
transition/animation above.

---

## 5. State
- **Server state → TanStack Query** (+ tRPC via `@trpc/tanstack-react-query`). NEVER in zustand.
- **Client/UI state → Zustand** (DECIDED — D42; not Jotai/TanStack Store: gated-zustand is more
  machine-enforceable for amnesiac agents than free-form atoms; the one zustand footgun is gated, §7).
  Gated by `state:files`: one `create(` per file, ≤10 top-level fields, no exported `set`/`getState`/store
  handle, `persist({name})` namespaced. Draft stores via the `createEntityDraftStore` factory.
- **Local-state-first** — `useState`/props unless genuinely cross-tree; stores only for global concerns
  (active selection, theme, the stream buffer).
- **Lifecycle slices modeled as discriminated-union transitions**, not ad-hoc `setState` — the stream/turn
  lifecycle (`turnStarted → delta → turnCompleted|turnAborted`, the ghost slot) is a state machine; model
  it explicitly inside the store (the center-pane `{kind:landing}|{kind:chat}` is the reference). No XState.

### 5.1 Single-route shell + the jank-avoidance rule (the neo lesson)
The URL stays `/` (entity ids never in the address bar; multi-device sync is DB-is-truth + the bus, not
URL-bookmarking). This is fine — but neo's single-route jank came NOT from single-route, it came from
every surface reading one ambient "active character/chat" global and chasing it (the `this_chid` parity
sync effect). **The rule a cold agent cannot get wrong:**

> surfaces own their own state · selecting a thing ≠ a cascade of side effects · NO effect making the
> right panel chase the active chat (no `this_chid` re-coupling).

If "open the library beside a live chat without it yanking the chat" is possible, the jank is gone. If
real deep-links/back-forward ever become wanted, routes are a localized bolt-on (TanStack Router for the
chat id only) — NOT a rewrite.

---

## 6. The stack — keep / dump
| | Decision |
|---|---|
| **DUMP** | **shadcn** (copy-paste workflow) → hand-author `@orb/ui`. **Radix** → **Base UI**. **react-markdown + rehype-sanitize + remark-gfm + rehype-raw** → **Streamdown** (§6.3). **react-syntax-highlighter / Prism** → **Shiki** (free inside Streamdown). The `@/` alias → `#`. |
| **KEEP** | feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery · **Tailwind v4** · CVA+clsx+tailwind-merge · **lucide** · **TanStack** (Query / Router-minimal / Form / Virtual) · **Zustand** · the satellites **cmdk · vaul · sonner · react-resizable-panels · @dnd-kit** · **nivo** (the analytics graphs — kept deliberately; "it has the features I want"). |
| **WRAP** | every kept third-party lib lives behind `@orb/ui`; app imports `@orb/ui`, never the lib. |

### 6.1 TanStack — keep, with discipline
- **Query / Form / Virtual: keep** (load-bearing; dropping = reinventing worse).
- **Router: use it MINIMALLY** — single-route shell means ~3 routes (`/`, `/login`, `/admin/*`). Drop the
  file-based codegen plugin; hand-write the tiny route tree. (Don't swap for wouter — family cohesion wins
  over the marginal ceremony saving.)
- **Form threshold rule:** TanStack Form for entity *editors* (multi-field, draft-survival —
  character/preset/prompt-manager/persona); plain controlled inputs + the same Zod schema for trivial
  1–2-field forms (search box, lone toggle). Don't pay the toolkit tax on a single toggle. RHF stays
  banned (neo decided; never coming back).

### 6.2 Tests
Playwright CT (`.ct.tsx`) for component tests + Playwright e2e (`.spec.ts`); central `tests/` mirror.
Browser is Playwright, NOT Vitest (it hangs) — separate runners, not in `pnpm check`. Add
**visual-regression (Playwright screenshots) as a gate** — the machine substitute for "is this visually
consistent" review.

### 6.3 Markdown + code → `@orb/ui/markdown` = Streamdown
- **Streamdown** (Vercel — a drop-in react-markdown replacement built for AI streaming) is THE markdown
  renderer, used everywhere (chat AND static descriptions → one lib). It repairs incomplete/unterminated
  markdown mid-stream (half-typed code fences, partial tables) instead of flashing, does incremental DOM
  updates (react-markdown re-parses the whole message per token → ~O(n²) → exponential lag on long
  streamed messages), and bundles **Shiki** highlighting + KaTeX + Mermaid + copy/download + security
  policies. Sealed as `@orb/ui/markdown`.
- **VERIFY-AT-BUILD (untrusted content):** Streamdown's built-in sanitization is tuned for AI output
  (semi-trusted). The app also renders UNTRUSTED markdown (user-uploaded character cards, other users'
  messages — D21 "no leaks ever"). Confirm Streamdown's security config is strict enough for the untrusted
  threat model, or layer `rehype-sanitize` behind the `@orb/ui/markdown` seam if not. (ledger D42.)

---

## 7. The sealed gotchas — fix each ONCE, in a place a cold agent can't bypass
Four cross-library footguns observed in neo (all rooted in libs that live *outside* React's render model —
external stores, event-based state, non-memoizable closures — which React 19 + the React Compiler punish).
neo solved each per-site; orbweaver seals each in a primitive so it can't be re-triggered:

| Footgun | Root | Sealed in |
|---|---|---|
| **Virtual × React Compiler** — `useVirtualizer` returns non-memoizable fns; the Compiler memo pass makes the list flash | TanStack Virtual is a Compiler-incompatible lib (React's `react-hooks/incompatible-library` flags it) | a **`@orb/ui/virtual-list`** primitive owns `"use no memo"` + the eslint-disables + the `measure()` effect. Feature code never calls `useVirtualizer` → can't forget the directive (neo re-risks it in 7 files). |
| **Form × React** — `isDirty` is event-based, never auto-clears after submit (#1144) → `useStore(isDirty)+useEffect` loops forever; save bar stays "Unsaved" without a manual reset | TanStack Form persistent-dirty | the **`_shared/form` toolkit** (`useAppForm`) owns reset-after-submit; the banned `useEffect`-on-`isDirty` autosave is gate-flagged |
| **Form × Query × Zustand** — a background refetch reseeds the form and clobbers unsaved typing | three-lib interaction | a **`useSeedFormOnServerLoad`** guard (`seededRef + !isDirty + reset + applyFormValues`) |
| **Zustand × React** — a selector returning a fresh `{}`/`[]` per render spins `useSyncExternalStore` forever | referential instability | the **`createEntityDraftStore`** factory's frozen `EMPTY` + a **gate flagging selectors that return a fresh object/array literal** without `useShallow`/a stable ref |

After these, the chosen libs have zero un-gated footguns.

---

## 8. The gates (physics + lint belts)
**Physics (resolver — can't even resolve):** `@orb/ui` ⇏ `@orb/client`/`@orb/contracts`-domain;
`@orb/client` ⇏ radix/cmdk/vaul/sonner/nivo/base-ui (not in its deps).

**Lint belts (what physics can't express):**
- `no-raw-value` — bans `bg-[#fff]`, `gap-[13px]`, `z-[N]`, inline `style={{}}` numeric literals (Tailwind
  can't type-block these).
- `no-media-queries-in-features` — `@media` only in `app-shell` (§4).
- `no-raw-container-widths` — container queries use the `--cq-*` token scale.
- `no-layout-context-props` — flags `compact`/`inDrawer`/`isSheet`/`density` boolean props on surfaces
  (the threading we're removing).
- `surface-in-a-container` — a surface must be mounted inside an anchor/layout-primitive that provides
  containment (so its `@container` queries resolve).
- the **zustand-selector** gate (§7), `client-feature-front-door`, `client-features-no-cross`,
  `state:files`, `design-token-parity`, `entity-editor`, `icons-lucide-only`, `tanstack-form-only-in-shared`.

---

## 9. What we explicitly do NOT carry from neo
shadcn copy-paste · Radix · the react-markdown stack · react-syntax-highlighter/Prism · the single-route
`this_chid` re-coupling sync effect (the jank) · `@/` aliases (use `#`) · the heavy file-based Router
codegen (single-route needs ~3 hand-written routes) · `compact`/`inDrawer`/`density` layout props
(container queries replace them) · per-feature `useVirtualizer` (the `@orb/ui/virtual-list` primitive
replaces it).

---

## 10. Deferred forks (DEFERRED-with-a-committed-default)
- **Token enforcement level** — DEFAULT: Tailwind v4 + DTCG + lint. Deferred upgrade: Panda `strictTokens`
  (type-level). Revisit only if lint-bypass is observed. (§3)
- **Streamdown sanitization for untrusted content** — verify-at-build; layer `rehype-sanitize` behind the
  seam if the built-in policy is too lax. (§6.3)
- **DECIDED (not forks):** Base UI as the primitive · Zustand for client state · Streamdown for markdown ·
  single-route shell · the container model · the `@orb/ui` package + DTCG tokens.
