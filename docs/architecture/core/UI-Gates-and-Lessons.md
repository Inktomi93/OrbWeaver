---
kind: law
status: active
updated: 2026-07-03
---

# UI-Gates-and-Lessons

> **The UI law — part of the nine-doc set split from the D42 spec** (pre-split source: a deleted `client.md`). Decision records: D42–D44, D52, D54 in `Core-Laws-and-Precedents.md`. §-map + reading order: `UI-Architecture-and-Layout.md` header.

## 7. The sealed gotchas — fix each ONCE, in a place a cold agent can't bypass

Four cross-library footguns observed in neo (all rooted in libs that live *outside* React's render model — external stores, event-based state, non-memoizable closures — which React 19 + the Compiler punish). neo solved each per-site; orbweaver seals each in a primitive:

| Footgun | Root | Sealed in |
| - | - | - |
| **Virtual × React Compiler** — `useVirtualizer`'s return is internally mutable; the Compiler memo pass can flash the list | interior mutability (FIXED upstream) | **`@orb/ui/virtual-list`** (BUILT) owns **`directDomUpdates: true` + `containerRef`** (TanStack Virtual 3.14+, Compiler-E2E-tested — **NOT `"use no memo"`**, obsolete) + `measureElement` wiring. Features never call `useVirtualizer` (dep-cruiser `ui-satellite-seals`). |
| **Form × React** — `isDirty` is event-based, never auto-clears after submit (#1144) → `useStore(isDirty)+useEffect` loops forever; save bar stays "Unsaved" | TanStack Form persistent-dirty | the **`client/forms` factories** (`useAppForm`, Phase 6) own the post-submit reset; the banned `useEffect`-on-`isDirty` autosave is gate-flagged |
| **Form × Query × Zustand** — a background refetch reseeds the form and clobbers unsaved typing | three-lib interaction | a **`useSeedFormOnServerLoad`** guard (`seededRef + persistent-isDirty + reset`) baked into the saved-form factory (Phase 6) |
| **Zustand × React** — a selector returning a fresh `{}`/`[]` per render spins `useSyncExternalStore` forever | referential instability | the **`createEntityDraftStore`** factory's frozen `EMPTY` (+ `useShallow` for multi-field selectors) + a gate flagging fresh literals (Phase 6) |

The two FORM rows are 2 of the six editor obligations the factories bake — **the full contract is §13.4 (the canonical home). Don't build a form against this table; build against §13.4.**

## 8. The gates (physics + lint belts)

> **One home for enforcement state:** `Core-Enforcement-Active-Gates.md` is the live registry (what fails a build today, all six layers); `Core-Enforcement-Deferred-Dropped.md` is the backlog. This § is the UI-law index: what each UI gate protects and where it lives. Rationale lives where each gate was specced (§11.x / §12.6 / §13.3).

**LIVE — physics (resolver + dep-cruiser, `.dependency-cruiser.cjs`):** `@orb/ui` ⇏ contracts/db/server/client (`ui-cake`); `ui-no-node-builtins`; every satellite sealed behind ONE group (`ui-satellite-seals`: echarts→`charts/` · react-virtual→`virtual-list|message-list|media-grid` · codemirror→`code-editor/` · streamdown/remark→`markdown/` · cmdk→`command/` · @dnd-kit→`sortable/` · diff→`diff/` · lucide→`icons/` · minisearch→`macro-textarea/`); `client-no-raw-satellites` (pre-wired Phase-6 backstop); `client ⇏ @orb/server` (wire types come from `@orb/contracts`).

**LIVE — ESLint (`eslint.config.js`, the narrow supplement to Biome):** react-hooks v7 recommended-latest (the React-Compiler Rules-of-React diagnostics; `exhaustive-deps`/`unsupported-syntax` hardened to error, `incompatible-library` kept at warn — it fires correctly on seals); `@tanstack/query` discipline incl. `prefer-query-options` (dormant until client Query code); `@tanstack/router` `create-route-property-order`; better-tailwindcss compiled-class validation on ui; the **compose-only keystone** (a feature ASSEMBLES `@orb/ui` primitives + the layout kit, it never PAINTS — no `className`/`style` on a raw intrinsic element in `features/`, app-shell exempt as the SHELL-tier painter); the zustand static-`setState`/`getState` escape-hatch ban.

**LIVE — Biome grit (`biome.json` → `tools/grit/`):** the token gates (`no-color-literals` incl. named non-token colors → `--scrim`, `no-raw-spacing`, `no-raw-typography`, `no-raw-z-index`) covering **all feature + ui TSX** (no `components/ui/`-style exemption — §11.0); `no-layout-context-props`; the neo client four (`no-direct-useform` · `no-form-state-in-useeffect` · `no-chat-trpc-in-surface` · `no-inline-optimistic-in-surface`, dormant until client code).

**LIVE — structural gates (`scripts/check/gates/`):** `ui-primitive-structure.ts` (the §13.7 primitive/CT contract) · `client-structure.ts` (the §2.1 feature-slice shape, per-built-feature — now incl. neo rules 2/6/7: feature↔domain mirror, per-bucket file naming, surface-purity) · `state-files.ts` (the §5 Zustand `state/` discipline: field cap, one store per file, no exported raw handle).

**LIVE — tests:** the token freshness test (§3 derived-theme invariant) · the CT containment tests on the D44 trio (§12.6).

**PARKED (named, correct — the client-foundation belts; they gate constructs that don't exist yet and MUST land before feature agents, §11.7/§13.6):** `no-media-queries-in-features` · `no-raw-container-widths` · `no-array-literal-querykey` · `no-inline-invalidate-outside-seam` · `no-inline-cache-surgery-in-stream` (scoped to stream/subscription bodies — must NOT flag `createEntityMutation.onMutate`) · `no-multiplexed-mutation-error` · `bus-onData-no-store-write` · `no-form-reset-in-autosave` · `no-client-wire-redeclare` · `persist-shape-needs-version`/`persist-partialize-and-total-migrate` · `no-fake-disabled-id` · `no-static-staletime-on-bus-keys` · `form-factory-for-multifield` · client-determinism (render scope: no `Date.now()`/`new Date()`/`Math.random()`; seeded PRNG allowed) · the zustand-selector gate · `check:registry-pairing` · the typed-`testId` gate · `tanstack-form-only-in-shared` (single-`createFormHook` half) · `client-feature-front-door`/`client-features-no-cross` · the D44 lint/route halves (§12.6) · `touch-target-floor`'s per-component half (token floor is test-locked; component half rides CT `boundingBox` assertions).

**DORMANT (built + self-tested, held out of `report.ts`'s `ALL_CHECKS` — distinct from PARKED, which is unwritten; activation is a one-line add, ground truth = the `DORMANT_GATES` set in `tests/tooling/check-gates.int.test.ts`):** `surface-in-a-container` (needs a real consumer surface — app-shell is shell-tier-exempt) · `component-size-ui` (rides W1-1's `table.tsx` split) · `test-presence-client` (rides W1-1's client-primitive test backfill). Full registry + triggers: `Core-Enforcement-Active-Gates.md`.

**No directory is exempt from a boundary rule** (the `_shared` + `components/ui/` exemptions are what rotted neo — §11.0).

## 9. What we explicitly do NOT carry from neo

shadcn copy-paste · Radix · the react-markdown stack · react-syntax-highlighter/Prism · the single-route `this_chid` re-coupling sync effect · `@/` aliases (use `#`) · file-based Router codegen (\~3 hand-written routes) · `compact`/`inDrawer`/`density` layout props (container queries replace them) · per-feature `useVirtualizer` (the `@orb/ui/virtual-list` seal replaces it).

## 10. Deferred forks (DEFERRED-with-a-committed-default)

- **Token enforcement level** — DEFAULT: Tailwind v4 + DTCG + the gates. Deferred upgrade: Panda `strictTokens` (type-level). Revisit only if gate-bypass is observed. (§3)
- **Streamdown sanitization for untrusted content** — RESOLVED-BUILT: the two-policy seal shipped (`packages/ui/src/markdown/policy.ts`, §11.6). The remaining hard checkpoint is the Phase-6 chat wiring (per-message trust selection + `MessageMedia` routing).
- **DECIDED (not forks):** Base UI as the primitive · Zustand for client state · Streamdown for markdown · single-route shell · the container model · the `@orb/ui` package + DTCG tokens.

## 11. Ratified from the full neo-client audit (ledger D43)

**Provenance.** Ten agents read every file in neo's client (\~51k LOC) against a shared KEEP / DUMP / IMPLICIT-CONVENTION / CROSS-LIB-FOOTGUN / ENFORCEABLE-RULE contract. This section is the ratified synthesis; D43 is the decision record. The findings converged across slices — which is what makes them load-bearing rather than slice-local.

### 11.0 Why neo rotted *despite* being structured + enforced (the three root causes)

neo had feature-slices, dep-cruiser, a token system, and \~104 gated queryKeys — and still became a mess. It rotted in exactly three seams; orbweaver closes all three by construction:

1. **Exemption zones become rot zones.** Two directories were carved OUT of the rules (`features/_shared/` from `client-no-cross-feature`; `components/ui/` from the token gates). **Every documented production bug, every raw style value, and the entire cross-feature-coupling mess lived in those two exempt zones.** ⇒ **orbweaver rule: no directory is exempt from a boundary rule.** `@orb/ui` is a real package under the same token gates; there is no `_shared` drawer.
2. **Consumer-obligation footguns leak as comments and rot; library-owned ones don't.** The four footguns that required the **call site** to remember something (`reset(value)`-after-submit, silent `setValue`, `onFieldUnmount` flush, `key={entityId}` remount) leaked as prose, and only one of four editors honored all of them — forgetting `reset(value)` silently bricks the save bar with a green `check`. ⇒ **orbweaver rule: every footgun is carried by STRUCTURE (a factory/primitive the call site cannot bypass), never by a remembered convention.**
3. **The cross-feature CONTRACT was unrecognized, so coupling pooled.** neo conflated "imports another feature's React module" with "couples to another feature," so a legit cross-feature *read* (calling `trpc.worldInfo.*`) had no legal home and got dumped in `_shared/`. ⇒ **orbweaver rule: the tRPC router + `@orb/contracts` ARE the cross-feature contract; calling a procedure is not coupling.** \~29 of neo's 66 `_shared` files evaporate as a category.

### 11.1 KEEP-BY-CONSTRUCTION (neo got these right — lock as physics, don't let them re-rot)

- **queryKeys are 100% tRPC-codegen-derived.** All \~104 sites are `trpc.X.Y.queryKey()`; **zero** ad-hoc `queryKey:[...]` arrays. The tRPC proxy IS the key factory. *Gate `no-array-literal-querykey`.*
- **The stream/turn lifecycle is the reference — carry it almost verbatim.** `applyChatBusEvent(event,deps)` is a **pure, extracted, exhaustive switch** over a server-authoritative discriminated union, node-testable against a real QueryClient with no SSE; the hook is a thin transport adapter. Slot lifecycle is owned by the **terminal** turn events (Stop stays live across the whole turn incl. TTFT); `openSlot` is idempotent with a lazy id factory. *Gate `no-inline-cache-surgery-in-stream`.*
- **Per-mutation error channels, never multiplexed.** TanStack v5 mutation errors are *sticky* until the next fire; `a.error ?? b.error` fed into a dialog leaks action A's failure into B's surface. One error slot per mutation. *Gate `no-multiplexed-mutation-error`.*
- **Registry-as-data shell + derive-don't-respell registries.** The array/record IS the panel; a missing member is a `tsc` error, not a stale `<Select>`. Carry.
- **The clamp-width overlay shell is the SHELL-tier reference (and needs ZERO `@media`).** One master `--width-shell-content: clamp(680px, ${chatWidthPct}dvw, 100dvw)` var at the root; drawer width *derives*; closed overlays are `absolute` + `-translate-x-full` so they consume zero width and never reflow. No media queries, no `react-resizable-panels`. **This IS the `overlay` mechanism for §4.1's collapsible panels** — the rail-shell's `docked`→`overlay`→`collapsed` states reuse this exact clamp.
- **The bus→cache sync seam is the only sanctioned SSE shape.** A subscription `onData` may (a) buffer transient progress in **local** state and (b) `invalidateQueries(readKey)` — it must **never** become a second store. The invalidation key must be produced by the same `*.queryKey(args)` the reader uses. *Gate `bus-onData-no-store-write`.*

### 11.2 The container model is a near-zero-cost FREEZE, not an unwind (the audit's happy surprise)

The plan assumed unwinding neo's `compact`/`inDrawer`/`density` threading. **It doesn't exist in the hot paths:** chat has **0** occurrences and **0** `@media`/`@container`; the macro shell needs **0** `@media`; total viewport-responsive sites client-wide: \~6. So `no-media-queries-in-features` + `no-layout-context-props` are a **freeze at \~6 sites' cost** — pin before features regrow the threading. **Correction to D42 §4:** features MAY use `@container`; only the SHELL tier may use viewport `@media`.

### 11.3 NEW structural primitives — convert every leaked convention into an API the call site can't bypass

The §11.0-rule-2 fixes. The `@orb/ui` halves are BUILT; the client halves ship in the client-foundation wave **before** feature agents (§11.7).

- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat) — BUILT** — seal TanStack Virtual (KEPT, D54; the virtua swap was refuted, §11.8). The seal owns `directDomUpdates: true` + `containerRef`, the `measureElement` wiring, and the unbounded-window tripwire **as a thrown error** (neo's dev-warn cost a 200ms commit). `message-list` additionally owns the native streaming-chat APIs (`anchorTo:'end'` + `followOnAppend` + `isAtEnd` = stick-to-bottom-without-yank · id-keyed `getItemKey` for the ghost→canonical swap) — the cluster neo hand-rolled into a 387-line surface, native since core 3.16. **NOT yet built (corrected 2026-07-04c): a no-recycle / keep-mounted path for stateful rows.** The seal is pure windowed virtualization — rows unmount off-screen, and a stable `getItemKey` does NOT keep them mounted — so a Tier-B `sandbox-frame` iframe reloads on scroll-back and edit-in-place local state drops unless hoisted to an external store keyed by message id. Tracked as **PD-119**; the capability lands with the first stateful-row consumer (edit-in-place / Tier-B card) in the chat lane.
- **`@orb/ui` charts — BUILT** (`chart` + `bar-list`/`histogram`/`stat-figure` over the ECharts seal; D52) — **injects the token theme internally** so omission is impossible (neo's voluntary `theme=` prop shipped an invisible white-on-transparent chart). **Token-theme wrinkle:** ECharts renders to Canvas, so `var(--token)` does NOT resolve as it did in nivo's SVG — the seal resolves DTCG tokens to concrete values (`getComputedStyle`) and re-reads on theme switch; the internal theme-injection is load-bearing for theming to work at all. Plus **`@orb/ui/meter`** for 1-D magnitude bars (never force these through the chart lib). Seam API covers bar · line · heatmap · calendar · scatter · force-graph (the corpus set; §11.8).
- **`@orb/ui/sortable` — BUILT** — seals `@dnd-kit/react` (the modern rewrite; the legacy `@dnd-kit/core`/`sortable`/`utilities` stack is dead and must never be installed).
- **TWO named editor factories** (homed in `client/forms`, §2.1 — Phase 6) so the four divergent strategies neo grew can't be improvised: `createSavedEntityForm` (button-gated) and `createAutosaveEntityForm` (listener-debounced; **`reset` removed from its type** — calling it is the autosave infinite loop). **The full six-obligation contract is §13.4 — do NOT re-spec it here.** Keep neo's one structural win: the single `createFormHook`/`createFormHookContexts` instance (gate `tanstack-form-only-in-shared`). *Gate `no-form-reset-in-autosave`.*
- **`ChatHandle` — the true `this_chid` successor** (Phase 6). neo killed the URL-coupled `this_chid` but resurrected the disease as an ambient `isOptimistic` boolean read in 15+ sites. Replace with a discriminated handle `{ kind:"committed"; id } | { kind:"draft"; id; meta }` threaded from the composition root — the draft and committed paths become different functions that don't typecheck against each other; forgetting the branch **cannot compile**.
- **The central invalidation seam** (Phase 6). queryKeys are solved (§11.1) but **invalidation is the real sprawl** (neo: 81 `invalidateQueries` across 40 files, no map, several arg-less). One `client/data/invalidation.ts` maps domain-event → `queryFilter()`s; mutation `onSettled` + bus handlers call `invalidate(event)`. *Gate `no-inline-invalidate-outside-seam`.*
- **`@orb/contracts` owns every wire DTO; the client never imports `#server/*`.** neo had no contracts layer, so the client imported server return types directly and re-declared wire schemas (`CustomOpenAiMetadata` had THREE homes). orbweaver's cake makes this physics. *Physics: `client ⇏ @orb/server`. Gate `no-client-wire-redeclare`.*

### 11.4 Close the token hole + extend gates past `globals.css`

neo's design-token check only ever inspected `globals.css`, never feature TSX — so raw `size-[1.5rem]`, `z-10`, `bg-black/50` drifted everywhere. Ratified (LIVE for ui; feature halves activate with client code): (a) `@orb/ui` lives under the same token gates as features, **no `components/ui/` exemption**; (b) the Tailwind utility namespaces are **generated** from the DTCG source (dead token = failing freshness test); (c) the token gates apply to **all** feature + ui TSX; (d) `no-color-literals` widened past hex to named non-token colors (`bg-black`/`bg-white`) + the theme-aware **`--scrim`** token (a `bg-black/50` scrim is invisible on a true-black theme); (e) a small CSS structure test pins the "one edit silently breaks it" `globals.css` footguns (theme enumeration, the **unlayered** reduced-motion floor, per-theme `color-scheme`).

### 11.5 The smaller HIGH-value gates (persist · determinism · sentinels · keystones)

- **Persist versioning — partly irreversible, pin first.** 9 of 11 neo stores `persist()` a non-primitive shape with no `version`/`migrate`; once stale blobs are in users' `localStorage` you can't migrate from a version line you never shipped. *Gate `persist-shape-needs-version`.* Plus a `STORAGE_KEYS` registry asserting key uniqueness.
- **Determinism reaches the client.** Extend the server's no-`Date.now()`/`new Date()`/`Math.random()` rule to client render + optimistic code (seeded PRNG allowed). **The timezone pipeline (carry neo's — it was solid):** the wire is ALWAYS a **UTC epoch number**; localization to the browser-local tz happens exactly ONCE, at the display edge, in the sealed `lib/time.ts` seam via memoized `Intl.*`; `now` is **injected** so relative-time is snapshot-testable. The `time.ts` seam is the ONE sanctioned `Intl` site.
- **`castId<X>("")` empty-id sentinel → `skipToken`.** The fake branded id paired with `enabled:` appeared \~10×; if the guard is ever dropped the empty id hits the server. `useGatedQuery(id, optsFn)` refuses to build the key when `id` is null. *Gate `no-fake-disabled-id`.*
- **Zustand selector stability** — extend the selector gate to **all** keyed stores (a fresh `{}`/`[]` per render spins `useSyncExternalStore` — runtime-only, no compile signal). And split per-token stream fields from lifecycle fields so chrome physically cannot subscribe to token churn.
- **Registry-pairing keystone.** RAIL\_SLOTS ↔ MODAL\_SLOTS id-pairing is the shell's keystone and was unguarded in neo (a missing body shipped as "the panel won't open"). *Gate `check:registry-pairing`.*
- **Typed test-id registry.** Freeform `data-testid` strings mean a typo silently breaks an e2e selector. A `testId(...)` typed map makes a typo a type error.

### 11.6 Streamdown + untrusted content — the two-policy spec (BUILT; API corrected at build)

The audit confirmed D21's threat surface is chat-only: character-card fields render as escaped text; the only untrusted-markdown render is chat's message body. Streamdown runs `rehype-sanitize` + `rehype-harden` **by default**, but the default is deliberately permissive — suitable for our own semi-trusted AI output, NOT for fully-untrusted content. So the `@orb/ui/markdown` seam exposes **two trust policies** — BUILT in `packages/ui/src/markdown/policy.ts`:

- **`trusted` (own AI output):** Streamdown defaults — maximum functionality.
- **`untrusted` (D21 — cards / other users):** the Tier-A element allowlist (§12.2) **minus `img`**, plus a `urlTransform` gate (blocks `javascript:`/`data:`/off-allowlist hosts).

**API correction (recorded at build — the docs-assumed knobs do not exist):** Streamdown 2.5's real security surface is **`allowedElements`/`disallowedElements` + `urlTransform`** — NOT `allowedLinkPrefixes`/`allowedImagePrefixes`/`allowDataImages`. And **`img` must be dropped at the element level for untrusted content**: verified 2026-07-02, Streamdown emits a `<link rel="preload" as="image">` that `urlTransform` does NOT intercept — an untrusted external image would prefetch to the source (the exact D21 tracking-pixel exfil) even with the url gate. Untrusted images route through the gated `<MessageMedia>` (§12.3) when chat wires it.

Also pinned: `remark-gfm { singleTilde:false }` (else `10~20°C` renders struck-through). The Phase-6 chat wiring (per-message trust selection at assembly) is the remaining hard checkpoint.

### 11.7 Sequencing (born-compliant — the non-negotiable)

Every §11.3 client primitive, the §11.4 feature-side gates, and all §8-PARKED belts ship in the **client-foundation wave, BEFORE any feature agent runs**. *neo rotted in the gap between "feature shipped" and "gate written"* — a feature that lands before its gate is enforced retroactively, the exact ts-morph-out-of-a-mess this architecture exists to prevent. (The `@orb/ui` half of this rule is already discharged — the primitives and their gates landed together.) (§12.8 is the §12-content companion.)

### 11.8 Stack-currency verification (2026-06 — the load-bearing bets re-checked against current reality)

- **Base UI** — `@base-ui/react` 1.x stable (1.0 shipped 2025-12; MUI-backed). The rc-era `@base-ui-components/react` name is dead and biome-banned.
- **React Compiler × TanStack Virtual — CORRECTED (D54).** The interior-mutability issue was real, but the fix shipped and is Compiler-E2E-tested: `directDomUpdates: true` + `containerRef` (3.14+); the streaming-chat cluster went native in core 3.16. The mid-2026 "virtua swap" idea rested on two now-refuted premises — **TanStack Virtual is KEPT**, sealed (§11.3). The seal still earns its place (chat cluster + dep-cruiser ban + tripwire), just not because the lib is "broken."
- **React 19.2 `<Activity>` + `useEffectEvent`** — both stable (Oct 2025). The §4a bets stand.
- **DTCG + Style Dictionary + Tailwind v4 `@theme`** — DTCG first stable spec 2025-10; Style Dictionary (v5 at build — recorded delta from the doc-era v4) has first-class DTCG support. The §3 pipeline is the 2026 best-practice path.
- **Streamdown** — real + security-first by default; stronger than planned (bundles sanitize+harden) but needed the §11.6 two-policy config (and the API correction recorded there).
- **Charts — DECIDED: Apache ECharts; nivo dropped (D52, reverses D43's "keep nivo").** nivo is stuck at v0.99 — the "amnesiac author inherits a dead lib" risk this architecture exists to avoid; the client had zero charts written, so pre-committing was free. ECharts is the only single mainstream lib natively covering the corpus set — bar · line · heatmap · **calendar** heatmap · scatter · **force-directed network** — which eliminated Recharts (renders neither hard one) and visx (hand-build). One dep replaced 6 `@nivo/*` packages; Canvas-rendered (a perf win for the dense corpus-galaxy scatter). Fallback if the similarity graph outgrows ECharts' force layout: split that one chart to a WebGL lib behind the same seal.
