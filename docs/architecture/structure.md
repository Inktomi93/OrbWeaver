# Orbweaver — structure & enforcement (the constitution)

> **Status: planning.** This is the canonical structure for Orbweaver — the ground-up remake of
> neo-tavern. It is written to be *enforced*, not aspirational: every rule below has (or will have) a
> gate that goes RED when violated. Read this before creating any file.

## Why a remake

neo-tavern's *architecture* was sound (clean layer cake, machine-enforced) but three things rotted in
place and are cheaper to rebuild than retrofit:

- **`domain/_shared` became a junk drawer** — primitives, cross-feature *services* (credentials,
  user-settings, role-clients), leaked feature-internals, and a misfiled driver concern all dumped
  together because there was no clean home for cross-cutting code.
- **Concepts fragmented across stores** — "a connection," "descriptive labels," "active persona" each
  had 2–6 homes with no partitioning rule for what lives where.
- **The frontend leaned on inherited SillyTavern patterns** that bit back.

Orbweaver keeps what worked (the **per-feature template** — it's genuinely good) and fixes the rest by
**making the structure self-documenting and the boundaries physics, not policy.**

The north star: **you can figure out where anything lives, and what may import what, from the file
tree alone.** Mental load drops because you *derive* the layout instead of *remembering* it.

---

## 1. The four locked principles

1. **Boundaries are physics (workspaces), not lint.** The app is split into pnpm workspace packages;
   a package cannot import what isn't in its declared deps — the layer cake is enforced by the module
   resolver, the earliest possible tier. dependency-cruiser is a *backstop* for intra-package rules,
   not the primary fence.
2. **`#` intra-package, packages cross-package, zero `paths` aliases.** Native Node subpath imports
   (`#kit`, `#domain`, …) inside a package; workspace package names across packages. **No tsconfig
   `paths`** anywhere (that was neo-tavern's `@/` shadcn tax). One resolution model, all native.
3. **Name by role; no `_` junk drawers.** Folders are named for what they are (`foundation`, `infra`,
   `kit`, `contract`). `kit` = pure primitives ONLY. There is **no `_shared` services drawer** —
   cross-feature *services* are their own feature; cross-feature *primitives* are `kit`.
4. **Tests are one central tree mirroring `src` 1:1.** Not colocated. The test path is a mechanical
   prefix-swap of the src path; kind is a filename suffix. More work, but agent-enforceable and the
   src tree stays clean.

### Working rule — "unwired ≠ worthless"

When porting from neo-tavern, **"no current consumer / dead / unwired" is a prompt to evaluate intent,
not a delete signal.** Much of it is **SillyTavern-inherited or scaffolded intent that just never got
wired** (e.g. `runOnEdit`, the non-chat `roleDefaults`, `chat_participants.activePersonaId`, the
declared-but-never-emitted `WiBusEvent` entry variants). Default to **understand the intent → wire or modernize it**; delete only when it's
genuinely superseded residue (a per-item judgment, never a reflex). Auto-deleting on "no consumer" throws
away half-built features the remake actually wants.

Agents (the only contributors here) respect only what fails *early*. Push enforcement up the ladder:

| Tier | Mechanism | Fires | Agent-proof |
|---|---|---|---|
| 1 Resolve-time | package deps (undeclared import won't resolve) | as written | **yes — physics** |
| 2 Compile-time | types: branded types, exhaustive unions, `satisfies never` | `tsc` | strong |
| 3 Lint-time | dependency-cruiser, biome, `scripts/check` | `check` (must be run) | weak |
| 4 Test-time | tests | later | weakest |

The cake → tier 1 (packages). Invariants → tier 2 (types). dependency-cruiser → tier 3 backstop only.

---

## 2. Packages — the tier-1 cake

```
packages/
  kit/        @orb/kit        pure primitives + engines; isomorphic (browser-safe); no node:*/domain/I/O — isomorphic npm deps (zod, luxon…) OK
  contracts/  @orb/contracts  cross-boundary types + zod schemas (the wire)     → deps: kit
  db/         @orb/db         drizzle schema + libsql client + migrations         → deps: kit, contracts
  server/     @orb/server     business logic                                      → deps: kit, contracts, db
  client/     @orb/client     UI                                                  → deps: kit, contracts, server(type-only)
```

`workspace:*` makes cross-package refs explicit; a package importing an undeclared package fails to
resolve. (Package scope name **DECIDED: `@orb/*`** — scoped, native via pnpm, no alias tooling; see Open
decisions + `DECISIONS-LEDGER §0`. The shadcn `@/` path-alias is NOT carried over.)

**`kit` holds the pure ENGINES (not just tiny utils):** the **macro engine** (`kit/macro` — AST/parse +
resolve a template against a `MacroContext`) and the **regex engine** (`kit/regex` — compile + apply +
the `node:vm` ReDoS guard + the macro-substitute hook; depends on `kit/macro`). They are pure,
zero-dep, cross-boundary transform engines with **multiple consumers — server assembly AND client
render AND each other** — so they must NOT live in `chat`. Critical distinction, **engine vs data**:
the engine is `kit`; the *data* it runs on comes from domains — the `MacroContext` *values*
(`{{char}}`/`{{user}}`/`{{memory}}`/`{{group}}`, assembled per-turn by chat/connection/memory) and the
regex *script library* (the world-info-style scoped store of user scripts, its own feature). One engine,
two call sites (server assemble + client render) → guaranteed-identical behavior. The
name-leak/speaker-label handling (`stripSelfSpeakerLabel`, `parseSpeakerSpans`) is also `kit` — it runs
at both persist and render. `chat` is a *consumer* of these engines, never their home.

TS project references are **not** used (recommended only at 100s-of-projects scale); ~5 packages
type-check fine without the complexity.

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
└── kit/              server-only PURE primitives (zero I/O, zero domain)
```

Changes vs neo-tavern: `foundation`/`infra`/`transport`/`entry` are **named tiers** (were loose under
`server/`), so the cake is visible in the tree; `kit/` gives server-only primitives a real home;
**`domain/_shared` is deleted** — its contents are redistributed (primitives → `kit`; services →
their own feature; feature-internals → home; rate-limit → transport).

---

## 4. The per-feature template — the legibility engine

**Every feature is the same eight slots.** Learn one, know all. (Carried over from neo-tavern, where
it already proved itself across features from `persona` (7 files) to `corpus` (40+).)

```
domain/<feature>/
├── index.ts        FRONT DOOR — the only legal external import. Re-exports the public surface.
├── service.ts      COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts      DI BUNDLE — the `ctx` verbs close over (db + cross-feature ops, wired at root).
├── contract/       THE TYPED SURFACE — the feature's "API README, as code" (no logic):
│   ├── service.ts      interface <Feature>Service   ← read THIS to know everything the feature does
│   ├── params.ts       every verb's *Params
│   ├── results.ts      every verb's *Result
│   ├── views.ts        read-model shapes (what the client receives)
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
|---|---|
| What does this feature *do*? | `contract/service.ts` (the interface) |
| Where's the `X` action? | `verbs/X.ts` |
| What shape does the client get? | `contract/views.ts` |
| Where's the DB? | `persistence/` |
| Where's the pure logic? | `substrate/` or the named `<subsystem>/` |
| How do I enter from outside? | `index.ts` (only) |
| Who wires it? | `service.ts` |

**Cross-feature dependency:** never a sideways import. A verb declares the *type* of an injected
cross-feature op in its `contract`; the runtime op is wired at the composition root (`service.ts` /
`context.ts`). (Same pattern neo-tavern used for the workloads runner-env.)

---

## 5. Tests — one central tree, mirroring `src` 1:1

```
tests/
├── support/         shared test substrate (NOT a mirror)
│   ├── fixtures.ts      the composed `test` (test.extend → db, clock, ids, seeded users, services)
│   ├── factories/       entity builders (makeX pure + seedX persisted)
│   ├── db.ts            freshDb / seed helpers (libSQL :memory:)
│   ├── clock.ts         frozen clock — determinism
│   └── ids.ts           seeded typeid generator — determinism
├── kit/             mirrors packages/kit/src/        (.test.ts · .test-d.ts)
├── contracts/       mirrors packages/contracts/src/  (.contract.test.ts · .test-d.ts)
├── db/              mirrors packages/db/src/         (.int.test.ts)
├── server/          mirrors packages/server/src/     (all node suffixes; .parity.test.ts at the validated module)
│   └── domain/<feature>/<file>.<kind>.test.ts   ↔  packages/server/src/domain/<feature>/<file>.ts
├── client/          mirrors features/                (.ct.tsx = Playwright CT · .test.ts = node pure-logic)
└── e2e/             full-stack Playwright .spec.ts   (NOT a mirror — spans the whole app)
```

**The mirror rule (one line, fully enforceable):** a test for `packages/<pkg>/src/<path>.ts` lives at
`tests/<pkg>/<path>.<kind>.test.ts`. **Path = prefix-swap** (`packages/X/src/` ↔ `tests/X/`); the gate
exempts the two non-mirror trees `support/` + `e2e/`. **Kind by suffix**: `.test.ts` (unit) ·
`.int.test.ts` (integration/db) · `.contract.test.ts` (golden/surface) · `.test-d.ts` (types) ·
`.parity.test.ts` (differential oracle — slow, opt-in). These **node** lanes are Vitest `test.projects`
selected by suffix in ONE config (`test.projects` is the modern "workspace"). **Browser lanes are
Playwright, not Vitest** (Vitest browser-mode hangs): `.ct.tsx` (component, Playwright CT) · `.spec.ts`
(e2e) — separate runners, not in the fast `check`. Full policy: `spine/testing.md`.

Why central+mirror over colocation: an agent can drop a colocated test anywhere; the mirror + a
path-gate means a test **must** land at the computed path or `check` goes red, and the src tree stays
clean. The fixture doctrine is composed `test.extend` (over `beforeEach`/`freshDb()`).

> **Authority: `spine/testing.md`.** This section is the layout + `test-mirror` gate only. The full
> testing policy — the four kinds as Vitest projects (`.test`/`.int.test`/`.contract.test`/`.parity.test`),
> the `test-presence` rule (§5 there), the mock/determinism doctrine, the factory contract, and the homes
> for the oracle + the ~150 esoterica + memory's 6 semantics — lives in that spine doc. (Committed:
> `reports/DECISIONS-LEDGER.md §6`.)

---

## 6. The partitioning rule — what concept lives where

The neo-tavern crunch was concepts with no single home. Orbweaver fixes the worst offenders up front:

| Concept | Home | Notes |
|---|---|---|
| **Connection** (api/source/model/providerRouting) | its own selection in user settings (a real `connection` domain owns resolution) | separate from the preset; one resolver; provider vocab is one derived map (runner/family derived from source+protocol) |
| **Generation config** (params/customParameters/sections) | the **preset** | preset = "how to generate," NOT the connection |
| **Credentials** | the `credentials` domain owns ALL of it (resolve + CRUD + metadata) | un-inverted: logic lives in the feature, not a `_shared` drawer |
| **Roles** (chat/embed/rerank/summarize/imageEmbed/generateImage/agent) | one `resolveRoleConnection(role)` | all roles honor settings; buddy = the `agent` role |
| **Regex** | a regex *library* + scope junctions (global/character/preset), assembled + executed by placement | the world-info pattern — one store, attached at scopes |
| **World info** | one books/entries store + scope junctions | already the right shape in neo-tavern; keep it |
| **Descriptive labels** | tags (one namespace + per-entity junctions); proposed = a *status*, not a parallel store | analytics facets (genre/tone/keywords/themes) are a SEPARATE concept (corpus) |
| **Derived data** (digests/embeddings/themes) | an event-driven indexer (canon write → ContentChanged → coalesced workload) | "import just works"; no manual backfill scripts |
| **Character versions** | reference live identity; versions = restorable history | de-pinned; no cv-pins woven through |

---

## 7. The legibility gates (each keeps a rule true)

| Rule | Gate |
|---|---|
| Tiers flow one way; packages can't import undeclared deps | packages (resolver) + dep-cruiser backstop |
| Every feature is the identical 8-slot template | `feature-structure` |
| One verb per file, named for the verb | `verb-naming` |
| Exported feature types live only in `contract/`; `service.ts` interface always present | `types-in-contract` |
| Tests mirror src 1:1 (prefix-swap), kind by suffix | `test-mirror` |
| **Verbs/schemas/persistence each have their required test** (presence, not blanket coverage) | `test-presence` (§5 `spine/testing`) |
| **No ambient clock/random/unseeded-id under `tests/`** (inject the frozen clock + seeded ids) | `test-determinism` (§3 `spine/testing`) |
| `kit/` = pure primitives + isomorphic engines; **no `node:*`/domain/contracts/db import** (isomorphic npm OK) | `kit-purity` |
| **No exported `type`/`interface`/`z.object`/structural-cast outside `db` schema / `contracts` / a domain's `contract/` / `kit`** (incl. `context.ts` = explicit interface, not `ReturnType<>`) | `no-inline-types` (§7.4 spine) |
| **Every string-union axis has ONE importable union — no inline re-spelling** | `no-inline-union-redecl` (§7.5 spine) |
| **Every union dispatch is a mapped-type Record or `assertNever` — a new member fails `tsc`** | `exhaustive-dispatch` (§7.5 spine) |
| **`persistence/` is queries only — no `fetch`/`http`/`node:*` I/O** | `persistence-no-io` |
| **`persistence/` holds no module-scope `Map`/`Set` (in-memory state lives in a named subsystem)** | `persistence-no-in-memory-state` |

When these hold, **the structure is the documentation**: a new feature is "copy the template,"
finding anything is a path derivation, and "where does this go?" has exactly one answer.

> The first six are the original constitution; the next five were promoted from the spine docs
> (`spine/types-and-schemas.md` §7.4, `spine/string-union-dispatch.md` §7.5, the persistence rules in
> `domains/credentials.md`) during the 2026-06-25 reconciliation; `test-presence` + `test-determinism`
> were added with `spine/testing.md` (2026-06-26). They are gate *candidates* — implemented as
> dep-cruiser/biome rules + `tsc` patterns at scaffold time. (`no-internal-mocks` stays advisory in
> `spine/testing.md §3`, not a hard gate.)

---

## Open decisions (committed defaults; the irreducibly-build-time ones flagged)

- **Package scope name — DECIDED: `@orb/*`** (scoped). Standard, unambiguous, native via pnpm; the
  unscoped `orb-*` alternative buys nothing. (The full decision record is `reports/DECISIONS-LEDGER.md`.)
- **shadcn `@/` — DECIDED: convert copied components to `#`** (we own them; one resolution model, no
  `paths` aliases, per principle #2). No `@/` carried into orbweaver.
- **UI headless engine — DEFERRED to client scaffold (recommended: Base UI, the radix team's successor).**
  Criterion: own the trivial atoms (button/badge/label/input) regardless; pick the engine only for the
  hard ~10 (dialog/select/popover/dropdown/tooltip/tabs/…). This is a `client`-rebuild call, made when
  the client package is stood up — it does not gate the kit→contracts→db→server build.
- **Stack version pins — DEFERRED to scaffold (criterion: 2026-latest stable of Node/TS/Hono/Drizzle/
  tRPC, pinned in the workspace at package-creation).** Irreducibly a scaffold-time act (you pin what's
  current when you `pnpm init`), not a design ambiguity.
