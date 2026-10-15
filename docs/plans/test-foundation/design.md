---
kind: plan
status: active
updated: 2026-10-15
---

# Tests on one harness and one code-facts engine

## Goal

Tests run the real product through one harness, and one code-facts engine serves codemods, `pnpm ast` and the verify gates. When the product changes, the tests and the gates change with it, because neither holds a second copy of the product or of the way code is read.

The aim is three things at once. Honest: a test proves what production does, never what a copy of it does. Small: tests stop outweighing the product, and the per-step cost of checks stops dominating agent time. Strict: a gate judges every rebuilt file at full strength with no waivers, and the type system carries as much of the proof as it can.

## Shape

### Order of work

This plan owns execution order. The [test-mirror inventory](../test-mirror/design.md) supplies migration candidates, not a competing retrofit queue. Work items own current assignments, blockers and verification evidence; temporary handoffs do not establish completion.

Read the [side-plan priority note](../inference-flow/design.md#reading-priority) before using inference-flow to choose work or report program status.

### Execution sequence

| Phase | Work | Exit condition |
| - | - | - |
| Composition boundary | Queries and per-call rules live in domains; entry wires their graph. | The complete compose-policy population passes without waivers; legacy remains regression evidence only. |
| Shared readers | Start Drizzle facts (953), then shape identity, references, import reach and codemods (954 to 957). | Consumers share the floor reader and preserve findings or record proven corrections. |
| Real harness | Build the server composition root (958) on the cleaned graph; continue readers in independent files. | Every external edge is injectable and a complete domain case set proves the real graph. |
| Test inputs and mounting | Finish builders/corpus (959) and the client compose door (960). | Test data derives from production and CT wiring derives from client composition. |
| Replacement suites | Corpus-backed e2e smoke, server domains, component CTs, then remaining suites. | Replacement preserves meaningful cases, catches a production defect and deletes the corresponding legacy harness. |

Discovery every-owner authority is integrated. Remaining owner-read adjudication and type homes (981) are production work. Schedule owner-specific batches without waiting for legacy suite polish. A required seam or correctness defect blocks its dependent harness work.

Contract derivation, stored-value recovery, wire-boundary admission, runtime funding and identity enforcement are integrated with native controls and security review. Server-root acceptance is established; complete corpus qualification remains open. A completed prerequisite does not close its parent program. Complete required production fixes before dependent corpus qualification.

### Foundation boundaries

The legacy folder, maintained lint migration, explicit package exports, native integer migration and domain-owned compose rules are implemented. Complete compose-policy qualification passes without waivers. HTTP, auth and rate-policy owners remain at their sanctioned entry homes. This does not establish complete foundations or a green application verdict. The [main findings item](../../work/0977-main-reds-and-loose-ends-from-the-test.md) owns remaining reds. Exact legacy filename admission is monotonic; strict reach excludes legacy evidence. Remaining probes keep their harness dependencies and case lists.

Testkit exists as a world-split package. The client mounting foundation delegates to production composition and supports named primitive isolation. The server root delegates to production composition. Native HTTP completion joins ordinary peer disconnects and retains unexpected stream faults. The selected notification lifecycle and capsule clone controls pass. Shared facts and builders/corpus remain work. Selected canonical row-builder chains are qualified. Wire-output boundary accounting is complete; supplier qualification and shared corpus adoption remain open. Tooling tests stay outside the application legacy migration; existing e2e files do not establish corpus adoption.

The synthetic corpus is committed under Node testkit support. Selected native clone, server continuation, smoke, component and isolated-stage consumers pass without private directory selectors. Component media uses private clones and native viewer admission; production owns blob authorization, variants and headers. Node replay state preserves settled time and ID continuation; browser consumers receive only portable wire and HTTP bytes. Producer timing remains marginal under its current guard. Remaining layer and matrix adoption stay open under item 959. These selected cases do not authorize general legacy ports.

SDK execution joins native Query and observed direct-child completion. It does not promise a sandbox for arbitrary trusted executables or universal descendant containment. This scope does not imply a shipped-CLI defect.

### Architecture workstreams

1. **One code-facts engine.** Every reader of code lives once in `tooling/src/floor/code-facts/`, behind one fact store: built once per world program, updated incrementally from file changes, persisted, and queried by every caller. A caller reads facts; it never loads its own program, so concurrent `pnpm ast` verbs, gates and codemods share one load. `pnpm ast` verbs, codemods and gates call it. A reader in `tooling/src/ast/lib/`, `tooling/src/codemod/lib/` or `tooling/src/verify/lib/` that answers the same question is deleted. Start with drizzle query facts (tables, joins, columns, reads and writes) and shape identity, then symbol references and member reads, import doors and reach, liveness, tRPC wiring, ambient calls and casts. Each move proves `pnpm ast` output and gate findings unchanged.
2. **The server test harness.** A test composition root in `@orb/testkit/node` builds the real `entry/compose` graph and injects only the edges: database, clock, ids, random, the inference provider edge, the plugin host and the network. Production exposes those seams at the composition root. Domain harnesses are deleted as their suites move onto the root. Runs in parallel with step 1.
3. **Builders and corpus.** One builder per contract output and database row, built from contract defaults or by running production. One synthetic corpus from the seed tool, shared by e2e, CT, server tests and side-eye.
4. **The client CT door.** CTs mount through the real client compose. A story isolates only through the named exception.
5. **The legacy folder.** Every test not yet rebuilt moves to a legacy folder under `tests/` at its same mirror path; the folder is the ledger. It runs in CI as its own project, never in commit hooks, lane floors or the strict gates, and reaches package internals through the root raw-reach map without grants. A domain's legacy folder is deleted when its rebuilt suite carries every case.
6. **Rebuild.** The e2e smoke matrix on the corpus first, then server suites by domain on the composition root, then CTs on the door, then the rest.

### Why this order

The hard parts come first because they decide the shape of every rebuilt test. A test written before its foundation exists gets written twice. Build all of these before any suite is ported. The engine and the harness run in parallel, as the order of work says:

- The compose cleanup (964), because the composition root can only reach a rule that lives in its domain.
- The server test composition root with every edge injectable (958): database, clock, ids, random, timers, the provider edge, the plugin host and the network. Production exposes each seam; a seam missing here forces a fake back into every test.
- One builder per shape and the corpus (959), because every layer draws its data from them.
- The CT door (960), because every CT mounts through it.
- The engine readers (953 to 957), because the strict gates that judge rebuilt files read code through them.
- The legacy folder (961), because it lets rebuilt files run strict while legacy files keep running in CI, and it lets item 983 narrow the exports maps without breaking them.

Dependencies that hold the order: the server harness uses clean production composition; 966 waits on 954. A structural move such as a file split runs after content lanes in the same files, never beside them.

Then the rebuild, cheapest proof first: the e2e smoke matrix on the corpus, which proves the app works end to end; server suites by domain on the composition root; CTs on the door with builder stubs; the rest. Tooling tests stay as they are; they test the tools, not the product.

### Rules

- Repair product, security and checker defects. Preserve useful legacy cases for replacement; stop fixture polish, copied-harness repair and waiver bookkeeping as independent deliverables.
- Rejudge waivers and grants against their actual subjects. Their existence does not establish authority or justify weakening enforcement.
- Recover unfinished production branches by coherent current-tree changes, not wholesale stale merges. The work items for contract derivation and stored-value parsing own their security blockers.
- Complete engine and builders/corpus qualification remains open; source integration alone is not completion.
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
| Shape identity: copy, respell, assignability | AST exact/near adapters and verify copy, type-home, Base UI and fabrication policies share floor field, declaration, factory-origin, derivation and assignability readers. Function-clone syntax retains its canonical reader. | 954, then 966 |
| Symbol references and member reads | `ast/lib/resolve.ts`, `usage.ts`, the wiring member reader; floor `reference-fact`; `verify/lib` `symbol-reference`; the hand-written bracket readers | 955 |
| Import doors and reach | `pnpm ast` importers, reaches and flow; `verify/lib` test-reach, test-import-door, tooling-import-door, policy-production-reach | 956 |
| Codemods | codemod readers in `tooling/src/codemod/lib/` | 957 |
| Liveness | `pnpm ast` dead, orphans, testonly and chains; ledger-symbol-liveness, testid-liveness | not yet itemized |
| tRPC wiring | `pnpm ast` unwired, clientgap and viewgap; floor `trpc-doors` | not yet itemized |
| Ambient calls: clock, random, timers, environment | no-raw-clock, no-raw-random, test-determinism, platform-spellings, sole-env-reader | not yet itemized |
| Casts | no-loose-id-cast, no-mint-via-cast, no-test-fabrication, byte-check-cast | not yet itemized; 973 widens the id gates |

Gate families fold onto the shared readers:

- Type homes: the inline alias and interface policies converge on one Spine-TypeScript section 7.4 placement judgment and home table. Native restrictions own covered syntax. Service-presence and ledger field bans retain separate hard enforcement until successor coverage is proved. Component-owned APIs stay beside their components; lower-owned data stays derived.
- JSON columns: json-column-read-parsed, json-column-write-parity and open-json-column-key-parity become one JSON-column fact with three judgements.
- Copies: contract-structural-copy, contract-derives-not-respells, test-hand-shape and test-production-clone become one copy family over the shape reader, judged by population.

The fact store is built once per world program, updated from file changes and persisted. A `pnpm ast` verb that loads its own program is a defect: one such run held most of the box's memory. Item 965 measures the static tier on a standard hosted runner; the fix is the shared store, never a time or memory cap.

### Shared semantic inventory store

The [native inventory store item](../../work/1002-persist-native-semantic-inventory-facts-and-release-world.md) owns qualification. Persisted facts live in `tooling/src/floor/code-facts/` and native worker lifecycle in `tooling/src/floor/compiler/`. Existing inventory collectors retain their judgments and query shared compiler facts. Consumer routing, bounded persistence and lazy readers are implemented. Current reuse is partition-level; complete current-demand replay and consumer equivalence remain open. Unported typed readers still require their native programs.

Verifier native-world delivery remains incomplete. Generated token ownership uses actual producer output and lazy native Node/browser views. Native value-cast, ID-brand and runtime-export facts reach their verifier consumers through shared closed demand without reference extraction. Plugin guards and the client assertion audit receive native callable declarations and helper bodies through exact call-span demand. Storage upgrades preserve committed generations. Computed-key normalization and other typed families still require migration; the ordinary syntax workspace does not establish native world ownership. The [typed verifier delivery item](../../work/1027-deliver-verifier-typed-reads-through-native-world-owners.md) owns remaining migration through shared floor and compiler owners. Keep native interpretations separate, refuse missing contexts and preserve worker release instead of retaining every world.

Each partition belongs to a native compiler program from `compiler-programs.ts`. Preserve its options, roots, resolved closure and unresolved outcomes. Key declarations by canonical file and source span, with the program identity beside the fact. Store export origins, module targets, binding declarations and physical references. Preserve aliases, type/value distinctions, static dynamic-import members and namespace consumption. Keep native interpretations world-specific, including ambiguous and unresolved results. Physical reference spans may deduplicate body locations, but never select a typed meaning. Resolve imported export origins in the importing world, not the target file's primary world. Record product, tooling and test consumers separately.

Use the native SQLite platform for committed facts. A writer compares input versions under the publication lock before starting a worker. Reuse unchanged partitions without loading a compiler program. Build affected partitions through native programs, not through combined compiler options. The worker writes its partition and exits before publication, releasing its program. Recheck source, config, package-resolution and dependency versions after worker exit, immediately before publication. Discard a partition whose inputs changed during extraction. Publish complete partitions atomically; concurrent readers see a committed generation, never a partial build. Competing writers recheck the committed version before starting work.

Track source, config, package-resolution and dependency inputs with content versions. Changed inputs invalidate their affected native partitions. Added files and failed module lookups also participate in invalidation. Reconcile removed declarations and references when publishing an update. Cross-world reference and export unions demand one input snapshot for every participating world. Publish their generation together only after every demanded partition passes the final input check. Readers pin that generation; they never combine independently published old and new partitions. A failed worker leaves the previous generation intact and supplies no current verdict.

Keep transaction overlays separate from committed facts. Derive their roots from the compiler overlay and their content from the transaction filesystem. Changed overlay content selects new facts; it never changes the repository generation. Discard overlay partitions when their transaction ends.

The store-backed inventory corpus is a separate syntax carrier over the complete authored-root inventory. Its readers query native facts explicitly. Keep the existing native `SourceCorpus` contract, including browser-native `getType`, for consumers not yet ported. Do not give those consumers a syntax carrier with synthetic compiler options.

Contextual sharing, optional invocation and native resource registration pass bounded controls and independent review. The current actual query reaches its deadline without a target verdict. Item 1002 owns proof-obligation cost diagnosis, target qualification and dependent replay order. Complete store qualification remains open.

| Consumer home | Planned shared-store migration |
| - | - |
| `tooling/src/ast/lib/scope.ts`, `tooling/src/ast/lib/keys.ts` | Own exports and exposed origin sets |
| `tooling/src/floor/code-facts/module-target.ts` | Native dynamic-import and relative module targets; preserve consumer-specific admission |
| `tooling/src/ast/lib/liveness.ts`, `tooling/src/ast/lib/edges.ts` | Import targets, export origins and binding identity; keep existing consumption judgments |
| `tooling/src/ast/ops/apisurface.ts` | Package consumption facts; keep classification |
| `tooling/src/ast/ops/swallowed.ts` | Namespace binding identity; keep member consumption and refusal behavior |
| `tooling/src/ast/lib/tooling-entries.ts` | Checked witness origins and references; keep detached-witness refusal |
| `tooling/src/floor/compiler/ts-workspace.ts` | Stored physical-reference queries; keep explicit native views |
| `tooling/src/floor/code-facts/reference-fact.ts` | Stored export origins through the existing public reader |
| `tooling/src/ast/index.ts`, `tooling/src/ast/lib/emit.ts`, `tooling/src/ast/cli.ts` | Explicit store-backed inventory routing; unported typed verbs keep native views |

`dead` and `typeonly` keep their existing judgments and read references through the floor. Codemod overlays use the same store contract without publishing transaction facts. Other typed readers remain native until their family moves.

Prove native world differences, alias and dynamic-import identity, complete population and separated consumer classes through bounded controls. Prove change invalidation, atomic publication, worker release and reuse by concurrent readers. Change inputs during extraction and prove publication refuses them. Read during a cross-world update and prove readers never receive a mixed generation. Compare existing collector output on the same controls. Replay the frozen inventory only after these controls and the consumer migration pass review. Record peak memory during that replay; a heap limit is not a measurement.

### Gates move to the tool that already does the job

Maintained tools own every rule they can express. Replace custom gates about names, imports, globals, JSX elements or syntax with native configuration. Needing types does not justify a custom gate when an installed typed rule covers the claim.

| Claim | Preferred owner |
| - | - |
| React hooks, compiler correctness, effects, browser-resource cleanup and accessibility | Maintained React, hooks, browser API and accessibility ESLint plugins |
| Query-client usage, schema syntax and database write syntax | Installed query, Zod and Drizzle ESLint rules, within their actual coverage |
| Restricted names, globals, APIs, imports and JSX syntax | Biome or native ESLint restrictions |
| Resolved package doors, tier direction and forbidden import reach | Dependency-cruiser and package resolution |

Read the [enforced inventory](../../law/Core-Enforcement-Active-Gates.md) and each candidate implementation before choosing its replacement. Check installed rule behavior and effective configuration, not similar rule names. Move the covered claim and delete its custom implementation, registration and redundant proofs in the same assignment. For partial coverage, retain only the unmatched semantic claim. Custom grant, counting and certification machinery does not itself justify retention. Judge recurring exceptions against their actual production subjects before carrying them into native configuration.

Batch React, syntax and import replacements by shared configuration and policy. Use bounded positive and rejection controls for the changed claims. Reuse matching evidence; do not start a repository-wide checker recertification campaign. Keep custom analysis only when no maintained tool expresses the required judgment.

The native token-scale reset is not yet configured in the generated theme. Prove rejection of off-token classes before deleting their gates; a namespace reset alone is not coverage evidence. World purity stays native: per-world tsconfigs written by the type-config generator, checked by `tsc`, plus `noNodejsModules` and the dependency-cruiser world rules; both stay by owner ruling. Replace config-liveness parsers and the ESLint selector model only where native APIs cover their actual claims. Keep dependency-cruiser budget validation and genuine runner membership checks. Native unused-suppression reporting does not prove config-path liveness; a generic dead-path check is not yet built. Preserve the root development-dependency judgment when removing registry parity. Examine other health checks and gates about gates last, one by one. A blanket deletion is not approved.

Native configuration owns tooling sibling import boundaries in `.dependency-cruiser.cjs` and PNG engine restrictions in `eslint.config.js`. ESLint discovery uses its installed `calculateConfigForFile` API. `root-development-dependencies` preserves root manifest ownership without a second script registry. Native snapshot transactions, runner membership and dependency-cruiser budget validation remain. Config-liveness parsers and the private Biome rule prober are deleted.

Evaluate package/test reach, capability provenance, ambient aliases and shadows, imported/composed classes, suppression taxonomy, Zod identity and CT scheduling/live reads separately. These are candidate semantic remainders, not a blanket retention list. Native syntax coverage alone does not establish their judgments; the shared-reader work consolidates any remaining analysis. The token reset remains unconfigured, and generic config-path liveness remains unbuilt. CSS-file tooling proposals remain unapproved dependencies. D307 and D317 retain weekly checker cadence.

Installed Zod replacements differ in call grammar, binding identity and literal-union remedies. Preserve those judgments until a native replacement proves their actual accepted population. React and query plugins do not replace application selection taint, invalidation reach or window recovery. Native ESLint owns direct React memo named imports and direct numeric reservation counts. Custom policies retain unmatched origins, constants and TypeScript wrappers. Shared subject vocabulary preserves actual file-level memo permissions and their custom authority.

Tooling tests follow one rule: test verdict logic and lifecycle or concurrency rules (caps, races, reaping, ownership, slots, bands) fast against the decision code; an instrument's plumbing is proven by use; a test that reruns a gate over the real tree is deleted, because CI's structure stage already does it.

Keep the semantic CT live-read assertion checker alongside maintained Playwright lint. Native rules do not follow imported snapshots, recursive aliases and the typed live-read cases. Their direct syntax coverage does not replace that invariant; population shrink does not establish equivalence.

### Public doors and production usage

D318 separates package paths from exported symbols. Explicit package maps restrict cross-package entry; private imports retain their wildcards. Legacy reaches internals through the root raw-reach map. Rebuilt tests use genuine public entries and testkit world doors.

Native Knip judges production usage without testkit, tooling or test-only consumers keeping application exports alive. `knip-production.baseline.json` records shrink-only findings, not permission to keep them. Its entries can repeat a symbol at several barrels; an unused export does not establish a dead implementation.

The [production export work item](../../work/0989-adjudicate-unused-production-exports-behind-explicit-package-doors.md) owns adjudication in cohesive package/domain batches as compose and shared-reader work stabilizes. Remove unnecessary re-exports, follow remaining findings to implementation callers, then delete truly unused code. Keep a deliberately supported external API with its actual contract; never add fake consumers or widen the baseline. This work must not pause all foundations for a repository-wide deletion campaign.

The [memory work item](../../work/0965-static-checks-and-pnpm-ast-run-within-a.md) owns correct-invocation and memory diagnosis. Failed custom runs do not establish a shipped-tool defect. Bulk export application waits for complete typed evidence; native Knip and codemod preparation do not establish that evidence. Confirm the actual failure mechanism before implementation; preserve the plan's shared-engine requirement without escalating heaps or dropping populations.

Use existing alias-aware `pnpm ast apisurface`, `rot` and `dead` evidence with native Knip's production work set. Apply adjudicated mechanical removals through one batched codemod, not a lane per barrel. Preserve reader limitations and distinguish tool consumers from application production callers. The shared-reader migration owns detector consolidation; this cleanup adds no replacement liveness gate.

### Named macro API vocabulary

Keep the native macro API's named input and result types importable. Callers use this vocabulary instead of declaring copies of nested shapes. D285 preserves the grammar, validation, registration and input-resolution semantics these types describe. This contract does not claim that current application callers import every name.

| Public operation | Named vocabulary | Source home |
| - | - | - |
| `swapIdentityMacros` | `IdentityMapping` | `packages/kit/src/macro/content.ts` |
| `trimContent` | `TrimContentOptions` | `packages/kit/src/macro/content.ts` |
| `parseMacros`, `evaluateMacros` | `MacroNode`, `TextNode`, `MacroCallNode`, `MacroFlags`, `MacroFlagKey` | `packages/kit/src/macro/types.ts` |
| `checkMacroArgs` | `CheckMacroArgsOptions`, `MacroArgViolation`, `MacroArgViolationKind` | `packages/kit/src/macro/metadata.ts`, `packages/kit/src/macro/types.ts` |
| `validateMacroArgs` | `MacroSpan` | `packages/kit/src/macro/types.ts` |
| `queryMacros`, `checkMacroArgs`, `registerUserMacros` | `MacroCategory`, `MacroArgDef`, `MacroListSpec` | `packages/kit/src/macro/types.ts` |
| `MacroRegistry.register` | `MacroHandler`, `MacroAnalysisOptions` | `packages/kit/src/macro/types.ts` |
| `MacroContext.resolve` | `MacroResolveOptions` | `packages/kit/src/macro/types.ts` |
| `registerUserMacros` | `RegisterUserMacrosOptions` | `packages/kit/src/macro/user-macros.ts` |
| `resolveUserMacroInputs` | `UserMacroInputOption`, `UserMacroInputValueBag`, `ResolveUserMacroInputsOptions`, `ResolvedUserMacroInputs` | `packages/kit/src/macro/user-macros.ts` |

Registry implementation helpers and bookkeeping types remain outside this named API contract. Their declaration exports can still serve relative imports inside the engine.

### Execution and verification

Give lanes cohesive assignments with explicit ownership, affected behavior and a scoped floor. Batch review corrections into the assignment's final commit. The orchestrator schedules compiler and gate-heavy work; lanes request permission before whole-tree checks.

Run affected typechecks, scoped tests and focused check or structure selections concurrently within measured host limits. Reserve whole-tree runs for the main-owned qualification boundary.

Commit red is permitted under the owner-authorized check bypass, retaining commit-message validation and recording the reason and deferred checks. This does not permit suppressions, waiver inflation or weakened assertions.

Use one independent review per substantive wave and reuse matching completed checks. Recheck only concrete failures or changed behavior. D317 owns the single application check before an owner-authorized push; no whole-tree check follows each merge. The dev stack is disposable; the release container is outside this program's authority.

### Compose holds wiring only

`entry/compose` builds the graph. A decision that runs once while the graph is built, on config, mode or which dependencies exist, is wiring. A decision inside any business operation compose hands out (an op, a port method, a business callback, a handler) runs per call on live data, so it lives in its owning domain. Native graph disposal follows entry lifecycle ownership in Tier-5-Entry. Compose calls no drizzle query. The only exemption is the forward-if-set idiom for optional fields. Item 964 builds the gate and moves the rules; item 958 builds the test composition root on the result, so every rule is reachable from its domain.

`compose-wiring-only` judges compose and the entry helpers it reaches, not arbitrary test assemblies. The server harness work item must enforce one test composition home that delegates to production. Reject copied domain assemblies outside that home while admitting production-derived builders and external-edge adapters. Use existing import and clone checks or native restrictions where they express the boundary; add no certification framework.

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
4. Business clocks, ids and randomness come injected from the composition root, without fake timers. Native protocol time follows [Spine-Testing section 3](../../law/Spine-Testing.md#3-determinism--mock-doctrine).
5. It fakes only an edge: the database driver, the provider, the plugin host, the network.
6. It asserts behaviour a user or a caller sees, never a literal it built itself and never help or copy text.
7. A port keeps every case of the file it replaces, regression cases first, and a production mutant turns it red.

### Tests mirror directories, not files

By owner ruling (item 899), tests live in the directory that mirrors their feature and are named for the behaviour they prove; there is no one-to-one file mirror. A module has a test when a test reaches it through the import graph or names it in an `@subject` header; a mock or a type-only import is not reach. `test-layout` checks the directory and `test-reach` checks presence, and both stay in the core. Rebuilt tests drive the product through public entries, so `test-reach` credits the module a test drives through that entry, never every module the composed graph happens to import.

### Client mounting foundation

`packages/client/src/compose/client-runtime.ts` owns production data construction. Boot retains its runtime through `packages/client/src/compose/app-singletons.ts`; isolated mounts retain theirs through React state.
`packages/client/src/compose/authed-composition.tsx` owns authenticated registry construction. `packages/client/src/compose/authed-providers.tsx` delivers that graph to both the lazy route and the CT door.
The router still gates authentication before loading the authenticated graph. Testkit never copies the section, modal or configuration tables.

`tests/support/browser/ct-data-providers.tsx` exposes the maintained client mounting door. It controls document capabilities and network responses without replacing application modules.
Cache teardown cancels outstanding queries. Scoped document and notification bindings release their own owner, including nested mounts that end out of order.
Immutable configuration palette binding remains in production composition. Session recovery and bus subscriptions retain their production hook lifetimes.

Primitive subjects use `CtIsolation` from `tests/support/browser/ct-isolated-subject.tsx`. Registry variants use the named exception in `tests/support/browser/ct-isolation.ts`.
The mounting policy consumes native Playwright signatures and visitor-delivered JSX and returns. Unreadable trees require explicit isolation, not silent admission.
Dependency-cruiser derives browser entries from the canonical world inventory. Browser stories, fixtures and support reject server value imports while preserving type-only and Node-world routes.

The maintained client dialog cases remain primitive isolation. Component runtime and registry controls prove the production door; legacy route and shell cases remain migration evidence.
Builders and the corpus come from item 959. Flow tests remain the e2e population rather than a second application assembled in CT.

## Rejected

Moving the tests out of the repository: it drops the regression net for the whole rebuild; the in-repo legacy folder gives the same relief and keeps the net. Per-gate time or memory caps: cost is a design defect fixed by the shared fact store, not a limit. Retrofitting fake-heavy server harnesses row by row: each row needs fixture repair and a fresh review.

## Coupled sites

The test-mirror plan: item 890 server harness rows move here, item 901 hosts the harness, items 887 and 898 feed the corpus and the smoke matrix, item 952 burns down against the legacy folder. Raw package reaches and over-cap test files leave with the legacy files the ledger retires; rebuilt tests enter packages through public entries by construction. `docs/law/Spine-Testing.md` sections 2 and 10, `docs/law/Core-0-Architecture-and-Structure.md` section 5, and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` section 4 for inner-loop membership.

## Late tooling cleanup

The [checker-recertification cleanup](../../work/1012-remove-whole-tree-checker-recertification-from-tooling-tests.md) follows foundation and replacement-suite work. Remove redundant live-tree reruns and certification scaffolding while preserving bounded verdict, refusal and lifecycle tests. Adjudicate static tooling-certification claims individually; move native-expressible restrictions and retain genuine failure semantics. This cleanup does not delay required production fixes or dependent harness and corpus qualification.

## Test plan

Each engine move diffs `pnpm ast` output and gate findings before and after. Each ported suite shows the same case list and a production mutant that turns it red. The legacy-folder gate refuses a new entry and a returning file.
