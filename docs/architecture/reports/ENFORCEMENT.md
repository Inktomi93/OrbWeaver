# Enforcement registry

The single catalog of every machine-enforced invariant in orbweaver, and the deferred backlog of
gates that are deliberately not on yet (with the trigger that turns each one on). If a rule isn't
here, it isn't enforced; if it's in the backlog, it has a named activation condition — nothing is
"forgotten," it's "scheduled."

Philosophy: gates are written **before** the code they govern, so code is born compliant. A gate that
would only false-fire on the current (placeholder) tree is not "missing" — it's in the backlog, keyed
to the code that makes it meaningful.

**The fast lane** — `pnpm check` = `biome` (lint+format) → `tsc` (types, hardened by `@total-typescript/
ts-reset` via the root `reset.d.ts`) → `check:structure` (ts-morph/fs gates) → `depcruise` (import graph
— ACTIVE, Layer 4). All four must be green. lefthook runs **biome on staged files at pre-commit** (fast)
and the **full `pnpm check` at pre-push**; CI runs the full check + `pnpm test` + `pnpm cpd`. The check
budget is **structural-fast** — whole-tree/slow analyses (jscpd, mutation) are deliberately CI/on-demand
lanes, not pre-commit.

**The CI / on-demand lanes** — `pnpm cpd` (jscpd, Layer 5) and `pnpm test:mutation[:gate]` (Stryker,
Layer 6). Enforced (they fail the build), just not in the pre-commit budget.

---

## Layer 1 — Biome (`biome.json`)

168 explicit rules at `error`, 4 type-aware domains (project/types/react/test), all `warn`→`error`.
Format + lint + import-organize. See `biome.json` and `docs/architecture/spine/typescript-style.md`.
Notable ratchets: `noUnresolvedImports`, `useConsistentTypeDefinitions: interface` (object shapes are
interfaces — matches structure §7.4), `noExcessiveCognitiveComplexity: 15`, `useMaxParams: 4`,
`useTopLevelRegex`, `useExplicitReturnType`, `noMagicNumbers`. `noConsole` is a **total ban by default**
(`allow: []` — server/db/contracts/kit log through the logger/pino, never raw console); relaxed only
for `packages/client/**` (`info/warn/error` ok in the browser until a client logger lands) and turned
off for `scripts/**` + `tests/**` (console is their output channel).

## Layer 2 — GritQL plugins (`tools/grit/`, 19 active)

AST patterns Biome rules can't express. Node matchers are **PascalCase** (`JsDecorator()`,
`JsxAttribute()`). Full list + rationale in `tools/grit/README.md`. Server: no-raw-id,
no-loose-id-cast, no-mint-via-cast, no-await-db-in-loop, no-raw-intl-time, no-raw-clock,
no-if-is-group, no-context-returntype, no-decorators, no-inline-types,
persistence-no-in-memory-state. (`no-if-is-group` flags an `if (isGroup)` / group-vs-solo branch — group-ness
is DATA, not a branch; solo is the roster-of-1 degenerate case, byte-identical — ledger D16, `domains/chat.md`
Part III §0/§12.) Client (live now, fire when client code lands): no-color-literals,
no-raw-z-index, no-raw-spacing-in-features, no-raw-typography-in-features, no-chat-trpc-in-surface,
no-direct-useform, no-form-state-in-useeffect, no-inline-optimistic-in-surface.

## Layer 3 — Structural gates (`scripts/check/`, ts-morph + fs)

Layout: `harness.ts` (Project loader + Violation runner) and `report.ts` (registry) at the root;
each gate is one module in `gates/`. Add a gate by dropping it in `gates/` and listing it in
`report.ts`. All are lenient on absent code (vacuously pass on the placeholder tree, activate as code
lands) and **pinned by `tests/tooling/check-gates.int.test.ts`** — it derives the gate registry from
`report.ts` and asserts every gate fires on a fixture (a broken AST query can't silently pass; anti-drift).

| Gate | Enforces | Origin |
|---|---|---|
| `feature-structure` | domain 8-slot template (index/service/context + contract/ + verbs/) | neo (ported) |
| `test-layout` | `tests/` prefix-swaps 1:1 to real `packages/<pkg>/src`; support/+e2e/ exempt | neo (ported) |
| `verb-naming` | `verbs/<v>.ts` exports `create<Pascal(v)>` | new |
| `no-caller-user-id` | the identifier `callerUserId` is forbidden (D19 turn-identity): the caller is `Principal.userId`; use `triggeredBy`/`runAsUserId`. AST-only (catches a newly-introduced name tsc can't) | new (P5) |
| `types-in-contract` | a feature's `contract/service.ts` declares the exported `<Feature>Service` interface (§7.4) | new |
| `no-inline-union-redecl` | no inline ≥3-member string-literal union type aliases (→ contracts) | new |
| `test-presence` | verbs/persistence/contract-schemas carry their required `.test`/`.int.test`/`.contract.test` | new |
| `test-determinism` | no ambient clock/random/unseeded-id under `tests/` (support/+e2e/ exempt) | new |
| `commented-code` | no parked code in `//` comments (prose only) | neo (ported) |
| `schema-branding` | db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK) | neo (ported) |
| `db-structure` | `packages/db` schema by-domain layout + aggregator barrel + relations | neo (ported) |
| `sole-env-reader` | `foundation/env` is the ONLY `process.env` reader — AST gate catching the `process["env"]` bracket form biome's `noProcessEnv` misses (ignores comments) | new (4a) |
| `assumes-single-replica` | a module-scope mutable `new Map/Set/WeakMap/WeakSet()` (non-literal-seed) carries `ASSUMES(single-replica)` in its file | new (4a) |
| `providers-runner-seal` | no `domain`/`transport`/`entry` imports the sealed runner derivation/vocab (`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) — providers.md inv #3 | new (4b) |

## Layer 4 — dependency-cruiser (`.dependency-cruiser.cjs`) — **ACTIVE**

The import-graph backstop ("boundaries are physics"), wired into `pnpm check` + CI + pre-push. 29 rules:
the 5-package cake (kit←contracts←db←server←client), server tier direction
(entry→transport→domain→infra→foundation→kit), kit-purity, infra-no-db, foundation-reaches-up-to-nothing,
drivers-through-domain, domain isolation (no-cross-feature/-verb/-subsystem + front-door + substrate
mediation), providers public-surface + strategy-isolation + the transitive credential firewall
(openrouter ↛ agent-sdk), persistence-no-io, stats-no-vector-tables, and `not-to-dev-dep` (prod `packages/*/src` must not import a
pure devDependency — restored from neo; `recommended-strict` omits it). Every rule is **pinned by
`tests/tooling/dependency-cruiser.int.test.ts`** (derives the rule set from the config, fires each on a
fixture — anti-drift). The full feature set (err-long, mermaid graph, `--focus`/`--reaches`/`--affected`)
+ deliberate non-adoptions are documented in the config header.

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
build below `thresholds.break`). On-demand + CI, never in `pnpm check` (runs are minutes). Skeleton
today (needs code + tests + `vitest.config.ts` + a root `tsconfig.json`); the mutate lists are
forward-looking and `break` stays null until the targets exist and a measured score calibrates it
(`spine/testing.md` › Mutation testing).

---

## Deferred backlog — neo gates not yet ported, with activation trigger

These are tracked, not dropped. Each turns on when its target code exists; until then it would only
false-fire or be vacuous. Numbers reference neo's `scripts/check/`.

| Gate | What it does | Activates when |
|---|---|---|
| `assets-single-writer` | only `domain/assets` writes the assets table + `storeBlob` (the one CAS coherence site) | assets domain built (PRE-SCAFFOLD §A1) |
| `asset-owner-gated` | assets are per-user (`assets.ownerId` + `unique(ownerId,hash)`); the `/blob/:hash` route resolves the caller (session cookie) + `fetchOwned` (or the roster-avatar membership exception) — NEVER serves on bare row-existence; `Cache-Control: private`; the CAS is per-user keyed (ledger D21 — "no leaks ever") | assets domain + blob route built |
| `discovery-no-vector-write` | `discovery` embeds nothing — no write into the embeddings vector tables | discovery + embeddings domains built (§A1) |
| `dead-code` (knip) | unused exports / files / deps | **DEFERRED to ~4c–6** — knip false-fires now: `contracts`/`db`/`kit` export symbols the domains (4c), transport/entry (4d/4e), and client (6) don't consume yet (same reason `no-orphans` is set to `ignore`). When the consuming tiers land, adopt a workspace knip config seeded from neo's `.config/knip.json` (entry: routes / shadcn / provider barrels; ignore: CSS-only deps). |
| `api-surface` | public package-surface drift snapshot ("lock the surface") | packages export a stable surface |
| `monotonic-tests` | test-count baseline only grows (behavior lock) | first real test suite + baseline file |
| `suppressions` | `biome-ignore` count ratchet + audit (reasons are already biome-native) | post-Phase-1 baseline (count-down ratchet needs existing code) |
| `provider-vocab` | provider-routing vocabulary has one home | connection domain built |
| `env-natures` | settings "four natures" split, machine-locked | settings domain built |
| `serde-core` | serialization-core invariants (one canonical home, layer-clean) | serde/import-export domains built |
| `bus-coverage` | chat event-bus coverage ratchet | chat domain built |
| `turn-identity` | turn pipeline runs as `runAsUserId` (host), not caller — the **triple** (id + role + model-gating all flip; the caller's `Principal.userId` never reaches `resolveCredential`/`loadUserSettings`; `triggeredBy` is the responsible human, no `callerUserId` term) (ledger D16/D17/D19) | chat domain built |
| `membership-enforcer` | every `chatId`-taking surface routes through the membership chokepoint (`requireParticipant`/`requireHost`/`can()`), default-deny — scope INCLUDES SSE subscribe + bus delivery + lineage walkers + `forkChat` + `chat_injections` + anchor reassignment; grep `ownerId ===` in chat → RED (ledger D16; `domains/chat.md` Part III §11) | chat domain built |
| `member-card-clamped` | a member reads a roster character's card ONLY via `getRosterCardView` (`requireParticipant` + fields clamped to `chatMetadata.group.memberCardVisibility`); `get`/`update`/`duplicate`/export stay owner-only (`fetchOwned`); the owner/host always sees `full`; viewing ≠ owning (ledger D22) | character + chat domains built |
| `owner-role-split` | `UserRole = owner\|admin\|user` single-homed in `@orb/contracts/identity`; db enum derives the `USER_ROLES` tuple (test-mirror); exhaustive dispatch; `max-pro-sub` gated `requireOwner`; the only `role === 'owner'\|'admin'` site is the `can()` seam (ledger D17) | identity/contracts built (chat for the by-proxy gate) |
| `bus-payload-allowlist` | credentials/secrets are **type-level-unrepresentable** in `ChatBusEvent` / `NotificationEvent`; all chat bus events are room-public (ledger D16) | chat + notifications domains built |
| `notifications-durable-first` | a notification is INSERTed in the membership-transition tx and fanned out only after commit (deliverable from the table alone); the stream uses the `chat.streamMessages` resume shape, never `buddy.stream` | notifications domain built |
| `solo-byte-identical` | a solo chat's assembled history AND rendered output is byte-identical before/after the roster (the `no-if(isGroup)` equivalence — pairs with the active `no-if-is-group` grit plugin) (ledger D16) | chat domain built |
| `vector-scope-derived` | NO domain reads the vector tables (`chat_digests`/`chat_segments`/`*_embeddings`) except via the ONE `search` engine; the producer owner-scope is a MANDATORY param, applied BEFORE cosine rank AND before `content_hash` collapse; no denormalized `ownerId` on a vector row (ledger D20 — the no-cross-user-leak gate; scope is derived from the producer, never stamped) | embeddings + search domains built |
| `optimistic-chat` | client optimistic-update call-site invariants | chat client built |
| `client-structure` | `packages/client` by-feature layout | client package built |
| `component-size` | god-component file-size cap | client package built |
| `design-tokens` | design-token file shape (globals.css) | client styling built |
| `state-files` | canonical store layout (zustand) | client state built |
| `substrate-clean` | substrate/canonical cleanliness ratchet | client built |
| `entity-editor` | entity-editor checklist ratchet | client entity editors built |
| `audit-client-tests` | client test audit | client tests exist |
| `doc-tables` | docs ↔ code table-consistency | a docs-table convention is adopted |
| `no-inline-union-redecl` (tuple-vs-tuple) | **UPGRADED (4b)**: the active gate now flags an inline union (any position, incl. interface property) OR a `z.enum([…])` literal array that re-spells an EXISTING canonical tuple's member set (the AUTH_MODE class). Remaining: a 2nd `as const` TUPLE duplicating a 1st's members — doctrinally contested (distinct axes may legitimately share a member set, e.g. `REASONING_DISPLAY_MODES`/`THINKING_DISPLAYS`, ledger §5 vs D5), so left unbuilt pending that policy call. | decide the distinct-axis-vs-dup policy |
| `dangling-refs` | prose pointers (paths/symbols) that lead nowhere | revisit (risk: doc-path refs); candidate post-Phase-1 |
| `abandoned-comments` | comments that lost their code anchor (report-only metric) | optional; revisit if churn warrants |
| `comment-density` | comment-density metric (report-only) | optional; revisit if a cap is agreed |
| `arch-metrics` | ArchUnitTS class-quality metrics (report-only) | optional |
| `show` | human-readable check-results viewer (UX) | optional (`report.ts` already prints readable output) |
| `enforcement-registry` | self-hosting gate that canonizes the catalog | optional (this doc is the catalog for now) |

### Dropped (do not port)

| neo gate | Why N/A |
|---|---|
| `clean-break` | retrofit-diff rule (delete-home-as-you-add-replacement); orbweaver is greenfield, no retrofits |
| `shared-structure` | governs neo's `src/shared/`; orbweaver has no `_shared` (kit/contracts replace it) |
