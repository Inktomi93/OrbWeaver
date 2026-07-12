---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — Enforcement Registry: Active Gates

> Split from `Core-Laws-and-Precedents.md` (2026-07-02). The currently-live, currently-enforced gate catalog — what actually fails a build today, across the six layers (Biome, GritQL, ts-morph structural gates, dependency-cruiser, jscpd, Stryker). The not-yet-active + rejected gates are in `Core-Enforcement-Deferred-Dropped.md`.

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
`pnpm check` at pre-commit** and **`pnpm check` + `pnpm test` at pre-push** (the 2026-06-28 staged-Biome
blind spot is closed — see `lefthook.yml`); CI runs the full check + `pnpm test` + `pnpm cpd`. The check
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

## Layer 2 — GritQL plugins (`tools/grit/`, 35 active)

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

Client belts are LIVE now but fire only once client code lands.

## Layer 3 — Structural gates (`scripts/check/`, ts-morph + fs)

Layout: `harness.ts` (Project loader + Violation runner) and `report.ts` (registry) at the root;
each gate is one module in `gates/`. Add a gate by dropping it in `gates/` and listing it in
`report.ts`. All are lenient on absent code (vacuously pass on the placeholder tree, activate as code
lands) and **pinned by `tests/tooling/check-gates.int.test.ts`** — it derives the gate registry from
`report.ts` and asserts every gate fires on a fixture (a broken AST query can't silently pass; anti-drift).

| Gate | Enforces | Origin | | |
| - | - | - | - | - |
| `feature-structure` | domain 8-slot template (index/service/context + contract/ + verbs/) | neo (ported) | | |
| `test-layout` | `tests/` prefix-swaps 1:1 to real `packages/<pkg>/src`; support/+e2e/ exempt | neo (ported) | | |
| `verb-naming` | `verbs/<v>.ts` exports `create<Pascal(v)>` | new | | |
| `no-caller-user-id` | the identifier `callerUserId` is forbidden (D19 turn-identity): the caller is `Principal.userId`; use `triggeredBy`/`runAsUserId`. AST-only (catches a newly-introduced name tsc can't) | new (P5) | | |
| `types-in-contract` | a feature's `contract/service.ts` declares the exported `<Feature>Service` interface (§7.4) | new | | |
| `no-inline-union-redecl` | no inline ≥3-member string-literal union type aliases (→ contracts) | new | | |
| `test-presence` | verbs/persistence/contract-schemas carry their required `.test`/`.int.test`/`.contract.test` | new | | |
| `test-determinism` | no ambient clock/random/unseeded-id under `tests/` (support/+e2e/ exempt) | new | | |
| `commented-code` | no parked code in `//` comments (prose only) | neo (ported) | | |
| `schema-branding` | db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK) | neo (ported) | | |
| `db-structure` | `packages/db` schema by-domain layout + aggregator barrel + relations | neo (ported) | | |
| `baseline-single-migration` | pre-launch schema changes SQUASH into a regenerated `0000_baseline` (never an incremental `0001+` migration) — `packages/db/src/migrations` holds exactly the baseline `.sql` + a single-entry journal; a `LAUNCHED` const (default false) is the deliberate post-launch sunset switch. LAUNCH DAY: flip BOTH this const AND its runtime twin in `entry/boot/migrate.ts` (pre-launch, baseline drift AUTO-RESETS the dev db at boot; launched = boot-fatal instead) | new (2026-07-09) | | |
| `sole-env-reader` | `foundation/env` is the ONLY `process.env` reader — AST gate catching the `process["env"]` bracket form biome's `noProcessEnv` misses (ignores comments) | new (4a) | | |
| `assumes-single-replica` | a module-scope mutable `new Map/Set/WeakMap/WeakSet()` (non-literal-seed) carries `ASSUMES(single-replica)` in its file | new (4a) | | |
| `providers-runner-seal` | no `domain`/`transport`/`entry` imports the sealed runner derivation/vocab (`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) — `Tier-3b-Providers.md` inv #3 | new (4b) | | |
| `ui-primitive-structure` | `@orb/ui` primitive dir shape — front-door `index.ts` + the `<name>.tsx`/`variants.ts` trio + a colocated test; per BUILT primitive | new | | |
| `client-structure` | `@orb/client` §2.1 feature-slice layout — front-door `index.ts` + known buckets (surfaces/anchors/components/hooks/lib; app-shell +registry/store) + no-stray-root, PLUS neo rules 2/6/7: feature-name↔domain mirror (or RESERVED), per-bucket file naming (`-surface.tsx` / `use-` / anchor container-suffix), and **surface-purity** (a surface renders no outer Dialog/Sheet/Drawer — the anchor's job); per BUILT feature | new | | |
| `state-files` | `@orb/client` `state/` Zustand discipline (UI-Arch §5) — a per-store top-level field cap, one store minted per file, and no exported raw store handle (intent-named actions + narrow read hooks only) | new (W1-0c) | | |
| `zustand-selector-derived` | the Layer-3 half of the Zustand selector-stability belt (UI-Lib-Zustand.md §A/§C-1, UI-Gates-and-Lessons.md §7/§11.5) — flags a `use<X>Store(selector)`/`useStore(store, selector)` call whose inline selector returns (directly, from a block body, or from either branch of a `?:`/`??`/\` | | `/`&&`) a fresh object/array literal, an `Object.keys/values/entries(...)`derivation, or an array-rebuilding`.map/.filter/...`call, unless wrapped in`useShallow(...)`— the shapes`tools/grit/zustand-selector-stability.grit\`'s AST pattern (Layer 2, literal-concise-body only) can't express | new (task #51 — realizes §8's PARKED "the zustand-selector gate" + §11.5's "extend to ALL keyed stores") |
| `component-size` | `@orb/client` hard file-size cap (450 default / 500 route shells); gates `.ts` + `.tsx`, exempts tests/gen/`.d.ts` — god-component sprawl can't survive a check run | neo (ported) | | |
| `no-direct-users-read` | the `users` table is read/written ONLY by `sessions` + `admin`; any other domain importing the `users` symbol from `@orb/db` is RED (identity comes from the Principal — resolve-once) | new | | |
| `pd-citation-integrity` | every in-code `FLAG[PD-n]` resolves to a `Core-Audits-and-Debt.md` registry row; no duplicate PD ids (the concurrent-append collision) | new | | |
| `test-mock-doctrine` | `vi.mock` of an internal module is banned — fake at the edges, inject at the root (`core/Spine-Testing.md §3`); third-party node edges only | new | | |
| `test-factory-contract` | `makeX(overrides?)` builders are pure (no db param); persisted variants are `seedX(db, …)`; factories live in `tests/support/factories/` | new | | |
| `test-fixture-imports` | tests import `{ test, expect }` from `support/fixtures`, never raw `vitest`/`@playwright/test` (e2e, support/, `.test-d.ts` exempt) | new | | |
| `test-no-stubs` | every test block carries ≥1 assertion (`expect`/`expectTypeOf`) — anti-gaming for `test-presence` | new | | |
| `server-layout` | `packages/server/src` root = the 6 tier dirs + `index.ts` only (§3) | new | | |
| `package-layout` | kit/contracts/db/ui/client: every module is a directory with `index.ts`; no loose root files except `index.ts` (D15) | new | | |
| `vector-scope-derived` | the vector tables (`character/image_embeddings`, `chat_digests/segments/digest_speakers`) are IMPORTED only by their sanctioned homes (embeddings/search/chat-memory/discovery/debug), WRITTEN only by `embeddings/persistence`, and cosine-ranked (`vector_distance_cos`) only in `search/persistence` — scope is derived from the producer, never stamped (D20) | new (PD-116) | | |
| `turn-identity` | the chat ENGINE is `Principal`-blind: no `Principal` import and no `principal` identifier under `domain/chat/engine/` — the turn triple is `runAsUserId`/`triggeredBy`/caller-resolved-upstream (D16/D17/D19) | new (PD-116) | | |
| `membership-enforcer` | no owner-equality comparison (`x.ownerId ===`) and no `fetchOwned`/`OwnedTable` import in `domain/chat` + the chat transport — chats are MEMBERSHIP-scoped (`assertParticipant` → `can()`); the host is looked up from the roster, never compared as an owner (D16/D18) | new (PD-116) | | |
| `owner-role-split` | no `role === "owner"\|"admin"` comparison outside `domain/admin/guard.ts` — `can()` is the ONE privilege seam; owner ⊇ admin lives inside it (D17; the gate's founding catch fixed the auth seam's inline `isAdmin`) | new (PD-116) | | |
| `bus-coverage` | every `CHAT_BUS_EVENT_TYPES` member has a server emit site OR a cited `DEFERRED` entry — a self-cleaning two-direction ratchet (missing emit RED; stale allowlist RED). Founding census: 8/26 unwired → PD-89 + PD-117 (D50) | new (PD-116) | | |
| `user-bus-coverage` | the per-USER bus twin of `bus-coverage`: every `USER_BUS_EVENT_TYPES` member has a server emit site (a domain verb's `emitUserEvent`) OR a cited `DEFERRED` entry — same two-direction ratchet. `connectionsChanged` is the sole founding DEFERRED (no per-user connection store; config lives in settings). PD user-bus lane | new (PD user-bus) | | |
| `member-card-clamped` | ONE D22 clamp: no `MemberCardView` declaration outside `@orb/contracts`, no `clampMemberCard`/`resolveCardVisibility` outside `chat/substrate/auth/`, and the PD-111-deleted `getRosterCardView` stays dead (D22) | new (PD-116/PD-111) | | |
| `diagnostic-legibility` | every custom-gate + grit diagnostic STRING carries a resolvable pointer (a `*.md` doc path, a code-home path/file, or an explicit `// terse-ok:` marker) — the meta-gate that makes the W1-D message normalization permanent; a new gate/grit cannot regress to a bare/pointerless message | new (W1-D) | | |
| `test-presence-client` | the `@orb/client` + non-primitive `@orb/ui` reach `test-presence` lacks (server/contracts only) — a test is required on the behavioral factories + logic modules, per `Spine-Testing.md` §5's conservative surface | new (W1-1) | | |
| `no-effect-on-shared-selection` | the mechanical half of the anti-`this_chid` rule (UI-Arch §5.1) — a `useEffect`/`useLayoutEffect` in `features/**` keyed on a shared-selection store pointer is banned (the neo chase reborn); only render-only reads are sanctioned | new (2026-07-09) | | |
| `persistence-boundary` | the device-local-vs-synced belt (UI-Theming-and-Content.md §12.1 + UI-Arch §5) — raw browser storage outside the two persist factories + the boot/dev allowlist is RED, and every persisted-store name must carry a registered why-device-local rationale | new (2026-07-09) | | |
| `no-interactive-role-in-features` | closes the layout-kit interactive-role escape hatch (UI-Gates-and-Lessons.md §8) — a `.tsx` under `features/**` assigning an INTERACTIVE (widget) ARIA role (`button`/`link`/`checkbox`/`menuitem`/… — static, braced, or conditional literal) is RED; structural/live-region roles + `data-role` stay legal, seals outside `features/**` are out of scope. Both-ways BURN\_DOWN ratchet (persona-panel-row cited to Wave 1) | new (2026-07-09) | | |
| `no-raw-interactive-intrinsics` | design-enforcement.md §3.2, D62 — a raw `<button>`/`<input>`/`<select>`/`<textarea>`/`<a href>` under `features/**` (app-shell exempt, shell-tier) is RED regardless of className; interactivity must come from an `@orb/ui` primitive. Both-ways BURN\_DOWN ratchet (3 hidden `<input type="file">` click-trigger offenders — no headless file-trigger primitive yet) | new (2026-07-11) | | |
| `empty-state-has-action` | design-enforcement.md §3.2, D62 — a `<EmptyState>` under `features/**` must pass `action` (or a spread that might); a dead end strands the user. Both-ways ALLOWLIST ratchet (7 files awaiting a CTA design call or genuinely action-less) | new (2026-07-11) | | |
| `surface-a11y-focus` | a `surfaces/*.tsx` that isn't an auto-focus-trapping Base UI primitive must explicitly manage focus on mount (`.focus()`/`useFocusOnMount`) | new | | |
| `surface-in-a-container` | a `surfaces/*.tsx` that establishes raw layout must sit inside an `@orb/ui/layout` container (UI-Arch §4) — feature code never writes raw containment | new (W1-1) | | |
| `registry-pairing` | the RAIL registry (`rail-slots.ts`) and its sibling `MODAL_SLOTS` bodies (`modal-slots.tsx`) are a bijection on modal ids — every trigger has a body, every body has a reachable trigger | new | | |
| `modal-body-not-placeholder` | a `MODAL_SLOTS` body whose `render` still returns `<SectionPlaceholder>` must carry an explicit `placeholder: true` flag — an unbuilt modal can't ship silently | new | | |
| `placeholder-copy-registry` | every `SECTION_PLACEHOLDER_COPY` entry's `(title, description)` pair is DISTINCT — kills the "three sections share one string" silent-duplicate case | new | | |
| `enforcement-registry-parity` | this doc's declared registered-gate COUNT + Layer-3 ACTIVE table must agree with `report.ts`'s `ALL_CHECKS` (both directions), and every `scripts/check/gates/*.ts` file must be registered or DORMANT — the meta-gate that promotes `check-gates.int.test.ts`'s anti-drift assertion to every `pnpm check` | new (2026-07-09) | | |
| `no-array-literal-querykey` | a `queryKey:` property whose value is an inline array literal anywhere in `packages/client/src` is RED — client query keys are 100% tRPC-proxy-derived (`.queryKey()`/`.queryFilter()`/`.pathFilter()`), §11.1; the data/ factory passthroughs are identifiers, never literals, so they pass | new (2026-07-09, client-foundation) | | |
| `no-inline-invalidate-outside-seam` | `.invalidateQueries(` may be called ONLY in `data/invalidation.ts` (the central seam); everything else routes `invalidate(event)`/`invalidateFilters`. Tighter than the Layer-2 grit `client-cache-surgery-only-in-data` (which allows all of `data/`) — §11.3 | new (2026-07-09, client-foundation) | | |
| `bus-onData-no-store-write` | a raw `.setState(` inside a `data/bus/*` subscription `onData`/`onConnectionStateChange` body is RED — the seam buffers through the chatStream api + routes to the invalidation seam, never a second store (§11.1); the reducer-body twin of the import-side grit `chat-stream-writes-in-bus-only` | new (2026-07-09, client-foundation) | | |
| `no-form-reset-in-autosave` | a `.reset(` on a form in any file importing `createAutosaveEntityForm`, PLUS the reset type-strip (`Omit<…,"reset">`) must stay present and unexposed in the factory — the runtime backstop to the compile-time strip (the autosave infinite loop, §7 row 2) | new (2026-07-09, client-foundation) | | |
| `persist-partialize-and-total-migrate` | a bare zustand `persist(` outside the two minting factories (`create-persisted-store.ts`/`create-entity-draft-store.ts`) is RED, AND inside each factory the persist options must carry `version`+`partialize`+`migrate` — the Layer-3 twin of the `no-raw-zustand-persist` grit, reading INTO the chokepoint (§11.5) | new (2026-07-09, client-foundation) | | |
| `ownerid-registry` | an `ownerId` schema column may exist ONLY on a D23-passing table (a TRUE PRODUCER, a parentless per-user aggregate, or the two sanctioned scope-subject cases — `chat_tags` D30 · `global_documents` D49); every other table DERIVES its owner by one FK to an owned entity. A newly-stamped `ownerId` on an unlisted table is a doubling — RED with the D23 cite (D21/D23/D30) | new (ledger-gate wave) | | |
| `no-untyped-soft-ref` | a schema column whose JS key ends in `Id` (an entity reference) MUST carry a `.references()` FK — boundaries are FK-enforced physics (D24); a soft `text`/`integer` id with no FK is banned, exceptions only `audit_logs.entityId` (append-only, outlives its referent — D37) + `users.externalId` (an external IdP subject, not a table ref) | new (ledger-gate wave) | | |
| `db-enum-from-tuple` | a drizzle `text("x", { enum: … })` column must reference an IDENTIFIER — an imported `@orb/contracts`/`@orb/kit` tuple or a local `as const satisfies readonly <ContractsType>[]` — never an inline array literal that re-spells the union away from its one home (D34) | new (ledger-gate wave) | | |
| `schema-banned-shapes` | ONE registry-driven gate over the ledger's explicitly-REJECTED schema + contract shapes — each row is a (location, forbidden shape, D-cite) the ledger killed by name; a reintroduction (a neo pattern re-ported) is RED with its cite | new (ledger-gate wave) | | |
| `warning-code-coverage` | the emit-coverage RATCHET for both structured warning-code tuples (`WARNING_CODES` in infra/providers · the domain warning set) — every member must appear as an emitted `{ code: "…" }` literal at a real emit site (the bus-coverage twin for the warning channels) (D41/D45/D48/D51) | new (ledger-gate wave) | | |
| `infra-auth-no-userid` | `infra/auth` VERIFIES headers into a pre-row `ResolvedIdentity` and must NEVER yield a `userId` — identity→row is a DOMAIN step and the `Principal` is minted ONCE at `entry/auth`; a `userId` identifier under `infra/auth/**` is the neo tier-collapse reborn — RED (D40) | new (ledger-gate wave) | | |
| `content-part-seam` | `ChatContentPart` is PRODUCED exactly once (the engine request seam, `pipeline.ts`) and CONSUMED only by `infra/providers/**`; everything upstream (assemble/shape, verbs, the rest of `domain/chat`, transport) stays `content: string` — no "content-parts everywhere" spread (D51) | new (ledger-gate wave) | | |
| `no-raw-egress` | a bare `fetch(` in `packages/server/src` must go through `safeFetch` (the self-enforcing SSRF resolve→validate→pin guard, `infra/network`); raw `fetch` is sanctioned ONLY in the credentialed/loopback provider-egress tier + safeFetch's own home (D61 B5a) | new (ledger-gate wave) | | |
| `contract-verb-presence` | the INTERFACE-level complement to `test-presence`'s file-mirror rule — every method a domain's exported `*Service` interface declares (MethodSignature + PropertySignature-with-FunctionType) must have an invocation-shaped match (`verb(` bare call or its `create<Verb>(` factory) in that domain's `tests/server/domain/<d>/**` tree (grep-style presence, not filename convention). Closes the "add a verb to the contract, never test it" hole (Spine-Testing.md §5). DEFERRED ratchet (2 entries, W1i): `chat.getRoomOverridesForChat` · `discovery.themes` | new (2026-07-09, test-support-dry-punchlist §5) | | |
| `no-test-fabrication` | bans the two fabricated-entity casts in `tests/` that compile straight through a type change — `X as unknown as Y` double-casts and object/array-literal `as Y` (Y ≠ const/any/unknown); fix is a typed factory or `satisfies Y`. `// FABRICATION-OK: <reason>` escapes a deliberate invalid-input probe. Baseline-ratchet (`no-test-fabrication.baseline.json`, 235 sites / 97 files): a file is RED only when its count EXCEEDS baseline; shrink as W1h burns it down (Spine-Testing.md §5) | new (2026-07-09, test-support-dry-punchlist §5) | | |
| `form-factory-for-multifield` | a `features/**` component hand-rolling ≥3 controlled form inputs (value/checked + an onChange-family handler) without importing an editor factory is RED — the D54 §13.4 "≥3 fields ⇒ a factory" trigger, closing the hole the `no-direct-useform` grit leaves (a form dodging Form entirely) | new (2026-07-09, D54 §13.3/§13.4) | | |
| `no-arbitrary-tw-values` | design-enforcement.md §3 — a Tailwind arbitrary-value bracket (`w-[137px]`, `text-[13px]`) on a layout/size/spacing/type utility in `packages/client/src` or `packages/ui/src` is RED (variant-SELECTOR brackets like `data-[…]:`/`has-[…]:` and token-driven bodies — `--…`/`var(…)`/`calc(…)` — stay legal); if a value is worth using it's worth a token. Both-ways ALLOWLIST ratchet (2 files: markdown.tsx's `max-h-[60cqh]` cqh unit, layout/variants.ts's `grid-cols-[repeat(auto-fit,…)]` auto-fit grid) | new (2026-07-11) | | |
| `asset-refs-fk-coverage` | task #114 — every `packages/db/src/schema` column whose FK targets `assets.id` must be classified in `domain/assets/persistence/asset-refs.ts`'s registry, either RETAINING (`ASSET_REFS`) or DERIVED (`DERIVED_ASSET_COLUMNS`) — an unregistered column silently escapes BOTH asset GC and portability blob-bundling (both walk that one registry). STRICT, no allowlist. The static (`pnpm check:structure`, pre-commit) half of the runtime `tests/server/domain/assets/persistence/asset-refs.int.test.ts` invariant | new (2026-07-11, task #114) | | |
| `no-off-token-radius-shadow` | design-enforcement.md §3, DC8 rollup-audit blind spot — the default-scale twin of `no-arbitrary-tw-values` (that gate catches brackets only, e.g. `rounded-[3px]`; this one catches an off-token DEFAULT-SCALE `rounded-{sm,md,lg,xl,2xl,3xl,4xl}` / `shadow-{sm,md,lg,xl,2xl,3xl,inner}` / bare `shadow` utility in `packages/client/src` or `packages/ui/src`, which resolves against Tailwind's stock scale instead of the DTCG theme's closed radius vocabulary — `rounded-base/control/card/full` — and shadow vocabulary — `shadow-glow/overlay/prose`, `tokens.json`). `rounded-none`/`shadow-none` (a deliberate opt-out, not a magic value) and `drop-shadow-*` (a different CSS property) stay legal. Both-ways ALLOWLIST ratchet (10 files: the overlay-primitive family — dialog/popover/menu/tooltip/alert-dialog/drawer/toast/selection-bar/macro-textarea — shipped `shadow-md`/`shadow-lg` instead of `shadow-overlay`, plus `command-palette-surface.tsx`; `packages/client/src/features/preset/**` is structurally excluded, mid-revamp lane) | new (2026-07-12, DC8) | | |
| `motion-token-purity` | BASEUI-MOTION-AUDIT.md §5 Layer 3 — the CSS motion twin of the radius/shadow gate: a RAW duration (`220ms`/`3s`) or easing (`ease`/`ease-in`/`ease-out`/`ease-in-out`/`cubic-bezier(…)`) written into a `transition`/`animation` shorthand or a `transition-duration`/`animation-duration`/`transition-timing-function` longhand in `packages/{ui,client}/src/**/*.css` is RED where a `--motion-*`/`--ease-*` (or co-motion `--shell-*`) token belongs. `linear` (continuous loops), `0s` (a deliberate no-transition), `var(…)`/`calc(…)` bodies, and custom-property DEFINITIONS (`--motion-fast: 130ms` in theme.css — not a scanned property) stay legal. The source arm of the never-desync guarantee (co-motion vars in shell.css + a rendered-parity CT are the other two layers). Both-ways ALLOWLIST ratchet (2 files: client globals.css's `orb-weave-shimmer 3s` continuous loop + ui globals.css's reduced-motion `0.01ms !important` kill-switch and the spotlight `ease-out`) | new (2026-07-12) | | |
| `no-off-token-inline-style` | design-enforcement.md §3 — the INLINE/IMPERATIVE arm the className gates (`no-arbitrary-tw-values`/`no-off-token-radius-shadow`/`no-color-literals`) and the CSS gate (`motion-token-purity`) can't see. A token-backed CSS property (`borderRadius`/`boxShadow`/`color`/`background(Color)`/`transition`(+ duration/timing)/`animation`/`gap`/`padding*`/`margin*`) written as a RAW STATIC LITERAL (a unit-bearing number/hex/`rgb(`/`oklch(`/duration/easing keyword, or a bare non-zero number) in `packages/{ui,client}/src/**/*.{ts,tsx}` is RED, in either carrier: a JSX inline `style={{ prop: value }}` object literal, or an imperative `<expr>.style.prop = value` / `<expr>.style.setProperty("prop", value)`. A value that IS or CONTAINS a `var(--…)` reference (on-token, just inline) passes; a DYNAMIC value (identifier/member read/interpolated template/conditional) is deliberately NOT flagged (conservative — static raw literals only). Both-ways ALLOWLIST ratchet, currently EMPTY (the two known off-Tailwind radius sinks — the ECharts `<canvas>` bar radius + the CodeMirror lint-marker decoration — are framework-config object properties, NOT JSX `style={{…}}`/imperative `.style` sites, so they fall outside this gate's scope, not its allowlist). GREEN today (a ratchet — the JSX/imperative inline-style drift surface is currently empty) | new (2026-07-12) | | |
| `verify-registry-parity` | UNIFIED-VERIFICATION-DESIGN.md §3.6 — every `package.json` script matching the verification shape (`check*`/`test*`/`lint*`/`typecheck*`/`depcruise*`/`e2e*`/`cpd*`/`format*`) must be reachable from the `pnpm verify` stage registry (`scripts/verify/registry.ts`): either it IS a registry stage's `pnpm <script>` argv, or it is a writer/artifact-generator on the gate's `NON_STAGE_ALLOWLIST` (lint:fix, format(:docs), depcruise:graph/focus/reaches, cpd:report, the verify/check hosts). The mirror arm: every registry stage's whole-scope `pnpm <script>` argv must name a real package.json script (a dead row is RED). Makes a "forgotten script" — one added to package.json without a tier — a structural violation | new (2026-07-12, V4) | | |

The table mirrors `scripts/check/report.ts` (70 registered gates); `report.ts` is the runtime truth.

The 7th fired-trigger gate (PD-116), `solo-byte-identical`, is NOT a static gate — it is the
cross-cutting property suite `tests/server/domain/chat/solo-byte-identical.suite.int.test.ts`: two
identically-shaped roster-of-one chats (untouched-solo config vs fully group-configured) drive ONE
round each through the REAL engine and the wire request + persisted canon must be BYTE-identical
(D16 "solo is a group of one"; the behavioral half of the `no-if-is-group` grit).

### Layer 3 — DORMANT structural gates (built + self-tested, deliberately NOT in `ALL_CHECKS`)

These gate files exist in `scripts/check/gates/` and each carries its own `tests/tooling/` self-test
proving it fires, but are held out of `report.ts`'s `ALL_CHECKS` by decision (each finds real debt whose
backfill rides a later wave, or gates a construct that doesn't exist yet — keeping them off preserves
green-to-commit without hiding the debt). Activation is a one-line `ALL_CHECKS` add. **Ground truth:** the
`DORMANT_GATES` set in `tests/tooling/check-gates.int.test.ts` (a gate is DORMANT iff it's there / absent
from `ALL_CHECKS`).

| Gate | Enforces | Activation trigger |
| - | - | - |
| `component-size-ui` | `packages/ui/src` LOC ceiling (450) — the ui twin of `component-size` | W1-1 splits `table.tsx` (461 > 450), then registers it |
| `monotonic-tests` | a green `check` can't be reached by deleting/disabling tests (a committed baseline manifest) | first real client test suite + committed baseline |
| `audit-client-tests` | AST anti-patterns in `*.test.ts` (empty describe/hook, no-assertion, missing `await`) | client tests exist |

**Stale-name follow-up (`client-structure` RESERVED):** `features/corpus` mirrors no domain — the domain
map renamed corpus→discovery (AGENTS §6). The `.gitkeep` stub should rename to `discovery` (or justify
keeping `corpus`); tracked inline in `client-structure.ts`'s `RESERVED` comment as a doc/PD follow-up.

## Layer 4 — dependency-cruiser (`.dependency-cruiser.cjs`) — **ACTIVE**

The import-graph backstop ("boundaries are physics"), wired into `pnpm check` + CI + pre-push. 35 rules:
the 6-package cake (kit←contracts←db←server←client, + `@orb/ui` between contracts and client), server tier direction
(entry→transport→domain→infra→foundation→kit), kit-purity + kit/ui no-node-builtins, infra-no-db, foundation-reaches-up-to-nothing,
drivers-through-domain, domain isolation (no-cross-feature/-verb/-subsystem + front-door + substrate
mediation), the client rules (feature front-door, no-cross-feature, no-backend-runtime, the `@orb/ui`
satellite seals — D42/D52 physics), providers public-surface + strategy-isolation + vllm-surface-isolation + the transitive credential firewall
(openrouter ↛ agent-sdk), persistence-no-io, stats-no-vector-tables, and `not-to-dev-dep` (prod `packages/*/src` must not import a
pure devDependency — restored from neo; `recommended-strict` omits it). Every rule is **pinned by
`tests/tooling/dependency-cruiser.int.test.ts`** (derives the rule set from the config, fires each on a
fixture — anti-drift). The full feature set (err-long, mermaid graph, `--focus`/`--reaches`/`--affected`)

- deliberate non-adoptions are documented in the config header.

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
