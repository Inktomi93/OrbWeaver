# UI-Gates-and-Lessons

> **The UI law — part of the nine-doc set split from the D42 spec** (pre-split source: `archive/client.md`; these nine carry the D43/D44/D52/D54/D58 corrections and WIN on any conflict with the archive). The ledger entries (D42–D44, D52, D54 in `Core-Laws-and-Precedents.md`) are the decision records; these docs are the expansion.
>
> **Reading order:** UI-Architecture-and-Layout (§0–§6) → UI-Gates-and-Lessons (§7–§11) → UI-Theming-and-Content (§12) → UI-Primitives-and-Reuse (§13) → the five lib companions (`UI-Lib-TanStack-{Query,Form,Router,Virtual}` · `UI-Lib-Zustand` — evidence/provenance mines; distilled verdicts already live in the spec sections).
>
> **§-map (cross-doc `§N` references resolve here):** §0–§6.3.1 → `UI-Architecture-and-Layout.md` · §7–§11.8 → `UI-Gates-and-Lessons.md` · §12–§12.8 → `UI-Theming-and-Content.md` · §13–§13.6 → `UI-Primitives-and-Reuse.md`.

## Table of Contents

- [7. The sealed gotchas — fix each ONCE, in a place a cold agent can't bypass](#1493c277)
- [8. The gates (physics + lint belts)](#3fcff2cc)
- [9. What we explicitly do NOT carry from neo](#5069ce1d)
- [10. Deferred forks (DEFERRED-with-a-committed-default)](#14686bd4)
- [11. Ratified from the full neo-client audit (ledger D43)](#544a32d2)
  - [11.0 Why neo rotted _despite_ being structured + enforced (the three root causes)](#673ca933)
  - [11.1 KEEP-BY-CONSTRUCTION (neo got these right — lock as physics, don't let them re-rot)](#9b38ae92)
  - [11.2 The container model is a near-zero-cost FREEZE, not an unwind (the audit's happy surprise)](#35aba913)
  - [11.3 NEW structural primitives — convert every leaked convention into an API the call site can't bypass](#0cded781)
  - [11.4 Close the token hole + extend gates past `globals.css`](#d20a590b)
  - [11.5 The smaller HIGH-value gates (persist · determinism · sentinels · keystones)](#7912412c)
  - [11.6 Streamdown + untrusted content — the deferral becomes a CONCRETE two-policy spec (verified 2026-06)](#bc3af343)
  - [11.7 Sequencing (born-compliant — the non-negotiable)](#5ee53487)
  - [11.8 Stack-currency verification (2026-06 — checked the load-bearing bets are best-practice, not stale)](#36658ec7)

---

<!-- Source: client.md -->

<a id='1493c277'></a>

## 7. The sealed gotchas — fix each ONCE, in a place a cold agent can't bypass

Four cross-library footguns observed in neo (all rooted in libs that live _outside_ React's render model —
external stores, event-based state, non-memoizable closures — which React 19 + the React Compiler punish).
neo solved each per-site; orbweaver seals each in a primitive so it can't be re-triggered:

| Footgun                                                                                                                                                                            | Root                                               | Sealed in                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtual × React Compiler** — `useVirtualizer`'s return is internally mutable; the Compiler memo pass can flash the list                                                          | the interior-mutability issue (now FIXED upstream) | a **`@orb/ui/virtual-list`** primitive owns the **`directDomUpdates: true` + `containerRef`** fix (TanStack Virtual 3.14+, Compiler-E2E-tested — **NOT `"use no memo"`**, now obsolete) + the `measureElement` wiring. Feature never calls `useVirtualizer` → can't forget the config (neo re-risked the old `"use no memo"` hatch in 7 files; D54). |
| **Form × React** — `isDirty` is event-based, never auto-clears after submit (#1144) → `useStore(isDirty)+useEffect` loops forever; save bar stays "Unsaved" without a manual reset | TanStack Form persistent-dirty                     | the **`client/forms` factories** (`useAppForm`) own the post-submit reset; the banned `useEffect`-on-`isDirty` autosave is gate-flagged                                                                                                                                                                                                              |
| **Form × Query × Zustand** — a background refetch reseeds the form and clobbers unsaved typing                                                                                     | three-lib interaction                              | a **`useSeedFormOnServerLoad`** guard (`seededRef + persistent-isDirty + reset + applyFormValues`) baked into the saved-form factory                                                                                                                                                                                                                 |
| **Zustand × React** — a selector returning a fresh `{}`/`[]` per render spins `useSyncExternalStore` forever                                                                       | referential instability                            | the **`createEntityDraftStore`** factory's frozen `EMPTY` (+ `useShallow` for multi-field selectors) + a **gate flagging fresh object/array literals** without `useShallow`/a stable ref                                                                                                                                                             |

After these, the chosen libs have zero un-gated footguns. **The two FORM rows above are 2 of the six editor
obligations the factories bake — the full contract is §13.4 (the canonical home; the D54 docs mine corrected
several details, e.g. delete `fieldValuesEqual`, reset in a post-submit _effect_). Don't build a form against
this table; build against §13.4.**

---

<!-- Source: client.md -->

<a id='3fcff2cc'></a>

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

<!-- Source: client.md -->

<a id='5069ce1d'></a>

## 9. What we explicitly do NOT carry from neo

shadcn copy-paste · Radix · the react-markdown stack · react-syntax-highlighter/Prism · the single-route
`this_chid` re-coupling sync effect (the jank) · `@/` aliases (use `#`) · the heavy file-based Router
codegen (single-route needs ~3 hand-written routes) · `compact`/`inDrawer`/`density` layout props
(container queries replace them) · per-feature `useVirtualizer` (the `@orb/ui/virtual-list` primitive
replaces it).

---

<!-- Source: client.md -->

<a id='14686bd4'></a>

## 10. Deferred forks (DEFERRED-with-a-committed-default)

- **Token enforcement level** — DEFAULT: Tailwind v4 + DTCG + lint. Deferred upgrade: Panda `strictTokens`
  (type-level). Revisit only if lint-bypass is observed. (§3)
- **Streamdown sanitization for untrusted content** — verify-at-build; layer `rehype-sanitize` behind the
  seam if the built-in policy is too lax. (§6.3) **PROMOTED by D43 (§11.6) to a HARD checkpoint when chat
  markdown lands** — the audit confirmed chat is the _only_ untrusted-markdown render path (character/persona
  fields render as escaped text), so this is no longer a soft default: it governs what gets rendered.
- **DECIDED (not forks):** Base UI as the primitive · Zustand for client state · Streamdown for markdown ·
  single-route shell · the container model · the `@orb/ui` package + DTCG tokens.

---

<!-- Source: client.md -->

<a id='544a32d2'></a>

## 11. Ratified from the full neo-client audit (ledger D43)

**Provenance.** Ten general-purpose agents read **every file** in neo's client in full (~51k LOC: `state` ·
`lib` · `routes` · `components` · `styles` · all 13 features) against a shared KEEP / DUMP / IMPLICIT-CONVENTION
/ CROSS-LIB-FOOTGUN / ENFORCEABLE-RULE contract. This section is the ratified synthesis; D43 is the decision
record. **The findings converged across slices** — the same root causes recur in chat, character, corpus,
credentials, app-shell — which is what makes them load-bearing rather than slice-local.

<!-- Source: client.md -->

<a id='673ca933'></a>

### 11.0 Why neo rotted _despite_ being structured + enforced (the three root causes)

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
   _fixes_ the footguns it owns (single-instance context, Select sentinel, rollback-removeQueries). The four
   that require the **call site** to remember something — `reset(value)`-after-submit, silent `setValue` for
   non-user writes, `onFieldUnmount` flush, `key={entityId}` remount — leaked as prose, and **only one of
   the four editors honored all of them.** Forgetting `reset(value)` silently bricks the save bar and reverts
   Discard to pre-save values (data loss) with a green `check`. ⇒ **orbweaver rule: every footgun is carried
   by STRUCTURE (a factory/primitive the call site cannot bypass), never by a remembered convention.**

3. **The cross-feature CONTRACT was unrecognized, so coupling pooled.** neo conflated "imports another
   feature's React module" with "couples to another feature," so a legit cross-feature _read_ — which only
   calls `trpc.worldInfo.*`, the server's public front door — had no legal home and got dumped in
   `_shared/world-book-attachments/`, `_shared/persona-connections/`, etc. ⇒ **orbweaver rule: the tRPC
   router + `@orb/contracts` ARE the cross-feature contract; calling a procedure is not coupling.** ~29 of
   neo's 66 `_shared` files evaporate as a _category_, not by tidying.

<!-- Source: client.md -->

<a id='9b38ae92'></a>

### 11.1 KEEP-BY-CONSTRUCTION (neo got these right — lock as physics, don't let them re-rot)

- **queryKeys are 100% tRPC-codegen-derived.** The "~104 sites = mess" worry was **wrong**: all 104 are
  `trpc.X.Y.queryKey()`; there are **zero** ad-hoc `queryKey:[...]` arrays in the entire client. The tRPC
  proxy IS the key factory. _Gate `no-array-literal-querykey`_ (force the proxy; lock the win).
- **The stream/turn lifecycle is the reference — carry it almost verbatim.** `applyChatBusEvent(event,deps)`
  is a **pure, extracted, exhaustive switch** over a server-authoritative discriminated union, node-testable
  against a real QueryClient with no SSE; the hook is a thin transport adapter. Slot lifecycle is owned by
  the **terminal** turn events (Stop stays live across the whole turn incl. TTFT); `openSlot` is idempotent
  with a **lazy** id factory (no UUID per token). _Gate: all chat-cache writes route through the pure
  reducer — `no-inline-cache-surgery-in-stream` (no `setQueryData`/store-set inside a subscription/component
  body)._
- **Per-mutation error channels, never multiplexed.** TanStack v5 mutation errors are _sticky_ until the
  next fire; a `a.error ?? b.error` fed into a dialog leaks action A's failure into B's surface (neo's
  `[V9-cluster]`). One error slot per mutation. _Gate `no-multiplexed-mutation-error`._
- **Registry-as-data shell + derive-don't-respell registries.** `TOP_NAV_SLOTS`/`MODAL_SLOTS`,
  `ROLE_REGISTRY`, `PROVIDER_META: Record<Enum,…>` — the array/record IS the panel; a missing member is a
  `tsc` error, not a stale `<Select>`. Carry.
- **The clamp-width overlay shell is the SHELL-tier reference (and needs ZERO `@media`).** One master
  `--width-shell-content: clamp(680px, ${chatWidthPct}dvw, 100dvw)` var at the root; drawer width _derives_
  (`max(360px, (100dvw − content)/2)`); closed overlays are `absolute` + `-translate-x-full` so they consume
  zero width and never reflow. neo achieves the "3-pane resizable" feel with **no media queries and no
  `react-resizable-panels`** in the macro shell. This is how the SHELL tier hits "viewport-aware in one place."
  **This IS the `overlay` mechanism for §4.1's collapsible LIST/CONTEXT panels** — the rail-shell's
  `docked`→`overlay`→`collapsed` states reuse this exact clamp, so the design-seed layout costs no new shell
  machinery, just a per-panel state + the RAIL fixed column.
- **The bus→cache sync seam (`use-workload-events`) is the only sanctioned SSE shape.** A subscription
  `onData` may (a) buffer transient progress in **local** state and (b) `invalidateQueries(readKey)` — it
  must **never** become a second store. The invalidation key must be produced by the same `*.queryKey(args)`
  the reader uses (neo's `[V9-2]` shipped from a key-shape mismatch). _Gate `bus-onData-no-store-write`._

<!-- Source: client.md -->

<a id='35aba913'></a>

### 11.2 The container model is a near-zero-cost FREEZE, not an unwind (the audit's happy surprise)

The plan assumed it must unwind neo's `compact`/`inDrawer`/`density` prop threading. **It doesn't exist in
the hot paths:** chat has **0** occurrences of those props and **0** `@media`/`@container`; the macro shell
needs **0** `@media`. Total viewport-responsive sites client-wide: ~6 (four `sm:max-w-dialog`, two
`md:grid-cols-2`). So `no-media-queries-in-features` + `no-layout-context-props` are a **freeze of an existing
property at ~6 sites' cost** — pin them NOW, before features regrow the threading when a drawer/sheet host
lands. **Correction to D42 §4:** features MAY use `@container`; only the SHELL tier may use viewport
`@media`. The two `md:grid-cols-2` settings panels respond to _panel_ width, not viewport → container queries.

<!-- Source: client.md -->

<a id='0cded781'></a>

### 11.3 NEW structural primitives — convert every leaked convention into an API the call site can't bypass

These are the §11.0-rule-2 fixes. Each ships in `@orb/ui` / the client foundation **before** feature agents run.

- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat)** seal **TanStack Virtual** (KEPT — D54;
  the virtua swap was refuted, see §11.8). The seal owns the **`directDomUpdates: true` + `containerRef`** Compiler
  fix (3.14+, E2E-tested — **NOT `"use no memo"`**, now obsolete), the `measureElement`/`scrollMargin`-from-rect
  wiring, and the unbounded-window tripwire **as a thrown error** (neo's was a dev `console.warn` → a 200ms commit).
  The **`message-list`** seal additionally owns the native streaming-chat APIs (`anchorTo:'end'` + `followOnAppend` +
  `isAtEnd` = stick-to-bottom-without-yank · id-keyed `getItemKey` for the ghost→canonical swap · a no-recycle
  window for stateful rows / Tier-B iframes) — the cluster neo hand-rolled into a 387-line surface is now ~config
  (native since core 3.16). _Physics: dep-cruiser bans `@tanstack/react-virtual` outside these two primitives._
  **7 client sites → 1 generic + 1 chat.**
- **`@orb/ui/charts`** seals **ECharts** (`echarts` + `echarts-for-react` — ONE dep replacing neo's 6 `@nivo/*`
  packages; D52) and **injects the token theme internally** so omission is impossible (neo's `theme={nivoTheme}`
  was voluntary → a new chart silently rendered white-on-transparent, invisible in dark mode); owns
  `<ChartTooltip>` (5 copy-pasted tooltip divs) + a **token categorical ramp** (kills the `genre-color.ts`
  14-hex palette + nivo `scheme:"set2"` + `RISE="#10b981"`). Plus **`@orb/ui/meter`** for 1-D magnitude bars
  (neo hand-rolled the same `width:%` span in 5 files — don't force these through the chart lib).
  _Physics: dep-cruiser bans `echarts`/`echarts-for-react` outside `@orb/ui/charts`._ The seal's whole footprint
  is **`corpus` only** (9 charts that were 6 nivo packages — verified repo-wide); the seam API must cover bar ·
  line · heatmap · **calendar** · scatter · **force-directed network** — ECharts covers all six natively
  (`calendar` coord + heatmap series · `graph` series + `force` layout), Canvas-rendered (a perf win for the
  dense `corpus-galaxy` scatter). **Token-theme wrinkle (Canvas ≠ nivo's SVG-`var()` trick):** ECharts renders
  to Canvas, so `fill:"var(--token)"` does NOT resolve the way it did in nivo's SVG output — the seal must
  resolve the DTCG tokens to concrete values (`getComputedStyle` on the `--chart-*`/`--foreground`/… custom
  props) and feed them into the ECharts `option`, re-reading on theme switch. This makes the internal
  theme-injection _load-bearing for theming to work at all_ (not just dark-mode safety) — a stronger reason for
  the seal, not a weaker one. See §11.8 / D52.
- **`@orb/ui/sortable`** seals `@dnd-kit` (sensors / strategy / `CSS.Transform.toString` / `arrayMove`).
  _Physics: dep-cruiser bans `@dnd-kit/_` outside it.\* (Only one sortable list exists today — seal it before
  the second one re-improvises different sensor constants.)
- **TWO named editor factories** (homed in `client/forms`, §2.1) so the four divergent strategies neo grew
  (preset `withFieldGroup` button-gated · standalone section form · world-entry **autosave** · create-book
  dialog) can't be improvised by whichever neighbor an agent opens first: `createSavedEntityForm` (button-gated)
  and `createAutosaveEntityForm` (listener-debounced; **`reset` removed from its type** — calling it is the
  autosave infinite-loop). **The full six-obligation contract is the canonical home in §13.4 — do NOT re-spec
  it here** (it was sharpened by the D54 docs mine: pill off `!isDefaultValue`, NO hand-rolled `fieldValuesEqual`,
  post-submit-_effect_ `reset(saved)`, version-locked `dontUpdateMeta`). Keep neo's one structural win: the
  single `createFormHook`/`createFormHookContexts` instance (gate `tanstack-form-only-in-shared` — multiple
  instances split context wiring and bound fields silently lose state). _Gate `no-form-reset-in-autosave`._
- **`ChatHandle` — the true `this_chid` successor.** neo killed the _URL-coupled_ `this_chid` (single-route
  shell, `center-pane-store` as sole writer) but **resurrected the same disease as an ambient `isOptimistic`
  boolean** read+branched in 15+ sites and propped up by a hand-written "A7" lint. Replace with a
  discriminated handle `{ kind:"committed"; id } | { kind:"draft"; id; meta }` threaded from the composition
  root; the draft path and committed path become **different functions that don't typecheck against each
  other** — forgetting the branch (→ a 409 against a non-existent row, or a seed-clobber) **cannot compile**.
- **The central invalidation seam.** queryKeys are solved (§11.1) but **invalidation is the real sprawl**:
  81 `invalidateQueries` across 40 files, no map, several arg-less (`trpc.persona.get.queryKey()` nukes every
  detail). One `client/invalidation.ts` maps domain-event → `queryFilter()`s; mutation `onSettled` + bus
  handlers call `invalidate(event)`. _Gate `no-inline-invalidate-outside-seam`._
- **`@orb/contracts` owns every wire DTO; the client never imports `#server/*`.** neo had no contracts layer,
  so the client imported server-domain return types directly (`CharacterDetail`, `EntryView`,
  `StartWorkloadInput`, `AdminUserView`, …) and **re-declared wire schemas** (`CustomOpenAiMetadata` had
  THREE homes; `addCredentialSchema` was an admitted hand-mirror). orbweaver's cake makes this physics.
  _Physics: dep-cruiser `client ⇏ @orb/server`. Gate `no-client-wire-redeclare` (a client `z.object` whose
  field set overlaps a contract input, or a client `interface` duplicating a contract type name)._

<!-- Source: client.md -->

<a id='d20a590b'></a>

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

<!-- Source: client.md -->

<a id='7912412c'></a>

### 11.5 The smaller HIGH-value gates (persist · determinism · sentinels · keystones)

- **Persist versioning — partly irreversible, pin first.** 9 of 11 neo stores `persist()` a non-primitive
  shape with **no `version`/`migrate`**; a future field rename rehydrates a mis-shaped blob _over_ server
  data, silently — and once stale blobs are in users' `localStorage` you can't migrate from a version line
  you never shipped. _Gate `persist-shape-needs-version` (non-primitive `partialize` ⇒ `version`+`migrate`
  required)._ Plus a `STORAGE_KEYS` registry asserting key uniqueness (neo deliberately reused `neo:active-chat`).
- **Determinism reaches the client.** Extend the server's `no Date.now()/new Date()/Math.random()` rule to
  client render + optimistic code (seeded PRNG allowed — neo already does `mulberry32` for sort). neo has
  live `Date.now()` in optimistic merges (`revokedAt: Date.now()`) and a `fmtSince` formatter that can't be
  snapshot-tested. **The timezone pipeline (carry neo's — it was solid):** the wire is ALWAYS a **UTC epoch
  number** (server stamps via its injected clock; no tz, no formatted strings ever cross the wire);
  localization to the **browser-local tz** happens exactly ONCE, at the display edge, in the sealed
  `lib/time.ts` seam via **memoized `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat`** (Intl defaults to the
  browser tz+locale — no tz lib needed, §formatters/D54). `now` is **injected** into that seam (not read from
  `Date.now()`), so relative-time (`"2h ago"`) is snapshot-testable — the fix for neo's un-testable `fmtSince`.
  _Gate: `client-determinism` already bans `Date.now()`/`new Date()` in render; the `time.ts` seam is the ONE
  sanctioned `Intl` site, fed the injected `now`._
- **`castId<X>("")` empty-id sentinel → `skipToken`.** The fake branded id paired with `enabled:` appears
  ~10× as the disabled-query input; if the `enabled` guard is ever dropped the empty id hits the server. A
  `useGatedQuery(id, optsFn)` that refuses to build the key when `id` is null removes the sentinel entirely.
  _Gate `no-fake-disabled-id`._
- **Zustand selector stability** — D42 already seals `createEntityDraftStore`'s frozen `EMPTY`; extend the
  zustand-selector gate to **all** keyed stores (a selector returning a fresh `{}`/`[]` spins
  `useSyncExternalStore` → infinite re-render — runtime-only, no compile signal). And split per-token stream
  fields from lifecycle fields so chrome physically _cannot_ subscribe to token churn (the hot-path-selector
  perf cliff).
- **Registry-pairing keystone.** `TOP_NAV_SLOTS` ↔ `MODAL_SLOTS` id-pairing is the shell's keystone and was
  **unguarded** (a missing body shipped as "the panel won't open", caught only by a defensive `?? null`).
  _Gate `check:registry-pairing` (every `kind:"modal"` slot has a `MODAL_SLOTS` entry + the id is in the union)._
- **Typed test-id registry.** Freeform `data-testid` strings (hundreds, hand-typed) mean a typo silently
  breaks an e2e selector and never trips `tsc`. A `testId(...)` helper / typed map makes a typo a type error.

<!-- Source: client.md -->

<a id='bc3af343'></a>

### 11.6 Streamdown + untrusted content — the deferral becomes a CONCRETE two-policy spec (verified 2026-06)

The audit **confirms** D21's threat surface is chat-only: every character-card field renders as **escaped
text / input values** in the editors (zero `dangerouslySetInnerHTML`/markdown in character/persona/world-info
slices) — the only untrusted-markdown render is chat's message body. **Online verification of Streamdown's
actual security model (streamdown.ai/docs/security) sharpens the §6.3/§10 deferral from "verify it sanitizes"
into a precise requirement:** Streamdown runs `rehype-sanitize` (GitHub's schema) **+ `rehype-harden` BY
DEFAULT** — so we are NOT "layering rehype-sanitize behind the seam", it's already there. **But the default
config is deliberately PERMISSIVE** (all link/image/protocol prefixes allowed) — _suitable for our own
semi-trusted AI output, explicitly NOT safe for fully-untrusted content_ (character cards, other users'
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

<!-- Source: client.md -->

<a id='5ee53487'></a>

### 11.7 Sequencing (born-compliant — the non-negotiable)

Every §11.3 primitive, the §11.4 codegen, and all new gates ship in the **`@orb/ui` + client-foundation
wave, BEFORE any feature agent runs.** The audit's verdict is unambiguous: _neo rotted in the gap between
"feature shipped" and "gate written."_ For orbweaver these are a **prerequisite of Phase 6**, sequenced like
the Phase-0 backend gates were — a feature that lands before its gate is enforced retroactively, which is the
exact ts-morph-out-of-a-mess this whole exercise exists to prevent. (§12.8 is the §12-content companion to
this rule.)

<!-- Source: client.md -->

<a id='36658ec7'></a>

### 11.8 Stack-currency verification (2026-06 — checked the load-bearing bets are best-practice, not stale)

Every foundational choice was re-verified against current (June 2026) reality, since the design predates it:

- **Base UI** — ✅ `@base-ui/react` is correct (renamed from the stale `@base-ui-components/react`); **1.0
  stable shipped 2025-12-11, now 1.6.x**, 35 a11y components, MUI-backed long-term-maintenance commitment.
  The primitive foundation is real and production-stable.
- **React Compiler × TanStack Virtual — CORRECTED (D54; full-docs+changelog mine, `UI-Lib-TanStack-Virtual.md`).**
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
  kept nivo and named ECharts only as a deferred _exit ramp_. Reversed at Nate's call: nivo is **still v0.99**
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
