---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — Enforcement Registry: Active Gates

> The currently-live, machine-enforced gate catalog — what fails a build today, across the six layers (Biome, GritQL, ts-morph structural gates, dependency-cruiser, jscpd, Stryker). Not-yet-active + rejected gates: `Core-Enforcement-Deferred-Dropped.md`. Extracted adoption sagas + dropped-experiment postmortems: `history/enforcement-archaeology-record.md`.

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

## Layer 2 — GritQL plugins (`tools/grit/`, 37 active)

AST patterns Biome rules can't express. Node matchers are **PascalCase** (`JsDecorator()`,
`JsxAttribute()`). The count is the `biome.json` `plugins` array (the `!**/*.grit` ignore entry is not a
plugin); full list + rationale in `tools/grit/README.md`.

- **Server / determinism / types / ids (12):** no-raw-id, no-loose-id-cast, no-mint-via-cast,
  no-await-db-in-loop, no-raw-intl-time, no-raw-clock, no-raw-random, no-if-is-group,
  no-context-returntype, no-decorators, no-inline-types, persistence-no-in-memory-state.
  (`no-if-is-group` flags an `if (isGroup)` / group-vs-solo branch — group-ness is DATA, not a branch;
  solo is the roster-of-1 degenerate case, byte-identical — ledger D16.) The determinism grits
  (no-raw-clock, no-raw-random, no-raw-intl-time) scope over `packages/(server|client|ui)`.
- **Client tokens / layout (7):** no-color-literals, no-raw-z-index, no-raw-spacing-in-features,
  no-raw-typography-in-features, no-media-queries-in-features, no-raw-container-widths,
  no-layout-context-props (D42).
- **Client data / forms / state discipline (12):** no-chat-trpc-in-surface, no-direct-useform,
  no-form-state-in-useeffect, no-inline-optimistic-in-surface, client-cache-surgery-only-in-data,
  no-raw-zustand-persist, no-static-staletime, no-fake-disabled-id, chat-stream-writes-in-bus-only,
  no-multiplexed-mutation-error, zustand-selector-stability, testid-typed-only.
- **D44 containment trio (3):** no-untrusted-html-in-main-dom, no-external-media-without-gate,
  theme-override-only-via-scope.
- **kit (1):** no-manual-token-estimate (`.length / 4` hand-rolled token estimates → `@orb/kit/tokens`).
- **Misc bans (2):** no-arbitrary-tw-values (the className-arm Tailwind arbitrary-value ban — distinct
  from the same-named Layer-3 structural gate), no-raw-matchmedia (raw `matchMedia()` ban).

Client belts are LIVE now but fire only once client code lands.

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
| `no-parallel-section-map` | client-architecture-lockdown §5 rule 4 / §16 G2 — an object literal / array of `{ id: … }` elements / `Record<…>`-typed value hardcoding ≥2 `SectionId`s, `ModalSlotId`s, OR `SettingsCategoryId`s (a re-declared per-id map like the old `SECTION_PANEL_DEFAULTS`/`RAIL_SECTIONS`/`RAIL_ACTIONS`/`YOU_MODAL_ROWS`) outside the sanctioned homes (the vocab tuple · the `main.tsx` door · the `*-section`/`*-modal`/`*-pane` definition files) is RED — derive from the registry, never re-declare (a derived `registry.list()…` map has no literal keys/type, so it passes). Covers the SectionId + ModalSlotId + SettingsCategoryId vocabularies (M6.1) |
| `context-definition-shape` | client-architecture-lockdown §6b/§16 G3 — post-M3, four arms over the `defineContextTabs<S>` mint (`lib/registry-contracts.ts`): (1) a hand-rolled `{ kind: "tabs", useResolved }` object literal outside the mint's own home is a badge-wearing tabs renderer; (2) a `defineContextTabs` call with `tabs: []` AND no `contributors` (a dead mint); (3) O5 strict — a `defineContextTabs` call or `ContextTabDef<…>` type-ref whose type arg is not `void` and not an identifier resolving to a type EXPORTED from `registry-contracts.ts` (`any`/`unknown`/an inline literal/an index signature) is RED; (4) a `bodies: Record<string, ReactNode>`-shaped JSX attr/interface member under `client/src` — the dead CONTEXT\_SLOTS↔bodies split resurrected |
| `zustand-selector-derived` | the Layer-3 half of the Zustand selector-stability belt (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5) — flags a `use<X>Store(selector)`/`useStore(store, selector)` call whose inline selector returns a fresh object/array literal, an `Object.keys/values/entries(...)` derivation, or an array-rebuilding `.map/.filter/...` (directly, from a block body, or from either branch of a ternary/`??`/`&&`), unless wrapped in `useShallow(...)` — the shape the Layer-2 grit `zustand-selector-stability` (literal-concise-body only) can't express |
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
| `member-card-clamped` | ONE D22 clamp: no `MemberCardView` declaration outside `@orb/contracts`, no `clampMemberCard`/`resolveCardVisibility` outside `chat/substrate/auth/`, and the deleted `getRosterCardView` stays dead (D22) |
| `diagnostic-legibility` | every custom-gate + grit diagnostic STRING carries a resolvable pointer (a `*.md` doc path, a code-home path/file, or an explicit `// terse-ok:` marker) — the meta-gate: a new gate/grit cannot regress to a bare/pointerless message |
| `test-presence-client` | the `@orb/client` + non-primitive `@orb/ui` reach `test-presence` lacks (server/contracts only) — a test is required on the behavioral factories + logic modules, per `Spine-Testing.md` §5's conservative surface. Clause C: a `state/*.ts` store's mirror EXISTING isn't presence for a NEW action — every exported action (`createGatedStore`/`createPersistedStore`/`createEntityDraftStore` files) must be called BY NAME in its mirror `tests/client/state/*.ct.tsx` (or the shared `_ct-stories.tsx`), not merely have SOME mirror test |
| `no-effect-on-shared-selection` | the mechanical half of the anti-`this_chid` rule (UI-Arch §5.1) — a `useEffect`/`useLayoutEffect` in `features/**` keyed on a shared-selection store pointer is banned; only render-only reads are sanctioned |
| `persistence-boundary` | the device-local-vs-synced belt (UI-Theming-and-Content.md §12.1 + UI-Arch §5) — raw browser storage outside the two persist factories + the boot/dev allowlist is RED, and every persisted-store name must carry a registered why-device-local rationale |
| `no-interactive-role-in-features` | closes the layout-kit interactive-role escape hatch (UI-Gates-and-Lessons.md §8) — a `.tsx` under `features/**` assigning an INTERACTIVE (widget) ARIA role (`button`/`link`/`checkbox`/`menuitem`/… — static, braced, or conditional literal) is RED; structural/live-region roles + `data-role` stay legal, seals outside `features/**` are out of scope. Both-ways BURN\_DOWN ratchet |
| `no-raw-interactive-intrinsics` | design-enforcement.md §3.2, D62 — a raw `<button>`/`<input>`/`<select>`/`<textarea>`/`<a href>` under `features/**` (app-shell exempt, shell-tier) is RED regardless of className; interactivity must come from an `@orb/ui` primitive. Both-ways BURN\_DOWN ratchet (allowlisted click-triggers await a headless file-trigger primitive) |
| `empty-state-has-action` | design-enforcement.md §3.2, D62 — a `<EmptyState>` under `features/**` must pass `action` (or a spread that might); a dead end strands the user. Both-ways ALLOWLIST ratchet (allowlisted files await a CTA design call or are genuinely action-less) |
| `surface-a11y-focus` | a `surfaces/*.tsx` that isn't an auto-focus-trapping Base UI primitive must explicitly manage focus on mount (`.focus()`/`useFocusOnMount`) |
| `surface-in-a-container` | a `surfaces/*.tsx` that establishes raw layout must sit inside an `@orb/ui/layout` container (UI-Arch §4) — feature code never writes raw containment |
| `modal-registry-completeness` | client-architecture-lockdown.md §6d / §16 G13 — the modal registry's structural walls tsc can't see: a `ModalDefinition` not co-located in `features/*/lib/*-modal.tsx`; two defs for one id; the DECLARED-PLANNED honesty (a `body: {planned}` with an empty reason, or a planned modal wiring a real function `body`); the SINGLETON-placement arm (exactly one modal per `avatar`/`topbar-command`/`mobile-tab` — the rail/topbar/mobile-bar derivation assumes one; `rail-footer`/`content` may repeat); the anti-god-map arm (a `modals={{…}}` object literal in `routes/**`). The modal twin of `section-registry-completeness` |
| `modal-body-not-placeholder` | a `ModalDefinition` (`features/*/lib/*-modal.tsx`) whose function-arm `body` renders `<SectionPlaceholder>` is RED — an unbuilt modal uses the `{planned}` arm, never a placeholder body (the placeholder-body anti-pattern is unspellable) |
| `settings-pane-completeness` | client-architecture-lockdown.md §8 / §16 G4 — the settings-pane registry's structural walls tsc can't see: a `SettingsPaneDefinition` not co-located in `features/*/lib/*-pane.{ts,tsx}`; two defs for one id; a real function `body` that silently renders the teaching placeholder instead of the honest `body: {placeholder:true}` flag; the settings host importing a pane's `*-settings-surface` body directly instead of reading it off the registry. The settings twin of `modal-registry-completeness`/`section-registry-completeness` |
| `placeholder-copy-registry` | client-architecture-lockdown.md §6a / §16 G13 — every co-located `SectionDefinition.placeholder` `(title, description)` pair is DISTINCT and non-empty, reconciled ACROSS the 7 `features/*/lib/*-section.*` files — kills the "three sections share one string" silent-duplicate case |
| `registry-assembly-at-door-only` | client-architecture-lockdown.md §16 G8 — `createRegistry`/`createContributorRegistry` may be CALLED only in `main.tsx` or a `compose/` module; a mutating `register(`-named function/method is banned outright wherever declared (§5 rule 1) |
| `list-row-adoption` | client-architecture-lockdown.md §14/§16 G6 — a LIST-region surface file (one importing `LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface`) whose `.map()` callback OR `renderItem`/`renderRow` prop returns interactive JSX (onClick/role/href) must root that JSX in `ListRow`/`LibraryRow`/an allowlisted composite. Both-ways ALLOWLIST ratchet (currently empty — every current LIST-surface row already roots in `LibraryRow`) |
| `enforcement-registry-parity` | this doc's declared registered-gate COUNT + Layer-3 ACTIVE/DORMANT tables must agree with the DISCOVERED gate descriptors' `status` fields (both directions) — reconciles the doc against `loadGates()`'s discovered set, not an `ALL_CHECKS` array — the meta-gate that promotes `check-gates.int.test.ts`'s anti-drift assertion to every `pnpm check` |
| `no-array-literal-querykey` | a `queryKey:` property whose value is an inline array literal anywhere in `packages/client/src` is RED — client query keys are 100% tRPC-proxy-derived (`.queryKey()`/`.queryFilter()`/`.pathFilter()`), §11.1; the data/ factory passthroughs are identifiers, never literals, so they pass |
| `no-inline-invalidate-outside-seam` | `.invalidateQueries(` may be called ONLY in `data/invalidation.ts` (the central seam); everything else routes `invalidate(event)`/`invalidateFilters`. Tighter than the Layer-2 grit `client-cache-surgery-only-in-data` (which allows all of `data/`) — §11.3 |
| `bus-onData-no-store-write` | a raw `.setState(` inside a `data/bus/*` subscription `onData`/`onConnectionStateChange` body is RED — the seam buffers through the chatStream api + routes to the invalidation seam, never a second store (§11.1); the reducer-body twin of the import-side grit `chat-stream-writes-in-bus-only` |
| `no-form-reset-in-autosave` | a `.reset(` on a form in any file importing `createAutosaveEntityForm`, PLUS the reset type-strip (`Omit<…,"reset">`) must stay present and unexposed in the factory — the runtime backstop to the compile-time strip (the autosave infinite loop, §7 row 2) |
| `persist-partialize-and-total-migrate` | a bare zustand `persist(` outside the two minting factories (`create-persisted-store.ts`/`create-entity-draft-store.ts`) is RED, AND inside each factory the persist options must carry `version`+`partialize`+`migrate` — the Layer-3 twin of the `no-raw-zustand-persist` grit, reading INTO the chokepoint (§11.5) |
| `ownerid-registry` | an `ownerId` schema column may exist ONLY on a D23-passing table (a TRUE PRODUCER, a parentless per-user aggregate, or the two sanctioned scope-subject cases — `chat_tags` D30 · `global_documents` D49); every other table DERIVES its owner by one FK to an owned entity. A newly-stamped `ownerId` on an unlisted table is a doubling — RED with the D23 cite (D21/D23/D30) |
| `no-untyped-soft-ref` | a schema column whose JS key ends in `Id` (an entity reference) MUST carry a `.references()` FK — boundaries are FK-enforced physics (D24); a soft `text`/`integer` id with no FK is banned, exceptions only `audit_logs.entityId` (append-only, outlives its referent — D37) + `users.externalId` (an external IdP subject, not a table ref) |
| `db-enum-from-tuple` | a drizzle `text("x", { enum: … })` column must reference an IDENTIFIER — an imported `@orb/contracts`/`@orb/kit` tuple or a local `as const satisfies readonly <ContractsType>[]` — never an inline array literal that re-spells the union away from its one home (D34) |
| `schema-banned-shapes` | ONE registry-driven gate over the ledger's explicitly-REJECTED schema + contract shapes — each row is a (location, forbidden shape, D-cite) the ledger killed by name; a reintroduction is RED with its cite |
| `warning-code-coverage` | the emit-coverage RATCHET for both structured warning-code tuples (`WARNING_CODES` in infra/providers · the domain warning set) — every member must appear as an emitted `{ code: "…" }` literal at a real emit site (the bus-coverage twin for the warning channels) (D41/D45/D48/D51) |
| `infra-auth-no-userid` | `infra/auth` VERIFIES headers into a pre-row `ResolvedIdentity` and must NEVER yield a `userId` — identity→row is a DOMAIN step and the `Principal` is minted ONCE at `entry/auth`; a `userId` identifier under `infra/auth/**` is banned — RED (D40) |
| `content-part-seam` | `ChatContentPart` is PRODUCED exactly once (the engine request seam, `pipeline.ts`) and CONSUMED only by `infra/providers/**`; everything upstream (assemble/shape, verbs, the rest of `domain/chat`, transport) stays `content: string` — no "content-parts everywhere" spread (D51) |
| `no-raw-egress` | a bare `fetch(` in `packages/server/src` must go through `safeFetch` (the self-enforcing SSRF resolve→validate→pin guard, `infra/network`); raw `fetch` is sanctioned ONLY in the credentialed/loopback provider-egress tier + safeFetch's own home (D61 B5a) |
| `contract-verb-presence` | the INTERFACE-level complement to `test-presence`'s file-mirror rule — every method a domain's exported `*Service` interface declares (MethodSignature + PropertySignature-with-FunctionType) must have an invocation-shaped match (`verb(` bare call or its `create<Verb>(` factory) in that domain's `tests/server/domain/<d>/**` tree (grep-style presence, not filename convention). Closes the "add a verb to the contract, never test it" hole (Spine-Testing.md §5). Carries a DEFERRED ratchet for cited exceptions |
| `no-test-fabrication` | bans the two fabricated-entity casts in `tests/` that compile straight through a type change — `X as unknown as Y` double-casts and object/array-literal `as Y` (Y ≠ const/any/unknown); fix is a typed factory or `satisfies Y`. `// FABRICATION-OK: <reason>` escapes a deliberate invalid-input probe. Baseline-ratchet (`no-test-fabrication.baseline.json`): a file is RED only when its count EXCEEDS baseline (Spine-Testing.md §5) |
| `form-factory-for-multifield` | a `features/**` component hand-rolling ≥3 controlled form inputs (value/checked + an onChange-family handler) without importing an editor factory is RED — the D54 §13.4 "≥3 fields ⇒ a factory" trigger, closing the hole the `no-direct-useform` grit leaves (a form dodging Form entirely) |
| `no-arbitrary-tw-values` | design-enforcement.md §3 — a Tailwind arbitrary-value bracket (`w-[137px]`, `text-[13px]`) on a layout/size/spacing/type utility in `packages/client/src` or `packages/ui/src` is RED (variant-SELECTOR brackets like `data-[…]:`/`has-[…]:` and token-driven bodies — `--…`/`var(…)`/`calc(…)` — stay legal); if a value is worth using it's worth a token. Both-ways ALLOWLIST ratchet (allowlist in the gate file) |
| `asset-refs-fk-coverage` | every `packages/db/src/schema` column whose FK targets `assets.id` must be classified in `domain/assets/persistence/asset-refs.ts`'s registry, either RETAINING (`ASSET_REFS`) or DERIVED (`DERIVED_ASSET_COLUMNS`) — an unregistered column silently escapes BOTH asset GC and portability blob-bundling (both walk that one registry). STRICT, no allowlist. The static (`pnpm check:structure`, pre-commit) half of the runtime `tests/server/domain/assets/persistence/asset-refs.int.test.ts` invariant |
| `no-off-token-radius-shadow` | design-enforcement.md §3, DC8 — the default-scale twin of `no-arbitrary-tw-values` (that gate catches brackets only, e.g. `rounded-[3px]`; this one catches an off-token DEFAULT-SCALE `rounded-{sm,md,lg,xl,2xl,3xl,4xl}` / `shadow-{sm,md,lg,xl,2xl,3xl,inner}` / bare `shadow` utility in `packages/client/src` or `packages/ui/src`, which resolves against Tailwind's stock scale instead of the DTCG theme's closed radius vocabulary — `rounded-base/control/card/full` — and shadow vocabulary — `shadow-glow/overlay/prose`, `tokens.json`). `rounded-none`/`shadow-none` (a deliberate opt-out) and `drop-shadow-*` (a different CSS property) stay legal. Both-ways ALLOWLIST ratchet (allowlist in the gate file; `packages/client/src/features/preset/**` is structurally excluded, mid-revamp lane) |
| `motion-token-purity` | BASEUI-MOTION-AUDIT.md §5 Layer 3 — the CSS motion twin of the radius/shadow gate: a RAW duration (`220ms`/`3s`) or easing (`ease`/`ease-in`/`ease-out`/`ease-in-out`/`cubic-bezier(…)`) written into a `transition`/`animation` shorthand or a `transition-duration`/`animation-duration`/`transition-timing-function` longhand in `packages/{ui,client}/src/**/*.css` is RED where a `--motion-*`/`--ease-*` (or co-motion `--shell-*`) token belongs. `linear` (continuous loops), `0s` (a deliberate no-transition), `var(…)`/`calc(…)` bodies, and custom-property DEFINITIONS stay legal. The source arm of the never-desync guarantee (co-motion vars in shell.css + a rendered-parity CT are the other two layers). Both-ways ALLOWLIST ratchet (allowlist in the gate file) |
| `no-off-token-inline-style` | design-enforcement.md §3 — the INLINE/IMPERATIVE arm the className gates (`no-arbitrary-tw-values`/`no-off-token-radius-shadow`/`no-color-literals`) and the CSS gate (`motion-token-purity`) can't see. A token-backed CSS property (`borderRadius`/`boxShadow`/`color`/`background(Color)`/`transition`(+ duration/timing)/`animation`/`gap`/`padding*`/`margin*`) written as a RAW STATIC LITERAL (a unit-bearing number/hex/`rgb(`/`oklch(`/duration/easing keyword, or a bare non-zero number) in `packages/{ui,client}/src/**/*.{ts,tsx}` is RED, in either carrier: a JSX inline `style={{ prop: value }}` object literal, or an imperative `<expr>.style.prop = value` / `<expr>.style.setProperty("prop", value)`. A value that IS or CONTAINS a `var(--…)` reference passes; a DYNAMIC value (identifier/member read/interpolated template/conditional) is deliberately NOT flagged (static raw literals only). Both-ways ALLOWLIST ratchet (currently empty) |
| `feature-css-files` | client-architecture-lockdown.md §4 / §16 G14 — a `.css` file under `features/**` outside the §4 sanctioned allowlist (`app-shell/surfaces/shell.css`, the ONE feature-tier hand-written exception) is RED — features write NEITHER CSS nor raw values (tokens/variants/globals only). `settings-shell.css` was the last offender, dissolved into `client/styles/globals.css` at M6.3 |
| `verify-registry-parity` | UNIFIED-VERIFICATION-DESIGN.md §3.6 — every `package.json` script matching the verification shape (`check*`/`test*`/`lint*`/`typecheck*`/`depcruise*`/`e2e*`/`cpd*`/`format*`) must be reachable from the `pnpm verify` stage registry (`scripts/verify/registry.ts`): either it IS a registry stage's `pnpm <script>` argv, or it is a writer/artifact-generator on the gate's `NON_STAGE_ALLOWLIST` (lint:fix, format(:docs), depcruise:graph/focus/reaches, cpd:report, the verify/check hosts). The mirror arm: every registry stage's whole-scope `pnpm <script>` argv must name a real package.json script (a dead row is RED). Makes a "forgotten script" — one added to package.json without a tier — a structural violation |
| `no-vanity-alias` | one symbol, one name — a workspace rename-import (original not otherwise present in-module), a rename-export of a UNIQUELY-homed symbol (the ChatSource class — a name with <2 producer modules), or 2+ bare type-aliases onto one identifier (RouteOverlay/RoutableChat). Sanctioned: a genuine in-module collision; a GENERIC name (≥2 producer modules — barrel disambiguation); an `@orb/ui` / db-`*Table` / contracts-`*Wire` rename; a `packages/server/src/**/contract/**` distinct-alias-per-verb vocab home; any vendor-package rename. `whole-project` (rule b counts producer modules tree-wide) |
| `tsconfig-routing-parity` | TSC-INCREMENTAL-PERFILE.md §2.2 — the file→tsconfig routing algebra (`scripts/verify/selection.ts` `staticPrograms`, which scopes `verify --file/--changed`'s type lanes to the OWNING program(s)) must match each program's REAL root membership. For every present tsconfig (the root graph + 6 package configs) the gate reads its resolved `files` via `tsgo --showConfig` (the include/files expansion, pre-import-closure) and reconciles both directions: a file a program ROOTS that the algebra doesn't predict is RED (forward), and a file the algebra routes to a program that doesn't root it is RED (mirror). A wrong route type-checks a file against the WRONG program (or skips it) → a FALSE GREEN at `verify --file` |

The table mirrors `report.ts`'s `loadGates()`-discovered `status:"active"` set (80 registered gates);
the discovered descriptor set is the runtime truth.

The 7th fired-trigger gate (PD-116), `solo-byte-identical`, is NOT a static gate — it is the
cross-cutting property suite `tests/server/domain/chat/solo-byte-identical.suite.int.test.ts`: two
identically-shaped roster-of-one chats (untouched-solo config vs fully group-configured) drive ONE
round each through the REAL engine and the wire request + persisted canon must be BYTE-identical
(D16 "solo is a group of one"; the behavioral half of the `no-if-is-group` grit).

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

**Stale-name follow-up (`client-structure` RESERVED):** `features/corpus` mirrors no domain — the domain
map renamed corpus→discovery (AGENTS §6). The `.gitkeep` stub should rename to `discovery` (or justify
keeping `corpus`); tracked inline in `client-structure.ts`'s `RESERVED` comment as a doc/PD follow-up.

## Layer 4 — dependency-cruiser (`.dependency-cruiser.cjs`) — **ACTIVE**

The import-graph backstop ("boundaries are physics"), wired into `pnpm check` + CI + pre-push. 46 rules
(44 error + 1 warn + 1 ignore): the 6-package cake (kit←contracts←db←server←client, + `@orb/ui` between contracts and client), server tier direction
(entry→transport→domain→infra→foundation→kit), kit-purity + kit/ui no-node-builtins, infra-no-db, foundation-reaches-up-to-nothing,
drivers-through-domain, domain isolation (no-cross-feature/-verb/-subsystem + front-door + substrate
mediation), the client rules (feature front-door, no-cross-feature, no-backend-runtime, `confirm-uses-composite` — client-architecture-lockdown.md §16 G7, `features/**` may not import `@orb/ui/alert-dialog` (the raw primitive) — ConfirmDialog is the sole feature-tier confirm, the `@orb/ui`
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

Structural duplication the per-file biome/grit rules can't see. Scans `packages/**/src` (TS + CSS;
the centralized `tests/` mirror, migrations, fixtures, and `*.d.ts` are excluded — mirror duplication
is intentional). **CI lane, not the pre-commit fast check** (whole-tree scan). Gate: the build fails
over **5%** duplication (`threshold`) — ratchet down as the codebase matures. `pnpm cpd` (console) /
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
