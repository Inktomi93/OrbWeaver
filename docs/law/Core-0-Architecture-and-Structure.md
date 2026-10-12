---
kind: law
status: active
updated: 2026-09-20
---

# Orbweaver — structure & enforcement (the constitution)

> **Status: authoritative.** The canonical structure for Orbweaver. Every rule below has a gate that
> goes RED when violated — enforced, not aspirational. Read this before creating any file.

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

Agents (the only contributors here) respect only what fails *early*. Push enforcement up the ladder:

| Tier | Mechanism | Fires | Agent-proof |
| - | - | - | - |
| 1 Resolve-time | package deps (undeclared import won't resolve) | as written | **yes — physics** |
| 2 Compile-time | types: branded types, exhaustive unions, `satisfies never` | `tsc` | strong |
| 3 Lint-time | dependency-cruiser, biome, `tooling/src/verify` | `check` (must be run) | weak |
| 4 Test-time | tests | later | weakest |

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
and are imported by a one-level relative path or by `#src/<path>`). `kit`/`contracts`/`db`/`server`/`client`
share ONE resolution map — `exports: { ".": "./src/index.ts", "./*": "./src/*/index.ts" }`,
`imports: { "#*": "./src/*/index.ts", "#src/*": "./src/*" }` —
that works at any depth and never needs editing: a module grows from one file to many with no change to
its import path or the map. (`ui` is the deliberate exception: an explicit per-primitive `exports` map —
the sealed surface is the export list itself; consumers import `@orb/ui/<primitive>` only.)
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

**Every feature is the same eight slots.** Learn one, know all. Scales from a small leaf like `tag`
to the 90+-file `chat` without changing shape.

```
domain/<feature>/
├── index.ts        FRONT DOOR — the only legal external import. Re-exports the public surface.
├── service.ts      COMPOSITION ROOT — wires verbs + injected deps. ZERO logic.
├── context.ts      DI BUNDLE — the `ctx` verbs close over (db + cross-feature ops, wired at root).
├── guard.ts        OPTIONAL 9th slot — the ratified `can()` authority seam (`requireAdmin`/`requireParticipant`):
│                   an I/O-touching, non-verb gate primitive. Allowed at ANY feature root (admin/chat/import).
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
| - | - |
| What does this feature *do*? | `contract/service.ts` (the interface) |
| Where's the `X` action? | `verbs/X.ts` |
| What shape does the client get? | `contract/views.ts` |
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
verb/substrate/subsystem. The allowlist lives in the `feature-structure` gate; anything else at the root
is RED.

---

## 5. Tests — one central tree that mirrors `src` directories

**The mirror rule:** a test for code in `packages/<pkg>/src/<dir>/` lives in `tests/<pkg>/<dir>/`. The directory is a
prefix swap (`packages/<pkg>/src/` ↔ `tests/<pkg>/`); the file name says the behaviour the test proves, not the
module it touches. One test file may cover several modules of its directory, and one module may be proved by several
files. `tests/tooling/<tool>/<dir>/` mirrors `tooling/src/<tool>/<dir>/` when that tool exists (§9); flat
`tests/tooling` files and directories with no tool twin are exempt. `support/` and `e2e/` mirror nothing. A
`.suite.*` kind asserts one property across many modules, so it may sit anywhere in its package tree. **Kind by
suffix**: `.test.ts` (unit) · `.int.test.ts` (integration/db) · `.contract.test.ts` (golden/surface) · `.test-d.ts`
(types) · `.suite.test.ts`/`.suite.int.test.ts` (cross-cutting property suites). The node lanes are Vitest
`test.projects` selected by suffix in ONE config. **Browser lanes are Playwright, not Vitest** (Vitest browser-mode
hangs): `.ct.tsx` (component, Playwright CT) · `.spec.ts` (e2e) — separate runners, not in the fast `check`.

**Presence is reach, not a path.** A file at a computed path proves only that the file exists. A module counts as
tested when a test, or a test-tree helper it imports, references one of the module's value exports through the
import graph, or when a test names the module in an `@subject <path>` header. `Spine-Testing.md` §5 owns which
modules must be reached and by which kind.

Why central plus a directory mirror over colocation: an agent can drop a colocated test anywhere, while the mirrored
directory gives every test one home a gate can check, and the src tree stays clean. The fixture doctrine is composed
`test.extend` (over `beforeEach`/`freshDb()`).

**The test kit is a package.** `tests/support` is the workspace package `@orb/testkit`. It sits above the cake
beside tooling (§9). Its exports map has three world subpaths and no root entry: `@orb/testkit/iso/<path>`,
`@orb/testkit/node/<path>` and `@orb/testkit/browser/<path>`. Each world directory compiles under its own world
program (`TEST_WORLD_PROGRAMS` in `tooling/src/floor/compiler/project-worlds.ts`). `test-helper-world-direction`
keeps the direction: iso imports no other world, node imports iso, browser imports both.

The kit holds only test-only seams: the frozen clock, seeded ids, factories, fixtures and runner doors, fakes,
in-memory stores and recorders. Product logic a test needs moves down to its owning layer and its public API, and
production and tests both call it there. A harness that wires one domain's internals lives beside that domain's
tests, not in the kit.

**Tests enter packages through their doors.** A test or the kit imports a package through its public entry
(`@orb/<package>` or a subpath its `exports` map declares) or its testing door. A testing door is a package module
that exports only test-only seams; none is built yet. A raw reach through the root `#<package>/*` imports map
(`#server/domain/chat/verbs/send.ts`) needs a reviewed grant (`tests-raw-package-reach`). The map lives in the root
`package.json`, so product code and the kit cannot resolve it. A relative climb into a package's `src` or, from
outside, into the kit is banned (`tests-package-subpath`).

Two named exceptions replace copies. The browser world re-exports the client door's registry lists from
`@orb/client/compose`, the reviewed exception in `client-compose-door-only`. The kit takes tRPC types from the
`@orb/server` root, the type-only `AppRouter` bridge the client uses (`testkit-app-router-bridge`).

> **Authority: `Spine-Testing.md`.** This section is the mirror rule and the `test-layout` gate only. The full
> policy — the tree (§2 there), the lanes/projects, presence (`test-reach`), the mock/determinism doctrine, the
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

## 7. The legibility gates (each keeps a rule true)

| Rule | Gate |
| - | - |
| Tiers flow one way; packages can't import undeclared deps | packages (resolver) + dep-cruiser backstop |
| Every feature is the identical 8-slot template | `feature-structure` |
| One verb per file, named for the verb | `verb-naming` |
| Exported feature types live only in `contract/`; `service.ts` interface always present | `types-in-contract` |
| Tests live in the mirrored source directory, kind by suffix | `test-layout` |
| Tests and the test kit enter a package through its declared entries; a raw reach carries a reviewed grant | `tests-package-subpath` · `tests-raw-package-reach` |
| **Verbs, routers, schemas and persistence are each reached by the test kind they owe** (presence by reach, not blanket coverage) | `test-reach` (§5 `spine/testing`) |
| **No ambient clock/random/unseeded-id under `tests/`** (inject the frozen clock + seeded ids) | `test-determinism` (§3 `spine/testing`) |
| `kit/` = pure primitives + isomorphic engines; **no `node:*`/domain/contracts/db import** (isomorphic npm OK) | `kit-purity` |
| **No exported `type`/`interface`/`z.object`/structural-cast outside `db` schema / `contracts` / a domain's `contract/` / `kit`** (incl. `context.ts` = explicit interface, not `ReturnType<>`) | `no-inline-types` (§7.4 spine) |
| **Every string-union axis has ONE importable union — no inline re-spelling** | `no-inline-union-redecl` (§7.5 spine) |
| **Every union dispatch is a mapped-type Record or `assertNever` — a new member fails `tsc`** | `tsc` itself — compile-time by construction, no gate file (house label: `exhaustive-dispatch`; §7.5 spine) |
| **`persistence/` is queries only — no `fetch`/`http`/`node:*` I/O** | `persistence-no-io` |
| **`persistence/` holds no module-scope `Map`/`Set` (in-memory state lives in a named subsystem)** | `persistence-no-in-memory-state` |
| **A parent-relative import climbs at most one directory; another module is entered through its front door** | `package-deep-import` · `package-subpath-crossing` |

When these hold, **the structure is the documentation**: a new feature is "copy the template,"
finding anything is a path derivation, and "where does this go?" has exactly one answer.

> Every row above is ENFORCED (dep-cruiser rules and the ts-morph gates in `tooling/src/verify/gates/`, plus
> `tsc` for the union-dispatch row, which has no gate file); `no-internal-mocks` stays advisory in `Spine-Testing.md §3`, not a hard gate.
> **This table is the constitution; the full live-gate catalog is `Core-Enforcement-Active-Gates.md`**
> (the single enforcement source of truth; a not-yet-buildable gate is a `docs/work` decision item, and a
> rejected gate proposal is a rejected ADR, for example `docs/adr/0220-rejected-neo-and-report-only-gates.md`).

## 8. Cross-cutting invariants (the laws no single file shows)

Rules that span multiple files or domains, enforced by convention and review, not one gate.
Promoted here from code comments so they are discoverable; the code stays the source of truth.

| Invariant | Home / detail |
| - | - |
| **ONE credential-mint site** — the brand-protected `ResolvedSecret` is constructed ONLY in the credentials substrate's mint; the brand is otherwise unforgeable. | `domain/credentials/substrate/mint-secret.ts` |
| **Notifications are durable-first** — INSERT the inbox row, THEN publish to the bus; a crash between the two never loses a delivered notification (the inbox is truth, the bus is best-effort). | `domain/notifications` |
| **`notifications.record` is the ONE recipient chokepoint** — every producer routes through it, and it REFUSES an agent-principal recipient (agents never hold an inbox). Enforced once, inherited by all producers. | `domain/notifications` |
| **Wire event unions are secret-unrepresentable** — the chat/notification event unions are closed discriminated unions of strict objects carrying only ids + literals; a secret/credential field is not expressible, so it cannot leak onto the bus. | `@orb/contracts/{chat,notifications}` |
| **Settings: one KV primitive, tenant-owned meaning** — `defineVersionedConfig` owns the versioned-blob mechanism; each settings tenant owns its blob's schema/meaning (settings never interprets a tenant blob). | `domain/settings`; detail: `Spine-Config-and-Serialization.md` |
| **`users`-read chokepoint + audit-ordering** — only `admin` + `sessions` + `entry` read the `users` table (every admin read gates first); audit ordering is check→write→audit, so a refused write leaves NO phantom audit row. | `domain/admin` (read side: `no-direct-users-read` gate) |

## 9. The tooling tree — `@orb/tooling`, ABOVE the cake

`tooling/` is a ROOT tree beside `packages/`, one private workspace package (`@orb/tooling`) holding the
entire durable tool fleet: the verification system, the rendered-surface instruments, the AST/codemod
engines, the operator CLIs, the dev-stack launchers. It is deliberately NOT inside `packages/`, so every
`packages/*` glob in the repo keeps meaning "the cake" unchanged and "tools sit above the cake" is legible
from the path alone.

**One-way glass.** `@orb/tooling` may import ANY app package; **nothing in `packages/**` may ever import
tooling.** Primary enforcement is resolver physics (no package declares the dep, so the import cannot
resolve); the `packages-no-tooling` dep-cruiser stanza is the deep-relative-escape backstop, the `ui-cake`
posture. The one surface still sealed AGAINST tooling is the provider FAMILIES
(`packages/inference/src/backends/<x>`, where the agent-sdk credential firewall lives) plus the package's
contract internals — `tooling-no-provider-families`. The package FRONT DOOR is legal; its families are
not.

**The test kit sits beside tooling.** `@orb/testkit` (`tests/support`, §5) is a package above the cake.
It may import any app package and tooling's floor, such as the contrast and timing engines. Nothing in
`packages/**` imports it (`not-to-test`), and tooling never imports it (`tooling-no-testkit`), so a tool's verdict
never depends on a test fixture.

**The five-slot tool template** (`tooling/src/<tool>/` — the domain template's tooling twin; learn one,
know all):

```
tooling/src/<tool>/
├── cli.ts        argv parse + dispatch ONLY (cap 200 lines; enters through floor/cli/run-tool.ts)
├── index.ts      programmatic API — tests import THIS; cli.ts consumes it
├── contract/     result shapes, config schemas, typed exit data
├── ops/          one file per command family / capability
└── lib/          tool-internal pure helpers
```

Two sanctioned departures: **`floor/`** is the ONE plumbing floor, role-subfoldered and never a flat drawer
(`browser/` holds the browser bootstrap, `compiler/` the ts-morph workspace loader, `artifacts/` the artifact
filer, `cli/` the exit contract, `process/` the process door, and so on), and it reaches UP to no tool
(`tooling-shared-floor`); **`gates/`** is a SIXTH slot inside `verify/` only — the fs-discovered gate
corpus is neither a command family nor tool-internal helpers, and it is cap-exempt. A bash-fronted tool
(`stack/`) carries its `.sh` entrypoints at the tool root under a typed exemption row, and its node half is
an `ops/*-entry.ts`, never a second `cli.ts`.

Revisioned non-TS runtime data lives under the owning tool's `ops/` or `lib/`, never at the tool root.
The exact DevTools frontend exception is `tooling/src/snap/lib/devtools-frontend/`: generated official
runtime bytes plus a closed hash/MIME/license manifest, owned and updated by Snap's maintainer subcommand.

**Every tool is reached by its pnpm script name, never by path** — the script names are the front door and
did not change when the fleet moved.

| Rule | Enforcer |
| - | - |
| top-level entries are tool DIRS; each carries `cli.ts` + `index.ts`; tool roots admit only the five slots | `tooling-slot-template` |
| a cross-tool import enters through the sibling's front door (`#<tool>`), never its `ops`/`lib`/`contract` | `tooling-front-door` (shape) + `tooling-internal-direction` + `tooling-cli-via-index` (resolved edges) |
| no file >450 lines; no `cli.ts` >200 (`verify/gates/**` cap-exempt) | `tooling-size` |
| ONE home per plumbing capability: the ts-morph project, the browser launch, the artifact dir, `process.exit`, the `cli.ts` `runTool` entry, the `node:child_process` door, the un-niced spawn census | `tooling-project-home` · `tooling-browser-door` · `tooling-artifact-path-home` · `tooling-artifact-run-slot` · `tooling-process-exit-home` · `tooling-cli-entry` · `tooling-child-process-door` (the `tooling-shared-plumbing` split, `Core-Tooling-Law.md` §4.4) |
| every instrument whose output is a VERDICT about the app owns a planted-defect proof AND a planted-absence proof | `tooling-instrument-proof` (keyed off `floor/instrument/instruments.ts`) |
| `packages/** ⇏ tooling/**`; provider families stay sealed | `packages-no-tooling` · `tooling-no-provider-families` |
| `packages/**` and `tooling/**` ⇏ the test kit | `not-to-test` · `tooling-no-testkit` |

**Two fleet-wide doors, both in `floor/cli/`.** `exit-contract.ts` owns `EXIT = { clean: 0, violations: 1,
toolError: 2, misuse: 3 }` and `run-tool.ts` is the exit-honesty runner every `cli.ts` enters through:
crash ≠ verdict (an uncaught throw becomes a hard `toolError`, never a silent 1), verdicts set
`process.exitCode` so stdout drains, and a verdict never downgrades. `proc.ts` is the ONE
`node:child_process` door — every niced spawn runs its child at `TOOLING_PRIORITY` (10, every OS),
because the box co-hosts other services; an un-niced spawn needs a cited census row stating why that priority is wrong
there.

**`scripts/` is the research zone, not a second tool tree** — explicitly throwaway probes, one-shot
inspectors, launcher shims, and operator scripts; KISS/YAGNI apply there and only there. It MAY import
`@orb/tooling` (the glass is one-way against `packages/`, not against research). Roster + retention
rationale: `scripts/README.md`. A research script that becomes essential for verification is promoted
into `tooling/src/<tool>/` under the template, original deleted — never a compat stub.

> The detail home is `Core-Tooling-Law.md` (the tool roster, the plumbing floor, the per-gate
> contracts, the coupled-site census, the move playbook) plus the code's own file headers. Gate authoring law:
> `../../tooling/src/verify/gates/GATE-AUTHORING.md`. Live gate catalog:
> `Core-Enforcement-Active-Gates.md`.
