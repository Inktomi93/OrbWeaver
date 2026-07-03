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

**The fast lane** — `pnpm check` = `biome` (lint+format) → `tsc` (types, hardened by `@total-typescript/
ts-reset` via the root `reset.d.ts`) → `check:structure` (ts-morph/fs gates) → `depcruise` (import graph
— ACTIVE, Layer 4). All four must be green. lefthook runs **biome on staged files at pre-commit** (fast)
and the **full `pnpm check` at pre-push**; CI runs the full check + `pnpm test` + `pnpm cpd`. The check
budget is **structural-fast** — whole-tree/slow analyses (jscpd, mutation) are deliberately CI/on-demand
lanes, not pre-commit.

**The CI / on-demand lanes** — `pnpm cpd` (jscpd, Layer 5) and `pnpm test:mutation[:gate]` (Stryker,
Layer 6). Enforced (they fail the build), just not in the pre-commit budget.

---

<!-- Source: Core-Laws-and-Precedents.md -->

## Layer 1 — Biome (`biome.json`)

168 explicit rules at `error`, 4 type-aware domains (project/types/react/test), all `warn`→`error`.
Format + lint + import-organize. See `biome.json` and `docs/architecture/core/Spine-TypeScript-and-Patterns.md`.
Notable ratchets: `noUnresolvedImports`, `useConsistentTypeDefinitions: interface` (object shapes are
interfaces — matches structure §7.4), `noExcessiveCognitiveComplexity: 15`, `useMaxParams: 4`,
`useTopLevelRegex`, `useExplicitReturnType`, `noMagicNumbers`. `noConsole` is a **total ban by default**
(`allow: []` — server/db/contracts/kit log through the logger/pino, never raw console); relaxed only
for `packages/client/**` (`info/warn/error` ok in the browser until a client logger lands) and turned
off for `scripts/**` + `tests/**` (console is their output channel).

<!-- Source: Core-Laws-and-Precedents.md -->

## Layer 2 — GritQL plugins (`tools/grit/`, 19 active)

AST patterns Biome rules can't express. Node matchers are **PascalCase** (`JsDecorator()`,
`JsxAttribute()`). Full list + rationale in `tools/grit/README.md`. Server: no-raw-id,
no-loose-id-cast, no-mint-via-cast, no-await-db-in-loop, no-raw-intl-time, no-raw-clock,
no-if-is-group, no-context-returntype, no-decorators, no-inline-types,
persistence-no-in-memory-state. (`no-if-is-group` flags an `if (isGroup)` / group-vs-solo branch — group-ness
is DATA, not a branch; solo is the roster-of-1 degenerate case, byte-identical — ledger D16.) Client (live now, fire when client code lands): no-color-literals,
no-raw-z-index, no-raw-spacing-in-features, no-raw-typography-in-features, no-chat-trpc-in-surface,
no-direct-useform, no-form-state-in-useeffect, no-inline-optimistic-in-surface.

<!-- Source: Core-Laws-and-Precedents.md -->

## Layer 3 — Structural gates (`scripts/check/`, ts-morph + fs)

Layout: `harness.ts` (Project loader + Violation runner) and `report.ts` (registry) at the root;
each gate is one module in `gates/`. Add a gate by dropping it in `gates/` and listing it in
`report.ts`. All are lenient on absent code (vacuously pass on the placeholder tree, activate as code
lands) and **pinned by `tests/tooling/check-gates.int.test.ts`** — it derives the gate registry from
`report.ts` and asserts every gate fires on a fixture (a broken AST query can't silently pass; anti-drift).

| Gate                     | Enforces                                                                                                                                                                                | Origin       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `feature-structure`      | domain 8-slot template (index/service/context + contract/ + verbs/)                                                                                                                     | neo (ported) |
| `test-layout`            | `tests/` prefix-swaps 1:1 to real `packages/<pkg>/src`; support/+e2e/ exempt                                                                                                            | neo (ported) |
| `verb-naming`            | `verbs/<v>.ts` exports `create<Pascal(v)>`                                                                                                                                              | new          |
| `no-caller-user-id`      | the identifier `callerUserId` is forbidden (D19 turn-identity): the caller is `Principal.userId`; use `triggeredBy`/`runAsUserId`. AST-only (catches a newly-introduced name tsc can't) | new (P5)     |
| `types-in-contract`      | a feature's `contract/service.ts` declares the exported `<Feature>Service` interface (§7.4)                                                                                             | new          |
| `no-inline-union-redecl` | no inline ≥3-member string-literal union type aliases (→ contracts)                                                                                                                     | new          |
| `test-presence`          | verbs/persistence/contract-schemas carry their required `.test`/`.int.test`/`.contract.test`                                                                                            | new          |
| `test-determinism`       | no ambient clock/random/unseeded-id under `tests/` (support/+e2e/ exempt)                                                                                                               | new          |
| `commented-code`         | no parked code in `//` comments (prose only)                                                                                                                                            | neo (ported) |
| `schema-branding`        | db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK)                                                                                                                            | neo (ported) |
| `db-structure`           | `packages/db` schema by-domain layout + aggregator barrel + relations                                                                                                                   | neo (ported) |
| `sole-env-reader`        | `foundation/env` is the ONLY `process.env` reader — AST gate catching the `process["env"]` bracket form biome's `noProcessEnv` misses (ignores comments)                                | new (4a)     |
| `assumes-single-replica` | a module-scope mutable `new Map/Set/WeakMap/WeakSet()` (non-literal-seed) carries `ASSUMES(single-replica)` in its file                                                                 | new (4a)     |
| `providers-runner-seal`  | no `domain`/`transport`/`entry` imports the sealed runner derivation/vocab (`deriveRunner`/`backendForSource`/`BackendKey`/`BACKEND_KEYS`) — providers.md inv #3                        | new (4b)     |
| `ui-primitive-structure` | `@orb/ui` primitive dir shape — front-door `index.ts` + the `<name>.tsx`/`variants.ts` trio + a colocated test; per BUILT primitive                                                      | new          |
| `client-structure`       | `@orb/client` §2.1 feature-slice layout — front-door `index.ts` + known buckets (surfaces/anchors/components/hooks/lib; app-shell +registry/store) + no-stray-root; per BUILT feature    | new          |
| `component-size`         | `@orb/client` hard file-size cap (450 default / 500 route shells); gates `.ts` + `.tsx`, exempts tests/gen/`.d.ts` — god-component sprawl can't survive a check run                       | neo (ported) |

<!-- NOTE: this table is behind `report.ts` — 8 registered gates are not yet catalogued here
(no-direct-users-read, pd-citation-integrity, test-mock-doctrine, test-factory-contract,
test-fixture-imports, test-no-stubs, server-layout, package-layout). Reconcile against `report.ts`. -->

<!-- Source: Core-Laws-and-Precedents.md -->

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

- deliberate non-adoptions are documented in the config header.

<!-- Source: Core-Laws-and-Precedents.md -->

## Layer 5 — jscpd (`jscpd.json`) — copy-paste detection

Structural duplication the per-file biome/grit rules can't see. Scans `packages/**/src` (TS + CSS;
the centralized `tests/` mirror, migrations, fixtures, and `*.d.ts` are excluded — mirror duplication
is intentional). **CI lane, not the pre-commit fast check** (whole-tree scan). Gate: the build fails
over **5%** duplication (`threshold`) — ratchet down as the codebase matures. `pnpm cpd` (console) /
`pnpm cpd:report` (HTML → `reports/cpd`). Active now: vacuous on the comment-only placeholder tree,
fires the moment real code lands.

<!-- Source: Core-Laws-and-Precedents.md -->

## Layer 6 — Stryker (`stryker.config.json` + `stryker.gate.config.json`) — mutation testing — **SCHEDULED (Phase 4c/5)**

Mutates source + reruns the suite to score whether tests actually _catch_ bugs — the "test covers the
line but asserts nothing" signal coverage can't detect (neo's founding `isVllmBackend`-lying-gate
class). Two lanes: `pnpm test:mutation` (exploratory, `break:null`) and `pnpm test:mutation:gate`
(pinned to the highest-stakes pure modules — chat routing/assembly, credential resolution — fails the
build below `thresholds.break`). On-demand + CI, never in `pnpm check` (runs are minutes). Skeleton
today (needs code + tests + `vitest.config.ts` + a root `tsconfig.json`); the mutate lists are
forward-looking and `break` stays null until the targets exist and a measured score calibrates it
(`core/Spine-Testing.md` › Mutation testing).

---

<!-- Source: Core-Laws-and-Precedents.md -->

