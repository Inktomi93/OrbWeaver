---
kind: plan
status: active
updated: 2026-10-17
---

# Tests on one harness and one code-facts engine

## Goal

Run production through one harness without copied rules. Share one code-facts engine across codemods, `pnpm ast` and gates. Enforce rebuilt files through native types and tools where possible.

## Shape

### Order of work

This plan owns order. The [test-mirror inventory](../test-mirror/design.md) supplies candidates. Work items own assignments, blockers and evidence.

Read the [side-plan priority note](../inference-flow/design.md#reading-priority) before using inference-flow to choose work or report program status.

### Recovery priority and analysis scope

D321 records the owner rulings; item 1041 owns the audited gate migration. Custom gate analysis serves the KEEP set. Do not port MOVE or DELETE rows into the fact store. Shared providers count once for cost.

Start the audited migration after the assigned SQL correction's acceptance. Keep retained-reader gaps and complete equivalence/cost qualification open without blocking that migration. The [delivery-boundary report](../../../reports/review/1027-remaining-delivery-boundary.md) traces the remaining schema, clone and compose readers.

[D320](../../adr/0320-legacy-tests-run-and-typecheck-without-semantic-extraction.md) makes legacy tests run/typecheck-only. Keep their CI regression execution and native typecheck programs. Exclude legacy worlds from semantic extraction and legacy files from typed gate/provider populations and type-aware lint. Preserve cheap admission and boundary checks.

The exclusion is integrated and independently reviewed. Ordinary eligibility controls pass; existing store metadata failures remain open. Its source and evidence work belongs to items 1002 and 1027. Derive eligibility from canonical world/test-kind metadata. Preserve complete native options, roots and resolved closure inside every selected eligible program. Demand, generation identity and completeness must state the changed analysis scope; old all-world evidence remains historical evidence for its original scope.

Reduce structural cost before more micro-optimization: remove legacy deep analysis, eliminate unnecessary typed claims, and isolate accidental server closures through the AppRouter type bridge. Declaration bridges require fresh generated output and qualified transitive closure; do not replace them with copied shapes. Compiler baselines guide cost diagnosis but do not establish equivalent analysis work.

The [typed-gate census](../../../reports/review/typed-gate-necessity-census.md) classifies source, not qualified successors. Re-derive partly written migrations before continuing.

Keep the existing TS6 analysis. Park TS7 benchmarking and adapter work; the measured prototype is slower, larger and semantically unqualified. Batching removes transport overhead, not deep lookup or proof work. Focus on existing reference and callable traversal costs, shared facts and native gate replacement. Preserve the external experiment without changing pins. Evidence: `reports/review/1002-ts7-checker-benchmark.md`.

### Execution sequence

| Phase | Work | Exit condition |
| - | - | - |
| Composition boundary | Queries and per-call rules live in domains; entry wires their graph. | The complete compose-policy population passes without waivers; legacy remains regression evidence only. |
| Shared readers | Start Drizzle facts (953), then shape identity, references, import reach and codemods (954 to 957). | Consumers share the floor reader and preserve findings or record proven corrections. |
| Real harness | Build the server composition root (958) on the cleaned graph; continue readers in independent files. | Every external edge is injectable and a complete domain case set proves the real graph. |
| Test inputs and mounting | Finish builders/corpus (959) and the client compose door (960). | Test data derives from production and CT wiring derives from client composition. |
| Replacement suites | Corpus-backed e2e smoke, server domains, component CTs, then remaining suites. | Replacement preserves meaningful cases, catches a production defect and deletes the corresponding legacy harness. |

Discovery every-owner authority is integrated. Remaining owner-read adjudication and type homes (981) are production work. Schedule owner-specific batches without waiting for legacy suite polish. A required seam or correctness defect blocks its dependent harness work.

Contract derivation, stored-value recovery, wire-boundary admission, runtime funding and identity enforcement are integrated with native controls and security review. Builders/corpus foundations qualify. The graph-owned forward-JWT repair passes security review and ordinary root controls. Replacement-matrix and native-fact qualification remain open. Complete required production fixes before dependent qualification; prerequisites do not close the program.

### Foundation boundaries

Legacy isolation, native lint, explicit exports, native integers and domain-owned compose rules are implemented. Query wiring qualifies; per-call corpus qualification remains open. Sanctioned HTTP, auth and rate-policy entry homes remain. This is not complete foundation or application qualification. [Main findings](../../work/0977-main-reds-and-loose-ends-from-the-test.md) owns remaining reds. Legacy filename admission stays monotonic; strict reach excludes legacy evidence. Probes retain their cases and harness dependencies.

Testkit exists as a world-split package. The client mounting foundation delegates to production composition and supports named primitive isolation. The server root delegates to production composition. Native HTTP completion joins ordinary peer disconnects and retains unexpected stream faults. The selected notification lifecycle and capsule clone controls pass. Shared facts remain work. Canonical row builders and output suppliers meet their declared contracts. Wire-output boundary accounting and allocated native supplier qualification are established. The committed corpus serves each test layer. Tooling tests stay outside the application legacy migration; existing e2e files do not establish corpus adoption.

The synthetic corpus is committed under Node testkit support. Selected native clone, server continuation, smoke, component and isolated-stage consumers pass without private directory selectors. Public plugin stages also feed default native continuation and the Extensions component. Public default-corpus E2E passes through an independent clone. Additive required CI wiring preserves ordinary smoke selection and artifacts; hosted execution remains unqualified. A native browser reservation-limit case qualifies unavailable handling, Retry and Worker retirement without changing production budgets. Component media uses private clones and native viewer admission; production owns blob authorization, variants and headers. Node replay state preserves settled time and ID continuation; browser consumers receive only portable wire and HTTP bytes. Production tag and character insert writers use the injected business clock. The committed corpus carries their native stamps with reviewed private-state and capture preservation. The full ordinary capsule passes under the registered slow completion policy; its producer and assertion population is unchanged. Default corpus Snap intake passes its corpus assertion, ARIA and navigation map. Reviewed marker repairs preserve list and context focus return. An owned loopback provider serves native preview through the production graph. Refusal controls preserve resources until consumer completion and reject unscripted origins. Separate provider recipes remain unqualified; software rendering withholds the application snapshot. Builders, required-field failure and layer intake meet the corpus foundation exit. Evidence: `.claude/worktrees/codex-identity-notification-suppliers-1036/reports/review/959-completion-boundary-audit.md`. Item 898 owns the replacement smoke matrix; item 977 owns UI and reporting findings. Stable timing and hosted CI remain unqualified. General legacy ports still wait for complete shared-reader foundations.

SDK execution joins native Query and observed direct-child completion, not arbitrary executable sandboxing or universal descendant containment.

### Architecture workstreams

1. **One code-facts engine.** Every reader of code lives once in `tooling/src/floor/code-facts/`, behind one fact store: built once per world program, updated incrementally from file changes, persisted, and queried by every caller. A caller reads facts; it never loads its own program. Extract only eligible demanded analysis worlds under D320, so concurrent `pnpm ast` verbs, gates and codemods share one load. `pnpm ast` verbs, codemods and gates call it. A reader in `tooling/src/ast/lib/`, `tooling/src/codemod/lib/` or `tooling/src/verify/lib/` that answers the same question is deleted. Start with drizzle query facts (tables, joins, columns, reads and writes) and shape identity, then symbol references and member reads, import doors and reach, liveness, tRPC wiring, ambient calls and casts. Each move proves `pnpm ast` output and gate findings unchanged.
2. **The server test harness.** A test composition root in `@orb/testkit/node` builds the real `entry/compose` graph and injects only the edges: database, clock, ids, random, the inference provider edge, the plugin host and the network. Production exposes those seams at the composition root. Domain harnesses are deleted as their suites move onto the root. Runs in parallel with step 1.
3. **Builders and corpus.** One builder per contract output and database row, built from contract defaults or by running production. One synthetic corpus from the seed tool, shared by e2e, CT, server tests and side-eye.
4. **The client CT door.** CTs mount through the real client compose. A story isolates only through the named exception.
5. **The legacy folder.** Every test not yet rebuilt moves to a legacy folder under `tests/` at its same mirror path; the folder is the ledger. It runs in CI as its own project, never in commit hooks, lane floors or the strict gates, and reaches package internals through the root raw-reach map without grants. A domain's legacy folder is deleted when its rebuilt suite carries every case.
6. **Rebuild.** The e2e smoke matrix on the corpus first, then server suites by domain on the composition root, then CTs on the door, then the rest.

### Why this order

Complete these foundations before general suite ports. Build the engine and harness in parallel:

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
- Complete engine and replacement qualification remains open; source integration alone is not completion.
- A rebuilt test calls production through a public entry, builds data through a builder, and carries no fake that stands in for domain logic.
- A ported suite keeps every case of the file it replaces; the verifier checks the case list.
- Retrofit work on fake-heavy server harnesses stops; those rows move to the rebuild.
- Each test layer answers its own question. e2e owns user flows and every wire: router, auth, streams, the database and the plugin host. CT owns component behaviour, rendered measurement and states a real backend does not produce on demand; a CT never mounts a route to walk a flow. Server integration tests own domain logic and permissions on the composition root. Unit tests own pure logic in `@orb/kit` and `@orb/contracts`.

### Why the rebuild, not the retrofit

Fake-heavy harnesses copy composition and drift from production. Repeated fixture repair preserves that defect and consumes check time. Spine-Testing requires composed production with external edges scripted. Build that foundation, then replace assemblies while preserving meaningful cases.

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

Today `pnpm ast` reads code through `tooling/src/ast/lib/` and the gates read it through `tooling/src/floor/code-facts/` and `tooling/src/verify/lib/`. Each row becomes one floor reader shared by `pnpm ast`, gates and codemods.

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

- Type homes: Spine-TypeScript section 7.4 owns the canonical home table. Native restrictions, typed owner data and tests replace placement proxies under D321. KEEP relational analysis stays shared. Preserve service-presence and ledger-field claims until their successors qualify. Component APIs stay beside components; lower-owned data stays derived.
- JSON columns: json-column-read-parsed, json-column-write-parity and open-json-column-key-parity become one JSON-column fact with three judgements.
- Copies: contract-structural-copy, contract-derives-not-respells, test-hand-shape and test-production-clone become one copy family over the shape reader, judged by population.

The fact store is built once per world program, updated from file changes and persisted. A `pnpm ast` verb that loads its own program is a defect: one such run held most of the box's memory. Item 965 measures the static tier on a standard hosted runner; the fix is the shared store, never a time or memory cap.

### Shared semantic inventory store

The [native inventory store item](../../work/1002-persist-native-semantic-inventory-facts-and-release-world.md) owns qualification. Persisted facts live in `tooling/src/floor/code-facts/` and native worker lifecycle in `tooling/src/floor/compiler/`. Existing inventory collectors retain their judgments and query shared compiler facts. Consumer routing, bounded persistence and lazy readers are implemented. Current reuse is partition-level; complete current-demand replay and consumer equivalence remain open. Unported typed readers still require their native programs.

Factory readers retain a query-only transaction on the selected complete generation. Raw binding reuse stays inside that owned snapshot; borrowed readers remain fresh. Owned reads reuse validated immutable invocation identity. Session admission indexes private registrations; caller keys and graph checks remain current. Acquisition validates exact native membership before exposing a reader. Owned readers index private partition membership. Physical source lookup reuses live wrappers without treating their contents or compiler epochs as immutable. Ordinary installed controls qualify this lookup reuse. Maintained-support qualification completes with the legacy-only mint finding. Complete target cost and standard-runner qualification remain open.

Verifier native-world delivery remains incomplete. Native owners supply closed module, declaration, reference, origin, value, signature and type observations. Queries retain importing-world options and exact source membership. Executable helpers and codecs participate in reuse invalidation. Missing, foreign, stale or disposed evidence refuses instead of falling back to the syntax workspace.

Qualified delivery includes selected shape and declaration, ambient and invocation, export-home, schema, JSON, Zod, ID, bus, failure, CSS and retained-origin consumers. Mounted tRPC, inherited-member, fixture-provenance, browser-mount and finite-type controls also pass independent review and ordinary qualification. These bounded controls do not establish repository equivalence, complete censuses or hosted cost.

Catalog and consumer observations publish atomically. Callback bindings and native alias identities remain exact. Contribution targets resolve in their importing world; a syntax location never borrows another world's Type. Tuple value capture follows selected-consumer demand while export indexing preserves complete ambiguity. Public parser presence does not establish parser adequacy.

Physical SQL statement, predicate and relational-binding delivery passes bounded controls and independent review. Native full-schema metadata and clone export discovery pass review and bounded controls. Evidence: `reports/review/native-foundation-wave-ordinary.md`. The [typed verifier delivery item](../../work/1027-deliver-verifier-typed-reads-through-native-world-owners.md) retains compose delivery and complete equivalence. Preserve native interpretations and worker release instead of retaining every world.

Exact ID-brand demand and ID matcher consumers pass ordinary qualification and security review. Shared query-helper inputs invalidate ID-only reuse and publication. Strict-reference capture preserves importing-world meaning, explicit zero, demanded-owner publication and pinned migration semantics. Independent review and combined ordinary controls pass. Remaining consumer migrations stay open.

Each partition belongs to a native compiler program from `compiler-programs.ts`. Preserve its options, roots, resolved closure and unresolved outcomes. Key declarations by canonical file and source span, with the program identity beside the fact. Store export origins, module targets, binding declarations and physical references. Preserve aliases, type/value distinctions, static dynamic-import members and namespace consumption. Keep native interpretations world-specific, including ambiguous and unresolved results. Physical reference spans may deduplicate body locations, but never select a typed meaning. Resolve imported export origins in the importing world, not the target file's primary world. Record product, tooling and test consumers separately.

Use the native SQLite platform for committed facts. A writer compares input versions under the publication lock before starting a worker. Reuse unchanged partitions without loading a compiler program. Build affected partitions through native programs, not through combined compiler options. The worker writes its partition and exits before publication, releasing its program. Recheck source, config, package-resolution and dependency versions after worker exit, immediately before publication. Discard a partition whose inputs changed during extraction. Publish complete partitions atomically; concurrent readers see a committed generation, never a partial build. Competing writers recheck the committed version before starting work.

Track source, config, package-resolution and dependency inputs with content versions. Changed inputs invalidate their affected native partitions. Added files and failed module lookups also participate in invalidation. Reconcile removed declarations and references when publishing an update. Cross-world reference and export unions demand one input snapshot for every participating world. Publish their generation together only after every demanded partition passes the final input check. Readers pin that generation; they never combine independently published old and new partitions. A failed worker leaves the previous generation intact and supplies no current verdict.

Keep transaction overlays separate from committed facts. Derive their roots from the compiler overlay and their content from the transaction filesystem. Changed overlay content selects new facts; it never changes the repository generation. Discard overlay partitions when their transaction ends.

Portable corpus captures derive production contracts without Node support or AppRouter reach. Node retains exhaustive router input and wire-output conformance. Native closure, compiler, publication, cross-tenant and independent security checks qualify this boundary. Evidence: `reports/review/1040-portable-corpus-ordinary.md`. A declaration bridge requires fresh generated output and qualified transitive closure; declaration emission alone does not establish isolation. Legacy CI and typecheck evidence remains available without extracting legacy semantic worlds, as D320 requires. Cross-world file duplication does not explain the separate single-world callable cost.

SDK-owned wrapper generations and capture census reuse preserve native source admission. Ordinary installed controls pass; complete invocation, full-schema and cost qualification remain open.

The store-backed inventory corpus is a separate syntax carrier over the complete authored-root inventory. Its readers query native facts explicitly. Keep the existing native `SourceCorpus` contract, including browser-native `getType`, for consumers not yet ported. Do not give those consumers a syntax carrier with synthetic compiler options.

Terminal optional sibling continuations preserve nullish or closed-absent receivers and unsafe-use refusals. Evidence: `reports/review/1002-default-binding-continuations-ordinary.md`. Direct awaited module aliases preserve native identity and consumer closure. Evidence: `reports/review/1002-module-alias-ordinary.md`. Captured catch transfer and ordinary call demand pass scoped controls and security review. Demand preserves private lifetime and requires actual publication; context-free transfer refuses. Evidence: `reports/review/1002-namespace-call-demand-ordinary.md`. Original target resolution remains unqualified.

Native callable controls preserve allocation-bound origins, selected-slot and ordered-copy closure, and publication after private-premise revocation. Finite contextual reentry qualifies; unknown contexts, mutation, escape and true recursion refuse. Exact dependencies retain native validation and whole-source opacity. Original receiver/allocation pass; target/delegate invocations remain unpublished. Complete mode-candidate evidence identifies recursive key-supplier and consumer closure, not a native signal defect. A source-derived sibling read reproduces the refusal in a bounded case. Its repair, sparse-env and full store/cost acceptance remain open. Evidence: `reports/review/1002-native-signal-projection-diagnosis.md`.

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

### Gates move to native enforcement

[D321](../../adr/0321-native-gate-replacements-and-keep-only-analysis.md) owns the migration rulings. [The migration item](../../work/1041-replace-audited-gates-with-native-enforcement.md) follows the assigned SQL delivery, not complete retained-reader or cost qualification. The canonical external audit is in /home/inktomi/Desktop/gate-audit. Read its README, folder CSVs and raw results; loose Desktop copies are obsolete.

D322 permits schema-only exports. Membership hygiene is removed; authored parity and issues-origin enforcement remain. Evidence: `reports/review/1041-native-zod-surface-ordinary.md`.

The audit asks whether a custom engine is necessary after changing the enforcement mechanism. The earlier typed-necessity census describes current implementations. A genuine Type dependency can move to a type change, native typed lint or a production test. Neither census alone proves a successor correct.

Run the migration in this order: security replacements; mechanical native lint/import moves; typed production registries; runtime/type tests; stylelint and CSS moves; obsolete family scaffolding; KEEP-only engine qualification and memory measurement. Security-executor lands real composition-root tests and native boundaries before deleting a security gate. A planted violation must fail.

The chat engine receives an actual narrow capability object; chat binds memory operations outside the engine. Native imports exclude full request-authority contexts and guards. Existing identity and role gates remain active. Evidence: `reports/review/1041-engine-authority-ordinary.md`. Legacy direct constructor cases remain unchanged and require production-root adoption. Their unqualified API compatibility is distinct from inherited compiler diagnostics; preserve their meaningful cases before deletion.

Device-local factory names derive from the production registry. Native factory option types require version, partialize and migrate. Private implementation imports remain restricted; the legacy adapter admits only its existing callers. Evidence: `reports/review/1041-persisted-factory-ordinary.md`. Runtime migration behavior remains the factories' responsibility.

Native lint owns lexical class, skin, banned utilities, z-index and determinism. Mandatory ESLint enforces CORS without inline suppression. Real HTTP controls enforce mounted mutation limits and order. Public URL policy rejects caller-supplied configured authority. Real composed controls enforce regex deadlines; ordinary integrated runtime and native type controls pass. Raw-origin and asset policies remain. Stylelint owns motion, color and integer/rest CSS; their semantic checks and complete CSS-variable enforcement remain. Review, ordinary main controls and isolated frozen-PNPM CSS qualification pass. Existing compiler and certification reds remain. Evidence: `reports/review/1041-native-wave-ordinary.md`.

Native Base UI lint owns derivation, handlers and state styling. Surface/anatomy contracts run in ordinary Node CI; portal and CSS semantic owners remain. Metadata admission invalidates caches. Maintained CTs use captured reads. Bounded controls pass; full migration remains open. Evidence: `reports/review/1041-native-baseui-ledger-ordinary.md`.

Context/register lint keeps publication and count owners; ordinary controls pass. Evidence: `reports/review/1041-native-context-registry-ordinary.md`. Parallel-map native lint uses canonical tuples; scoped main behavior passes with timing limits recorded.

Production registries supply config anchors and safe navigation; cleanup cancels delayed jumps. Native types enforce planned/live sections, dormant tiles and rail mobile policy. Native lint rejects route literal maps. Other semantic readers remain. Evidence: `reports/review/1041-native-client-registries-ordinary.md`. Legacy direct mounts require real-door replacement; application qualification stays open.

Opaque roles and root-derived Principals preserve internal authority. Public Caller DTOs expose raw roles, so role gates remain. Native lint owns the lowercase engine-name restriction; canonical Principal-origin analysis stays. Evidence: `reports/review/1041-native-turn-role-authority-ordinary.md`. Legacy adoption remains open.

Native Node/browser assertions and real-root controls replace bus secret-name checks. Source health and its readers remain; scoped main controls pass.

Native schema tests own portability; native runtime owns DevTools bytes. Native lint owns client literal IDs, scroll positioning, sealed sizes and source suppression refusal. Shared metadata retains scope and authority. Browser imports validate before effects. Story and token readers remain. Native manifest contracts retain acquisition refusals; application cases run in Node CI.

Typed KEEP gates are bus-producer-coverage, caught-failure-ownership, contract-structural-copy, json-column-write-parity, no-inline-union-redecl, owner-scoped-reads, test-hand-shape and test-production-clone. The per-call half of compose-wiring-only also stays custom. KEEP does not require deep Types for a syntax-only claim. Preserve the audit's syntax/resource KEEP consumers and their shared contracts.

Required producers cannot disappear with their audit row. Replace bus definitions, schema/catalog data, static-class and floorless-control inputs before removing an upstream producer used by KEEP consumers. Preserve meaningful unavailable-data and lifecycle refusal. Retire redundant certification, not the remaining consumer's failure behavior.

Move law tables into their production owners and type total registries against canonical unions. CI V8 coverage replaces contract-verb-presence and executes every domain verb implementation. Native database constraints enforce stored freeze-provenance normalization; complete canon body writers and production-root defect controls preserve freshness. Evidence: `reports/review/1041-freeze-provenance-ordinary.md`. Migration preserves coherent bytes and refuses invalid stored rows atomically. Inert DB, statement and batch wiring preserves native operands and atomicity. Native import/loader rules own the query boundary; custom per-call analysis remains. Evidence: `reports/review/1041-compose-query-capability-ordinary.md`.

Rejudge waivers and grants at their subjects. D321 permits reasoned native inline exceptions and shrinking ESLint bulk migration debt, not automatic permission copying. Reviewed exceptions preserve actual transferred lifetimes, derived replacements and native compatibility boundaries. Item 1006 owns broader disposition. Evidence: `reports/review/1006-native-exception-classes-ordinary.md`. Installed catalog entries are leads; confirm effective rules and scope before deleting enforcement. Missing example rule names do not authorize another dependency. Stylelint is approved for its assigned CSS claims; CSS coverage does not replace TypeScript value-flow claims.

Preserve D1/D40 request and turn construction boundaries and D118 subscription placement, not only runtime procedure names. Native prose restrictions and real delivery tests preserve D132's slot invariant. A typed reservation-key object does not prove unique mount use; qualify the actual successor before dropping that claim.

World purity remains with native per-world compiler programs, Biome and dependency-cruiser. Keep selected native options, roots and closure complete. D320 excludes legacy semantic worlds and typed subjects, not cheap legacy admission/boundary checks or native typechecks.

Tooling tests exercise verdict logic and resource/process lifetimes on bounded inputs. Remove repeated live-tree certification with its qualified successor. General checker cleanup stays in item 1012; it does not delay security or native replacements.

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

Give lanes cohesive assignments with ownership, behavior and scoped floors. Batch review corrections. Main schedules heavy runs; lanes request whole-tree checks. Use measured host limits.

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

Only e2e proves real wires. Item 963 replaces flow-walking route and shell CTs with e2e cases. CTs mount through the compose door (960) with stubs from builders (959), so a stub cannot drift from the contract.

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

General [checker-recertification cleanup](../../work/1012-remove-whole-tree-checker-recertification-from-tooling-tests.md) follows foundation and replacement-suite work. D321 family-owned obsolete checks retire with their qualified replacements. Remove redundant live-tree reruns and certification scaffolding while preserving bounded verdict, refusal and lifecycle tests. Adjudicate static tooling-certification claims individually; move native-expressible restrictions and retain genuine failure semantics. This cleanup does not delay required production fixes or dependent harness and corpus qualification. Real-corpus certification overlays do not block native reader delivery. Inventory transaction overlays still require current facts and isolated generations.

## Test plan

Each engine move diffs `pnpm ast` output and gate findings before and after. Each ported suite shows the same case list and a production mutant that turns it red. The legacy-folder gate refuses a new entry and a returning file.
