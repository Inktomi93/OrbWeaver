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

## 0.5 Phase-6 build manifest (the index — read this first)
> A scannable index for a Phase-6 builder. Every row points to its canonical spec section — this is a table
> of contents, **NOT a second source of truth** (the contract lives in the cited section). **Build order
> (§11.7 / §13.6, born-compliant):** tokens → `@orb/ui` primitives+seals → `@orb/client` data/forms/state
> primitives + the gates → features. A primitive or gate that lands *after* a feature is the rot D43 exists to
> prevent.

**Two new packages:** `@orb/ui` (domain-agnostic components — tree §2) · `@orb/client` (flat feature-slice — tree §2.1).

**`@orb/ui` primitives + seals** (each seals ONE lib behind an orbweaver API):
| Primitive | Seals | Spec |
|---|---|---|
| button · dialog · popover · tooltip · select · switch · slider · menu · field | Base UI | §2 |
| command · sortable | cmdk · @dnd-kit (the `@dnd-kit/react` rewrite) | §2 / §11.3 |
| toast · drawer (swipe-dismiss + virtual-keyboard) | **Base UI native** (D54 — dropped sonner + vaul) | §2 |
| icons | lucide-react (gate `icons-lucide-only`) | §2 |
| diff | `diff` (jsdiff v8+ — snapshot/edit-history diffs, D28) | §2 |
| layout (Stack/Row/Section/Toolbar/Container) | `container-type` | §4 |
| charts + meter | ECharts (`echarts`/`echarts-for-react`) | §11.3 (D52) |
| virtual-list (generic) + message-list (chat) | TanStack Virtual (`directDomUpdates`) | §11.3 (D54) |
| markdown | Streamdown (two trust policies) | §6.3 / §11.6 |
| stream (smooth-text pacer · TTFT shimmer) | domain-free string-math | §6.3.1 |
| sandbox-frame · MessageMedia · ThemeScope · lightbox | iframe/CSP · img+a/v · token scope | §12 |

**`@orb/client` data / forms / state primitives** (the §13.1 contracts):
| Primitive | Job | Spec |
|---|---|---|
| `createEntityMutation` | optimistic + rollback + sticky-error reset + invalidate + meta-toast | §13.1 |
| `createCollectionSurface` | infinite + `maxPages` + `keepPreviousData` + virtual-list + select | §13.1 |
| `<QueryBoundary>` | reset-handshake + `useSuspenseQueries` + `startTransition` | §13.1 |
| `useGatedQuery` | `skipToken` gating (kills `castId("")`) | §13.1 |
| `invalidation.ts` | event→`queryFilter` seam | §11.3 |
| bus reducer (`applyChatBusEvent`) | SSE→cache, pure + exhaustive | §11.1 |
| `createSavedEntityForm` / `createAutosaveEntityForm` | the editor factories (six-obligation) | §13.1 / §13.4 |
| `useAppForm` | the single `createFormHook` instance | §11.3 |
| `createEntityDraftStore` | gated Zustand draft (frozen `EMPTY` + `useShallow` + `persist`) | §5 / §7 / §13.1 |
| `ChatHandle` | `committed|draft` discriminated handle | §11.3 |

**Lookups:** surface→primitive (what to reach for) → **§13.2** · the full **gate registry** → **§8** · the
keep/dump/wrap stack → §6 · where each rich-content piece lives → §12.5.

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
| "app imports only the UI barrel, never raw primitives" | cmdk/@dnd-kit/echarts/base-ui are NOT in `@orb/client`'s `package.json` — it physically cannot import them — **resolver** |
| "UI is domain-agnostic" | `@orb/ui` has no dep on `@orb/contracts`/domain — **resolver** |
| design-token parity check | the Tailwind theme is **codegen-derived** from `tokens.json` (§3) — drift is structurally impossible, not policed |

---

## 2. `@orb/ui` — the one home for components
A workspace package = the "one home" (no doubling, §7.4). In a monorepo this replaces shadcn's external
namespaced-registry mechanism entirely — the *package* IS the registry. (Publish a registry only if
cross-repo reuse outside orbweaver ever becomes real — defer until then.)

```
packages/ui/
  package.json          # sealed runtime libs (the ONLY package depending on these): @base-ui/react · cmdk · @dnd-kit ·
                        #   @tanstack/react-virtual · echarts · echarts-for-react · streamdown · lucide-react · tailwind-variants · diff
                        #   peer/build: react (PEER — react-dom is @orb/client's, the renderer) · tailwindcss + @tailwindcss/vite ·
                        #   style-dictionary (§3 token codegen).  [D54: toast + drawer = Base UI native (no sonner, no vaul ~deprecated) ·
                        #   no react-resizable-panels · tv subsumes cva/clsx/tw-merge · @dnd-kit kept (no native DnD; use the @dnd-kit/react rewrite)]
  src/
    tokens/             # DTCG single-source (§3) — promote to @orb/tokens only on a 2nd consumer
    primitives/         # each seals ONE headless behavior behind an orbweaver API
      button/  { button.tsx · variants.ts (tailwind-variants slots/unions) · index.ts }
      dialog/ popover/ tooltip/ select/ switch/ slider/ menu/ field/ toast/ drawer/   ← Base UI behind the seam
      command/ ← cmdk   sortable/ ← @dnd-kit (the @dnd-kit/react rewrite)
      virtual-list/ ← TanStack Virtual (directDomUpdates, generic)   message-list/ ← the chat seal (§11.3, D54)
      icons/   ← lucide-react (the ONE icon set; gate icons-lucide-only)
    layout/             # Stack · Row · Section · Toolbar · Container (owns container-type — §4)
    charts/             # seals ECharts — <BarChart>/<ScatterChart> + meter/ (1-D bars). §11.3 (D52)
    markdown/           # seals Streamdown — the ONE renderer, two trust policies (§6.3 / §11.6);
                        #   + a `toPlainText` (remark `strip-markdown`, same pipeline) for previews/snippets/notifications (D54)
    stream/             # smooth-text (the pacer, domain-free) + the "Thinking…" shimmer (§6.3.1)
    content/            # sandbox-frame (untrusted iframe) · MessageMedia (img+a/v) · ThemeScope · lightbox (hand-built over Dialog+MessageMedia, §12.3)
    diff/               # seals `diff` (jsdiff v8+ — modern TS/async, NOT diff-match-patch) — character-snapshot (D28) + message-edit-history diff views
    lib/   { cn.ts }    # the cn() helper (tailwind-variants' built-in merge)
    styles/ { globals.css · view-transitions }   # imports tokens/generated theme
    index.ts            # subpath exports per group ("./button", "./charts", "./markdown", …)
```

- **Base UI (`@base-ui/react`, 1.x) is THE headless primitive** (D42; ledger §3). It replaces Radix:
  the explicit `Positioner` part kills the portal weirdness, the `render` prop replaces the `asChild`/Slot
  footgun, exit-animation is built in. shadcn is NOT used (no copy-paste registry/CLI — components are
  hand-authored over Base UI; reference basecn.dev / Base UI docs as prior art only).
- **Variants are tailwind-variants union types** (`VariantProps<typeof button>`; tv's `slots` for multi-part
  primitives — D54) — the ONLY styling-variation path; a
  bad variant is a `tsc` error. Ad-hoc `className` styling on a primitive is lint-banned.
- **Radix-vs-Base-UI stays reversible** — it's an impl detail *inside* `primitives/*`. The whole point of
  the seam: swapping the headless lib is a `@orb/ui`-internal change, app untouched. (So the Base UI
  `render`-vs-`asChild` API debate, mui/base-ui#3983, is a one-file concern.)

### 2.1 `@orb/client` — the feature-slice tree
**Provenance.** No orbweaver doc drew this tree; the intent was recorded as prose only (BUILD-PLAN Phase-6 §2:
*"carry neo's STRUCTURE — feature-slice · surfaces/anchors · `state:files`"*; `_FANOUT-BRIEF` excluded `src/client`
as "a fresh rebuild"). This IS that structure: **neo's exact shape** (verified against neo's live `src/client`),
minus the three things orbweaver kills, plus `data/`+`forms/` elevated to top-level peers — by the *same* logic
neo used to elevate `state/` out of `lib/` (load-bearing + numerous). The current `packages/client` stub
(`app/entities/features/shared`) is a discarded FSD guess — **orbweaver is NOT FSD** (no `entities/`/`shared/`
layers), it is flat feature-slice.

```
packages/client/
  package.json          # @orb/ui · @orb/contracts (type-only) · @orb/kit · zustand · @trpc/tanstack-react-query ·
                        #   @tanstack/{react-query, react-router, react-form} · react + react-dom (the renderer) ·
                        #   workbox-window (PWA runtime).   build: vite-plugin-pwa (installable + offline shell, D54).
                        #   NO raw radix/cmdk/echarts/base-ui (§1.1 physics)
  src/
    sw.ts / manifest    # PWA: service-worker (workbox precache the app shell) + web-app-manifest (install) — D54
                        #   offline scope = the shell + last-opened chat; live data still needs the server (SSE bus)
    main.tsx            # entry / composition root (mounts providers; injects the cross-feature ops — §11.0)
    routes/             # ~3 HAND-WRITTEN routes: / · /login · /admin/* (lazyRouteComponent) — no file-based codegen (§6.1)
    data/               # the data-layer primitives (TanStack Query + tRPC) — §13.1. ELEVATED from neo's lib/, same as state/
      trpc.ts           #   the proxy = the queryKey+queryFn factory (gate no-array-literal-querykey)
      query-client.ts   #   the §6.1 QueryClient defaults
      invalidation.ts   #   event→queryFilter map (gate no-inline-invalidate-outside-seam) — §11.3
      create-entity-mutation.ts · create-collection-surface.ts · query-boundary.tsx · use-gated-query.ts
      bus/              #   applyChatBusEvent (pure exhaustive reducer, §11.1) + the thin SSE transport hook
    forms/              # the editor factories — the SINGLE createFormHook instance — §13.1/§13.4. WAS neo's _shared/form (banned)
      use-app-form.ts · create-saved-entity-form.ts · create-autosave-entity-form.tsx · bound-fields/
    state/              # ALL gated Zustand stores, FLAT (gate state:files: one create/file, ≤10 fields, no exported set/getState)
      _create-entity-draft-store.ts (frozen EMPTY + persist version/migrate) · center-pane-store.ts · <entity>-draft-store.ts …
    features/           # the slices — cross-feature reads ONLY via trpc.* (§11.0); NO _shared/ drawer
      app-shell/        #   the shell: the ONLY viewport @media site (§4b axis 2); the clamp-width overlay (§11.1);
                        #     TOP_NAV_SLOTS ↔ MODAL_SLOTS registries (gate check:registry-pairing)
      auth/ character/ chat/ corpus/ credentials/ persona/ preset/ prompt-manager/ settings/ tag/ user-admin/ workloads/ world-info/
        <feature>/      #   { surfaces/ (containment CONSUMERS, @container) · anchors/ (containment PROVIDERS) ·
                        #     components/ (leaf) · hooks/ (trpc.* reads via useGatedQuery; createEntityMutation calls) · lib/ · index.ts }
    lib/                # cross-cutting display/util seams left after elevation: message-render · time · cn re-export · download-json · notify
      time.ts           #   THE date/time seam (carry neo's pipeline): server sends **epoch-UTC numbers**; client
                        #     formats to the **browser-local tz** via memoized `Intl.DateTimeFormat`/`RelativeTimeFormat`
                        #     (Intl defaults to the browser tz+locale); `now` is INJECTED (determinism §11.5 — no
                        #     `new Date()`/`Date.now()` in render). Never store/send formatted dates or a tz; the
                        #     wire is always a UTC epoch number, localization happens ONCE here at the display edge.
    styles/ globals.css · testIds.ts (typed registry, §11.5) · vite-env.d.ts
```
- **Why not FSD:** `@orb/ui` already IS the shared-component layer, so FSD's `shared/ui` is redundant; the
  `entities/` layer overlaps the feature concept and adds ceremony neo's proven flat slice never needed.
- **Three deletions from neo:** `components/` + `components/ui/` → the `@orb/ui` package; `features/_shared/` →
  dissolved (its generic bits → `@orb/ui`, its form toolkit → `forms/`, its cross-feature reads → `trpc.*`);
  file-based `routes/` codegen → ~3 hand-written routes.

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
  you; manual memo is noise. The ONE blind spot is `useVirtualizer` (interior mutability) → sealed in
  `@orb/ui/virtual-list` with **`directDomUpdates: true` + `containerRef`** — TanStack Virtual's released,
  React-19-Compiler-E2E-tested fix (3.14+), **NOT `"use no memo"`** (§7/§11.8/D54); feature never wires it by hand.
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

## 4b. Responsive doctrine — the FOUR axes (code once; desktop · widescreen · mobile from one build)
"Mobile just works" is NOT one technique — it's using the RIGHT tool per axis instead of a `max-width`
ladder. **The code-once guarantee: a feature author writes ONLY axis 1; axes 2–4 live once in the
shell/token/primitive layer.** There is no separate mobile build — one set of placement-agnostic surfaces +
one shell that reflows + a touch-first token baseline + platform CSS in three primitives.

| Axis | What varies | Tool | Where it's written |
|---|---|---|---|
| **1 — component layout** | a surface in a wide pane vs a narrow drawer | **`@container`** + container-query units (`cqi`) + `clamp()` | **features** (the ONLY responsive thing they write) |
| **2 — macro structure** | 3-pane desktop ⇄ stacked mobile; side-drawer ⇄ bottom-sheet (Base UI Drawer) | **`@media`** (viewport) | **SHELL only** (~1 file; the sole legal `@media` site) |
| **3 — device capability** | touch targets; hover affordances | **`@media (pointer/hover)`** + token sizing | **token/shell layer** (never features) |
| **4 — mobile platform** | keyboard, safe-area, overscroll, viewport height | **CSS primitives** (`dvh`/`svh`, `env()`, viewport meta) | **shell + composer/scroll primitives** (once) |

**Axis 1 (the core — verified 2026 standard, 95%+ support).** A surface adapts to *its container*, not the
screen — same `<CharacterGrid>` is 4-up in a wide pane, 1-up in a drawer, automatically. No mobile variant,
no `compact`/`inDrawer` prop (`no-layout-context-props`). Fluid type/spacing INSIDE a component use container
units `cqi`+`clamp()`, not viewport units.

**Axis 2.** The one genuinely viewport-dependent reflow, in the SHELL: 3-pane ⇄ stack, drawer ⇄ sheet. Tiny
(neo: one `clamp()` width var + the overlay model, §11.2). `no-media-queries-in-features` keeps it there.

**Axis 3 — capability, NOT size (the "do it right once" inversion).** hover/pointer are media-query-only
(container queries can't see them). **Touch-first baseline:** interactive primitives meet the ≥44px touch
floor *unconditionally* via token control-heights; `data-density="compact"` *tightens* for fine pointers —
so there's nothing to branch (invert the usual desktop-first→bolt-on-mobile). Hover is only ever an
*enhancement* (`@media (hover:hover)`); **every hover action has a tap-equivalent** (the kebab IS the tap
path). Base UI suppresses tooltips on touch for free. *Gate `touch-target-floor`: interactive primitives may
not set a control-height below the touch token.*

**Axis 4 — mobile platform CSS, baked into 3 primitives:**
- **`dvh`/`svh` units, not `vh`** (with a `vh` fallback line) — `svh` where above-fold must stay visible,
  `dvh` for the adaptive shell. Use intentionally (dvh recalcs on toolbar expand/collapse).
- **The keyboard gotcha (verified):** `dvh`/`svh` are NOT shrunk by the virtual keyboard (it shrinks the
  *visual* viewport, not the *layout* viewport these units reference) → set **`interactive-widget=resizes-content`**
  in the viewport meta so the composer reflows above the keyboard (Android/Chromium); `visualViewport` API
  only for precise composer-pinning if ever needed.
- **`env(safe-area-inset-*)`** padding on shell + composer (notch / home-indicator); **`overscroll-behavior:
  contain`** on every scroll region (no pull-to-refresh / scroll-chaining fighting the app); `inputmode`/
  `type=` on inputs (Base UI fields set these).

**Why no second build:** Base UI gives touch/keyboard/pointer *interaction* correctness for free (focus,
touch-dismiss, tooltip-on-touch, ARIA); we own only *layout* (axes 1–2) + *platform CSS* (axis 4), and axes
2–4 are all shell/token/primitive-level. A feature writes a `@container` surface, drops it in an anchor, and
mobile works — macro reflow is the shell's, touch sizing is the token baseline, keyboard/safe-area/overscroll
are the composer/scroll primitives'. (D42 §4 + D43 §11.2; verified 2026-06.)

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
| **DUMP** | **shadcn** (copy-paste workflow) → hand-author `@orb/ui`. **Radix** → **Base UI**. **react-markdown + rehype-sanitize + remark-gfm + rehype-raw** → **Streamdown** (§6.3). **react-syntax-highlighter / Prism** → **Shiki** (free inside Streamdown). **nivo** (the 6 `@nivo/*` corpus packages) → **ECharts** (D52 — nivo stuck at v0.99, see §11.8). The `@/` alias → `#`. |
| **KEEP** | feature-slice · surfaces/anchors · state-files · intent tokens · the gate battery · **Tailwind v4** · **tailwind-variants** (slots; subsumes cva+clsx+tailwind-merge — D54) · **lucide** · **TanStack** (Query / Router-minimal / Form / Virtual) · **Zustand** · the satellites **cmdk · @dnd-kit** · **ECharts** (replaces nivo, D52). **Base UI now native: toast + drawer** (dropped **sonner** + **vaul**, D54); **dropped react-resizable-panels** (shell uses the clamp-overlay, §11.1). |
| **WRAP** | every kept third-party lib lives behind `@orb/ui`; app imports `@orb/ui`, never the lib. |

### 6.1 TanStack — keep, with discipline
> **`QueryClient` defaults (born-compliant — from the full-docs mine, `client-tanstack-query-notes.md`):**
> `staleTime: Infinity` (the SSE bus drives freshness — **NOT `'static'`**, which silently ignores
> `invalidateQueries`; a gate should ban `'static'` on bus-backed keys) · `gcTime: 5*60_000` ·
> `refetchOnWindowFocus: false` (bus owns liveness) · **`refetchOnReconnect: true`** (SSE-gap catch-up —
> disabling it is the actual bug) · `refetchOnMount: true` · `networkMode: 'online'` · `structuralSharing: true` ·
> `throwOnError: false` (the `<QueryBoundary>` opts in per-tree) · mutations `retry: 0` · global error toasts via
> `QueryCache`/`MutationCache` `onError` keyed off `meta` (coexists with per-mutation error slots). **Gate-boundary
> note:** `no-inline-cache-surgery-in-stream` must scope to stream/subscription bodies only — it must NOT trip on
> the legitimate `setQueryData` inside `createEntityMutation.onMutate`. Adopt `skipToken` (kills the
> `castId<X>("")` sentinel) and `@tanstack/eslint-plugin-query` `flat/recommended-strict`.
> **Reference companions** (this directory — full-read examples + deep-docs mines; the distilled verdicts are
> already folded into the spec sections cited, so these are evidence/provenance, not extra law):
> | Companion | Fed into |
> |---|---|
> | `client-tanstack-query-examples.md` · `-query-notes.md` | the QueryClient defaults (above) · `createEntityMutation` · `createCollectionSurface` · `<QueryBoundary>` · §13 |
> | `client-tanstack-form-examples.md` · `-form-notes.md` | the editor-factory six-obligation contract (§13.4) · confirms Form is React-Compiler-clean, footguns #4/#5 FACTORY-ORIGINAL |
> | `client-tanstack-router-notes.md` | the Router verdict + traps (below) |
> | `client-tanstack-virtual-notes.md` | the D54 "keep TanStack Virtual" reversal (§11.8) |
> | `client-zustand-notes.md` | the §5/§13.1 store conventions (frozen `EMPTY` + `useShallow`; `persist` partialize/migrate) |
- **Query / Form / Virtual: keep** (load-bearing; dropping = reinventing worse).
- **Router: use it MINIMALLY** — single-route shell means ~3 routes (`/`, `/login`, `/admin/*`). Drop the
  file-based codegen plugin; hand-write the tiny route tree. (Don't swap for wouter — family cohesion wins
  over the marginal ceremony saving.) **Full-docs mine → `client-tanstack-router-notes.md` (this directory).**
  Verdict: all three calls (single-route/no-URL-ids · hand-written code-based tree, plugin dropped · router
  owns nav not data) are explicitly supported — **type-safety survives dropping the codegen plugin** (it's
  inference + one `declare module { Register }`, not codegen). Two real traps it surfaced: (1) `useBlocker`
  will NOT fire on the in-app editor pane-switch (it's a reducer state change, not a navigation) → the editor
  dirty-guard must be **hand-rolled in-app**, not `useBlocker`; (2) the router's built-in View Transitions fire
  only on URL commits (`pathChanged` is always false in our shell) → §4a's **hand-rolled** VT is correct, not a
  workaround. Steal-list: router-context DI (forward `queryClient`/`trpc`, never construct), `beforeLoad`+
  `redirect` auth gate, `lazyRouteComponent` for `/admin/*`, `createMemoryHistory` in tests, DEV-gated devtools.
- **Form threshold rule (CORRECTED — D54; we were under-scoping it to "entity editors"):** a **form factory**
  (§13) is the home for **ANY multi-field form** — the trigger is **≥3 fields OR validation OR save/draft
  semantics**, NOT "is it an entity." That is a much larger set than the 4 entity editors: it also covers
  **settings panels, connection/credential add+edit, group-chat config, room overrides, the D44 theme-override
  editor, and user-admin create/edit** (all were Form candidates being under-served). Only **genuinely trivial**
  inputs stay plain controlled + the same Zod schema — a 1–2-field search box, a lone toggle, a single rename.
  Don't pay the toolkit tax on a single toggle; do NOT hand-roll a 6-field config panel either. **Full
  surface→factory map in §13.4.** RHF stays banned (Compiler-incompatible; §6 / D54; never coming back).

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
  threat model, or layer `rehype-sanitize` behind the `@orb/ui/markdown` seam if not. (ledger D42; the
  concrete two-policy answer is §11.6.)

#### 6.3.1 The streaming-reveal stack — the three layers, and who owns each (D43; verified 2026-06)
neo had real **markdown-parse + streaming display bugs** (unterminated-fence flashes, partial-markdown
mis-render, an O(n²) full-reparse-per-token lag) — and the audit shows *why*: it hand-rolled the parse/repair
layer (`repairStreamingTail` + a custom `incremental` block-memoize) that is now a **solved problem**. Split
the stack into three layers with one owner each; **Streamdown replaces the layer that broke**, and we keep
only the one piece neo did better than the ecosystem:
1. **Parse · repair · incremental · fade · security → Streamdown (owns this).** Its incomplete-markdown
   repair, incremental DOM, per-word animation (`fadeIn`/`blurIn`/`slideUp`, configurable), and
   sanitize+harden are purpose-built for streaming AI markdown. **DELETE neo's `repairStreamingTail`, the
   hand-rolled `incremental` reparse, AND the `.stream-word` CSS** — Streamdown does all three, robustly.
   This is the fix for "streaming got weird," not a re-port of it.
2. **Pacing → KEEP neo's `useSmoothText`, sealed as a pure `@orb/ui` primitive.** Streamdown has **no
   pacing** (it animates whatever it's handed per render — verified at streamdown.ai/docs/animation); an
   external pacer "works seamlessly". `useSmoothText` is the genuinely best-of-best layer: adaptive
   backlog-drain (calm slow models / near-realtime fast), **grapheme-cluster safety** (no torn emoji/ZWJ —
   *no library does this*), trailing-partial-word + tag-aware hold-back, hidden-tab flush, reduced-motion
   passthrough, the dt-honesty single-loop fix. It is domain-free string-math + rAF → belongs in `@orb/ui`.
   Pipeline: tokens → `useSmoothText` (reveal cadence + cut-point) → Streamdown (repair + render + fade the
   new words). Do NOT swap it for AI SDK `smoothStream` (server-side, fixed-delay, cruder, drags in a
   transport we don't use).
3. **TTFT affordance → keep the "Thinking…" shimmer** (cheap, domain-agnostic; the pre-first-token state).
- **VERIFY-AT-BUILD:** confirm Streamdown's fade granularity (`sep:"word"`) composes with the pacer's
  word-snapping — both think in words, so newly-committed paced text should fade once, not double-animate.
- **Re-pin or retire the tag-aware hold-back** (`trailingOpenTagStart`) by whether orbweaver's chat keeps
  neo's `<speaker>`-span wire format; it exists only to stop a partial `<spea…` flashing as literal text.

**HONEST RISK — Streamdown's open bugs cluster in code-blocks-while-streaming, the SAME spot neo's did
(verified 2026-06; ~37 open issues).** Capability is complete (GFM tables/tasklists/strikethrough · Shiki
code highlighting — best-in-class, an upgrade on neo's Prism · KaTeX · Mermaid · incomplete-block repair),
but the streaming-time code-block path is its soft spot: #473 fenced blocks buffer-not-incremental, #402
Shiki re-highlight flicker per frame, #195 huge code blocks freeze the tab, #343 lazy code/mermaid chunks
crash after deploy (stale hashes + missing error boundary). So Streamdown is "trade hand-rolled bugs for a
maintained library's upstream-fixed bugs," NOT "weirdness solved." It is still the right call — the
alternative (hand-wiring react-markdown+remark+rehype+Shiki) is more code and re-inherits neo's repair
problem — but adopt with these **guards as build-gates, not assumptions:**
  1. **Pin a version floor ≥ 2.5** (where the code-block + long-line + unknown-language-fallback fixes landed).
  2. **The pacer mitigates the flicker (#402/#473):** feeding Streamdown word-snapped ~30fps commits (not
     raw per-token deltas) cuts the re-highlight churn — make this an explicit reason the pacer sits in front.
  3. **Wrap the lazy `CodeBlock`/`Mermaid` chunks in an error boundary** inside `@orb/ui/markdown` (#343) —
     orbweaver wants this anyway; it converts a deploy-time white-screen into a graceful fallback.
  4. **Large-code-block perf guard (#195):** a max-render/virtualize threshold for pathological blocks.
  5. **Golden-test streaming code fences** against the #473/#402 scenarios before chat commits to it — the
     audit's "test the streaming code-block path" is a Phase-5 checkpoint, not a hope.

---

## 7. The sealed gotchas — fix each ONCE, in a place a cold agent can't bypass
Four cross-library footguns observed in neo (all rooted in libs that live *outside* React's render model —
external stores, event-based state, non-memoizable closures — which React 19 + the React Compiler punish).
neo solved each per-site; orbweaver seals each in a primitive so it can't be re-triggered:

| Footgun | Root | Sealed in |
|---|---|---|
| **Virtual × React Compiler** — `useVirtualizer`'s return is internally mutable; the Compiler memo pass can flash the list | the interior-mutability issue (now FIXED upstream) | a **`@orb/ui/virtual-list`** primitive owns the **`directDomUpdates: true` + `containerRef`** fix (TanStack Virtual 3.14+, Compiler-E2E-tested — **NOT `"use no memo"`**, now obsolete) + the `measureElement` wiring. Feature never calls `useVirtualizer` → can't forget the config (neo re-risked the old `"use no memo"` hatch in 7 files; D54). |
| **Form × React** — `isDirty` is event-based, never auto-clears after submit (#1144) → `useStore(isDirty)+useEffect` loops forever; save bar stays "Unsaved" without a manual reset | TanStack Form persistent-dirty | the **`client/forms` factories** (`useAppForm`) own the post-submit reset; the banned `useEffect`-on-`isDirty` autosave is gate-flagged |
| **Form × Query × Zustand** — a background refetch reseeds the form and clobbers unsaved typing | three-lib interaction | a **`useSeedFormOnServerLoad`** guard (`seededRef + persistent-isDirty + reset + applyFormValues`) baked into the saved-form factory |
| **Zustand × React** — a selector returning a fresh `{}`/`[]` per render spins `useSyncExternalStore` forever | referential instability | the **`createEntityDraftStore`** factory's frozen `EMPTY` (+ `useShallow` for multi-field selectors) + a **gate flagging fresh object/array literals** without `useShallow`/a stable ref |

After these, the chosen libs have zero un-gated footguns. **The two FORM rows above are 2 of the six editor
obligations the factories bake — the full contract is §13.4 (the canonical home; the D54 docs mine corrected
several details, e.g. delete `fieldValuesEqual`, reset in a post-submit *effect*). Don't build a form against
this table; build against §13.4.**

---

## 8. The gates (physics + lint belts)
**Physics (resolver — can't even resolve):** `@orb/ui` ⇏ `@orb/client`/`@orb/contracts`-domain;
`@orb/client` ⇏ cmdk/@dnd-kit/echarts/base-ui/streamdown (not in its deps).

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

**Ratified from the audit (D43 — §11; full list + rationale there).** Physics: dep-cruiser bans
`@tanstack/react-virtual` / `echarts`+`echarts-for-react` / `@dnd-kit/*` outside their `@orb/ui` seals, and `client ⇏ @orb/server`
(wire types come from `@orb/contracts`). Lint belts: `no-array-literal-querykey` · `no-inline-invalidate-outside-seam`
· `no-inline-cache-surgery-in-stream` · `no-multiplexed-mutation-error` · `bus-onData-no-store-write` ·
`no-form-reset-in-autosave` · `no-client-wire-redeclare` · `persist-shape-needs-version` · `no-fake-disabled-id`
· client-determinism (no `Date.now()`/`new Date()`/`Math.random()` in render — seeded PRNG allowed) ·
`check:registry-pairing` · the typed-`testId` gate · `touch-target-floor` (interactive primitives meet the
≥44px touch token — §4b) · the token gates extended to ALL feature+ui TSX
(no `components/ui/`-style exemption) + named-non-token-color ban (`--scrim`). **No directory is exempt from a
boundary rule** (the `_shared` + `components/ui/` exemptions are what rotted neo — §11.0).

**Rich-content gates (D44 — §12.6):** `no-untrusted-html-in-main-dom` · `no-external-media-without-gate` ·
`theme-override-only-via-scope` · `CSP-headers-present`.

**Reuse-model gates (D54 — §13.3):** `no-static-staletime-on-bus-keys` · `no-inline-cache-surgery-in-stream`
(scoped to subscription/stream bodies — must NOT flag `createEntityMutation.onMutate`) ·
`persist-partialize-and-total-migrate` · `form-factory-for-multifield` · `virtualizer-only-in-seal`. Plus the
adopted upstream linters: **`@tanstack/eslint-plugin-query` `flat/recommended-strict`** (`prefer-query-options`
forces the proxy key) + **`eslint-plugin-react-hooks` `recommended-latest`** (the Compiler's Rules-of-React
enforcement — load-bearing).

> **This §8 is the gate INDEX.** Each gate's rationale lives where it was specced (§11.x / §12.6 / §13.3); a
> Phase-6 builder reads the full list here and follows the section ref for the why.

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
  seam if the built-in policy is too lax. (§6.3) **PROMOTED by D43 (§11.6) to a HARD checkpoint when chat
  markdown lands** — the audit confirmed chat is the *only* untrusted-markdown render path (character/persona
  fields render as escaped text), so this is no longer a soft default: it governs what gets rendered.
- **DECIDED (not forks):** Base UI as the primitive · Zustand for client state · Streamdown for markdown ·
  single-route shell · the container model · the `@orb/ui` package + DTCG tokens.

---

## 11. Ratified from the full neo-client audit (ledger D43)
**Provenance.** Ten general-purpose agents read **every file** in neo's client in full (~51k LOC: `state` ·
`lib` · `routes` · `components` · `styles` · all 13 features) against a shared KEEP / DUMP / IMPLICIT-CONVENTION
/ CROSS-LIB-FOOTGUN / ENFORCEABLE-RULE contract. This section is the ratified synthesis; D43 is the decision
record. **The findings converged across slices** — the same root causes recur in chat, character, corpus,
credentials, app-shell — which is what makes them load-bearing rather than slice-local.

### 11.0 Why neo rotted *despite* being structured + enforced (the three root causes)
The whole point of reading neo is that it had feature-slices, dep-cruiser, a token system, and ~104 gated
queryKeys — and still became a mess. It rotted in exactly three seams, and orbweaver closes all three by
construction:

1. **Exemption zones become rot zones.** Two directories were carved OUT of the rules: `features/_shared/`
   was exempt from `client-no-cross-feature` (dep-cruiser `pathNot`), and `components/ui/` was exempt from
   the four token gates. **Every documented production bug, every raw style value, and the entire
   cross-feature-coupling mess lived in those two exempt zones.** The rule herded the rot INTO the drawer
   (`_shared`'s own litmus was "if it imports a feature, it goes here"). ⇒ **orbweaver rule: no directory is
   exempt from a boundary rule.** `@orb/ui` is a real package under the same token gates (no allowlist);
   there is no `_shared` drawer.

2. **Consumer-obligation footguns leak as comments and rot; library-owned ones don't.** The form toolkit
   *fixes* the footguns it owns (single-instance context, Select sentinel, rollback-removeQueries). The four
   that require the **call site** to remember something — `reset(value)`-after-submit, silent `setValue` for
   non-user writes, `onFieldUnmount` flush, `key={entityId}` remount — leaked as prose, and **only one of
   the four editors honored all of them.** Forgetting `reset(value)` silently bricks the save bar and reverts
   Discard to pre-save values (data loss) with a green `check`. ⇒ **orbweaver rule: every footgun is carried
   by STRUCTURE (a factory/primitive the call site cannot bypass), never by a remembered convention.**

3. **The cross-feature CONTRACT was unrecognized, so coupling pooled.** neo conflated "imports another
   feature's React module" with "couples to another feature," so a legit cross-feature *read* — which only
   calls `trpc.worldInfo.*`, the server's public front door — had no legal home and got dumped in
   `_shared/world-book-attachments/`, `_shared/persona-connections/`, etc. ⇒ **orbweaver rule: the tRPC
   router + `@orb/contracts` ARE the cross-feature contract; calling a procedure is not coupling.** ~29 of
   neo's 66 `_shared` files evaporate as a *category*, not by tidying.

### 11.1 KEEP-BY-CONSTRUCTION (neo got these right — lock as physics, don't let them re-rot)
- **queryKeys are 100% tRPC-codegen-derived.** The "~104 sites = mess" worry was **wrong**: all 104 are
  `trpc.X.Y.queryKey()`; there are **zero** ad-hoc `queryKey:[...]` arrays in the entire client. The tRPC
  proxy IS the key factory. *Gate `no-array-literal-querykey`* (force the proxy; lock the win).
- **The stream/turn lifecycle is the reference — carry it almost verbatim.** `applyChatBusEvent(event,deps)`
  is a **pure, extracted, exhaustive switch** over a server-authoritative discriminated union, node-testable
  against a real QueryClient with no SSE; the hook is a thin transport adapter. Slot lifecycle is owned by
  the **terminal** turn events (Stop stays live across the whole turn incl. TTFT); `openSlot` is idempotent
  with a **lazy** id factory (no UUID per token). *Gate: all chat-cache writes route through the pure
  reducer — `no-inline-cache-surgery-in-stream` (no `setQueryData`/store-set inside a subscription/component
  body).*
- **Per-mutation error channels, never multiplexed.** TanStack v5 mutation errors are *sticky* until the
  next fire; a `a.error ?? b.error` fed into a dialog leaks action A's failure into B's surface (neo's
  `[V9-cluster]`). One error slot per mutation. *Gate `no-multiplexed-mutation-error`.*
- **Registry-as-data shell + derive-don't-respell registries.** `TOP_NAV_SLOTS`/`MODAL_SLOTS`,
  `ROLE_REGISTRY`, `PROVIDER_META: Record<Enum,…>` — the array/record IS the panel; a missing member is a
  `tsc` error, not a stale `<Select>`. Carry.
- **The clamp-width overlay shell is the SHELL-tier reference (and needs ZERO `@media`).** One master
  `--width-shell-content: clamp(680px, ${chatWidthPct}dvw, 100dvw)` var at the root; drawer width *derives*
  (`max(360px, (100dvw − content)/2)`); closed overlays are `absolute` + `-translate-x-full` so they consume
  zero width and never reflow. neo achieves the "3-pane resizable" feel with **no media queries and no
  `react-resizable-panels`** in the macro shell. This is how the SHELL tier hits "viewport-aware in one place."
- **The bus→cache sync seam (`use-workload-events`) is the only sanctioned SSE shape.** A subscription
  `onData` may (a) buffer transient progress in **local** state and (b) `invalidateQueries(readKey)` — it
  must **never** become a second store. The invalidation key must be produced by the same `*.queryKey(args)`
  the reader uses (neo's `[V9-2]` shipped from a key-shape mismatch). *Gate `bus-onData-no-store-write`.*

### 11.2 The container model is a near-zero-cost FREEZE, not an unwind (the audit's happy surprise)
The plan assumed it must unwind neo's `compact`/`inDrawer`/`density` prop threading. **It doesn't exist in
the hot paths:** chat has **0** occurrences of those props and **0** `@media`/`@container`; the macro shell
needs **0** `@media`. Total viewport-responsive sites client-wide: ~6 (four `sm:max-w-dialog`, two
`md:grid-cols-2`). So `no-media-queries-in-features` + `no-layout-context-props` are a **freeze of an existing
property at ~6 sites' cost** — pin them NOW, before features regrow the threading when a drawer/sheet host
lands. **Correction to D42 §4:** features MAY use `@container`; only the SHELL tier may use viewport
`@media`. The two `md:grid-cols-2` settings panels respond to *panel* width, not viewport → container queries.

### 11.3 NEW structural primitives — convert every leaked convention into an API the call site can't bypass
These are the §11.0-rule-2 fixes. Each ships in `@orb/ui` / the client foundation **before** feature agents run.
- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat)** seal **TanStack Virtual** (KEPT — D54;
  the virtua swap was refuted, see §11.8). The seal owns the **`directDomUpdates: true` + `containerRef`** Compiler
  fix (3.14+, E2E-tested — **NOT `"use no memo"`**, now obsolete), the `measureElement`/`scrollMargin`-from-rect
  wiring, and the unbounded-window tripwire **as a thrown error** (neo's was a dev `console.warn` → a 200ms commit).
  The **`message-list`** seal additionally owns the native streaming-chat APIs (`anchorTo:'end'` + `followOnAppend` +
  `isAtEnd` = stick-to-bottom-without-yank · id-keyed `getItemKey` for the ghost→canonical swap · a no-recycle
  window for stateful rows / Tier-B iframes) — the cluster neo hand-rolled into a 387-line surface is now ~config
  (native since core 3.16). *Physics: dep-cruiser bans `@tanstack/react-virtual` outside these two primitives.*
  **7 client sites → 1 generic + 1 chat.**
- **`@orb/ui/charts`** seals **ECharts** (`echarts` + `echarts-for-react` — ONE dep replacing neo's 6 `@nivo/*`
  packages; D52) and **injects the token theme internally** so omission is impossible (neo's `theme={nivoTheme}`
  was voluntary → a new chart silently rendered white-on-transparent, invisible in dark mode); owns
  `<ChartTooltip>` (5 copy-pasted tooltip divs) + a **token categorical ramp** (kills the `genre-color.ts`
  14-hex palette + nivo `scheme:"set2"` + `RISE="#10b981"`). Plus **`@orb/ui/meter`** for 1-D magnitude bars
  (neo hand-rolled the same `width:%` span in 5 files — don't force these through the chart lib).
  *Physics: dep-cruiser bans `echarts`/`echarts-for-react` outside `@orb/ui/charts`.* The seal's whole footprint
  is **`corpus` only** (9 charts that were 6 nivo packages — verified repo-wide); the seam API must cover bar ·
  line · heatmap · **calendar** · scatter · **force-directed network** — ECharts covers all six natively
  (`calendar` coord + heatmap series · `graph` series + `force` layout), Canvas-rendered (a perf win for the
  dense `corpus-galaxy` scatter). **Token-theme wrinkle (Canvas ≠ nivo's SVG-`var()` trick):** ECharts renders
  to Canvas, so `fill:"var(--token)"` does NOT resolve the way it did in nivo's SVG output — the seal must
  resolve the DTCG tokens to concrete values (`getComputedStyle` on the `--chart-*`/`--foreground`/… custom
  props) and feed them into the ECharts `option`, re-reading on theme switch. This makes the internal
  theme-injection *load-bearing for theming to work at all* (not just dark-mode safety) — a stronger reason for
  the seal, not a weaker one. See §11.8 / D52.
- **`@orb/ui/sortable`** seals `@dnd-kit` (sensors / strategy / `CSS.Transform.toString` / `arrayMove`).
  *Physics: dep-cruiser bans `@dnd-kit/*` outside it.* (Only one sortable list exists today — seal it before
  the second one re-improvises different sensor constants.)
- **TWO named editor factories** (homed in `client/forms`, §2.1) so the four divergent strategies neo grew
  (preset `withFieldGroup` button-gated · standalone section form · world-entry **autosave** · create-book
  dialog) can't be improvised by whichever neighbor an agent opens first: `createSavedEntityForm` (button-gated)
  and `createAutosaveEntityForm` (listener-debounced; **`reset` removed from its type** — calling it is the
  autosave infinite-loop). **The full six-obligation contract is the canonical home in §13.4 — do NOT re-spec
  it here** (it was sharpened by the D54 docs mine: pill off `!isDefaultValue`, NO hand-rolled `fieldValuesEqual`,
  post-submit-*effect* `reset(saved)`, version-locked `dontUpdateMeta`). Keep neo's one structural win: the
  single `createFormHook`/`createFormHookContexts` instance (gate `tanstack-form-only-in-shared` — multiple
  instances split context wiring and bound fields silently lose state). *Gate `no-form-reset-in-autosave`.*
- **`ChatHandle` — the true `this_chid` successor.** neo killed the *URL-coupled* `this_chid` (single-route
  shell, `center-pane-store` as sole writer) but **resurrected the same disease as an ambient `isOptimistic`
  boolean** read+branched in 15+ sites and propped up by a hand-written "A7" lint. Replace with a
  discriminated handle `{ kind:"committed"; id } | { kind:"draft"; id; meta }` threaded from the composition
  root; the draft path and committed path become **different functions that don't typecheck against each
  other** — forgetting the branch (→ a 409 against a non-existent row, or a seed-clobber) **cannot compile**.
- **The central invalidation seam.** queryKeys are solved (§11.1) but **invalidation is the real sprawl**:
  81 `invalidateQueries` across 40 files, no map, several arg-less (`trpc.persona.get.queryKey()` nukes every
  detail). One `client/invalidation.ts` maps domain-event → `queryFilter()`s; mutation `onSettled` + bus
  handlers call `invalidate(event)`. *Gate `no-inline-invalidate-outside-seam`.*
- **`@orb/contracts` owns every wire DTO; the client never imports `#server/*`.** neo had no contracts layer,
  so the client imported server-domain return types directly (`CharacterDetail`, `EntryView`,
  `StartWorkloadInput`, `AdminUserView`, …) and **re-declared wire schemas** (`CustomOpenAiMetadata` had
  THREE homes; `addCredentialSchema` was an admitted hand-mirror). orbweaver's cake makes this physics.
  *Physics: dep-cruiser `client ⇏ @orb/server`. Gate `no-client-wire-redeclare` (a client `z.object` whose
  field set overlaps a contract input, or a client `interface` duplicating a contract type name).*

### 11.4 Close the token hole + extend gates past `globals.css`
neo's design-token check only ever inspected `globals.css` (parity), **never feature TSX** — so raw
`size-[1.5rem]`, `z-10`, `min-w-[8rem]`, `bg-black/50` drifted everywhere, the files' own "§9 no raw scale"
comments notwithstanding. Ratified: (a) `@orb/ui` lives under the same token gates as features, **no
`components/ui/` exemption**; (b) **generate** the Tailwind utility namespaces + the `tailwind-merge`
class-groups from the DTCG source (dead token = build error); (c) the token gates (`no-raw-spacing` /
`-typography` / `-z-index` / icon-size / arbitrary `[Npx|Nrem|Nvh]`) apply to **all** feature + ui TSX; (d)
widen `no-color-literals` past arbitrary hex to ban named non-token colors (`bg-black`/`bg-white`) and add a
theme-aware **`--scrim`** token (a `bg-black/50` scrim is invisible on a true-black theme); (e) a small CSS
structure test pins the three "one edit silently breaks it" `globals.css` footguns (the `dark:` theme
enumeration, the **unlayered** reduced-motion floor, per-theme `color-scheme`).

### 11.5 The smaller HIGH-value gates (persist · determinism · sentinels · keystones)
- **Persist versioning — partly irreversible, pin first.** 9 of 11 neo stores `persist()` a non-primitive
  shape with **no `version`/`migrate`**; a future field rename rehydrates a mis-shaped blob *over* server
  data, silently — and once stale blobs are in users' `localStorage` you can't migrate from a version line
  you never shipped. *Gate `persist-shape-needs-version` (non-primitive `partialize` ⇒ `version`+`migrate`
  required).* Plus a `STORAGE_KEYS` registry asserting key uniqueness (neo deliberately reused `neo:active-chat`).
- **Determinism reaches the client.** Extend the server's `no Date.now()/new Date()/Math.random()` rule to
  client render + optimistic code (seeded PRNG allowed — neo already does `mulberry32` for sort). neo has
  live `Date.now()` in optimistic merges (`revokedAt: Date.now()`) and a `fmtSince` formatter that can't be
  snapshot-tested. **The timezone pipeline (carry neo's — it was solid):** the wire is ALWAYS a **UTC epoch
  number** (server stamps via its injected clock; no tz, no formatted strings ever cross the wire);
  localization to the **browser-local tz** happens exactly ONCE, at the display edge, in the sealed
  `lib/time.ts` seam via **memoized `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat`** (Intl defaults to the
  browser tz+locale — no tz lib needed, §formatters/D54). `now` is **injected** into that seam (not read from
  `Date.now()`), so relative-time (`"2h ago"`) is snapshot-testable — the fix for neo's un-testable `fmtSince`.
  *Gate: `client-determinism` already bans `Date.now()`/`new Date()` in render; the `time.ts` seam is the ONE
  sanctioned `Intl` site, fed the injected `now`.*
- **`castId<X>("")` empty-id sentinel → `skipToken`.** The fake branded id paired with `enabled:` appears
  ~10× as the disabled-query input; if the `enabled` guard is ever dropped the empty id hits the server. A
  `useGatedQuery(id, optsFn)` that refuses to build the key when `id` is null removes the sentinel entirely.
  *Gate `no-fake-disabled-id`.*
- **Zustand selector stability** — D42 already seals `createEntityDraftStore`'s frozen `EMPTY`; extend the
  zustand-selector gate to **all** keyed stores (a selector returning a fresh `{}`/`[]` spins
  `useSyncExternalStore` → infinite re-render — runtime-only, no compile signal). And split per-token stream
  fields from lifecycle fields so chrome physically *cannot* subscribe to token churn (the hot-path-selector
  perf cliff).
- **Registry-pairing keystone.** `TOP_NAV_SLOTS` ↔ `MODAL_SLOTS` id-pairing is the shell's keystone and was
  **unguarded** (a missing body shipped as "the panel won't open", caught only by a defensive `?? null`).
  *Gate `check:registry-pairing` (every `kind:"modal"` slot has a `MODAL_SLOTS` entry + the id is in the union).*
- **Typed test-id registry.** Freeform `data-testid` strings (hundreds, hand-typed) mean a typo silently
  breaks an e2e selector and never trips `tsc`. A `testId(...)` helper / typed map makes a typo a type error.

### 11.6 Streamdown + untrusted content — the deferral becomes a CONCRETE two-policy spec (verified 2026-06)
The audit **confirms** D21's threat surface is chat-only: every character-card field renders as **escaped
text / input values** in the editors (zero `dangerouslySetInnerHTML`/markdown in character/persona/world-info
slices) — the only untrusted-markdown render is chat's message body. **Online verification of Streamdown's
actual security model (streamdown.ai/docs/security) sharpens the §6.3/§10 deferral from "verify it sanitizes"
into a precise requirement:** Streamdown runs `rehype-sanitize` (GitHub's schema) **+ `rehype-harden` BY
DEFAULT** — so we are NOT "layering rehype-sanitize behind the seam", it's already there. **But the default
config is deliberately PERMISSIVE** (all link/image/protocol prefixes allowed) — *suitable for our own
semi-trusted AI output, explicitly NOT safe for fully-untrusted content* (character cards, other users'
messages). Therefore the `@orb/ui/markdown` seam must expose **two trust policies**, not one:
- **`trusted` (own AI output):** Streamdown defaults — maximum functionality.
- **`untrusted` (D21 — cards / other users):** `allowedLinkPrefixes` + `allowedImagePrefixes` restricted to
  known hosts, **`allowDataImages:false`** (kills base64 tracking pixels / embedded payloads), and the
  protocol allowlist tightened to `http`/`https`/`mailto` (drop `irc`/`xmpp`/`tel`). This is the
  data-exfiltration-via-image/link prompt-injection defense Vercel's own `harden-react-markdown` guidance
  prescribes.

This is now a **hard checkpoint when chat markdown lands** (it governs what gets rendered, per-trust-level —
not a reversible impl seam). Also re-pin **`remark-gfm { singleTilde:false }`** (else prose like `10~20°C`
renders struck-through). Do NOT port neo's hand-rolled word-stagger / fence-aware re-parse — Streamdown ships
incremental parse natively (confirm before deleting the streaming-tail repair, or the ghost regresses).

### 11.7 Sequencing (born-compliant — the non-negotiable)
Every §11.3 primitive, the §11.4 codegen, and all new gates ship in the **`@orb/ui` + client-foundation
wave, BEFORE any feature agent runs.** The audit's verdict is unambiguous: *neo rotted in the gap between
"feature shipped" and "gate written."* For orbweaver these are a **prerequisite of Phase 6**, sequenced like
the Phase-0 backend gates were — a feature that lands before its gate is enforced retroactively, which is the
exact ts-morph-out-of-a-mess this whole exercise exists to prevent. (§12.8 is the §12-content companion to
this rule.)

### 11.8 Stack-currency verification (2026-06 — checked the load-bearing bets are best-practice, not stale)
Every foundational choice was re-verified against current (June 2026) reality, since the design predates it:
- **Base UI** — ✅ `@base-ui/react` is correct (renamed from the stale `@base-ui-components/react`); **1.0
  stable shipped 2025-12-11, now 1.6.x**, 35 a11y components, MUI-backed long-term-maintenance commitment.
  The primitive foundation is real and production-stable.
- **React Compiler × TanStack Virtual — CORRECTED (D54; full-docs+changelog mine, `client-tanstack-virtual-notes.md`).**
  The interior-mutability issue was real, but the fix **shipped and is React-19-Compiler-E2E-tested**:
  **`directDomUpdates: true` + `containerRef`** (TanStack Virtual **3.14.0/3.14.3**) — **no `"use no memo"` needed**.
  Separately the **entire streaming-chat cluster went native in core 3.16** (`anchorTo`/`followOnAppend`/`isAtEnd`;
  hardened 3.17.x). So the mid-2026 "virtua swap" idea was decided on **two now-refuted premises** (headless
  hand-rolling + an unfixable Compiler bug). **TanStack Virtual is KEPT**, sealed with the `directDomUpdates` config
  (§11.3); virtua would have lost `rangeExtractor` sticky headers / masonry `lanes` / `scrollMargin`-for-multiple-
  virtualizers / the headless seams, and added a second virtualization lib (anti one-home). The seal still earns its
  place — the chat cluster + the dep-cruiser ban + the tripwire — just not because the lib is "broken."
- **React 19.2 `<Activity>` + `useEffectEvent`** — ✅ both **stable** in 19.2 (Oct 2025), no longer
  experimental. The §4a bets (pane-preserve + the seam-effect fix) stand.
- **DTCG + Style Dictionary v4 + Tailwind v4 `@theme`** — ✅ DTCG **first stable spec (2025.10)** published
  2025-10-28; Style Dictionary v4 has first-class DTCG support; Tailwind v4 `@theme`→CSS-vars. The §3
  single-source→derived-theme pipeline is exactly the 2026 best-practice "three-tier W3C tokens" path.
- **Streamdown** — ✅ real + security-first by default (§11.6); stronger than the plan assumed (bundles
  sanitize+harden), but needs the two-policy config above for untrusted content.
- **Charts — DECIDED: Apache ECharts; nivo dropped (D52, 2026-06-29 — reverses D43's "keep nivo").** D43 had
  kept nivo and named ECharts only as a deferred *exit ramp*. Reversed at Nate's call: nivo is **still v0.99**
  (no 1.0 after years; the `Theme` type already shuffled to `@nivo/theming` mid-0.99), and that stagnation is
  exactly the "amnesiac author inherits a dead lib" risk this architecture exists to avoid. The deciding lever:
  **the client isn't built yet** (zero charts written — `packages/client` is empty stubs), so there is no
  migration to pay — pre-committing now is free, whereas carrying nivo means starting a fresh build on a
  stuck-at-v0.99 lib just to seal it behind a swap ramp. **ECharts is the chosen primitive:** the only single
  mainstream lib that natively covers neo's whole corpus set — bar · line · heatmap · **calendar** heatmap
  (`calendar` coord + heatmap series) · scatter · **force-directed network** (`graph` series + `force` layout).
  The two hard ones (calendar + force graph) are exactly what eliminated **Recharts** (2026 community default,
  but renders neither) and force hand-building in **visx** — so ECharts wins on coverage, not popularity.
  Actively maintained (last commit 2026-05, 66k★), ~100kB-gz tree-shakeable, Canvas-rendered (a perf win for
  the dense `corpus-galaxy` scatter), React wrapper `echarts-for-react`. **One dep replaces all 6 `@nivo/*`
  packages.** Sealed behind `@orb/ui/charts` (§11.3): the seam API requirement is the chart-type set above, and
  the one real porting wrinkle is the Canvas token-theme resolution noted in §11.3 (ECharts can't consume
  `var(--token)` live the way nivo's SVG did → the seal resolves DTCG tokens to concrete values and re-reads on
  theme switch — which makes the internal theme-injection load-bearing, not just dark-mode insurance). Fallback
  if the similarity graph ever outgrows ECharts' force layout (thousands of nodes): split that one chart to
  **Reagraph**/**react-force-graph** (WebGL) behind the same seal. visx stays the max-control hand-build
  alternative (rejected — more code, no built-in calendar/force). nivo's only edge was polished defaults; the
  seal's token theme + a curated `option` builder recover that inside `@orb/ui/charts`.

---

## 12. User theming & rich message content (ledger D44) — specced BEFORE Phase 5
**Why here, why now.** SillyTavern's expressive surface — custom CSS (global + per-character), rich HTML
"cards" (stat-blocks / styled mini-UIs), and inline images — is a real product need, redesigned to orbweaver
rigor. It is specced **before Phase 5** because the chat message-content model, composer, and assembly all
*depend* on these decisions; left unspecced, the chat phase would reinvent them ad hoc (and almost certainly
copy ST's bypassable approach). Read with §11.6 (the Streamdown two-policy security spec) — this section is
its content-side companion.

### 12.0 The governing principle — two trust tiers, isolation by PHYSICS not string-munging
Every user-supplied rendering input is exactly one trust level, and that determines the mechanism:
- **TRUSTED** = authored by the box owner / this user (global theme CSS, own persona theme, own uploaded
  images). Risk is self-inflicted + design-system integrity, not security.
- **UNTRUSTED** = from an imported character card, another participant, or the LLM (per-character CSS, card
  HTML, external image URLs, message markdown). Risk is D21 "no leaks ever" — CSS exfiltration, clickjacking,
  tracking pixels, mutation-XSS.
**Rule:** untrusted content is contained by a *browser-enforced boundary* (sandboxed iframe · CSP ·
token-validation), NEVER by ST's regex-sanitize-and-scope (which the research + ST's own source show is
bypassable string-munging — `.custom-` class renaming, `://` stripping). How ST does it (verified from
`chats.js`/`power-user.js`) is prior art to learn from, not copy.

### 12.1 Theming — the CSS story (decided: scopes = Global owner + Per-character)
- **Tier A (default): a curated, Zod-validated TOKEN-OVERRIDE API — not raw CSS.** Expose a fixed subset of
  DTCG tokens (accent · bubble bg/fg · name color · quote color · font from an allowlist · radius ·
  background asset/allowlisted-URL · density) applied as **scoped CSS custom properties** via an `@orb/ui`
  `<ThemeScope>` on the target subtree. Custom-property *values* can't select/execute/exfiltrate; values are
  parsed+clamped at the boundary (a color must parse as a color — reject `url()`/`expression()`; dims snap to
  the token scale). Covers the *vibe* (~90% of per-character styling) with **zero injection surface**, stays
  inside the token system (container model + `no-raw-value` gates still hold). ST has no safe tier like this.
- **Tier B (opt-in trust): raw CSS only inside the sandboxed-iframe card (12.2)** — never injected into the
  app document.
- **Global owner CSS** (trusted): a settings field → one scoped `<style>` under a known app root, run through
  the same validator (warn-on-`@import` like ST; reject shell-breaking `position:fixed` on chrome). Trusted,
  but still fenced from accidentally wrecking the shell.
- **Resolution order:** character > global > default. (Per-persona / per-chat scopes are deliberately
  deferred — the order is built to accept them later without rework.)

### 12.2 Rich message content — the HTML story (two tiers; Tier B = sandboxed iframe, NOT Shadow DOM)
The isolation-primitive choice is settled by research (§ research note below): **Shadow DOM is encapsulation,
not a security boundary** (JS gets full page access, `position:fixed` escapes, CSS `url()` still exfils,
custom props pierce the boundary); a **sandboxed `<iframe>` IS the boundary** (separate realm, `sandbox` minus
`allow-same-origin`, per-frame CSP) — the proven industry standard for untrusted LLM HTML (Claude Artifacts,
CodePen, JSFiddle). ChatGPT Canvas refuses to render HTML inline at all; the sandboxed iframe is the only
safe-inline-render pattern anyone ships.
- **Tier A (default, main DOM): a tight INERT sanitized allowlist via Streamdown** (its `rehype-raw` →
  `rehype-sanitize` → `rehype-harden` pipeline, configured to OUR explicit allowlist, not its permissive
  default): structural (`div/span/details/summary/table`-family/`blockquote`/`hr`) · text formatting · icons
  (mapped to **lucide**, not raw FontAwesome classes) · links (`rel=noopener` + prefix-allowlist) · images
  (via `MessageMedia`, 12.3). **Forbidden in Tier A:** `<script>` · `on*` handlers · `<style>` · inline
  `style=` · `<iframe>/<object>/<embed>/<form>/<input>`. Covers ~90% of "cards" (structured/styled text + icons).
- **Tier B (opt-in per-character trust): elaborate self-contained HTML+CSS mini-UI → `@orb/ui/sandbox-frame`**
  = sandboxed iframe + per-frame CSP (`connect-src 'none'`, `img-src` allowlist), **render-on-complete** (hold
  the block until close — the iframe enforces this naturally; skeleton during stream), the validated
  theme-token subset injected so the card's `var(--accent)` tracks the active theme, postMessage auto-height,
  **lazy-mounted + virtualized** in the message list (the one real cost — a realm per card — bounded to opt-in
  rich cards only; **verify-at-build:** a recycled virtual row remounts its iframe → reload + flicker + lost
  frame state, so Tier-B cards need a stable key + likely a no-recycle / over-scan window in
  `@orb/ui/virtual-list`). This is the Claude-Artifacts model.
- **Explicit NON-GOALS v1** (the dangerous ST features deliberately not carried): card JS / event handlers ·
  **action-buttons wired to app commands** (ST's QR/STscript surface) · forms · card-spawned iframes · inline
  `style`. **Doored, not walled:** because Tier B is already an iframe, interactivity later = flip
  `allow-scripts` for a *trusted* card (the Artifacts experience) — no re-architecture, just a gate change.
- **Two sandboxes, orthogonal — do NOT conflate:** this iframe isolates untrusted **display** (card
  HTML/CSS/UI); the **QuickJS-WASM** sandbox in `proposals/scripting-automation-extensibility.md` §7
  isolates untrusted **logic** (automation rules / plugins). Different threat models, different primitives.
  A card's future interactivity flips THIS iframe's `allow-scripts` (the Artifacts model) — it does NOT
  route through QuickJS.

### 12.3 Images AND native media in chat — also two trust tiers (the new dimension)
Covers `<img>` **and native `<audio controls>` / `<video controls>`** — verified from ST source as the
mechanism behind "a card generated an inline music player": it was **raw HTML+CSS, a native `<audio controls>`
element** (browser-native play/seek controls = interactive with ZERO card JS; ST allows audio/video/source/
track in sanitized message HTML and gates the external `src`). Native media is the one HTML class that's
interactive *declaratively*, so it sidesteps the no-JS rule — and it carries the same external-load risk as
images plus two extras (autoplay = tracking beacon + annoyance, and bandwidth).
- **TRUSTED = own uploads / assets → render freely from our store.** The "supporting pictures/media in
  messages" case: the user attaches in the composer → stored via the **`assets` domain (4c)** with
  variants/thumbnails from the **`infra/image` sharp adapter (4b)** → referenced as `asset://<id>` → served
  from our own origin. The same stored asset also feeds the **multimodal send** — the image as model
    *input* to a vision-capable model, via the *send-side* content-part model (distinct from the render
    model; see §12.4).
- **UNTRUSTED = external URLs** (LLM markdown `![](url)`, untrusted card `<img>`/`<audio>`/`<video>`) → gated,
  defaulting to SAFE:
  - **`forbidExternalMedia: true` by default** (mirrors ST + D21): external media does NOT auto-load — the
    *load itself* is the exfil/tracking-pixel (the remote server sees IP + timing). Render a click-to-load
    "external media — load from `<host>`?" placeholder.
  - **`autoplay` is FORCED OFF and `controls` REQUIRED on untrusted audio/video, always** (even when media is
    allowed) — an untrusted autoplaying `<audio>` is a tracking beacon + a hostile-noise vector; ST forces
    `autoplay=false; pause()` and we harden that into a non-overridable rule for untrusted media.
  - When permitted (per-character `override ?? global`, extending the D21 `forbidExternalMedia` tri-state, or
    owner opt-in): only `allowedMediaPrefixes` hosts load · `allowDataImages:false` (no base64 tracking
    pixels) · **CSP `img-src` + `media-src` `'self' <allowlist>` is the network backstop** (§11.6).
  - A bare image-URL link auto-embeds only if allowlisted+allowed, else renders as a plain link.
- **Primitive `@orb/ui/MessageMedia`** (covers image + native audio/video): dispatches asset-ref vs
  external-gated · lazy-load · intrinsic size/aspect reservation (no layout shift, container-model max-width)
  · `autoplay`-off + `controls`-on for untrusted A/V · broken-media fallback · click-to-zoom **lightbox**
  (sealed `@orb/ui` viewer) for images/video. Inside a Tier-B `sandbox-frame`, media is additionally governed
  by the frame's own `img-src`/`media-src` CSP (defense-in-depth).
- **A JS-driven custom player** (custom seek logic, not native controls) is the one case that needs Tier B's
  sandboxed iframe + `allow-scripts` — the native-element path (Tier A) covers the common "card music player"
  declaratively, no iframe needed.

### 12.4 The message-content model (Phase-5 touchpoint — `@orb/contracts`, born-compliant)
A message body is a **typed sequence of content blocks, NOT one HTML string** (ST's fatal simplification):
```
MessageContentBlock =
  | { kind: "markdown"; md: string }
  | { kind: "media"; media: "image" | "audio" | "video"; src: AssetRef | ExternalUrl; alt: string; dims?: {w;h} }
  | { kind: "html-card"; html: string; css?: string; trust: "tierA" | "tierB" }
```
The block model is what makes the trust-tier × render-tier dispatch type-safe and clean. The composer (P5)
emits image blocks from attachments; markdown stays markdown; card HTML carries its own trust level. The
`forbidExternalMedia` + per-character `cardTrust` overrides resolve at chat **assembly** (`override ?? global`,
extending D21). **This block union must land in the `@orb/contracts` pass, not be invented inside chat.**

**Scope: pictures in chat = DISPLAY (this is the feature). Model-vision = separate + optional.** The actual
want is plain: **send a picture (your own upload), receive and display it, and display an online image by
URL.** That is *entirely the render model* — a `media` block (`src: AssetRef` for an upload, `ExternalUrl`
for a link), rendered by `MessageMedia`, with `forbidExternalMedia` gating external URLs (§12.3). The model
is NOT involved; nothing beyond the block union + the asset path is needed. **This is the committed
feature.**

The **provider-send model** — what is transmitted *to the model as input* — is called out ONLY so it isn't
conflated with display. Sending an image *to* the model (true multimodal vision) is a different contract
running the other direction:

| | Render model | Provider-send model |
|---|---|---|
| Contract | `MessageContentBlock` (this §) | `ChatHistoryMessage.content` (`@orb/contracts/chat`) |
| Direction | stored message → client display | assembled turn → the model |
| Shape | block union (markdown / media / html-card) | content-part array (text / image parts) |
| Gated by | trust-tier × render-tier (§12.2) | `ModelCapability.vision` — image parts are sent ONLY to vision-capable models |

**Model-vision is ALSO committed — ledger D45 (sending an image TO the model).** Separate from display:
this is the **provider-send** reshape — `ChatHistoryMessage.content`: `string` → content-part array (`text`
| `image` parts), gated by a new `ModelCapability.vision` axis. It is **server-side**, so it is NOT a
client-doc concern to spec — the authoritative homes are **`domains/connection.md`** (the
`ModelCapability.vision` axis — the gate) + **`tiers/providers.md`** (the sealed translators map image parts
to each backend's wire) + **`@orb/contracts/chat`** (the message DTOs); this § only records the render↔send
distinction. **Born-compliant before Phase 5:** that `content:string` field is consumed by all three sealed
translators + the assembly seam, so widening it after chat is built whole is the cross-cutting retrofit
we're avoiding. A text-only turn is a one-element `[{ type:"text" }]` array — no `if(hasImage)` branch — and
a non-vision model drops image parts at assembly with a `warning` ChatEvent (D41). **One uploaded image is
stored once** (`assets`) and used both as a render `media` block (display, above) AND an `image` send-part
(D45).

**Born-compliant for DISPLAY (the part that IS required before Phase 5):** the `MessageContentBlock` union
itself (so a message is text + image, not a bare string) + `MessageMedia` + `forbidExternalMedia` land in
the `@orb/contracts` + `@orb/ui` passes before chat assembles content. That's the picture-in-chat feature;
it's cheap and additive, and it does not touch the send wire.

### 12.5 Where each piece lives (the cake)
| Concern | Home |
|---|---|
| `ThemeOverride` schema (token subset, Zod-validated) · `MessageContentBlock` union | `@orb/contracts` |
| `<ThemeScope>` (validated tokens → scoped custom props) · `@orb/ui/sandbox-frame` · `@orb/ui/MessageMedia` (img+native a/v) + lightbox | `@orb/ui` |
| Tier-A HTML+media sanitize allowlist (Streamdown config) | `@orb/ui/markdown` |
| asset storage + thumbnails/variants | `assets` domain (4c) + `infra/image` sharp (4b) |
| composer image attach · multimodal send · `forbidExternalMedia`/`cardTrust` resolution | chat domain (Phase 5; extends D21) |
| CSP headers (`img-src` · `connect-src` · `style-src`) | `entry/http` |

### 12.6 New gates (machine-enforceable — the rigor)
- **`no-untrusted-html-in-main-dom`** — a raw/untrusted HTML string may reach ONLY `@orb/ui/sandbox-frame`;
  never `dangerouslySetInnerHTML`, a `<head>` `<style>`, or main-DOM injection.
- **`no-external-media-without-gate`** — any `<img>`/`<audio>`/`<video>` with an external `src` must route
  through `MessageMedia` (the `forbidExternalMedia` gate + forced `autoplay`-off for untrusted A/V); no raw
  external `<img>/<audio>/<video>`.
- **`theme-override-only-via-scope`** — a `ThemeOverride` applies only via `<ThemeScope>` (validated), never
  spread as raw `style`.
- **CSP-headers-present** test (the `img-src`/`connect-src`/`style-src` headers exist + are tight).
- Extend the existing `no-raw-value` / no-inline-`style` gates to message-render code.

### 12.7 Streaming interplay (ties to §6.3.1)
- **HTML-card blocks render-on-complete** (hold until the block closes) — the `sandbox-frame` enforces this;
  show skeleton/plain text during stream (avoids the half-rendered-`<div>` flash, worse than the code-fence one).
- **Images reserve space from known dims** (asset images known-size; external use a fixed placeholder box) so
  mid-stream image arrival doesn't shift layout.

### 12.8 Sequencing (born-compliant — non-negotiable)
The `@orb/ui` primitives (`ThemeScope`, `sandbox-frame`, `MessageMedia`), the `@orb/contracts`
`MessageContentBlock`/`ThemeOverride`, the CSP wiring, and the 12.6 gates ship in the **foundation/`@orb/ui`
+ contracts passes, BEFORE Phase 5 wires chat content** — same rule as §11.7. `assets` (4c) + `infra/image`
(4b) are prerequisites already in the plan. A Phase-5 agent assembles messages against this spec; it does not
get to invent the content model or copy ST's string-blob.

> **Research note (2026-06, why Tier B is an iframe):** Shadow DOM is *composability*, not isolation —
> "prevent accidental interference, not enforce separation"; JS in a shadow tree has full page access, custom
> props pierce it, and there's a 2026 CSS sandbox-escape CVE. A sandboxed iframe is a separate realm and the
> decade-proven primitive CodePen/JSFiddle/**Claude Artifacts** use for untrusted rendered HTML/CSS/JS. No
> all-in-one library does parse+sanitize+isolate for inline content — but we don't need one: **sanitize is
> NATIVE in Streamdown** (its bundled `rehype-sanitize` + `rehype-harden`, §11.6 — the unified/rehype-ecosystem
> standard, living *inside* our markdown pipeline; this is the modern stack-aligned sanitizer, **NOT DOMPurify** —
> DOMPurify is a DOM-string-level second pass *outside* the pipeline and would be redundant), plus a small OWNED
> `sandbox-frame` for untrusted HTML (we own the exact `sandbox`/CSP attributes — the iframe IS the boundary, so
> untrusted HTML is never sanitized-into-main-DOM; don't depend on a generic lib for the security boundary).
> `react-shadow`/`react-shadow-root` exist but are for our OWN design-system encapsulation, the wrong tool for
> untrusted content.

---

## 13. The reuse model — the central primitives every feature builds on (D54)
> **Status: authoritative (D54, 2026-06-29).** Synthesis of the full client-foundation research sweep — the
> Query/Form/Router/Virtual examples + the Query/Form/Router/Virtual/Zustand deep-docs mines (the seven
> `client-tanstack-*` / `client-zustand-notes` companions in this directory; cite them for any specific claim).
> The §11.0 thesis — *every footgun carried by STRUCTURE, never convention* — **extended from footguns to
> boilerplate**: a feature converges to **config + a field/row renderer**; all wiring (fetch · cache · invalidate ·
> optimistic · error · virtualize · select · seed · dirty · lifecycle) lives in a primitive the call site
> **cannot bypass or get wrong**. Ships in the `@orb/ui` + client-foundation wave **BEFORE any feature agent runs**
> (§11.7).

### 13.0 The litmus (what gets centralized, what stays in the feature)
- **Central (the call site cannot opt out):** wiring, lifecycle, and the footguns — fetch/cache/invalidate,
  optimistic+rollback, the dirty/reset/seed dance, virtualization, selection, error channels.
- **Feature-owned:** the fields, the row/card visuals, the copy, the per-field control choice.
- **The bar to centralize:** repeated **3+ times AND changing together** (the chart tooltip ×5, the meter ×5, the
  editors ×4, the collection surfaces ×8 all clear it). A genuine one-off stays hand-composed from `@orb/ui` —
  premature DRY is still a cost even here.

### 13.1 The primitive catalog (contracts — born before Phase 6)
- **`createEntityMutation`** — bakes the canonical 4-phase optimistic flow (Query `optimistic-updates-cache`):
  `onMutate` = `cancelQueries` → `getQueryData` snapshot → `setQueryData` patch → return rollback; `onError`
  restores; `onSettled` invalidates **via the central seam**. Uses the **`context.client`** arg (provider-clean).
  A lightweight **variables-render mode** for append-only creates. **Resets the v5 sticky error on next `mutate`**
  (examples don't cover it — ours). One error slot per mutation, never multiplexed.
- **`createCollectionSurface`** — one machine for every browse view. Feature supplies the (infinite) query + the
  row renderer + the filter config + bulk actions. Bakes `useInfiniteQuery` + **`maxPages`** + **`placeholderData:
  keepPreviousData`** gated on `isPlaceholderData` (no flash / no scroll-jump), the virtual-list seal, the selection
  store, empty/loading/error, and the tail-fetch guard **off the virtualizer's own range** — **no
  `react-intersection-observer`**.
- **`useGatedQuery` / `skipToken`** — a null id yields `skipToken` (never builds the key); kills the `castId("")`
  sentinel (gate `no-fake-disabled-id`).
- **`<QueryBoundary>`** — the `QueryErrorResetBoundary` → `ErrorBoundary onReset` handshake (a retry that actually
  refetches) + `useSuspenseQuery`/`useSuspenseQueries` (non-null data, Compiler-clean; queries-plural for parallel,
  no waterfall) + `useTransition` around pane switches (no fallback flash; pairs with `<Activity>`).
- **`createSavedEntityForm` / `createAutosaveEntityForm`** — the editor factories (§13.4 for the six-obligation
  contract + the surface map).
- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat)** — TanStack Virtual sealed with
  `directDomUpdates` + the native chat APIs (§11.3, corrected D54).
- **The central seams (ratified, re-stated as the standard):** `invalidation.ts` event→`queryFilter` map
  (`no-inline-invalidate-outside-seam`); bus→cache `onData` = buffer-local + `invalidate(readKey)`, never a 2nd
  store (`bus-onData-no-store-write`); stream writes through the pure reducer (`no-inline-cache-surgery-in-stream`);
  queryKeys 100% tRPC-proxy (`no-array-literal-querykey`).
- **`QueryClient` defaults (§6.1):** `staleTime: Infinity` (bus drives freshness; **never `'static'`**) ·
  `refetchOnWindowFocus:false` · **`refetchOnReconnect:true`** · `gcTime:5min` · `structuralSharing:true` ·
  `throwOnError:false` · mutations `retry:0` · global `meta`-toasts via `QueryCache`/`MutationCache.onError`.
- **State — Zustand (§5), standardized:** one `create`/file · ≤10 authored fields · no exported `set`/`getState` ·
  `persist` with **`partialize` to the persisted key + a total/crash-proof `migrate`** (default `merge` is shallow) ·
  `set(next, true)` **replace** for DU lifecycle transitions (a dropped field is a typecheck error) ·
  `createEntityDraftStore` keeps the frozen `EMPTY` default-ref **and** adds `useShallow` for multi-field draft
  selectors (not redundant — different jobs) · token-stream split from lifecycle (`subscribeWithSelector` + transient
  `subscribe`, zero renders) · dev-only `devtools`.

### 13.2 The standardization map — for surface X, reach for primitive Y (the cold-agent lookup)
| You are building… | Use | NOT |
|---|---|---|
| a browse/list/grid of entities | `createCollectionSurface` | a hand-wired query+list+filter |
| an entity edit/create form (≥3 fields) | a **form factory** (§13.4) | a hand-rolled `useAppForm` |
| a create/update/delete action | `createEntityMutation` | inline `useMutation` + `setQueryData` |
| a read that shows loading/error | `useGatedQuery` in `<QueryBoundary>` | bare `useQuery` + `isPending` ladders |
| a conditional/disabled query | `useGatedQuery` (`skipToken`) | `castId("")` + `enabled` |
| a virtualized list | `@orb/ui/virtual-list` | raw `useVirtualizer` |
| the chat message list | `@orb/ui/message-list` | a hand-rolled scroll/anchor hook |
| a chart | `@orb/ui/charts` (ECharts) | raw `echarts` / a `<div style=width>` |
| a 1-D magnitude bar | `@orb/ui/meter` | a hand-rolled `<span style=width>` |
| cache invalidation | `invalidate(event)` (the seam) | inline `invalidateQueries` |
| global client state | one gated Zustand store | exported `set`/`getState`, >10 fields |
| an editor draft | `createEntityDraftStore` | a bespoke persist store |
| a route / auth gate | Router `beforeLoad`+`redirect` (§6.1) | `useBlocker` for an in-app pane guard |
| the editor "unsaved? leave?" guard | a **hand-rolled in-app** guard off view-state | `useBlocker` (won't fire on a pane swap) |
| single-route pane transition | hand-rolled `document.startViewTransition()` | the router's VT (won't fire; `pathChanged` is constant) |

### 13.3 The new gates (machine-enforced — added by D54)
- `no-static-staletime-on-bus-keys` — `staleTime:'static'` silently ignores `invalidateQueries`; ban it on bus keys.
- `no-inline-cache-surgery-in-stream` **scoped to subscription/stream bodies** — must NOT flag
  `createEntityMutation`'s legitimate `onMutate setQueryData`.
- `persist-partialize-and-total-migrate` — non-primitive `persist()` needs `partialize` to its key + a total `migrate`.
- `form-factory-for-multifield` — a ≥3-field `useAppForm`/controlled form outside a factory is flagged.
- `virtualizer-only-in-seal` — `@tanstack/react-virtual` only inside the two `@orb/ui` seals (dep-cruiser).
- adopt **`@tanstack/eslint-plugin-query` `flat/recommended-strict`** (`prefer-query-options` forces the proxy key)
  + **`eslint-plugin-react-hooks` `recommended-latest`** (the Compiler's Rules-of-React enforcement — load-bearing,
  not optional: an undetected violation = a silent mis-memoization).
- the Form factory bakes: pill off `!isDefaultValue` · **no hand-rolled `fieldValuesEqual`** (lib does deep compare) ·
  post-submit-effect `reset(saved)` · version-locked `dontUpdateMeta` + a guard test · `useSelector` (not `useStore`).

### 13.4 Where to use Form — the surface map (the under-use correction)
The §6.1 rule applied. **Trigger = ≥3 fields OR validation OR save/draft semantics** — *Form is for forms, not for
"entities."* The six obligations the factories bake (verified FACTORY-ORIGINAL — no example or doc fixes them):
seed-on-load · `key`-remount on id change · post-submit `reset(saved)` · the `seededRef + persistent-isDirty` reseed
guard · the Zustand-`persist` draft mirror (autosave) · `dontUpdateMeta` on non-user writes.

| Surface | Factory | Why (and why it was under-served) |
|---|---|---|
| Character card editor | `createSavedEntityForm` | many fields, draft, explicit save |
| Persona editor | `createSavedEntityForm` | multi-field, draft |
| Preset editor | `createSavedEntityForm` | many fields |
| Prompt-manager | `createSavedEntityForm` | multi-field |
| **Connection / credential add+edit** | `createSavedEntityForm` | multi-field **+ validation** — was hand-rolled |
| **Group-chat create + config** | `createSavedEntityForm` | roster + overrides |
| **User-admin create / edit user** | `createSavedEntityForm` | multi-field + validation |
| **D44 theme-override editor** | `createSavedEntityForm` | the token subset (color/font/bubble/radius/…) |
| World-info / lorebook entry | `createAutosaveEntityForm` | neo autosaved these; debounced draft |
| Room overrides (per-chat) | `createAutosaveEntityForm` | flip-and-it-saves |
| **Settings panels (AppSettings)** | `createAutosaveEntityForm` | many grouped toggles, save-on-change |
| — stays controlled + Zod — | | search box · lone toggle · single rename · login (2-field): trivial, no toolkit tax |

**The correction in one line:** treating Form as "the 4 entity editors" (neo's framing) under-used it — settings,
connections, group config, theme, and user-admin are all multi-field forms that belong in a factory. **Bolded rows
above are the newly-claimed surfaces.**

### 13.5 Deferred-with-a-committed-default forks (D54)
- **Editor draft layer** — DEFAULT: TanStack Form + the Zustand-`persist` draft store + the factory seed/dirty guards
  (the seed/clobber + persistence are FACTORY-ORIGINAL — no lib does them). Deferred upgrade: **TanStack DB**
  local-storage-collection + manual transactions (`tx.mutate`/`rollback`/`commit` = edit/discard/save) would
  *dissolve* the dirty/reset/seed dance. Revisit when TanStack DB hits 1.0 + a proven Form-editor recipe (alpha
  today; not for a born-compliant build). **The factory IS the swap seam.**
- **Token enforcement** — DEFAULT Tailwind v4 + DTCG + lint; deferred **Panda `strictTokens`** (§3/§10).

### 13.6 Sequencing (born-compliant — non-negotiable)
Every §13.1 primitive + the §13.3 gates ship in the `@orb/ui` + client-foundation wave **before any feature agent
runs** (§11.7). The §13.2 map is the cold-agent contract: a surface not using its primitive is the review flag.
