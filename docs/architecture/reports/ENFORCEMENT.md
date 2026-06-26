# Enforcement registry

The single catalog of every machine-enforced invariant in orbweaver, and the deferred backlog of
gates that are deliberately not on yet (with the trigger that turns each one on). If a rule isn't
here, it isn't enforced; if it's in the backlog, it has a named activation condition — nothing is
"forgotten," it's "scheduled."

Philosophy: gates are written **before** the code they govern, so code is born compliant. A gate that
would only false-fire on the current (placeholder) tree is not "missing" — it's in the backlog, keyed
to the code that makes it meaningful.

`pnpm check` = `biome` (lint+format) → `tsc` (types) → `check:structure` (ts-morph/fs gates) →
`depcruise` (import graph, pending). All four must be green; lefthook runs them pre-commit in every
worktree.

---

## Layer 1 — Biome (`biome.json`)

168 explicit rules at `error`, 4 type-aware domains (project/types/react/test), all `warn`→`error`.
Format + lint + import-organize. See `biome.json` and `docs/architecture/spine/typescript-style.md`.
Notable ratchets: `noUnresolvedImports`, `useConsistentTypeDefinitions: interface` (object shapes are
interfaces — matches structure §7.4), `noExcessiveCognitiveComplexity: 15`, `useMaxParams: 4`,
`useTopLevelRegex`, `useExplicitType`, `noMagicNumbers`.

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
lands) and fixture-tested to fire on a violation + pass clean.

| Gate | Enforces | Origin |
|---|---|---|
| `feature-structure` | domain 8-slot template (index/service/context + contract/ + verbs/) | neo (ported) |
| `test-layout` | `tests/` prefix-swaps 1:1 to real `packages/<pkg>/src`; support/+e2e/ exempt | neo (ported) |
| `verb-naming` | `verbs/<v>.ts` exports `create<Pascal(v)>` | new |
| `types-in-contract` | a feature's `contract/service.ts` declares the exported `<Feature>Service` interface (§7.4) | new |
| `no-inline-union-redecl` | no inline ≥3-member string-literal union type aliases (→ contracts) | new |
| `test-presence` | verbs/persistence/contract-schemas carry their required `.test`/`.int.test`/`.contract.test` | new |
| `commented-code` | no parked code in `//` comments (prose only) | neo (ported) |
| `schema-branding` | db `*Id` columns carry `.$type<XId>()` (PK + cross-brand FK) | neo (ported) |

## Layer 4 — dependency-cruiser (`.dependency-cruiser.cjs`) — **PENDING (Phase 0b)**

The import-graph backstop ("boundaries are physics"): 5-package cake layering
(kit←contracts←db←server←client), server tier direction (entry→transport→domain→infra→foundation→kit),
kit-purity, persistence-no-io, domain-no-cross-feature, drivers-through-domain, and the `#`/package
import convention (absorbs neo's `import-alias`). Last major Phase-0b gate.

---

## Deferred backlog — neo gates not yet ported, with activation trigger

These are tracked, not dropped. Each turns on when its target code exists; until then it would only
false-fire or be vacuous. Numbers reference neo's `scripts/check/`.

| Gate | What it does | Activates when |
|---|---|---|
| `db-structure` | `packages/db` schema by-domain layout + aggregator barrel + relations | db schema files land (Phase 1 db) |
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
