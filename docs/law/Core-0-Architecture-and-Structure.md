---
kind: law
status: active
updated: 2026-10-16
---

# Orbweaver — structure and placement

> **Status: authoritative.** The canonical structure for Orbweaver. Read this before creating any file.

**North star:** you can figure out where anything lives, and what may import what, **from the file tree
alone** — you *derive* the layout instead of *remembering* it. The structure is self-documenting and the
boundaries are physics, not policy.

---

## 1. The four locked principles

1. **Boundaries are physics (workspaces), not lint.** The app is split into pnpm workspace packages;
   a package cannot import what isn't in its declared deps — the layer cake is enforced by the module
   resolver, the earliest possible tier. dependency-cruiser is a *backstop*, not the primary boundary.
2. **`#` intra-package, packages cross-package, zero `paths` aliases.** Native Node subpath imports
   (`#domain`, `#primitives`, …) inside a package; workspace package names across packages. **No tsconfig
   `paths`** anywhere (that was neo-tavern's `@/` shadcn tax). One resolution model, all native.
   Another module is entered only through its front door, `#<module>`. `#src/<path>` names a file in the
   importer's own module and never crosses into another one. A parent-relative import climbs at most one
   directory (`package-deep-import`, `package-subpath-crossing`).
3. **Name by role; no `_` junk drawers.** Folders are named for what they are (`foundation`, `infra`,
   `primitives`, `contract`, `query`, `http`). Only the `@orb/kit` package is called `kit`; a package-local
   helper folder is named by its role. There is **no `_shared` services drawer** — cross-feature *services*
   are their own feature; cross-feature *primitives* are `@orb/kit`.
4. **Tests are one central tree mirroring `src` 1:1.** Not colocated. The test path is a mechanical
   prefix-swap of the src path; kind is a filename suffix. More work, but agent-enforceable and the
   src tree stays clean.

Put each boundary at the earliest available check:

| Tier | Mechanism | Fires | Agent-proof |
| - | - | - | - |
| 1 Resolve-time | package deps (undeclared import won't resolve) | as written | **yes — physics** |
| 2 Compile-time | types: branded types, exhaustive unions, `satisfies never` | `tsc` | strong |
| 3 Lint-time | retained native lint and dependency-cruiser rules | CI and focused lint | guidance |
| 4 Test-time | product and testkit tests | test runner | behavior |

The cake → tier 1 (packages). Invariants → tier 2 (types). dependency-cruiser → tier 3 backstop only.

---

## 2. Packages — the tier-1 cake

```
packages/
  kit/        @orb/kit        pure primitives + engines; isomorphic (browser-safe); no node:*/domain/I/O — isomorphic npm deps (zod, luxon…) OK
  contracts/  @orb/contracts  cross-boundary types + zod schemas (the wire)  → deps: kit
  db/         @orb/db         drizzle schema + libsql client + migrations    → deps: kit, contracts
  server/     @orb/server     business logic                                 → deps: kit, contracts, db
  ui/         @orb/ui         sealed domain-agnostic primitives (D54)        → deps: kit; react/react-dom are PEERS; the primitive libs (Base UI, cmdk, ECharts…) sealed inside
  client/     @orb/client     UI                                             → deps: kit, contracts, ui, server(devDep — type-only)
```

`workspace:*` makes cross-package refs explicit; a package importing an undeclared package fails to
resolve. (Package scope name **DECIDED: `@orb/*`** — scoped, native via pnpm, no alias tooling.
The shadcn `@/` path-alias is NOT carried over.)

**`ui` is the sealed frontend leaf** (`kit ← ui ← client`): only `@orb/kit` among workspace deps, never
`contracts`/domain types; `client` reaches every primitive lib THROUGH it — client's `package.json` lacks
the raw libs, so an app→raw-primitive import fails to resolve (physics). Full UI law:
`UI-Primitives-and-Reuse.md` + `UI-Architecture-and-Layout.md`.

**Every importable module is a DIRECTORY with `index.ts`** (front-door = folder; internal files stay flat
and are imported by a one-level relative path or by `#src/<path>`). Each package's `exports` map lists its
public doors by hand (D318): a door is a module another package uses, and a test-only seam is a declared testing
door. The `imports` map keeps `{ "#*": "./src/*/index.ts", "#src/*": "./src/*" }` for the package's own use. An
import of an undeclared path fails to resolve, and knip reports a declared export no production package uses.
Consumers never see the `index.ts` (`@orb/kit/ids`, not `@orb/kit/ids/index`). This avoids the flat-vs-dir
special-casing that rots: Node's `exports` has **no directory-index and no file-existence fallback** (an
array target resolves to the first *syntactically valid* entry, not the first existing file), so a mixed
flat/dir layout would force per-package exception lists. Uniform folders = one rule, zero maintenance
(D15).

**`kit` holds the pure ENGINES (not just tiny utils):** the **macro engine** (`kit/macro` — AST/parse +
resolve a template against a `MacroContext`) and the **regex engine** (`kit/regex` — compile + apply +
the macro-substitute hook; depends on `kit/macro`; the `node:vm` ReDoS watchdog is node-only, so it lives
in `@orb/server/primitives/regex` and is INJECTED — D53). They are pure,
zero-dep, cross-boundary transform engines with **multiple consumers — server assembly AND client
render AND each other** — so they must NOT live in `chat`. Critical distinction, **engine vs data**:
the engine is `kit`; the *data* it runs on comes from domains — the `MacroContext` *values*
(`{{char}}`/`{{user}}`/`{{memory}}`/`{{group}}`, assembled per-turn by chat/connection/memory) and the
regex *script library* (the world-info-style scoped store of user scripts, its own feature). One engine,
two call sites (server assemble + client render) → guaranteed-identical behavior. The
name-leak/speaker-label handling (`stripSelfSpeakerLabel`, `parseSpeakerSpans`) is also `kit` — it runs
at both persist and render. `chat` is a *consumer* of these engines, never their home.

TS project references are **not** used: they require emit (`composite` ⇒ `declaration`), which fights
our no-emit model (node runs the `.ts` SOURCE directly — tsc is the type ORACLE and nothing emits), and
our `exports`→`.ts` map already gives cross-package
go-to-def + boundary
enforcement without them. **Revisit triggers** (only then): we start publishing a package to npm, or
per-package `tsc --noEmit` gets slow enough to want incremental `tsc -b` caching. (TS house style +
the staged-config triggers live in `docs/law/Spine-TypeScript-and-Patterns.md`.)

---

## 3. The server package — tiers ARE directories

Read top→bottom = request flow. **Imports only flow downward in this list** (enforced).

```
packages/server/src/
├── entry/            composition root — wires everything, owns no logic
│   ├── index.ts          boot: migrate → supervisors → serve
│   ├── app.ts            Hono builder (middleware + mount)
│   └── http/             non-tRPC registrars (binary / multipart / healthz)
├── transport/        DRIVERS — thin; call DOWN into domain via front doors only
│   ├── trpc/{router,context}.ts + routers/<feature>.ts
│   └── jobs/             in-server background workers (workload poll loop)
├── domain/           BUSINESS LOGIC — one folder per feature, IDENTICAL template (§4)
│   └── <feature>/
├── infra/            external adapters (I/O) — providers / auth / storage / crypto / network
├── foundation/       read DOWN into by all; never reaches up — env · config · observability
└── primitives/       server-only PURE primitives (zero I/O, zero domain, no state, no env)
```

---

## 4. The per-feature template — the legibility engine

Use the same role-based layout across domains. Create `contract/views.ts` only for definitions the domain owns.
Import shared view shapes directly from `@orb/contracts`; do not create forwarding-only view files.
Define context types in the domain's `contract/`. Add `context.ts` only for dependency adaptation, operation binding or shared-state construction.
Use direct context construction in `service.ts` when no adaptation or shared state needs a separate builder.
Do not create forwarding-only context files or identity builders.

```
domain/<feature>/
├── index.ts        FRONT DOOR — the only legal external import. Re-exports the public surface.
├── service.ts      COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts      OPTIONAL CONSTRUCTION — adapts dependencies, binds operations or constructs shared state.
├── guard.ts        OPTIONAL 9th slot — the ratified `can()` authority seam (`requireAdmin`/`requireParticipant`):
│                   an I/O-touching, non-verb gate primitive. Allowed at ANY feature root (admin/chat/import).
├── contract/       THE TYPED SURFACE — the feature's "API README, as code" (no logic):
│   ├── service.ts      interface <Feature>Service   ← read THIS to know everything the feature does
│   ├── context.ts      context types, when separate from the service contract
│   ├── params.ts       every verb's *Params
│   ├── results.ts      every verb's *Result
│   ├── views.ts        domain-owned read models, when needed
│   └── errors.ts       typed domain errors
├── verbs/          THE ACTIONS — one verb per file, `createX(ctx, deps?)`:
│   ├── <verb>.ts       flat when few
│   └── <group>/        grouped + index.ts when many (e.g. books/, entries/, attachments/)
├── persistence/    ALL db access for this feature (queries only — no business logic)
├── substrate/      PURE feature-local helpers (zero I/O) — only if needed
└── <subsystem>/    NAMED internal subsystems, substrate-mediated (e.g. engine/ assembly/ memory/,
                    or themes/ duplicates/) — each typically {generate,retrieve,utils}.ts
```

**Navigate by structure — answer "where is…?" without opening a file:**

| Question | Answer (mechanical) |
| - | - |
| What does this feature *do*? | `contract/service.ts` (the interface) |
| Where's the `X` action? | `verbs/X.ts` |
| What shape does the client get? | `@orb/contracts`; domain-owned read models stay in `contract/views.ts` |
| Where's the DB? | `persistence/` |
| Where's the pure logic? | `substrate/` or the named `<subsystem>/` |
| How do I enter from outside? | `index.ts` (only) |
| Who wires it? | `service.ts` |

**Cross-feature dependency:** never a sideways import. A verb declares the *type* of an injected
cross-feature op in its `contract`; the runtime op is wired at the composition root (`service.ts` /
`context.ts`).

**Feature-root files are locked** to `index.ts` / `service.ts` / `context.ts` / `guard.ts` /
`workload-contributions.ts` (the ratified cross-domain 10th slot, D117) — plus a
handful of individually-sanctioned domain singletons (chat's `bus.ts` / `active-turns.ts`, rpg's
`bus.ts` / `staging.ts` / `flush-barrier.ts`, preset/settings' `constants.ts` + seed files) that fit no
verb/substrate/subsystem. The allowlist lives in `tests/server/layout.suite.test.ts`; anything else at the root
is RED.

---

## 5. Tests — one central tree that mirrors `src` directories

**The mirror rule:** a test for code in `packages/<pkg>/src/<dir>/` lives in `tests/<pkg>/<dir>/`. The directory is a
prefix swap (`packages/<pkg>/src/` ↔ `tests/<pkg>/`); the file name says the behaviour the test proves, not the
module it touches. One test file may cover several modules of its directory, and one module may be proved by several
files. `tests/tooling/<tool>/<dir>/` mirrors `tooling/src/<tool>/<dir>/` when that tool exists (§9); flat
`tests/tooling` files and directories with no tool twin are exempt. `support/` and `e2e/` mirror nothing. The sibling legacy source is reference-only (`Spine-Testing.md` §2). A
`.suite.*` kind asserts one property across many modules, so it may sit anywhere in its package tree. **Kind by
suffix**: `.test.ts` (unit) · `.int.test.ts` (integration/db) · `.contract.test.ts` (golden/surface) · `.test-d.ts`
(types) · `.suite.test.ts`/`.suite.int.test.ts` (cross-cutting property suites). The node lanes are Vitest
`test.projects` selected by suffix in ONE config. **Browser lanes are Playwright, not Vitest** (Vitest browser-mode
hangs): `.ct.tsx` (component, Playwright CT) · `.spec.ts` (e2e) — separate runners.

**Presence is behavior, not a path.** Tests should import and exercise the production behavior they claim to cover. `Spine-Testing.md` §5 describes the product surfaces that need behavioral tests. D333 retires custom static presence enforcement.

Why central plus a directory mirror over colocation: the mirrored
directory gives each test one home, and the src tree stays clean. The fixture doctrine is composed
`test.extend` (over `beforeEach`/`freshDb()`).

**The test kit is a package.** `tests/support` is the workspace package `@orb/testkit`. It sits above the cake
beside tooling (§9). Its `package.json` exports map holds its doors and no root entry: `@orb/testkit/iso`, `node`, `node/helpers`, `node/composed`,
`node/rows`, `ct`, `ct-corpus`, `browser`, `browser/spec`, `tooling` and `sdk`; each is a barrel in its world directory, and `tests/support/README.md` says what it holds. The checked-in compiler configurations own their environments: `tsconfig.tests-iso.json`, `tsconfig.json` and `tsconfig.tests-dom.json`.
The `test-helper-world-direction` rule in `.dependency-cruiser.ts` keeps the direction: iso imports no other world, node imports iso, browser imports both.

The kit holds deterministic inputs, production-derived builders, external-edge adapters and recorders. Product logic stays in its owning layer behind its public API. `Spine-Testing.md` §2 owns the server test composition home; rebuilt tests do not assemble another domain graph.

**Tests enter packages through their doors.** Tests import workspace packages through their public entry (`@orb/<package>`) or an exported subpath. They use the production composition root for integration behavior. D333 ends custom test-reach grants and enforcement; package direction remains in workspace dependencies and runtime composition.

Two named exceptions replace copies. The browser world re-exports the client door's registry lists from
`@orb/client/compose`, the reviewed exception in `client-compose-door-only`. The kit takes tRPC types from the
`@orb/server` root, the type-only `AppRouter` bridge the client uses (`testkit-app-router-bridge`).

> **Authority: `Spine-Testing.md`.** This section is the mirror rule. The full
> policy — the tree (§2 there), the test projects, the mock/determinism doctrine, the
> factory contract, and the homes for the oracle + the esoterica + memory's 6 semantics — lives there.

---

## 6. The partitioning rule — what concept lives where

The rot mode is a concept with no single home. Each of these has exactly one, up front:

| Concept | Home | Notes |
| - | - | - |
| **Connection** (api/source/model/providerRouting) | its own selection in user settings (a real `connection` domain owns resolution) | separate from the preset; one resolver; provider vocab is one derived map (runner/family derived from source+protocol) |
| **Generation config** (params/customParameters/sections) | the **preset** | preset = "how to generate," NOT the connection |
| **Credentials** | the `credentials` domain owns ALL of it (resolve + CRUD + metadata) | un-inverted: logic lives in the feature, not a `_shared` drawer |
| **Roles** (chat/embed/rerank/summarize/imageEmbed/generateImage/agent) | one `resolveRole(role)` | all roles honor settings; buddy = the `agent` role |
| **Regex** | a regex *library* + scope junctions (global/character/preset), assembled + executed by placement | the world-info pattern — one store, attached at scopes |
| **World info** | one books/entries store + scope junctions | the canonical scope-junction pattern (regex reuses it) |
| **Descriptive labels** | tags (one namespace + per-entity junctions); proposed = a *status*, not a parallel store | analytics facets (genre/tone/keywords/themes) are a SEPARATE concept (discovery) |
| **Derived data** (digests/embeddings/themes) | an event-driven indexer (canon write → ContentChanged → coalesced workload) | free derived data runs on its own after an import: card embeddings always, chat-segment embeddings while Memory is on; paid derivation (memory digests) is offered behind the model-run confirm with its call count; no manual backfill scripts |
| **Turn economics** (tokens/cost/cache/timing rollups) | `stats` — the four per-owner rollups; ZERO vector tables | economics and semantics NEVER share tables: `stats` (economics) vs `discovery` (semantics) are disjoint + type-enforced (`stats-no-vector-tables` dep-cruiser rule + disjoint `messages` projections) |
| **Character cards** | the card IS a flat `characters` row (live identity + content); history = a standalone `character_snapshots` log that gates nothing | D28: no version table — git working-tree (`characters`) + commit-log (`character_snapshots`), browse + restore-in-place |

---

## 7. Static assurance

D333 retires the custom static gate catalog. Package resolution, TypeScript, dependency-cruiser and retained native lint remain. The architecture and product laws above still apply, but custom gate enforcement is no longer available.

## 8. Cross-cutting invariants (the laws no single file shows)

Rules that span multiple files or domains, enforced by convention and review, not one gate.
Promoted here from code comments so they are discoverable; the code stays the source of truth.

| Invariant | Home / detail |
| - | - |
| **ONE credential-mint site** — the brand-protected `ResolvedSecret` is constructed ONLY in the credentials substrate's mint; the brand is otherwise unforgeable. | `domain/credentials/substrate/mint-secret.ts` |
| **Notifications are durable-first** — INSERT the inbox row, THEN publish to the bus; a crash between the two never loses a delivered notification (the inbox is truth, the bus is best-effort). | `domain/notifications` |
| **`notifications.record` is the ONE recipient chokepoint** — every producer routes through it, and it REFUSES an agent-principal recipient (agents never hold an inbox). Enforced once, inherited by all producers. | `domain/notifications` |
| **Wire event unions are secret-unrepresentable** — the chat/notification event unions are closed discriminated unions of strict objects carrying only ids + literals; a secret/credential field is not expressible, so it cannot leak onto the bus. | `@orb/contracts/{chat,notifications}` |
| **Settings has one writer.** `domain/settings` owns its KV table and exposes an opaque, registered-prefix port; each tenant owns its values' meaning. | `domain/settings/persistence/kv.ts`; `SETTINGS_TENANT_PREFIXES` in `@orb/contracts/settings` |
| **`users`-read chokepoint + audit-ordering** — only `admin` + `sessions` read the `users` table (every admin read checks authorization first); audit ordering is check→write→audit, so a refused write leaves NO phantom audit row. | `domain/admin` |

## 9. Retained tooling

D333 retains Snap, design audit, motion tools, CPU capture and application development commands. Keep retained tools outside product packages. Keep shared infrastructure only when a retained consumer needs it. Do not restore the verify or gate framework.
