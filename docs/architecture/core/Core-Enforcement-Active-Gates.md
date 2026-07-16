---
kind: law
status: active
updated: 2026-07-15
---

# Orbweaver — Enforcement Registry: Active Gates

> The currently-live, machine-enforced gate catalog — what fails a build today, across the five active layers (Biome, ts-morph structural gates, dependency-cruiser, jscpd, Stryker; the former GritQL layer is RETIRED — §Layer 2). Not-yet-active + rejected gates: `Core-Enforcement-Deferred-Dropped.md`. Extracted adoption sagas + dropped-experiment postmortems: `history/enforcement-archaeology-record.md`.

---

## Enforcement registry

The single catalog of every machine-enforced invariant in orbweaver, and the deferred backlog of
gates that are deliberately not on yet (with the trigger that turns each one on). If a rule isn't
here, it isn't enforced; if it's in the backlog, it has a named activation condition — nothing is
"forgotten," it's "scheduled."

Philosophy: gates are written **before** the code they govern, so code is born compliant. A gate that
would only false-fire on the current (placeholder) tree is not "missing" — it's in the backlog, keyed
to the code that makes it meaningful.

**The fast lane** — `pnpm check` = `biome` (lint+format) → `eslint` (the doc-comment gates
`tsdoc/syntax` + `@typescript-eslint/no-deprecated` on server/kit/db/contracts, plus the react-surface
rules on ui/client/tests-ui) → `tsc` (types, hardened by `@total-typescript/ts-reset` via the root
`reset.d.ts`) → `test:types` (the vitest typecheck lane over `tests/`) → `check:structure` (ts-morph/fs
gates) → `depcruise` (import graph — ACTIVE, Layer 4). All six must be green. lefthook runs the **full
`pnpm check` at pre-commit** and **`pnpm check` + `pnpm test` at pre-push** (see `lefthook.yml`); CI
runs the full check + `pnpm test` + `pnpm cpd`. The check
budget is **structural-fast** — whole-tree/slow analyses (jscpd, mutation) are deliberately CI/on-demand
lanes, not pre-commit.

**The CI / on-demand lanes** — `pnpm cpd` (jscpd, Layer 5) and `pnpm test:mutation[:gate]` (Stryker,
Layer 6). Enforced (they fail the build), just not in the pre-commit budget.

---

## Layer 1 — Biome (`biome.json`)

\~180 explicit rules at `error`, 4 type-aware domains (project/types/react/test), all `warn`→`error`.
Format + lint + import-organize. See `biome.json` and `docs/architecture/core/Spine-TypeScript-and-Patterns.md`.
Notable ratchets: `noUnresolvedImports`, `useConsistentTypeDefinitions: interface` (object shapes are
interfaces — matches structure §7.4), `noExcessiveCognitiveComplexity: 15`, `useMaxParams: 4`,
`useTopLevelRegex`, `useExplicitReturnType`, `noMagicNumbers`. `noConsole` is a **total ban by default**
(`allow: []` — server/db/contracts/kit log through the logger/pino, never raw console); relaxed only
for `packages/client/**` (`info/warn/error` ok in the browser until a client logger lands) and turned
off for `scripts/**` + `tests/**` (console is their output channel).

## Layer 2 — GritQL plugins — **RETIRED (2026-07-15, migrated to Layer 3)**

The GritQL layer is GONE: biome's gritql engine had been core-dumping SILENTLY whenever a plugin
touched `packages/db`/`packages/server` shapes (trpc/drizzle call graphs) — a crash reads as "no
diagnostics", so the layer enforced nothing over exactly the packages it claimed to cover. Every
plugin was recreated 1:1 as a ts-morph structural gate in `scripts/check/gates/` (Layer 3 — where the
rule, its diagnostic, and its inline `mustFlag`/`mustPass` proof live in ONE descriptor); `tools/grit/`
is deleted and `biome.json` `plugins` is empty and stays empty. Do NOT add a grit plugin — add a
Layer-3 gate.

## Layer 3 — Structural gates (`scripts/check/`, ts-morph + fs)

Layout: `harness.ts` (Project loader + Violation runner) and `report.ts` (registry) at the root;
each gate is one module in `gates/`. Add a gate by exporting a valid `gate` descriptor in `gates/` —
the loader (`report.ts`'s `loadGates()`) discovers and registers it: glob → validate descriptor →
run, fail-closed on an invalid descriptor. All are lenient on absent code (vacuously pass on the placeholder tree, activate as code
lands) and **pinned by `tests/tooling/check-gates.int.test.ts`** — it derives the gate registry from
`report.ts` and asserts every gate fires on a fixture (a broken AST query can't silently pass; anti-drift).

| Gate | Enforces |
| - | - |
| `feature-structure` | domain 8-slot template (index/service/context + contract/ + verbs/) |
| `test-layout` | `tests/` prefix-swaps 1:1 to real `packages/<pkg>/src`; support/+e2e/ exempt |
| `verb-naming` | `verbs/<v>.ts` exports `create<Pascal(v)>` |
| `no-caller-user-id` | the identifier `callerUserId` is forbidden (D19 turn-identity): the caller is `Principal.userId`; use `triggeredBy`/`runAsUserId`. AST-only (catches a newly-introduced name tsc can't) |
| `types-in-contract` | a feature's `contract/service.ts` declares the exported `<Feature>Service` interface (§7.4) |
| `no-inline-union-redecl` | no inline ≥3-member string-literal union type aliases (→ contracts) |
| `test-presence` | verbs/persistence/contract-schemas carry their required `.test`/`.int.test`/`.contract.test` |
| `test-determinism` | no ambient clock/random/unseeded-id under `tests/` (support/+e2e/ exempt) |
| `commented-code` | no parked code in `//` comments (prose only) |
| `schema-branding` | db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK) |
| `db-structure` | `packages/db` schema by-domain layout + aggregator barrel + relations |
| `baseline-single-migration` | pre-launch schema changes SQUASH into a regenerated `0000_baseline` (never an incremental `0001+` migration) — `packages/db/src/migrations` holds exactly the baseline `.sql` + a single-entry journal; a `LAUNCHED` const (default false) is the deliberate post-launch sunset switch. LAUNCH DAY: flip BOTH this const AND its runtime twin in `entry/boot/migrate.ts` (pre-launch, baseline drift AUTO-RESETS the dev db at boot; launched = boot-fatal instead) |
| `sole-env-reader` | `foundation/env` is the ONLY `process.env` reader — AST gate catching the `process["env"]` bracket form biome's `noProcessEnv` misses (ignores comments) |
| `assumes-single-replica` | a module-scope mutable `new Map/Set/WeakMap/WeakSet()` (non-literal-seed) carries `ASSUMES(single-replica)` in its file |
| `providers-runner-seal` | no `domain`/`transport`/`entry` imports the sealed runner derivation/vocab (`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) — `Tier-3b-Providers.md` inv #3 |
| `ui-primitive-structure` | `@orb/ui` primitive dir shape — front-door `index.ts` + the `<name>.tsx`/`variants.ts` trio + a colocated test; per BUILT primitive |
| `client-structure` | `@orb/client` §2.1 feature-slice layout — front-door `index.ts` + known buckets (surfaces/anchors/components/hooks/lib; app-shell +registry/store) + no-stray-root, PLUS neo rules 2/6/7: feature-name↔domain mirror (or RESERVED), per-bucket file naming (`-surface.tsx` / `use-` / anchor container-suffix), and **surface-purity** (a surface renders no outer Dialog/Sheet/Drawer — the anchor's job); per BUILT feature |
| `state-files` | `@orb/client` `state/` Zustand discipline (UI-Arch §5) — a per-store top-level field cap, one store minted per file, and no exported raw store handle (intent-named actions + narrow read hooks only) |
| `section-registry-completeness` | client-architecture-lockdown §6/§16 G1 — the section-registry walls tsc can't see: a `SectionDefinition` is co-located in `features/<owner>/lib/<id>-section.*`; a DECLARED-PLANNED section (`content:{planned}`, O1) has a non-empty reason AND no real body (list/header/non-`none` context); two co-located definitions never declare the SAME `id` (a shadow def tsc's total door Record can't see); and no route re-forms the god-map (a `sections` prop object literal in a route file, or a non-auth feature front-door import in `routes/**` outside the sanctioned `app-root.tsx`). The `modals` twin of the anti-god-map arm lands at M4 (modal registry) |
| `no-parallel-section-map` | client-architecture-lockdown §5 rule 4 / §16 G2 — an object literal / array of `{ id: … }` elements / `Record<…>`-typed value hardcoding ≥2 `SectionId`s, `ModalSlotId`s, OR `SettingsCategoryId`s (a re-declared per-id map like the old `SECTION_PANEL_DEFAULTS`/`RAIL_SECTIONS`/`RAIL_ACTIONS`/`YOU_MODAL_ROWS`) outside the sanctioned homes (the vocab tuple · the `main.tsx` door · the `*-section`/`*-modal`/`*-pane` definition files) is RED — derive from the registry, never re-declare (a derived `registry.list()…` map has no literal keys/type, so it passes). Covers the SectionId + ModalSlotId + SettingsCategoryId vocabularies (M6.1) PLUS the CHROME arm (shell-chrome-unification.md §D — chrome has no id tuple, so this keys on the `CHROME_ZONES` value axis: an array literal of ≥2 objects each with a CHROME\_ZONES `zone` outside the door/`state/assemble-chrome.ts`/`*-chrome.tsx` is a hand-maintained chrome list — RED) |
| `context-definition-shape` | client-architecture-lockdown §6b/§16 G3 — post-M3, four arms over the `defineContextTabs<S>` mint (`lib/registry-contracts.ts`): (1) a hand-rolled `{ kind: "tabs", useResolved }` object literal outside the mint's own home is a badge-wearing tabs renderer; (2) a `defineContextTabs` call with `tabs: []` AND no `contributors` (a dead mint); (3) O5 strict — a `defineContextTabs` call or `ContextTabDef<…>` type-ref whose type arg is not `void` and not an identifier resolving to a type EXPORTED from `registry-contracts.ts` (`any`/`unknown`/an inline literal/an index signature) is RED; (4) a `bodies: Record<string, ReactNode>`-shaped JSX attr/interface member under `client/src` — the dead CONTEXT\_SLOTS↔bodies split resurrected |
| `zustand-selector-derived` | the Layer-3 half of the Zustand selector-stability belt (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5) — flags a `use<X>Store(selector)`/`useStore(store, selector)` call whose inline selector returns a fresh object/array literal, an `Object.keys/values/entries(...)` derivation, or an array-rebuilding `.map/.filter/...` (directly, from a block body, or from either branch of a ternary/`??`/`&&`), unless wrapped in `useShallow(...)` — the shape its narrow sibling gate `zustand-selector-stability` (literal-concise-body only) can't express |
| `component-size` | `@orb/client` hard file-size cap (450 default / 500 route shells); gates `.ts` + `.tsx`, exempts tests/gen/`.d.ts` — god-component sprawl can't survive a check run |
| `no-direct-users-read` | the `users` table is read/written ONLY by `sessions` + `admin`; any other domain importing the `users` symbol from `@orb/db` is RED (identity comes from the Principal — resolve-once) |
| `discovery-no-stats-rollups` | the stats rollup tables (`ownerStats`/`characterStats`/`dailyStats`/`modelStats`) are stats' alone — `domain/discovery` importing one from `@orb/db` is RED; economics reach discovery ONLY as the injected pre-aggregated stats ops (stats-discovery-seam.md; a dep-cruiser `to: schema/stats` rule cannot fire — the `@orb/db` barrel absorbs the resolution, so the seal matches the ImportSpecifier like `no-direct-users-read`) |
| `pd-citation-integrity` | every in-code `FLAG[PD-n]` resolves to a `Core-Audits-and-Debt.md` registry row; no duplicate PD ids (the concurrent-append collision) |
| `test-mock-doctrine` | `vi.mock` of an internal module is banned — fake at the edges, inject at the root (`core/Spine-Testing.md §3`); third-party node edges only |
| `test-factory-contract` | `makeX(overrides?)` builders are pure (no db param); persisted variants are `seedX(db, …)`; factories live in `tests/support/factories/` |
| `test-fixture-imports` | tests import `{ test, expect }` from `support/fixtures`, never raw `vitest`/`@playwright/test` (e2e, support/, `.test-d.ts` exempt) |
| `test-no-stubs` | every test block carries ≥1 assertion (`expect`/`expectTypeOf`) — anti-gaming for `test-presence` |
| `server-layout` | `packages/server/src` root = the 6 tier dirs + `index.ts` only (§3) |
| `package-layout` | kit/contracts/db/ui/client: every module is a directory with `index.ts`; no loose root files except `index.ts` (D15) |
| `vector-scope-derived` | the vector tables (`character/image_embeddings`, `chat_digests/segments/digest_speakers`) are IMPORTED only by their sanctioned homes (embeddings/search/chat-memory/discovery/debug), WRITTEN only by `embeddings/persistence`, and cosine-ranked (`vector_distance_cos`) only in `search/persistence` — scope is derived from the producer, never stamped (D20) |
| `turn-identity` | the chat ENGINE is `Principal`-blind: no `Principal` import and no `principal` identifier under `domain/chat/engine/` — the turn triple is `runAsUserId`/`triggeredBy`/caller-resolved-upstream (D16/D17/D19) |
| `membership-enforcer` | no owner-equality comparison (`x.ownerId ===`) and no `fetchOwned`/`OwnedTable` import in `domain/chat` + the chat transport — chats are MEMBERSHIP-scoped (`assertParticipant` → `can()`); the host is looked up from the roster, never compared as an owner (D16/D18) |
| `owner-role-split` | no `role === "owner"\|"admin"` comparison outside `domain/admin/guard.ts` — `can()` is the ONE privilege seam; owner ⊇ admin lives inside it (D17) |
| `bus-coverage` | every `CHAT_BUS_EVENT_TYPES` member has a server emit site OR a cited `DEFERRED` entry — a self-cleaning two-direction ratchet (missing emit RED; stale allowlist RED) (D50) |
| `user-bus-coverage` | the per-USER bus twin of `bus-coverage`: every `USER_BUS_EVENT_TYPES` member has a server emit site (a domain verb's `emitUserEvent`) OR a cited `DEFERRED` entry — same two-direction ratchet. `connectionsChanged` is the sole founding DEFERRED (no per-user connection store; config lives in settings) |
| `bus-channel-primitive` | client-architecture-lockdown.md §13/§16 G10 — `defineBusChannel` (`transport/trpc/bus-channel.ts`) is the ONE transport `EventEmitter` home; a bare `new EventEmitter(` under `packages/server/src/transport/` outside that file is RED. Buddy's `@orb/kit/replay-buffer`-backed bus is domain-minted, not a transport `EventEmitter` — out of scope (O4) |
| `bus-definition-belts` | client-architecture-lockdown.md §13 laws 4/5, §16 G11 — every `*_EVENT_TYPES satisfies Record<X["type"], true>` const in `@orb/contracts` must carry BOTH belts a new bus can ship without: a `scripts/check/gates/*.ts` coverage-gate file naming it (the producer-coverage ratchet, `bus-coverage`/`user-bus-coverage`'s own convention), AND a mapped-type total map over its event union in `packages/client/src/data/invalidation.ts` (the consumer-exhaustiveness belt) |
| `membership-fan-guard` | client-architecture-lockdown.md §13 law 2/§16 G12 — the `emitUserEvent` identifier (the actor-only per-person emit) is banned under `domain/chat/**`: chat is MEMBERSHIP-scoped (D16/D18), so member-visible state must fan through `emitChatChanged`/the chat bus, never a single-user channel a co-member could be silently excluded from |
| `member-card-clamped` | ONE D22 clamp: no `MemberCardView` declaration outside `@orb/contracts`, no `clampMemberCard`/`resolveCardVisibility` outside `chat/substrate/auth/`, and the deleted `getRosterCardView` stays dead (D22) |
| `diagnostic-legibility` | every custom-gate diagnostic STRING carries a resolvable pointer (a `*.md` doc path, a code-home path/file, or an explicit `// terse-ok:` marker) — the meta-gate: a new gate cannot regress to a bare/pointerless message |
| `test-presence-client` | the `@orb/client` + non-primitive `@orb/ui` reach `test-presence` lacks (server/contracts only) — a test is required on the behavioral factories + logic modules, per `Spine-Testing.md` §5's conservative surface. Clause C: a `state/*.ts` store's mirror EXISTING isn't presence for a NEW action — every exported action (`createGatedStore`/`createPersistedStore`/`createEntityDraftStore` files) must be called BY NAME in its mirror `tests/client/state/*.ct.tsx` (or the shared `_ct-stories.tsx`), not merely have SOME mirror test |
| `no-effect-on-shared-selection` | the mechanical half of the anti-`this_chid` rule (UI-Arch §5.1) — a `useEffect`/`useLayoutEffect` in `features/**` keyed on a shared-selection store pointer is banned; only render-only reads are sanctioned |
| `persistence-boundary` | the device-local-vs-synced belt (UI-Theming-and-Content.md §12.1 + UI-Arch §5) — raw browser storage outside the two persist factories + the boot/dev allowlist is RED, and every persisted-store name must carry a registered why-device-local rationale |
| `no-interactive-role-in-features` | closes the layout-kit interactive-role escape hatch (UI-Gates-and-Lessons.md §8) — a `.tsx` under `features/**` assigning an INTERACTIVE (widget) ARIA role (`button`/`link`/`checkbox`/`menuitem`/… — static, braced, or conditional literal) is RED; structural/live-region roles + `data-role` stay legal, seals outside `features/**` are out of scope. Both-ways BURN\_DOWN ratchet |
| `no-raw-interactive-intrinsics` | design-enforcement.md §3.2, D62 — a raw `<button>`/`<input>`/`<select>`/`<textarea>`/`<a href>` under `features/**` (app-shell exempt, shell-tier) is RED regardless of className; interactivity must come from an `@orb/ui` primitive. Both-ways BURN\_DOWN ratchet (allowlisted click-triggers await a headless file-trigger primitive) |
| `empty-state-has-action` | design-enforcement.md §3.2, D62 — a `<EmptyState>` under `features/**` must pass `action` (or a spread that might); a dead end strands the user. Both-ways ALLOWLIST ratchet (allowlisted files await a CTA design call or are genuinely action-less) |
| `surface-a11y-focus` | a `surfaces/*.tsx` that isn't an auto-focus-trapping Base UI primitive must explicitly manage focus on mount (`.focus()`/`useFocusOnMount`) |
| `surface-in-a-container` | a `surfaces/*.tsx` that establishes raw layout must sit inside an `@orb/ui/layout` container (UI-Arch §4) — feature code never writes raw containment |
| `modal-registry-completeness` | client-architecture-lockdown.md §6d / §16 G13 (+ shell-chrome-unification.md §E-7) — the modal registry's structural walls tsc can't see: a `ModalDefinition` not co-located in `features/*/lib/*-modal.tsx`; two defs for one id; the DECLARED-PLANNED honesty (a `body: {planned}` with an empty reason, or a planned modal wiring a real function `body`); the SINGLETON-placement arm (exactly one modal per `mobile-tab` — the mobile-bar You derivation assumes one; the `rail.end`/`topbar.trail`/`surface` cluster placements may repeat); the SURFACE-reachability arm (a `surface`-placed modal with a real body needs ≥1 `openModal("<id>")` opener — it has no chrome affordance deriving it, so a missing opener = unreachable dead chrome); the anti-god-map arm (a `modals={{…}}` object literal in `routes/**`). The modal twin of `section-registry-completeness` |
| `chrome-registry-completeness` | shell-chrome-unification.md §A/§D — the chrome registry's structural walls tsc can't see (a `ChromeEntry` is a plain object literal, not a total door Record): a `ChromeEntry` not co-located in `features/*/lib/*-chrome.tsx`; two defs for one id (the contributor registry's own dupe-id throw is a runtime catch; this is the static one); a `zone` outside `CHROME_ZONES` (rail.nav/rail.end/topbar.trail). The chrome twin of `modal-registry-completeness`/`section-registry-completeness` |
| `modal-body-not-placeholder` | a `ModalDefinition` (`features/*/lib/*-modal.tsx`) whose function-arm `body` renders `<SectionPlaceholder>` is RED — an unbuilt modal uses the `{planned}` arm, never a placeholder body (the placeholder-body anti-pattern is unspellable) |
| `settings-pane-completeness` | client-architecture-lockdown.md §8 / §16 G4 — the settings-pane registry's structural walls tsc can't see: a `SettingsPaneDefinition` not co-located in `features/*/lib/*-pane.{ts,tsx}`; two defs for one id; a real function `body` that silently renders the teaching placeholder instead of the honest `body: {placeholder:true}` flag; the settings host importing a pane's `*-settings-surface` body directly instead of reading it off the registry. The settings twin of `modal-registry-completeness`/`section-registry-completeness` |
| `settings-section-anchored` | derive-modernization-audit.md §W5 item 9 (the G4 arm) — a heading-bearing `<Section>` in a `*-settings-surface.tsx` with NO `id` attribute is RED: an anchored settings section must stamp `id={settingsAnchorId(category, sub)}` (and register the sub in the owning pane's `subcategories`), or it is invisible to the settings scroll-spy + command-palette search (the invisible-to-nav/search class). Keys on `heading`-bearing Sections only (a bare layout `<Section>` is not a nav target); a spread attribute that MIGHT carry `id` is given the benefit of the doubt (empty-state-has-action precedent). scanRoot = `*-settings-surface.tsx` under `packages/client/src` |
| `placeholder-copy-registry` | client-architecture-lockdown.md §6a / §16 G13 — every co-located `SectionDefinition.placeholder` `(title, description)` pair is DISTINCT and non-empty, reconciled ACROSS the 7 `features/*/lib/*-section.*` files — kills the "three sections share one string" silent-duplicate case |
| `registry-assembly-at-door-only` | client-architecture-lockdown.md §16 G8 — `createRegistry`/`createContributorRegistry` may be CALLED only in `main.tsx` or a `compose/` module; a mutating `register(`-named function/method is banned outright wherever declared (§5 rule 1) |
| `list-row-adoption` | client-architecture-lockdown.md §14/§16 G6 — a LIST-region surface file (one importing `LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface`) whose `.map()` callback OR `renderItem`/`renderRow` prop returns interactive JSX (onClick/role/href) must root that JSX in `ListRow`/`LibraryRow`/an allowlisted composite. Both-ways ALLOWLIST ratchet (currently empty — every current LIST-surface row already roots in `LibraryRow`) |
| `enforcement-registry-parity` | this doc's declared registered-gate COUNT + Layer-3 ACTIVE/DORMANT tables must agree with the DISCOVERED gate descriptors' `status` fields (both directions) — reconciles the doc against `loadGates()`'s discovered set, not an `ALL_CHECKS` array — the meta-gate that promotes `check-gates.int.test.ts`'s anti-drift assertion to every `pnpm check` |
| `no-array-literal-querykey` | a `queryKey:` property whose value is an inline array literal anywhere in `packages/client/src` is RED — client query keys are 100% tRPC-proxy-derived (`.queryKey()`/`.queryFilter()`/`.pathFilter()`), §11.1; the data/ factory passthroughs are identifiers, never literals, so they pass |
| `no-inline-invalidate-outside-seam` | `.invalidateQueries(` may be called ONLY in `data/invalidation.ts` (the central seam); everything else routes `invalidate(event)`/`invalidateFilters`. Tighter than `client-cache-surgery-only-in-data` (which allows all of `data/`) — §11.3 |
| `bus-onData-no-store-write` | a raw `.setState(` inside a `data/bus/*` subscription `onData`/`onConnectionStateChange` body is RED — the seam buffers through the chatStream api + routes to the invalidation seam, never a second store (§11.1); the reducer-body twin of the import-side gate `chat-stream-writes-in-bus-only` |
| `no-form-reset-in-autosave` | a `.reset(` on a form in any file importing `createAutosaveEntityForm`, PLUS the reset type-strip (`Omit<…,"reset">`) must stay present and unexposed in the factory — the runtime backstop to the compile-time strip (the autosave infinite loop, §7 row 2) |
| `persist-partialize-and-total-migrate` | a bare zustand `persist(` outside the two minting factories (`create-persisted-store.ts`/`create-entity-draft-store.ts`) is RED, AND inside each factory the persist options must carry `version`+`partialize`+`migrate` — the deep twin of `no-raw-zustand-persist`, reading INTO the chokepoint (§11.5) |
| `ownerid-registry` | an `ownerId` schema column may exist ONLY on a D23-passing table (a TRUE PRODUCER, a parentless per-user aggregate, or the two sanctioned scope-subject cases — `chat_tags` D30 · `global_documents` D49); every other table DERIVES its owner by one FK to an owned entity. A newly-stamped `ownerId` on an unlisted table is a doubling — RED with the D23 cite (D21/D23/D30) |
| `no-untyped-soft-ref` | a schema column whose JS key ends in `Id` (an entity reference) MUST carry a `.references()` FK — boundaries are FK-enforced physics (D24); a soft `text`/`integer` id with no FK is banned, exceptions only `audit_logs.entityId` (append-only, outlives its referent — D37) + `users.externalId` (an external IdP subject, not a table ref) |
| `db-enum-from-tuple` | a drizzle `text("x", { enum: … })` column must reference an IDENTIFIER — an imported `@orb/contracts`/`@orb/kit` tuple or a local `as const satisfies readonly <ContractsType>[]` — never an inline array literal that re-spells the union away from its one home (D34) |
| `schema-banned-shapes` | ONE registry-driven gate over the ledger's explicitly-REJECTED schema + contract shapes — each row is a (location, forbidden shape, D-cite) the ledger killed by name; a reintroduction is RED with its cite |
| `warning-code-coverage` | the emit-coverage RATCHET for both structured warning-code tuples (`WARNING_CODES` in infra/providers · the domain warning set) — every member must appear as an emitted `{ code: "…" }` literal at a real emit site (the bus-coverage twin for the warning channels) (D41/D45/D48/D51) |
| `infra-auth-no-userid` | `infra/auth` VERIFIES headers into a pre-row `ResolvedIdentity` and must NEVER yield a `userId` — identity→row is a DOMAIN step and the `Principal` is minted ONCE at `entry/auth`; a `userId` identifier under `infra/auth/**` is banned — RED (D40) |
| `content-part-seam` | `ChatContentPart` is PRODUCED exactly once (the engine request seam, `pipeline.ts`) and CONSUMED only by `infra/providers/**`; everything upstream (assemble/shape, verbs, the rest of `domain/chat`, transport) stays `content: string` — no "content-parts everywhere" spread (D51) |
| `no-raw-clock` | raw `Date.now()` / `new Date()` (ambient now) is forbidden outside the time seam (`@orb/kit/time`) and test suites. Production reads time from the injected clock for determinism. `new Date(ms)` to parse a known timestamp remains legal. (Spine-Testing.md §3) |
| `no-raw-egress` | a bare `fetch(` in `packages/server/src` must go through `safeFetch` (the self-enforcing SSRF resolve→validate→pin guard, `infra/network`); raw `fetch` is sanctioned ONLY in the credentialed/loopback provider-egress tier + safeFetch's own home (D61 B5a) |
| `no-raw-id` | id field typed as a raw z.string() — use brandedId<T>() (nanoid) or typeIdSchema(ID\_PREFIX.x) (TypeID). The brand flows through the contract surface into services + client, so swapping a ChatId for a CharacterId becomes a type error instead of silent FK drift. (Spine-TypeScript-and-Patterns.md §1) |
| `no-raw-random` | ambient `Math.random()` in shipped source breaks determinism. Inject a seeded PRNG instead (the same seam tests pin). (UI-Gates-and-Lessons.md §11.5) |
| `contract-verb-presence` | the INTERFACE-level complement to `test-presence`'s file-mirror rule — every method a domain's exported `*Service` interface declares (MethodSignature + PropertySignature-with-FunctionType) must have an invocation-shaped match (`verb(` bare call or its `create<Verb>(` factory) in that domain's `tests/server/domain/<d>/**` tree (grep-style presence, not filename convention). Closes the "add a verb to the contract, never test it" hole (Spine-Testing.md §5). Carries a DEFERRED ratchet for cited exceptions |
| `no-test-fabrication` | bans the two fabricated-entity casts in `tests/` that compile straight through a type change — `X as unknown as Y` double-casts and object/array-literal `as Y` (Y ≠ const/any/unknown); fix is a typed factory or `satisfies Y`. `// FABRICATION-OK: <reason>` escapes a deliberate invalid-input probe. Baseline-ratchet (`no-test-fabrication.baseline.json`): a file is RED only when its count EXCEEDS baseline (Spine-Testing.md §5) |
| `form-factory-for-multifield` | a `features/**` component hand-rolling ≥3 controlled form inputs (value/checked + an onChange-family handler) without importing an editor factory is RED — the D54 §13.4 "≥3 fields ⇒ a factory" trigger, closing the hole `no-direct-useform` leaves (a form dodging Form entirely) |
| `no-arbitrary-tw-values` | design-enforcement.md §3 — a Tailwind arbitrary-value bracket (`w-[137px]`, `text-[13px]`) on a layout/size/spacing/type utility in `packages/client/src` or `packages/ui/src` is RED (variant-SELECTOR brackets like `data-[…]:`/`has-[…]:` and token-driven bodies — `--…`/`var(…)`/`calc(…)` — stay legal); if a value is worth using it's worth a token. Both-ways ALLOWLIST ratchet (allowlist in the gate file) |
| `asset-refs-fk-coverage` | every `packages/db/src/schema` column whose FK targets `assets.id` must be classified in `domain/assets/persistence/asset-refs.ts`'s registry, either RETAINING (`ASSET_REFS`) or DERIVED (`DERIVED_ASSET_COLUMNS`) — an unregistered column silently escapes BOTH asset GC and portability blob-bundling (both walk that one registry). STRICT, no allowlist. The static (`pnpm check:structure`, pre-commit) half of the runtime `tests/server/domain/assets/persistence/asset-refs.int.test.ts` invariant |
| `no-off-token-radius-shadow` | design-enforcement.md §3, DC8 — the default-scale twin of `no-arbitrary-tw-values` (that gate catches brackets only, e.g. `rounded-[3px]`; this one catches an off-token DEFAULT-SCALE `rounded-{sm,md,lg,xl,2xl,3xl,4xl}` / `shadow-{sm,md,lg,xl,2xl,3xl,inner}` / bare `shadow` utility in `packages/client/src` or `packages/ui/src`, which resolves against Tailwind's stock scale instead of the DTCG theme's closed radius vocabulary — `rounded-base/control/card/full` — and shadow vocabulary — `shadow-glow/overlay/prose`, `tokens.json`). `rounded-none`/`shadow-none` (a deliberate opt-out) and `drop-shadow-*` (a different CSS property) stay legal. Both-ways ALLOWLIST ratchet (allowlist in the gate file; `packages/client/src/features/preset/**` is structurally excluded, mid-revamp lane) |
| `motion-token-purity` | BASEUI-MOTION-AUDIT.md §5 Layer 3 — the CSS motion twin of the radius/shadow gate: a RAW duration (`220ms`/`3s`) or easing (`ease`/`ease-in`/`ease-out`/`ease-in-out`/`cubic-bezier(…)`) written into a `transition`/`animation` shorthand or a `transition-duration`/`animation-duration`/`transition-timing-function` longhand in `packages/{ui,client}/src/**/*.css` is RED where a `--motion-*`/`--ease-*` (or co-motion `--shell-*`) token belongs. `linear` (continuous loops), `0s` (a deliberate no-transition), `var(…)`/`calc(…)` bodies, and custom-property DEFINITIONS stay legal. The source arm of the never-desync guarantee (co-motion vars in shell.css + a rendered-parity CT are the other two layers). Both-ways ALLOWLIST ratchet (allowlist in the gate file) |
| `no-off-token-inline-style` | design-enforcement.md §3 — the INLINE/IMPERATIVE arm the className gates (`no-arbitrary-tw-values`/`no-off-token-radius-shadow`/`no-color-literals`) and the CSS gate (`motion-token-purity`) can't see. A token-backed CSS property (`borderRadius`/`boxShadow`/`color`/`background(Color)`/`transition`(+ duration/timing)/`animation`/`gap`/`padding*`/`margin*`) written as a RAW STATIC LITERAL (a unit-bearing number/hex/`rgb(`/`oklch(`/duration/easing keyword, or a bare non-zero number) in `packages/{ui,client}/src/**/*.{ts,tsx}` is RED, in either carrier: a JSX inline `style={{ prop: value }}` object literal, or an imperative `<expr>.style.prop = value` / `<expr>.style.setProperty("prop", value)`. A value that IS or CONTAINS a `var(--…)` reference passes; a DYNAMIC value (identifier/member read/interpolated template/conditional) is deliberately NOT flagged (static raw literals only). Both-ways ALLOWLIST ratchet (currently empty) |
| `ui-skin-fragment-purity` | derive-modernization-audit.md §W2 (G25) — the seal of the `packages/ui/src/lib/` skin-fragment tier (the `FOCUS_RING`/`OVERLAY_MOTION` precedent): a class string OUTSIDE `ui/src/lib/` that hand-spells a homed fragment is RED. DATA-DRIVEN signature table (`{signature, composeInstead}`) so the tier grows by adding a row, and the failure names the exact lib constant to compose. Scans string-literal + template-literal STATIC parts (head/middle/tail + no-substitution) under `packages/ui/src/**` sans `lib/**` — comments/JSDoc are never those node kinds (a prose `bg-scrim` can't trip it), and a `${CONSTANT}` interpolation carries no signature in its static source, so composing is inherently clean. Rows: `focus-visible:ring-`→`FOCUS_RING*` (catches the toast partial-ring/white-halo forever) · `before:size-touch-target`→`TOUCH_TARGET_PSEUDO` · `rotate-45 border border-border bg-popover`→`OVERLAY_ARROW` · `bg-scrim`→`SCRIM(tier)`/`SCRIM_BASE` · `data-disabled:pointer-events-none data-disabled:opacity-50`→`DISABLED_STATE` · `disabled:pointer-events-none disabled:opacity-50`→`DISABLED_STATE_NATIVE` |
| `registry-context-via-mint` | derive-modernization-audit.md §W3 (G26) — the seal of the `createRegistryContext` mint (`packages/client/src/lib/create-registry-context.tsx`), the ONE home for the section/modal/settings-pane/chrome context+read-hook+provider trio. A `createContext` typed over a `*Registry` (raw `Registry<…>`/`ContributorRegistry<…>` or a `SectionRegistry`/`ModalRegistry`/`ChromeRegistry`/`SettingsPaneRegistry` alias) ANYWHERE in `packages/client/src/**` except the mint home is RED — a hand-rolled registry context+provider trio drifts from the ONE shape (D72: a machine ships WITH its seal). The mint's own `createContext<R \| null>` type-param carries no `Registry` match, and the mint home is scanRoot-excluded |
| `selection-store-via-factory` | derive-modernization-audit.md §W3 (G27) — the seal of `createDrillSelectionStore` (`packages/client/src/state/create-drill-selection-store.ts`), the ONE shape behind the five per-section drill stores (corpus/analytics/character/preset/world-info). Location-keyed (the G23 shape): a `packages/client/src/state/*-selection-store.ts` calling the raw `createGatedStore(` door DIRECTLY (instead of the factory) is RED — a hand-rolled selection store drifts from the shared shape (D72). The factory HOME (`create-*`) is scanRoot-excluded (it composes the door on purpose); every OTHER state store may call `createGatedStore` freely |
| `bound-field-via-hook` | derive-modernization-audit.md §W3 (G28) — the seal of `useBoundField` (`packages/client/src/forms/bound-fields/use-bound-field.ts`), the ONE home for every bound field's `useFieldContext<T>()` read + touch-gated error + `<Field>` prop bundle. The G9 import-specifier shape: a `useFieldContext` named import under `packages/client/src/forms/bound-fields/**` — anywhere but the hook home (scanRoot-excluded) — is RED, because a bound field that imports the raw context door re-hand-rolls the prop bundle that drifts (the audit's "declared the ONE home, 7 of 10 never adopted it" rot; D72: a machine ships WITH its seal). Keyed to the family dir, so the form toolkit's own `useFieldContext` re-export (`forms/contexts.ts`/`use-app-form.ts`) is out of scope |
| `render-error-via-battery` | derive-modernization-audit.md §W4 (G29) — the seal of the read-error battery (`QueryErrorState`, `packages/client/src/data/query-error-state.tsx`). QueryBoundary's `renderError` renders the failed-read surface and already DEFAULTS to `QueryErrorState` (`Couldn't load <label>.` + a real refetch Retry); a `renderError` JSX attr in `packages/client/src/**` whose expression is NOT `QueryErrorState`-rooted — neither a bare reference to it nor an arrow/function whose body roots in `<QueryErrorState>` — RED (the 28-arm drift its own header records; D72: a machine ships WITH its seal). A genuinely-custom error surface earns a cited allowlist entry (currently three: chat-room's Composer fallback, persona-panel's avatar placeholder, command-palette's silent null); those files are scanRoot-excluded (the G27 plain-Set shape). The `renderError`-shaped drop-in — mint `<QueryErrorState label=… onRetry={retry} />` or drop the prop for the default |
| `dialog-via-composite` | derive-modernization-audit.md §W1 (G24) — a `packages/client/src/features/**/*.tsx` file importing the raw `Dialog` root from `@orb/ui/dialog` is hand-assembling the modal anatomy the `FormDialog` composite (form body via `FormSubmitButton` · single-control PROMPT via `submit` · `TagPickerDialog`/`RelationManagerSection` built on it) and `ConfirmDialog` (alert, G7) exist to own. RED unless allowlisted with a cited reason (D72: a machine ships WITH its seal). Keys on the `Dialog` ROOT import only — a file using `DialogClose`/`DialogTitle` INSIDE a `FormDialog` (the composite renders the root) is legal. Both-ways ALLOWLIST ratchet: an allowlisted file that STOPS importing `Dialog` (migrated onto a composite) REDs as a stale entry (existsSync-guarded so a synthetic tree can't misfire). Allowlist = the sanctioned NON-form species WITH citations: the app-shell modal-host (generic modal seam), chat rename-chat/invite/join-invite (§13.4 + chat lane held untouched this wave), chat character-gallery (gallery picker), and preset variable-editor (a bound-field form whose pinned-title internal scroll the single-Stack shell can't preserve) |
| `feature-css-files` | client-architecture-lockdown.md §4 / §16 G14 — a `.css` file under `features/**` outside the §4 sanctioned allowlist (`app-shell/surfaces/shell.css`, the ONE feature-tier hand-written exception) is RED — features write NEITHER CSS nor raw values (tokens/variants/globals only). `settings-shell.css` was the last offender, dissolved into `client/styles/globals.css` at M6.3 |
| `feature-owns-definition` | client-architecture-lockdown.md §3 / §18 O2 — a `packages/client/src/features/*` dir that co-locates NO registered definition (`lib/*-section.tsx`, `lib/*-modal.tsx`, `lib/*-pane.tsx`, or `lib/*-chrome.tsx`) is RED: a feature dir owns a rail section, a modal, a settings pane, or a chrome widget, or it is deleted. NO exemptions — `prompt-manager` was deleted rather than exempted, and `notifications` owns a chrome def |
| `verify-registry-parity` | UNIFIED-VERIFICATION-DESIGN.md §3.6 — every `package.json` script matching the verification shape (`check*`/`test*`/`lint*`/`typecheck*`/`depcruise*`/`e2e*`/`cpd*`/`format*`) must be reachable from the `pnpm verify` stage registry (`scripts/verify/registry.ts`): either it IS a registry stage's `pnpm <script>` argv, or it is a writer/artifact-generator on the gate's `NON_STAGE_ALLOWLIST` (lint:fix, format(:docs), depcruise:graph/focus/reaches, cpd:report, the verify/check hosts). The mirror arm: every registry stage's whole-scope `pnpm <script>` argv must name a real package.json script (a dead row is RED). Makes a "forgotten script" — one added to package.json without a tier — a structural violation |
| `no-vanity-alias` | one symbol, one name — a workspace rename-import (original not otherwise present in-module), a rename-export of a UNIQUELY-homed symbol (the ChatSource class — a name with <2 producer modules), or 2+ bare type-aliases onto one identifier (RouteOverlay/RoutableChat). Sanctioned: a genuine in-module collision; a GENERIC name (≥2 producer modules — barrel disambiguation); an `@orb/ui` / db-`*Table` / contracts-`*Wire` rename; a `packages/server/src/**/contract/**` distinct-alias-per-verb vocab home; any vendor-package rename. `whole-project` (rule b counts producer modules tree-wide) |
| `tsconfig-routing-parity` | TSC-INCREMENTAL-PERFILE.md §2.2 — the file→tsconfig routing algebra (`scripts/verify/selection.ts` `staticPrograms`, which scopes `verify --file/--changed`'s type lanes to the OWNING program(s)) must match each program's REAL root membership. For every present tsconfig (the root graph + 6 package configs) the gate reads its resolved `files` via `tsgo --showConfig` (the include/files expansion, pre-import-closure) and reconciles both directions: a file a program ROOTS that the algebra doesn't predict is RED (forward), and a file the algebra routes to a program that doesn't root it is RED (mirror). A wrong route type-checks a file against the WRONG program (or skips it) → a FALSE GREEN at `verify --file` |
| `no-raw-intl-time` | raw Intl API or `.toLocale*()` usage is forbidden. Production reads time from the injected clock (`@orb/kit/time`), never ambient now. (Spine-TypeScript-and-Patterns.md) |
| `no-await-db-in-loop` | await on a db/tx query inside a loop — N+1 shape: one round-trip per iteration. Batch it instead. (Spine-TypeScript-and-Patterns.md §8) |
| `persistence-no-in-memory-state` | Map/Set constructed in a persistence/ file — persistence is queries-only; in-memory state (caches, registries) belongs in a named subsystem, not the query layer (Core-0-Architecture-and-Structure.md §7) |
| `no-loose-id-cast` | `as never` launders a value past ALL type checks. For a branded-ID parameter use the typed helper from @orb/kit/ids (castId / brandedId / parseId). For a genuine ORM/library escape, suppress WITH a reason. See Spine-TypeScript-and-Patterns.md §4. |
| `no-mint-via-cast` | `castId(<generator>)` MINTS an id by laundering a fresh value through the RE-BRAND helper — castId is for re-branding a value that already IS an id, NEVER for minting. Mint with mintTypeId(ID\_PREFIX.x) (TypeID) or newId<T>() (nanoid) from @orb/kit/ids so the value matches typeIdSchema at the wire. See Spine-TypeScript-and-Patterns.md. |
| `no-if-is-group` | `isGroup`-style boolean branches on group-vs-solo identity — the design forbids it (solo is the degenerate case of group). Gate on explicit roster/cast size that NO-OPS at roster=1 (so byte-identity holds). See Core-Laws-and-Precedents.md §7 D16 (unified group chat). |
| `no-context-returntype` | `ReturnType<>` in context.ts — the DI bundle type must be an explicit, hand-written interface (read it to know the feature's deps), never reflected off a builder. Write the interface. See Spine-TypeScript-and-Patterns.md §7.4. |
| `no-decorators` | decorators are not erasable — tsx/node type-stripping has no decorator runtime (runtime error), and the erasableSyntaxOnly compiler flag does NOT catch them. Use function composition / zod, not decorators. See Spine-TypeScript-and-Patterns.md §5. |
| `chat-stream-writes-in-bus-only` | the stream store's WRITE api (`chatStream`) may be imported only by the bus reducer and composition root (UI-Gates §11.1) |
| `client-cache-surgery-only-in-data` | the QueryClient's imperative cache API (`invalidateQueries`, etc.) may be called ONLY inside `packages/client/src/data/` (UI-Gates §11.3) |
| `no-chat-trpc-in-surface` | inline chat-verb mutations (`trpc.chat.<verb>.mutationOptions`) in a surface are banned; they belong in sanctioned verb-hook homes (UI-Arch §2.1) |
| `no-direct-useform` | direct `useForm(...)` / `createFormHook(...)` calls are banned; use the shared instance `useAppForm` from `#forms` instead (UI-Lib-TanStack-Form) |
| `no-fake-disabled-id` | `castId("")` (an empty-string branded id) as a fake-disabled sentinel is banned; use `useGatedQuery`/`skipToken` instead (UI-Gates §11.5) |
| `no-form-state-in-useeffect` | `useEffect` reading `form.state.values` / `form.store` in its dep array is banned; use form-level `listeners.onChange` or `form.Subscribe` (UI-Lib-TanStack-Form) |
| `no-inline-optimistic-in-surface` | optimistic-mutation plumbing (`cancelQueries` / `setQueryData`) in a surface is banned; it belongs in `features/<x>/hooks/` (UI-Lib-TanStack-Query) |
| `no-raw-spacing-in-features` | raw spacing tokens/values in features |
| `no-raw-typography-in-features` | raw typography tokens/values in features |
| `no-raw-z-index` | raw z-index tokens/values |
| `no-raw-zustand-persist` | direct usage of zustand persist |
| `no-static-staletime` | static staleTime in query configurations |
| `no-untrusted-html-in-main-dom` | D44 containment: untrusted HTML in main DOM |
| `query-machine-seals` | client-architecture-lockdown.md §14/§16 G9 — useMutation outside data/, useInfiniteQuery outside data/create-collection-surface.ts |
| `testid-typed-only` | data-testid must be typed |
| `theme-override-only-via-scope` | theme override only via scope |
| `zustand-selector-stability` | zustand selector stability |
| `no-default-props` | React modernization — `defaultProps` is deprecated; use default parameters instead. (UI-Architecture-and-Layout.md) |
| `no-color-literals` | literal hex colors or non-token named colors in className/cn (UI-Architecture-and-Layout.md / D43) |
| `no-external-media-without-gate` | raw media elements (img/video/audio) outside of MessageMedia in features (D44 containment) |
| `no-inline-types` | exported type/zod-schema outside of type homes (contract, kit, tests) (Spine-TypeScript-and-Patterns.md §7.4) |
| `no-layout-context-props` | layout-context boolean/enum props (compact/inDrawer) on JSX (D42) |
| `no-manual-token-estimate` | hand-rolled `.length / 4` token estimates — use `@orb/kit/tokens` instead |
| `no-media-queries-in-features` | viewport breakpoint variants in features — use `@orb/ui` responsive primitives |
| `no-multiplexed-mutation-error` | multiplexed mutation errors (`a.error ?? b.error`) — use a single mutation |
| `no-raw-container-widths` | raw content-width utilities on container elements — use layout tokens |
| `no-raw-matchmedia` | raw `matchMedia()` call outside the one-home reduced-motion lib |
| `no-context-provider` | React 19 deprecates `<Context.Provider>` — render `<Context>` directly instead (Spine-TypeScript-and-Patterns.md §1) |
| `no-forward-ref` | React 19 deprecates `forwardRef` — pass `ref` as a normal prop instead (Spine-TypeScript-and-Patterns.md §1) |
| `gate-ignore-inventory` | every `// @orb-gate-ignore <name>` suppression under `packages/**` must name a REAL registered gate — stale suppression rot RED |

The table mirrors `report.ts`'s `loadGates()`-discovered `status:"active"` set (133 registered gates);
the discovered descriptor set is the runtime truth.

The 7th fired-trigger gate (PD-116), `solo-byte-identical`, is NOT a static gate — it is the
cross-cutting property suite `tests/server/domain/chat/solo-byte-identical.suite.int.test.ts`: two
identically-shaped roster-of-one chats (untouched-solo config vs fully group-configured) drive ONE
round each through the REAL engine and the wire request + persisted canon must be BYTE-identical
(D16 "solo is a group of one"; the behavioral half of the `no-if-is-group` gate).

### Layer 3 — DORMANT structural gates (built + self-tested, deliberately `status:"dormant"`)

These gate files exist in `scripts/check/gates/` and each carries its own `tests/tooling/` self-test
proving it fires, but their descriptor's `status` field is `"dormant"` by decision — `report.ts`'s
`loadGates()`/`runPass` filters to active descriptors only (each finds real debt whose backfill rides
a later wave, or gates a construct that doesn't exist yet — keeping them off preserves green-to-commit
without hiding the debt). Activation is flipping the descriptor's `status` field to `"active"`. The
`DORMANT_GATES` set in `tests/tooling/check-gates.int.test.ts` is a mirror of this, not ground truth —
the descriptor's `status` field is ground truth.

| Gate | Enforces | Activation trigger |
| - | - | - |
| `component-size-ui` | `packages/ui/src` LOC ceiling (450) — the ui twin of `component-size` | W1-1 splits `table.tsx` (461 > 450), then registers it |
| `monotonic-tests` | a green `check` can't be reached by deleting/disabling tests (a committed baseline manifest) | first real client test suite + committed baseline |
| `audit-client-tests` | AST anti-patterns in `*.test.ts` (empty describe/hook, no-assertion, missing `await`) | client tests exist |

## Layer 4 — dependency-cruiser (`.dependency-cruiser.cjs`) — **ACTIVE**

The import-graph backstop ("boundaries are physics"), wired into `pnpm check` + CI + pre-push. 49 rules
(47 error + 1 warn + 1 ignore): the 6-package cake (kit←contracts←db←server←client, + `@orb/ui` between contracts and client), server tier direction
(entry→transport→domain→infra→foundation→kit), kit-purity + kit/ui no-node-builtins, infra-no-db, foundation-reaches-up-to-nothing,
drivers-through-domain, domain isolation (no-cross-feature/-verb/-subsystem + front-door + substrate
mediation), the client rules (feature front-door, no-cross-feature, no-backend-runtime, `confirm-uses-composite` — client-architecture-lockdown.md §16 G7, `features/**` may not import `@orb/ui/alert-dialog` (the raw primitive) — ConfirmDialog is the sole feature-tier confirm, `client-components-tier` — client-architecture-lockdown.md §16 G5, the tier-2 `components/` seal (never imports `features/`/`routes/`/`main.tsx`; `lib/` and `state/` never import `components/`), the `@orb/ui`
satellite seals — D42/D52 physics), providers public-surface + strategy-isolation + vllm-surface-isolation + the transitive credential firewall
(openrouter ↛ agent-sdk), persistence-no-io, stats-no-vector-tables, `not-to-dev-dep` (prod `packages/*/src` must not import a
pure devDependency; `recommended-strict` omits it), and `no-orphans` (severity `warn` — a module
nothing imports; `knip` is the deep authority, this is a cheap graph-level smell). Every rule is **pinned by
`tests/tooling/dependency-cruiser.int.test.ts`** (derives the rule set from the config, fires each on a
fixture — anti-drift). The full feature set (err-long, mermaid graph, `--focus`/`--reaches`/`--affected`)

- deliberate non-adoptions are documented in the config header.

`pnpm knip` / `pnpm knip:prod` (`knip.ts` config, all issue types as errors) is the
dead-code/dead-export/dead-dependency lane — LIVE in `pnpm check` as the `deps:knip` static-tier stage.

## Layer 5 — jscpd (`jscpd.json`) — copy-paste detection

Structural duplication the per-file biome/gate rules can't see. Scans `packages/**/src` (TS + CSS;
the centralized `tests/` mirror, migrations, fixtures, and `*.d.ts` are excluded — mirror duplication
is intentional). **CI lane, not the pre-commit fast check** (whole-tree scan). Gate: the build fails
over **2%** duplication (`threshold`) — ratchet down as the codebase matures. `pnpm cpd` (console) /
`pnpm cpd:report` (HTML → `reports/cpd`). Active now: vacuous on the comment-only placeholder tree,
fires the moment real code lands.

## Layer 6 — Stryker (`stryker.config.json` + `stryker.gate.config.json`) — mutation testing — **SCHEDULED (Phase 4c/5)**

Mutates source + reruns the suite to score whether tests actually *catch* bugs — the "test covers the
line but asserts nothing" signal coverage can't detect (neo's founding `isVllmBackend`-lying-gate
class). Two lanes: `pnpm test:mutation` (exploratory, `break:null`) and `pnpm test:mutation:gate`
(pinned to the highest-stakes pure modules — chat routing/assembly, credential resolution — fails the
build below `thresholds.break`). On-demand + CI, never in `pnpm check` (runs are minutes). Configs +
targets exist; `break` stays null (both configs) until a measured score calibrates it
(`core/Spine-Testing.md` › Mutation testing).
