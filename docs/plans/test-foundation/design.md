---
kind: plan
status: active
updated: 2026-10-12
---

# Tests on one harness and one code-facts engine

## Goal

Tests run the real product through one harness, and one code-facts engine serves codemods, `pnpm ast` and the verify gates. When the product changes, the tests and the gates change with it, because neither holds a second copy of the product or of the way code is read.

The aim is three things at once. Honest: a test proves what production does, never what a copy of it does. Small: tests stop outweighing the product, and the per-step cost of checks stops dominating agent time. Strict: a gate judges every rebuilt file at full strength with no waivers, and the type system carries as much of the proof as it can.

## Shape

### Order of work

1. **One code-facts engine.** Every reader of code lives once in `tooling/src/floor/code-facts/`, behind one fact store: built once per world program, updated incrementally from file changes, persisted, and queried by every caller. A caller reads facts; it never loads its own program, so concurrent `pnpm ast` verbs, gates and codemods share one load. `pnpm ast` verbs, codemods and gates call it. A reader in `tooling/src/ast/lib/`, `tooling/src/codemod/lib/` or `tooling/src/verify/lib/` that answers the same question is deleted. Start with drizzle query facts (tables, joins, columns, reads and writes) and shape identity, then symbol references and member reads, import doors and reach, liveness, tRPC wiring, ambient calls and casts. Each move proves `pnpm ast` output and gate findings unchanged.
2. **The server test harness.** A test composition root in `@orb/testkit/node` builds the real `entry/compose` graph and injects only the edges: database, clock, ids, random, the inference provider edge, the plugin host and the network. Production exposes those seams at the composition root. Domain harnesses are deleted as their suites move onto the root. Runs in parallel with step 1.
3. **Builders and corpus.** One builder per contract output and database row, built from contract defaults or by running production. One synthetic corpus from the seed tool, shared by e2e, CT, server tests and side-eye.
4. **The client CT door.** CTs mount through the real client compose. A story isolates only through the named exception.
5. **The legacy ledger.** One shrink-only list names every test file not yet rebuilt. Ledger files run in CI and nightly only, not in commit hooks or lane floors. Gates judge every file outside the ledger at full strictness. A file leaves the ledger when its cases, the regression cases first, are ported onto the new harness and verified; then it is deleted.
6. **Rebuild.** The e2e smoke matrix on the corpus first, then server suites by domain on the composition root, then CTs on the door, then the rest.

### Rules

- Not yet built: the engine, the composition root, the builders and corpus, and the ledger.
- A rebuilt test calls production through a public entry, builds data through a builder, and carries no fake that stands in for domain logic.
- A ported suite keeps every case of the file it replaces; the verifier checks the case list.
- Retrofit work on fake-heavy server harnesses stops; those rows move to the rebuild.
- Each test layer answers its own question. e2e owns user flows and every wire: router, auth, streams, the database and the plugin host. CT owns component behaviour, rendered measurement and states a real backend does not produce on demand; a CT never mounts a route to walk a flow. Server integration tests own domain logic and permissions on the composition root. Unit tests own pure logic in `@orb/kit` and `@orb/contracts`.

### Why the rebuild, not the retrofit

- Tests outweigh the product source, and almost none drive the real app end to end. The bulk of the server suites run on fake-heavy domain harnesses that copy compose closures and product rules.
- Agents spend a large share of their time waiting on checks: commit hooks, structure walks, typecheck, CT and node runs. The verify tree grew run slots, load guards, budget scaling, flake ledgers and hook bypasses only to make that cost survivable.
- Each retrofit row needed fixture repair and a fresh review, and the result still rode a harness the composition root deletes. Rows driven by legacy files stop; product moves that rebuilt tests call survive.
- The law already asks for this: Spine-Testing says the fixture is the composed production wiring with the model scripted, not a parallel test-only assembly. The tree never built it.

### Every check is one kind of thing

A check is a claim plus something observed. Checks differ by subject and by cadence, not by being "tests" or "verify".

| Subject | Examples | Character |
| - | - | - |
| The source text | types, world programs, dependency-cruiser, lint, structure gates, CPD | total: judges every file, never runs the app |
| The running product | unit, integration, contract, CT, e2e | sampled: proves the cases written |
| The checkers | tests under `tests/tooling`, planted controls, mutation | proves the instruments do not lie |

Cadence follows D317 and D307: commit runs Biome and typecheck; CI runs the core on every push; nightly runs full verification; weekly runs checker proof. `pnpm verify` is the scheduler over all of them.

The core never leaves CI: the compiler programs and world purity, package and tier direction, runner membership (every test is collected), contract and serde round-trips, schema and data safety (migrations, baseline, release and showcase versions), persistence and tenancy on a real database including the cross-tenant sweep, the e2e smoke matrix on the corpus, and lint.

A structure gate holds only a claim the type system and dependency-cruiser cannot express. A gate that repeats a type or an import rule is deleted.

### The engine: what merges where

Today `pnpm ast` reads code through `tooling/src/ast/lib/` and the gates read it through `tooling/src/floor/code-facts/` and `tooling/src/verify/lib/`. The two answer the same questions and drift, so a lane finds with `pnpm ast` what a gate misses. Each row below becomes one reader in the floor, called by the `pnpm ast` verb, the gates and the codemods.

| One home | Readers it replaces | Item |
| - | - | - |
| Drizzle query facts: tables, joins, columns, reads, writes | `ast/lib/columns.ts`, `column-reads.ts`; floor `drizzle-columns`, `drizzle-write-chain`; `verify/lib` `drizzle-client-call`, `tenancy-read`, `tenancy-join` and the json-column readers | 953 |
| Shape identity: copy, respell, assignability | `ast/lib/respell-shapes.ts`; `verify/lib` `contract-structural-copy`, `contract-derives-not-respells`, `inline-shape-declaration`, `baseui-derives-not-respells`; floor `assignability` | 954, then 966 |
| Symbol references and member reads | `ast/lib/resolve.ts`, `usage.ts`, the wiring member reader; floor `reference-fact`; `verify/lib` `symbol-reference`; the hand-written bracket readers | 955 |
| Import doors and reach | `pnpm ast` importers, reaches and flow; `verify/lib` test-reach, test-import-door, tooling-import-door, policy-production-reach | 956 |
| Codemods | codemod readers in `tooling/src/codemod/lib/` | 957 |
| Liveness | `pnpm ast` dead, orphans, testonly and chains; ledger-symbol-liveness, testid-liveness | not yet itemized |
| tRPC wiring | `pnpm ast` unwired, clientgap and viewgap; floor `trpc-doors` | not yet itemized |
| Ambient calls: clock, random, timers, environment | no-raw-clock, no-raw-random, test-determinism, platform-spellings, sole-env-reader | not yet itemized |
| Casts | no-loose-id-cast, no-mint-via-cast, no-test-fabrication, byte-check-cast | not yet itemized; 973 widens the id gates |

Gate families fold onto the shared readers:

- Type homes: no-inline-types, no-inline-domain-interface, no-inline-wire-interface, no-inline-package-interface, types-in-contract and contract-banned-shapes become one Spine-TypeScript section 7.4 gate driven by the type-home table.
- JSON columns: json-column-read-parsed, json-column-write-parity and open-json-column-key-parity become one JSON-column fact with three judgements.
- Copies: contract-structural-copy, contract-derives-not-respells, test-hand-shape and test-production-clone become one copy family over the shape reader, judged by population.

The fact store is built once per world program, updated from file changes and persisted. A `pnpm ast` verb that loads its own program is a defect: one such run held most of the box's memory. Item 965 measures the static tier on a standard hosted runner; the fix is the shared store, never a time or memory cap.

### Compose holds wiring only

`entry/compose` builds the graph. A decision that runs once while the graph is built, on config, mode or which dependencies exist, is wiring. A decision inside any function compose hands out (an op, a port method, a callback, a handler) runs per call on live data, so it is a rule and lives in its owning domain. Compose calls no drizzle query. The only exemption is the forward-if-set idiom for optional fields. Item 964 builds the gate and moves the rules; item 958 builds the test composition root on the result, so every rule is reachable from its domain.

### What carries over from the retrofit

- Product moved to its home: wire schemas into contracts, one home for the present-host read, kit helpers, exported production seams, rules shared by client and server in contracts or kit.
- The testkit package with its world subpaths, and the first builders and typed responders: the start of item 959.
- Gates and readers: the keyed waiver budget, tenancy through joins, the shared shape comparer and member reader: the first slices of items 953 to 955.
- The CT door, typed story ids and the shared width builder: the start of item 960.
- The seed and clone path for side-eye: part of the corpus.

Retrofits inside legacy test files (vanity aliases, casts, waiver bookkeeping, file splits) leave with those files.

### Each layer answers one question

| Layer | Owns | Never |
| - | - | - |
| e2e on the corpus | every user flow across surfaces and every wire: the router contract, auth, cookies, CSRF, streams, the real database and migrations, the plugin host, uploads | a component state it has to engineer into the server |
| CT | component and primitive behaviour; states a real backend does not produce on demand (error, loading, half-loaded, empty, very long content, races, slow responses, reconnects); rendered measurement (geometry, layout shift, contrast, accessible names, focus order, every viewport and theme) | a mounted route or the app shell walking a flow over stubbed calls |
| Server integration | domain logic and permissions, cross-tenant cases included, on the composition root | a fake that stands in for domain logic |
| Unit | pure logic in `@orb/kit` and `@orb/contracts` | I/O |

A CT stubs every wire, so a CT can stay green while the real wire is broken; only e2e proves the wire. A CT that walks a flow pays every CT cost (stub ratchets, the unfed-read ledger, the config-mirror gate, flake handling) to prove what e2e proves for real. Item 963 moves each flow-walking route and shell CT into an e2e case and deletes it. CTs mount through the compose door (960) with stubs from builders (959), so a stub cannot drift from the contract.

### How a rebuilt test is written

1. It calls production through a public entry: the router, a domain front door, a contract or kit export. It never copies a production function, query or rule.
2. It builds data through a builder or the corpus, so every value is one production can produce.
3. It takes its types from contracts and production; it declares no shape a lower package owns.
4. Clock, ids and random come injected from the composition root, so the result is deterministic without fake timers.
5. It fakes only an edge: the database driver, the provider, the plugin host, the network.
6. It asserts behaviour a user or a caller sees, never a literal it built itself and never help or copy text.
7. A port keeps every case of the file it replaces, regression cases first, and a production mutant turns it red.

### Tests mirror directories, not files

By owner ruling (item 899), tests live in the directory that mirrors their feature and are named for the behaviour they prove; there is no one-to-one file mirror. A module has a test when a test reaches it through the import graph or names it in an `@subject` header; a mock or a type-only import is not reach. `test-layout` checks the directory and `test-reach` checks presence, and both stay in the core. Rebuilt tests drive the product through public entries, so `test-reach` credits the module a test drives through that entry, never every module the composed graph happens to import.

## Rejected

Moving the tests out of the repository: it drops the regression net for the whole rebuild. Per-gate time or memory caps: cost is a design defect fixed by the shared fact store, not a limit. Retrofitting fake-heavy server harnesses row by row: each row needs fixture repair and a fresh review.

## Coupled sites

The test-mirror plan: item 890 server harness rows move here, item 901 hosts the harness, items 887 and 898 feed the corpus and the smoke matrix, item 952 burns down against the ledger. Raw package reaches and over-cap test files leave with the legacy files the ledger retires; rebuilt tests enter packages through public entries by construction. `docs/law/Spine-Testing.md` sections 2 and 10, `docs/law/Core-0-Architecture-and-Structure.md` section 5, and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` section 4 for inner-loop membership.

## Test plan

Each engine move diffs `pnpm ast` output and gate findings before and after. Each ported suite shows the same case list and a production mutant that turns it red. The ledger gate refuses a new entry and a returning file.
