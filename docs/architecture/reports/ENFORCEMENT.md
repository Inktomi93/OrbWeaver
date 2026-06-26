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
`useTopLevelRegex`, `useExplicitType`, `noMagicNumbers`. `noConsole` is a **total ban by default**
(`allow: []` — server/db/contracts/kit log through the logger/pino, never raw console); relaxed only
for `packages/client/**` (`info/warn/error` ok in the browser until a client logger lands) and turned
off for `scripts/**` + `tests/**` (console is their output channel).

## Layer 2 — GritQL plugins (`tools/grit/`, 19 active)

AST patterns Biome rules can't express. Node matchers are **PascalCase** (`JsDecorator()`,
`JsxAttribute()`). Full list + rationale in `tools/grit/README.md`. Server: no-raw-id,
no-loose-id-cast, no-mint-via-cast, no-await-db-in-loop, no-raw-intl-time, no-raw-clock,
no-if-is-group, no-context-returntype, no-decorators, no-inline-types,
persistence-no-in-memory-state. Client (live now, fire when client code lands): no-color-literals,
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
| `types-in-contract` | a feature's `contract/service.ts` declares the exported `<Feature>Service` interface (§7.4) | new |
| `no-inline-union-redecl` | no inline ≥3-member string-literal union type aliases (→ contracts) | new |
| `test-presence` | verbs/persistence/contract-schemas carry their required `.test`/`.int.test`/`.contract.test` | new |
| `test-determinism` | no ambient clock/random/unseeded-id under `tests/` (support/+e2e/ exempt) | new |
| `commented-code` | no parked code in `//` comments (prose only) | neo (ported) |
| `schema-branding` | db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK) | neo (ported) |

## Layer 4 — dependency-cruiser (`.dependency-cruiser.cjs`) — **ACTIVE**

The import-graph backstop ("boundaries are physics"), wired into `pnpm check` + CI + pre-push. 28 rules:
the 5-package cake (kit←contracts←db←server←client), server tier direction
(entry→transport→domain→infra→foundation→kit), kit-purity, infra-no-db, foundation-reaches-up-to-nothing,
drivers-through-domain, domain isolation (no-cross-feature/-verb/-subsystem + front-door + substrate
mediation), providers public-surface + strategy-isolation + the transitive credential firewall
(openrouter ↛ agent-sdk), persistence-no-io, stats-no-vector-tables. Every rule is **pinned by
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
| `db-structure` | `packages/db` schema by-domain layout + aggregator barrel + relations | db schema files land (Phase 1 db) |
| `sole-env-reader` | `foundation/env` is the ONLY `process.env` reader (biome no-restricted-globals/grep — dep-cruiser can't see non-import access) | foundation/env built (4a); the sessions call-time reads are allowlisted (foundation.md inv #1) |
| `assets-single-writer` | only `domain/assets` writes the assets table + `storeBlob` (the one CAS coherence site) | assets domain built (PRE-SCAFFOLD §A1) |
| `discovery-no-vector-write` | `discovery` embeds nothing — no write into the embeddings vector tables | discovery + embeddings domains built (§A1) |
| `assumes-single-replica` | every module-scope ring/cache/counter carries the `ASSUMES(single-replica)` annotation | the first single-replica in-memory state lands (foundation rings, §A1) |
| `dead-code` | unused exports (the seam tsc + knip leave open) | post-Phase-1 (false-fires while everything is a placeholder) |
| `api-surface` | public package-surface drift snapshot ("lock the surface") | packages export a stable surface |
| `monotonic-tests` | test-count baseline only grows (behavior lock) | first real test suite + baseline file |
| `suppressions` | `biome-ignore` count ratchet + audit (reasons are already biome-native) | post-Phase-1 baseline (count-down ratchet needs existing code) |
| `provider-vocab` | provider-routing vocabulary has one home | connection domain built |
| `env-natures` | settings "four natures" split, machine-locked | settings domain built |
| `serde-core` | serialization-core invariants (one canonical home, layer-clean) | serde/import-export domains built |
| `bus-coverage` | chat event-bus coverage ratchet | chat domain built |
| `turn-identity` | turn pipeline runs as `runAsUserId` (host), not caller | chat domain built |
| `optimistic-chat` | client optimistic-update call-site invariants | chat client built |
| `client-structure` | `packages/client` by-feature layout | client package built |
| `component-size` | god-component file-size cap | client package built |
| `design-tokens` | design-token file shape (globals.css) | client styling built |
| `state-files` | canonical store layout (zustand) | client state built |
| `substrate-clean` | substrate/canonical cleanliness ratchet | client built |
| `entity-editor` | entity-editor checklist ratchet | client entity editors built |
| `audit-client-tests` | client test audit | client tests exist |
| `doc-tables` | docs ↔ code table-consistency | a docs-table convention is adopted |
| `no-inline-union-redecl` (full set-dedup) | the ACTIVE gate is a v1 PROXY — it flags inline ≥3-member string-union *type aliases*, but NOT a 2nd `as const` tuple or `z.enum([…])` re-spelling of an existing axis's member set. The ledger §5 decision is the stronger "exactly one declaration site per member set." | strengthen when the first real union axes land + can be measured (the measured-pain axes from §7.5) |
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
