---
kind: law
status: active
updated: 2026-07-13
---

# UI-Gates-and-Lessons

> **The UI enforcement law.** Decision records: D42–D44, D52, D54, D62, D66 in
> `Core-Laws-and-Precedents.md`. §-map + reading order: `UI-Architecture-and-Layout.md` header. The
> war-story archaeology behind these rulings is `history/ui-gates-lessons-archaeology-record.md`.

## 7. The sealed gotchas — fix each ONCE, in a place a cold agent can't bypass

Four cross-library footguns from neo, all rooted in libs that live OUTSIDE React's render model
(external stores, event-based state, non-memoizable closures — which React 19 + the Compiler punish).
neo solved each per-site; orbweaver seals each in a primitive. Row order is load-bearing (gate
`no-form-reset-in-autosave` cites "§7 row 2").

| Footgun | Root | Sealed in |
| - | - | - |
| **Virtual × React Compiler** — `useVirtualizer`'s return is internally mutable; the Compiler memo pass can flash the list | interior mutability (FIXED upstream) | **`@orb/ui/virtual-list`** owns `directDomUpdates: true` + `containerRef` (TanStack Virtual 3.14+, Compiler-E2E-tested — NOT `"use no memo"`, obsolete) + `measureElement` wiring. Features never call `useVirtualizer` (dep-cruiser `ui-satellite-seals`). |
| **Form × React** — `isDirty` is event-based, never auto-clears after submit → `useStore(isDirty)+useEffect` loops forever; save bar stays "Unsaved" | TanStack Form persistent-dirty | the **`client/forms` factories** own the post-submit reset; the banned `useEffect`-on-`isDirty` autosave is gate-flagged |
| **Form × Query × Zustand** — a background refetch reseeds the form and clobbers unsaved typing | three-lib interaction | the reseed guard inlined in `create-saved-entity-form.ts` (`seededRef` + `!form.state.isDirty` + `form.reset(serverValues)` — reseed only an untouched form) |
| **Zustand × React** — a selector returning a fresh `{}`/`[]` per render spins `useSyncExternalStore` forever | referential instability | the **`createEntityDraftStore`** factory's frozen `EMPTY` (+ `useShallow` for multi-field selectors) + a gate flagging fresh literals |

The two FORM rows are 2 of the six editor obligations the factories bake — the full contract is §13.4
(the canonical home). Don't build a form against this table; build against §13.4.

**Doc TS snippets use method-shorthand (`get(id): Def`)** — biome's `useConsistentMethodSignatures` rejects
it on house style. Write property-style: `readonly get: (id: Id) => Def`. Same shape; never copy a doc
snippet verbatim into code.

## 8. The gates (physics + lint belts)

> **Live enforcement state has ONE home:** `Core-Enforcement-Active-Gates.md` (what fails a build today,
> all six layers) + `Core-Enforcement-Deferred-Dropped.md` (the backlog + each gate's activation
> trigger), kept honest by `enforcement-registry-parity.ts`. This § is the UI-law INDEX — the CONCEPT
> each UI-enforcement family protects, not a status board (do not re-track live/parked/dormant here; it
> drifts against the registry).

The UI enforcement families:

- **Physics (dependency-cruiser, `.dependency-cruiser.cjs`).** `@orb/ui` ⇏ contracts/db/server/client
  (`ui-cake`); `ui-no-node-builtins`; `ui-groups-independent` + `ui-primitives-below-groups` +
  `ui-lib-tokens-floor`; every satellite lib sealed behind ONE `@orb/ui` group (`ui-satellite-seals` —
  the lib→group map lives in that rule + §11.3). "client ⇏ raw satellite libs" is RESOLVER physics (the
  libs aren't in client's `package.json`), a deliberate NON-rule — not a dep-cruiser rule.
  `client ⇏ @orb/server` (wire types come from `@orb/contracts`).
- **Token gates (ts-morph, `scripts/check/gates/`).** `no-color-literals` (incl. named non-token colors +
  the theme-aware `--scrim`), `no-raw-spacing-in-features`, `no-raw-typography-in-features`,
  `no-raw-z-index`, `no-arbitrary-tw-values` — over ALL feature + ui TSX (the `-in-features` suffix is
  historical; scanRoot = client + ui src, only `ui/layout` + `ui/markdown` allowlisted), no
  `components/ui/`-style exemption (§11.0/§11.4).
- **Compose-only keystone (ESLint, `eslint.config.js`).** A feature ASSEMBLES `@orb/ui` primitives +
  the layout kit; it never PAINTS — no `className`/`style` on a raw intrinsic element anywhere in
  `packages/client/src`, three exact exemptions: `features/app-shell/**` (the SHELL-tier painter),
  `state/**` (store-internal setState re-list mechanics), `lib/weave-glyph.tsx` (the one lib painter,
  exact path) — `client-architecture-lockdown.md` §4/§15. Plus the zustand static-`setState`/`getState`
  escape-hatch ban, the react-hooks v7 React-Compiler diagnostics (`exhaustive-deps` +
  `unsupported-syntax` at error), the `@tanstack/query` + `@tanstack/router` discipline, and
  better-tailwindcss compiled-class validation on ui.
- **Structural (ts-morph, `scripts/check/gates/`).** The UI structural family: `ui-primitive-structure`
  (the §13.7 primitive/CT contract), `client-structure`/`feature-structure` (the §2.1 slice shape),
  `state-files` (the §5 Zustand discipline), the two selector-stability gates
  (`zustand-selector-stability.ts` = the fast narrow literal belt; `zustand-selector-derived.ts` = the
  full-body/second-call-shape comprehensive belt), `no-effect-on-shared-selection` (§5.1),
  `persistence-boundary` (§12.1), `no-interactive-role-in-features` (closes the layout-kit
  interactive-role escape hatch), `surface-a11y-focus`, the registry keystones (the
  `modal-/section-/chrome-registry-completeness` trio — `registry-pairing` RETIRED at M4, the
  rail↔modal bijection is structural — plus `modal-body-not-placeholder`, `placeholder-copy-registry`), and the
  client-foundation belts (`no-array-literal-querykey`, `no-inline-invalidate-outside-seam`,
  `bus-onData-no-store-write`, `no-form-reset-in-autosave`, `persist-partialize-and-total-migrate`).
- **Tests.** The token-freshness invariant (§3 derived theme) + the CT containment tests on the D44
  trio (UI-Theming-and-Content.md §12.6).

**The D62 design-gate set** (specced in `history/design-enforcement.md` §3; lands WITH the D62 feature
lanes per §11.7): `no-raw-interactive-intrinsics` (raw `<button>/<input>/<select>/<textarea>/<a>` banned
in `features/**` regardless of className), `no-arbitrary-tw-values` (bracket-value utilities banned in
features AND ui), `empty-state-has-action` (§4.3 rule 1's mechanical half), CT state-coverage (every
interactive primitive's CT asserts focus-visible ring + disabled opacity). **Not yet gated — the
CI-browser-lane prerequisite is MET (`ci.yml` installs Playwright chromium + runs `pnpm verify --full`);
the goldens themselves are unbuilt:** the ARIA-tree goldens (`toMatchAriaSnapshot`
over the canonical shell states) and screenshot goldens (`toHaveScreenshot` × {desktop, mobile},
probe-mode on, animations off) — the "visual-regression as a gate" commitment.

**No directory is exempt from a boundary rule** (the `_shared` + `components/ui/` exemptions are what
rotted neo — §11.0).

## 9. What we explicitly do NOT carry from neo

shadcn copy-paste · Radix · the react-markdown stack · react-syntax-highlighter/Prism · the single-route
`this_chid` re-coupling sync effect · `@/` aliases (use `#`) · file-based Router codegen (\~3 hand-written
routes) · `compact`/`inDrawer`/`density` layout props (container queries replace them) · per-feature
`useVirtualizer` (the `@orb/ui/virtual-list` seal replaces it).

## 10. Deferred forks (DEFERRED-with-a-committed-default)

- **Token enforcement level** — DEFAULT: Tailwind v4 + DTCG + the gates. Deferred upgrade: Panda
  `strictTokens` (type-level). Revisit only if gate-bypass is observed. (§3)
- **Streamdown sanitization for untrusted content** — RESOLVED-BUILT: the two-policy seal shipped
  (`packages/ui/src/markdown/policy.ts`, §11.6).
- **DECIDED (not forks):** Base UI as the primitive · Zustand for client state · Streamdown for markdown
  · single-route shell · the container model · the `@orb/ui` package + DTCG tokens.

## 11. Ratified from the full neo-client audit (ledger D43)

The standing rulings from the ten-agent neo-client audit. Provenance + the bug narratives that produced
each ruling: `history/ui-gates-lessons-archaeology-record.md`.

### 11.0 Why neo rotted *despite* being structured + enforced (the three root causes)

neo had feature-slices, dep-cruiser, a token system, and \~104 gated queryKeys — and still rotted, in
three seams. The three standing rulings (also D43 (1)/(2)/(3)):

1. **No directory is exempt from a boundary rule.** Exemption zones (`features/_shared/`,
   `components/ui/`) become rot zones — every neo prod bug and raw style value lived in them. `@orb/ui`
   is a real package under the same token gates; there is no `_shared` drawer.
2. **Every footgun is carried by STRUCTURE (a factory/primitive the call site cannot bypass), never by a
   remembered convention.** Consumer-obligation footguns leak as comments and rot; library-owned ones
   don't.
3. **The tRPC router + `@orb/contracts` ARE the cross-feature contract; calling a procedure is not
   coupling.** A legit cross-feature READ has a legal home — it does not belong in a `_shared/` drawer.

### 11.1 KEEP-BY-CONSTRUCTION (neo got these right — lock as physics, don't let them re-rot)

- **queryKeys are 100% tRPC-codegen-derived.** All sites are `trpc.X.Y.queryKey()`; zero ad-hoc
  `queryKey:[...]` arrays. The tRPC proxy IS the key factory. *Gate `no-array-literal-querykey`.*
- **The stream/turn lifecycle is the reference — carry it almost verbatim.**
  `applyChatBusEvent(event,deps)` is a pure, extracted, exhaustive switch over a server-authoritative
  discriminated union, node-testable against a real QueryClient with no SSE; the hook is a thin
  transport adapter. Slot lifecycle is owned by the TERMINAL turn events; `openSlot` is idempotent with
  a lazy id factory. *Gate `chat-stream-writes-in-bus-only`.*
- **Per-mutation error channels, never multiplexed.** TanStack v5 mutation errors are sticky until the
  next fire; `a.error ?? b.error` leaks action A's failure into B's surface. One error slot per
  mutation. *Gate `no-multiplexed-mutation-error`.*
- **Registry-as-data shell + derive-don't-respell registries.** The array/record IS the panel; a missing
  member is a `tsc` error, not a stale `<Select>`.
- **The clamp-width overlay shell is the SHELL-tier reference (and needs ZERO `@media`).** One master
  `--width-shell-content: clamp(680px, ${chatWidthPct}dvw, 100dvw)` var at the root; drawer width
  DERIVES; closed overlays are `absolute` + `-translate-x-full` so they consume zero width and never
  reflow. This IS the `overlay` mechanism for §4.1's collapsible panels.
- **The bus→cache sync seam is the only sanctioned SSE shape.** A subscription `onData` may (a) buffer
  transient progress in LOCAL state and (b) `invalidateQueries(readKey)` — it must NEVER become a second
  store. The invalidation key is produced by the same `*.queryKey(args)` the reader uses. *Gate
  `bus-onData-no-store-write`.*

### 11.2 The container model is a FREEZE, not an unwind

Correction to D42 §4: features MAY use `@container`; only the SHELL tier may use viewport `@media`.
`no-media-queries-in-features` + `no-layout-context-props` freeze this at a handful of existing sites'
cost — pin before features regrow the threading. (The near-zero unwind cost is the archaeology record.)

### 11.3 NEW structural primitives — convert every leaked convention into an API the call site can't bypass

The §11.0-rule-2 fixes. The `@orb/ui` halves are BUILT; the client halves ship in the client-foundation
wave BEFORE feature agents (§11.7).

- **`@orb/ui/virtual-list` (generic) + `@orb/ui/message-list` (chat)** — seal TanStack Virtual (KEPT,
  D54). The seal owns `directDomUpdates: true` + `containerRef`, the `measureElement` wiring, and the
  unbounded-window tripwire as a THROWN error. `message-list` additionally owns the native streaming-chat
  APIs (`anchorTo:'end'` + `followOnAppend` + `isAtEnd` · id-keyed `getItemKey` for the ghost→canonical
  swap). **Keep-mounted path for stateful rows:** the `keepMounted?: (item: T) => boolean` predicate
  forces matched items' indices into the rendered range (composing over the caller's `rangeExtractor`),
  so a pinned row stays a REAL mounted DOM node at its own offset and its local React state survives
  scroll-away — the seal is pure windowed virtualization by default (rows unmount off-screen; a stable
  `getItemKey` does NOT keep them mounted). The caller owns the pinning POLICY (cap the matched set so it
  can't defeat virtualization).
- **`@orb/ui` charts** (`chart` + `bar-list`/`histogram`/`stat-figure` over the ECharts seal; D52) —
  INJECTS the token theme internally so omission is impossible. ECharts renders to Canvas, so the seal
  resolves DTCG tokens to concrete values (`getComputedStyle`) and re-reads on theme switch — the
  internal theme-injection is load-bearing for theming to work at all. Plus **`@orb/ui/meter`** for 1-D
  magnitude bars (never force these through the chart lib). Seam covers bar · line · heatmap · calendar ·
  scatter · force-graph.
- **`@orb/ui/sortable`** — seals `@dnd-kit/react` (the modern rewrite; the legacy
  `@dnd-kit/core`/`sortable`/`utilities` stack is dead and must never be installed).
- **TWO named editor factories** (homed in `client/forms`, §2.1): `createSavedEntityForm` (button-gated)
  and `createAutosaveEntityForm` (listener-debounced; **`reset` removed from its type** — calling it is
  the autosave infinite loop). The full six-obligation contract is §13.4. Keep neo's single
  `createFormHook`/`createFormHookContexts` instance (gate `no-direct-useform`). *Gate
  `no-form-reset-in-autosave`.* **Amended by D66 A4:** A4 made AUTOSAVE the standing save model (no manual
  Save button; program doc §7), so `createSavedEntityForm` + the `save-bar` primitive are now orphaned
  pending a no-consumer-remaining removal decision. Both factories still exist (D43/D54 list them); do
  not delete on the strength of A4 alone.
- **`ChatHandle` — the true `this_chid` successor.** A discriminated handle
  `{ kind:"committed"; id } | { kind:"draft"; id; meta }` threaded from the composition root; the draft
  and committed paths become different functions that don't typecheck against each other — forgetting the
  branch cannot compile. (Replaces neo's ambient `isOptimistic` boolean.)
- **The central invalidation seam.** queryKeys are solved (§11.1) but invalidation is the real sprawl.
  One `client/data/invalidation.ts` maps domain-event → `queryFilter()`s; mutation `onSettled` + bus
  handlers call `invalidate(event)`. *Gate `no-inline-invalidate-outside-seam`.*
- **`@orb/contracts` owns every wire DTO; the client never imports `#server/*`.** *Physics:
  `client ⇏ @orb/server`. dep-cruiser `client-no-backend-runtime`.*

### 11.4 Close the token hole + extend gates past `globals.css`

neo's design-token check only inspected `globals.css`, never feature TSX — so raw `size-[1.5rem]`,
`z-10`, `bg-black/50` drifted everywhere. Ratified: (a) `@orb/ui` lives under the same token gates as
features, no `components/ui/` exemption; (b) the Tailwind utility namespaces are GENERATED from the DTCG
source (dead token = failing freshness test); (c) the token gates apply to ALL feature + ui TSX;
(d) `no-color-literals` widened past hex to named non-token colors (`bg-black`/`bg-white`) + the
theme-aware `--scrim` token (a `bg-black/50` scrim is invisible on a true-black theme); (e) a small CSS
structure test pins the `globals.css` footguns (theme enumeration, the unlayered reduced-motion floor,
per-theme `color-scheme`).

### 11.5 The smaller HIGH-value gates (persist · determinism · sentinels · keystones)

- **Persist versioning — partly irreversible, pin first.** 9 of 11 neo stores `persist()` a non-primitive
  shape with no `version`/`migrate`; once stale blobs are in users' `localStorage` you can't migrate from
  a version line you never shipped. \*Gates `no-raw-zustand-persist` + `persist-partialize-and-total-migrate`
  - a `STORAGE_KEYS` uniqueness registry *(PHANTOM-REF — never built; only a code-comment concept in `create-gated-store.ts`; truth-audit 2026-08-03)*.\*
- **Determinism reaches the client.** Extend the server's no-`Date.now()`/`new Date()`/`Math.random()`
  rule to client render + optimistic code (seeded PRNG allowed). **Timezone pipeline:** the wire is
  ALWAYS a UTC epoch number; localization to browser-local tz happens exactly ONCE, at the display edge,
  in the sealed `lib/time.ts` seam via memoized `Intl.*`; `now` is INJECTED so relative-time is
  snapshot-testable. `time.ts` is the ONE sanctioned `Intl` site. *Gates `no-raw-random`, `no-raw-clock`,
  `no-raw-intl-time`.*
- **`castId<X>("")` empty-id sentinel → `skipToken`.** The fake branded id paired with `enabled:` hits
  the server if the guard is ever dropped. `useGatedQuery(id, optsFn)` refuses to build the key when `id`
  is null. *Gate `no-fake-disabled-id`.*
- **Zustand selector stability** — a fresh `{}`/`[]` per render spins `useSyncExternalStore` (runtime-only,
  no compile signal). Split per-token stream fields from lifecycle fields so chrome physically cannot
  subscribe to token churn. *Gates: `zustand-selector-stability.ts` (narrow) + `zustand-selector-derived.ts`
  (full-body, both call shapes).*
- **Registry-pairing keystone.** RAIL\_SLOTS ↔ MODAL\_SLOTS id-pairing was unguarded in neo (a missing body
  shipped as "the panel won't open"). *Gate `modal-registry-completeness` (`registry-pairing` RETIRED at
  M4 — the rail DERIVES modal affordances from the registry; the bijection is structural).*
- **Typed test-id registry.** A `testId(...)` typed map makes a `data-testid` typo a type error. What it
  does NOT make a type error is a LIVE key whose producer was deleted: the id stays spellable, the
  selector matches nothing, and the assertion fails late or passes falsely (the 2026-08-14 draft-cast
  ghosts survived every scoped floor). A row lives only as long as a component stamps it — add the row
  and its `data-testid` in the same commit, delete both together. *Gates `testid-typed-only` (spelling) +
  `testid-liveness` (a consumer or a registry row with no producer).*

### 11.6 Streamdown + untrusted content — the two-policy spec (BUILT)

The threat surface is chat-only: character-card fields render as escaped text; the only untrusted-markdown
render is chat's message body. The `@orb/ui/markdown` seam exposes two trust policies (BUILT in
`packages/ui/src/markdown/policy.ts`). **Governing posture (D44 §12.0): UNTRUSTED BY DEFAULT** — "trusted"
names the permissive POLICY, not a default; the model is untrusted (indirect prompt-injection can make it
emit exfil-shaped markup). Per-message tier resolved by `resolveRowRenderPolicy`
(`client/src/lib/render-trust.ts` — re-homed from features/chat, cross-feature tier 4); the opt-in mirrors `forbidExternalMedia` (deployment-global
`trustHtml` AND per-character override, resolved server-side `override ?? global`).

- **`trusted` (the OPT-IN escalation — the viewer's OWN input, or a character/global that opted into rich
  HTML):** Streamdown defaults — maximum functionality.
- **`untrusted` (the DEFAULT — LLM output / imported cards / other participants / system):** the Tier-A
  element allowlist (§12.2) MINUS `img`, plus a `urlTransform` gate (blocks `javascript:`/`data:`/off-allowlist
  hosts), AND Mermaid withheld (a `mermaid` fence degrades to an inert code block). KaTeX kept (rehype-katex
  `trust:false` — math-only, inert).

> \[!WARNING] `img` MUST be dropped at the element level for untrusted content — NOT via `urlTransform`.
> Streamdown emits a `<link rel="preload" as="image">` that `urlTransform` does NOT intercept, so an
> untrusted external image would prefetch to the source (the D21 tracking-pixel exfil) even with the url
> gate. Untrusted images route through the gated `<MessageMedia>` (§12.3). Streamdown 2.5's real security
> surface is `allowedElements`/`disallowedElements` + `urlTransform` — the docs-assumed
> `allowedLinkPrefixes`/`allowedImagePrefixes`/`allowDataImages` knobs do not exist.

Also pinned: `remark-gfm { singleTilde:false }` (else `10~20°C` renders struck-through). The Phase-6 chat
wiring (per-message trust selection + `MessageMedia`/`SandboxFrame` dispatch) LANDED: `message-row.tsx`
resolves `render` via `resolveRowRenderPolicy`, `message-content.tsx` dispatches markdown/media/html-card
per block. The `html-card` + `asset`-media arms are PRE-WIRED seams awaiting their producers (card grammar

- `cardTrust`; asset resolver + composer attach). *Gates `no-untrusted-html-in-main-dom`,
  `no-external-media-without-gate` (UI-Theming-and-Content.md §12.6).*

### 11.7 Sequencing (born-compliant — the non-negotiable)

Every §11.3 client primitive, the §11.4 feature-side gates, and all deferred UI belts ship in the
client-foundation wave, BEFORE any feature agent runs. neo rotted in the gap between "feature shipped" and
"gate written" — a feature that lands before its gate is enforced retroactively, the exact mess this
architecture exists to prevent. (The `@orb/ui` half is already discharged — the primitives and their gates
landed together.)

### 11.8 Stack-currency decisions (the load-bearing bets)

The 2026-06 re-verification write-up is the archaeology record; the standing decisions:

- **Base UI** — `@base-ui/react` 1.x is the primitive. The rc-era `@base-ui-components/react` name is dead
  and biome-banned.
- **TanStack Virtual is KEPT** (D54), sealed (§11.3) — the interior-mutability issue was real but the fix
  shipped and is Compiler-E2E-tested; the "virtua swap" rested on now-refuted premises.
- **React 19.2** `<Activity>` + `useEffectEvent` are stable — the §4a bets stand.
- **DTCG + Style Dictionary (v5) + Tailwind v4 `@theme`** — the §3 pipeline is the current best-practice
  path.
- **Charts: Apache ECharts; nivo dropped (D52).** One dep natively covers the corpus set (bar · line ·
  heatmap · calendar · scatter · force-graph), replacing 6 `@nivo/*` packages; Canvas-rendered. Fallback if
  the similarity graph outgrows the force layout: split that one chart to a WebGL lib behind the same seal.

## 12. Authoring a gate — the full ritual (a gate is NOT just the gate file)

SUPERSEDED IN DETAIL by `scripts/check/GATE-AUTHORING.md` (THE gate-authoring law: the descriptor contract,
the complete coupled-sites list, the exemption grammar, `scanRoot` formats, harness mechanics, exemplars).
Scaffold with `pnpm gate:new <name>`. What follows is the short form; where the two differ, that doc wins.

To ship a `scripts/check/gates/<name>.ts` gate GREEN you must ALSO do all three, or `pnpm check` reds:

1. **Inline proof (always):** the descriptor exports `gate: GateDescriptor` with `name` == filename, a real
   `docRow`, `status`, `scopeSafety`, a `visit`/`visitFile`/`run` body, and ≥1 `mustFlag` + ≥1 `mustPass`. The
   loader REFUSES an un-proven gate; `gate-conformance.int.test.ts` runs the synthetic examples — you cannot
   ship an always-green fake.
2. **Registry parity:** add the gate's row to `Core-Enforcement-Active-Gates.md` AND bump the "N registered
   gates" count — `enforcement-registry-parity` reds until the doc matches the loader.
3. **Live-tree anti-drift** (`tests/tooling/check-gates.int.test.ts`): either (a) add a `__g_` fixture — a
   minimal real-tree violation at the gate's anchor path (most per-node gates) — or (b) add the gate NAME to
   `UNFIXTURABLE_GATES` if it reconciles WHOLE-TREE state and no minimal fixture can trigger it (parity /
   completeness arms). Do NOT force a fake fixture for an unfixturable gate.

**`scopeSafety` is load-bearing:** a cross-file / registry / completeness gate marked `incremental-safe`
false-greens on scoped runs — it MUST be `whole-project` when it reconciles across files.

**Prove it BITES its REAL shape, not a strawman.** The machine proves a gate self-CONSISTENT (mustFlag/mustPass
run); it CANNOT prove the examples are HONEST — that is the reviewer's job. Construct the REAL violation shape
(the actual bug the gate exists to stop) and confirm the gate reds on it; a `mustFlag` that bites a toy while
the real shape slips through is the failure. Two recurring traps: a gate that catches ONE syntactic form of the
banned shape is a HALF-gate (enumerate every form — object vs array vs bare-string-list; `.map()` vs
`renderItem`; annotated vs inferred type); and a gate whose `scanRoot` names a specific FILE dies silently GREEN
when that file is deleted (a deletion wave must sweep gates for scanRoots at deleted paths).
