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

## Layer 2 — GritQL plugins (`tools/grit/`, 23 active)

AST patterns Biome rules can't express. Node matchers are **PascalCase** (`JsDecorator()`,
`JsxAttribute()`). Full list + rationale in `tools/grit/README.md`. Server: no-raw-id,
no-loose-id-cast, no-mint-via-cast, no-await-db-in-loop, no-raw-intl-time, no-raw-clock,
no-if-is-group, no-context-returntype, no-decorators, no-inline-types,
persistence-no-in-memory-state. (`no-if-is-group` flags an `if (isGroup)` / group-vs-solo branch — group-ness
is DATA, not a branch; solo is the roster-of-1 degenerate case, byte-identical — ledger D16.) Client (live now, fire when client code lands): no-color-literals,
no-raw-z-index, no-raw-spacing-in-features, no-raw-typography-in-features, no-chat-trpc-in-surface,
no-direct-useform, no-form-state-in-useeffect, no-inline-optimistic-in-surface, no-layout-context-props
(D42), plus the D44 containment trio no-untrusted-html-in-main-dom, no-external-media-without-gate,
theme-override-only-via-scope.

## Layer 3 — Structural gates (`scripts/check/`, ts-morph + fs)

Layout: `harness.ts` (Project loader + Violation runner) and `report.ts` (registry) at the root;
each gate is one module in `gates/`. Add a gate by dropping it in `gates/` and listing it in
`report.ts`. All are lenient on absent code (vacuously pass on the placeholder tree, activate as code
lands) and **pinned by `tests/tooling/check-gates.int.test.ts`** — it derives the gate registry from
`report.ts` and asserts every gate fires on a fixture (a broken AST query can't silently pass; anti-drift).

| Gate | Enforces | Origin |
| - | - | - |
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
| `providers-runner-seal` | no `domain`/`transport`/`entry` imports the sealed runner derivation/vocab (`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) — `Tier-3b-Providers.md` inv #3 | new (4b) |
| `ui-primitive-structure` | `@orb/ui` primitive dir shape — front-door `index.ts` + the `<name>.tsx`/`variants.ts` trio + a colocated test; per BUILT primitive | new |
| `client-structure` | `@orb/client` §2.1 feature-slice layout — front-door `index.ts` + known buckets (surfaces/anchors/components/hooks/lib; app-shell +registry/store) + no-stray-root; per BUILT feature | new |
| `component-size` | `@orb/client` hard file-size cap (450 default / 500 route shells); gates `.ts` + `.tsx`, exempts tests/gen/`.d.ts` — god-component sprawl can't survive a check run | neo (ported) |
| `no-direct-users-read` | the `users` table is read/written ONLY by `sessions` + `admin`; any other domain importing the `users` symbol from `@orb/db` is RED (identity comes from the Principal — resolve-once) | new |
| `pd-citation-integrity` | every in-code `FLAG[PD-n]` resolves to a `Core-Audits-and-Debt.md` registry row; no duplicate PD ids (the concurrent-append collision) | new |
| `test-mock-doctrine` | `vi.mock` of an internal module is banned — fake at the edges, inject at the root (`core/Spine-Testing.md §3`); third-party node edges only | new |
| `test-factory-contract` | `makeX(overrides?)` builders are pure (no db param); persisted variants are `seedX(db, …)`; factories live in `tests/support/factories/` | new |
| `test-fixture-imports` | tests import `{ test, expect }` from `support/fixtures`, never raw `vitest`/`@playwright/test` (e2e, support/, `.test-d.ts` exempt) | new |
| `test-no-stubs` | every test block carries ≥1 assertion (`expect`/`expectTypeOf`) — anti-gaming for `test-presence` | new |
| `server-layout` | `packages/server/src` root = the 6 tier dirs + `index.ts` only (§3) | new |
| `package-layout` | kit/contracts/db/ui/client: every module is a directory with `index.ts`; no loose root files except `index.ts` (D15) | new |
| `vector-scope-derived` | the vector tables (`character/image_embeddings`, `chat_digests/segments/digest_speakers`) are IMPORTED only by their sanctioned homes (embeddings/search/chat-memory/discovery/debug), WRITTEN only by `embeddings/persistence`, and cosine-ranked (`vector_distance_cos`) only in `search/persistence` — scope is derived from the producer, never stamped (D20) | new (PD-116) |
| `turn-identity` | the chat ENGINE is `Principal`-blind: no `Principal` import and no `principal` identifier under `domain/chat/engine/` — the turn triple is `runAsUserId`/`triggeredBy`/caller-resolved-upstream (D16/D17/D19) | new (PD-116) |
| `membership-enforcer` | no owner-equality comparison (`x.ownerId ===`) and no `fetchOwned`/`OwnedTable` import in `domain/chat` + the chat transport — chats are MEMBERSHIP-scoped (`assertParticipant` → `can()`); the host is looked up from the roster, never compared as an owner (D16/D18) | new (PD-116) |
| `owner-role-split` | no `role === "owner"\|"admin"` comparison outside `domain/admin/guard.ts` — `can()` is the ONE privilege seam; owner ⊇ admin lives inside it (D17; the gate's founding catch fixed the auth seam's inline `isAdmin`) | new (PD-116) |
| `bus-coverage` | every `CHAT_BUS_EVENT_TYPES` member has a server emit site OR a cited `DEFERRED` entry — a self-cleaning two-direction ratchet (missing emit RED; stale allowlist RED). Founding census: 8/26 unwired → PD-89 + PD-117 (D50) | new (PD-116) |
| `member-card-clamped` | ONE D22 clamp: no `MemberCardView` declaration outside `@orb/contracts`, no `clampMemberCard`/`resolveCardVisibility` outside `chat/substrate/auth/`, and the PD-111-deleted `getRosterCardView` stays dead (D22) | new (PD-116/PD-111) |

The table mirrors `scripts/check/report.ts` (31 registered gates); `report.ts` is the runtime truth.

The 7th fired-trigger gate (PD-116), `solo-byte-identical`, is NOT a static gate — it is the
cross-cutting property suite `tests/server/domain/chat/solo-byte-identical.suite.int.test.ts`: two
identically-shaped roster-of-one chats (untouched-solo config vs fully group-configured) drive ONE
round each through the REAL engine and the wire request + persisted canon must be BYTE-identical
(D16 "solo is a group of one"; the behavioral half of the `no-if-is-group` grit).

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
