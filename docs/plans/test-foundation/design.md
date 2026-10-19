---
kind: plan
status: active
updated: 2026-10-18
---

# Tests on one harness and one code-facts engine

**Dispatch:** Claude primary adds capacity beyond the Codex lane cap. Follow the orchestrator skill and `~/.claude/bridge/SESSIONS.md`. Monitor `to-codex/` with one watcher; reply through `to-primary/`.

## Goal

Run production through one harness without copied rules. Share one code-facts engine across codemods, `pnpm ast` and gates. Enforce rebuilt files through native types and tools where possible.

## Shape

### Order of work

This plan owns order. The [test-mirror inventory](../test-mirror/design.md) supplies candidates. Work items own assignments, blockers and evidence.

Read the [side-plan priority note](../inference-flow/design.md#reading-priority) before using inference-flow to choose work or report program status.

### Recovery priority and analysis scope

Follow D328 before analysis dispatch. The bottleneck research (`reports/review/seven-day-bottleneck-claude-analysis.md`) records source-specific diagnosis, not a mandate to resume its repair loop. Derive current affected claims without another whole-tree audit.

[D328](../../adr/0328-bounded-analysis-and-explicit-security-successors.md) bounds analyzer acceptance. Keep shared native facts and local analysis; stop exhaustive DI, callable and escape proofs. Prefer native tools and partial coverage. Unsupported flows stay explicit, not universal release blockers. Concrete violations block. Security migrations retain production authorization, native boundaries and real cross-tenant controls; record lost static guarantees. Preserve complete declared populations, world identity and store lifetimes. D323 prototype enforcement remains. No helper-specific repair, new unbounded diagnostic, TS7 experiment or raised heap limit. The memory bar is one check run's peak within the 16 GB runner budget that item 965 owns; checks do not run side by side, so a gate's peak may grow while the run stays under it.

The original driver retains its signal-origin refusal; the full owner-policy run is stopped without a verdict. Neither qualifies the bounded successor. Item 1016 replaces the expensive reader with useful owner-read coverage and explicit limits. Evidence: `reports/review/1016-current-source-complete-policy-qualification.md` and `reports/review/1002-owner-read-native-partial-addendum.md`.

The bounded owner-policy run also remains unqualified. Its profile identifies repeated stored-schema decoding, not nominal authority lookup. Correct pinned-reader reuse while preserving currentness and disposal. Evidence: `reports/review/1016-schema-decode-cost.md`.

Dispatch the corpus smoke matrix independently. Its native shape and clone checks are available; callable resolution, store cost and gate migration do not block item 898. Complete its provider, authentication, width, style and flow acceptance before general legacy suite ports.

Migrate qualified ESLint-only MOVE rows and DELETE scaffolding before registries. Security rows wait for behavioral successors. Prototype lint lands before shared ESLint edits. Preserve KEEP data and necessary missing-data refusal in its producer or consumer when deleting health twins.

Keep cold multi-world cost separate. Client typecheck consumes router declarations; item 965 retains other owners, origin and warm reuse.

D321 records the owner rulings; item 1041 owns the audited gate migration. Custom gate analysis serves the KEEP set. Do not port MOVE or DELETE rows into the fact store. Shared providers count once for cost.

Continue audited migration independently of general callable closure. Qualify bounded retained-reader coverage and cost under D328. The delivery-boundary report (`reports/review/1027-remaining-delivery-boundary.md`) traces the remaining schema, clone and compose readers.

[D320](../../adr/0320-legacy-tests-run-and-typecheck-without-semantic-extraction.md) makes legacy tests run/typecheck-only. Keep their CI regression execution and native typecheck programs. Exclude legacy worlds from semantic extraction and legacy files from typed gate/provider populations and type-aware lint. Preserve cheap admission and boundary checks.

D320 eligibility is integrated; items 1002 and 1027 retain metadata qualification. Derive scope from canonical world/test-kind metadata. Preserve every selected program option, root and resolved closure. Demand and generation completeness name that scope; historical evidence keeps its original scope.

Prioritize D320 eligibility, native replacements and fresh declaration bridges. The [occurrence-index design](../native-occurrence-index/design.md) replaces repeated bulk reference searches. Preserve world-specific bindings and dependency invalidation. Attribute reference extraction separately from invocation and callable work. Compiler baselines do not prove equivalent analysis.

The typed-gate census (`reports/review/typed-gate-necessity-census.md`) classifies source, not qualified successors. Re-derive partly written migrations before continuing.

Keep the existing TS6 analysis. Park TS7 benchmarking and adapter work; the measured prototype is slower, larger and semantically unqualified. Batching removes transport overhead, not deep lookup or proof work. Focus on existing reference and callable traversal costs, shared facts and native gate replacement. Preserve the external experiment without changing pins. Evidence: `reports/review/1002-ts7-checker-benchmark.md`.

### Execution sequence

| Phase | Work | Exit condition |
| - | - | - |
| Composition boundary | Queries and per-call rules live in domains; entry wires their graph. | The complete compose-policy population passes without waivers; legacy remains regression evidence only. |
| Shared readers | Start Drizzle facts (953), then shape identity, references, import reach and codemods (954 to 957). | Consumers share the floor reader and preserve findings or record proven corrections. |
| Real harness | Build the server composition root (958) on the cleaned graph; continue readers in independent files. | Every external edge is injectable and a complete domain case set proves the real graph. |
| Test inputs and mounting | Finish builders/corpus (959) and the client compose door (960). | Test data derives from production and CT wiring derives from client composition. |
| Replacement suites | Corpus-backed e2e smoke, server domains, component CTs, then remaining suites. | Replacement preserves meaningful cases, catches a production defect and deletes the corresponding legacy harness. |

Discovery authority is integrated. Owner-read adjudication and type homes (981) remain production work. Required seam and correctness defects block dependent harness work, not independent batches.

Contract derivation, stored-value recovery, wire-boundary admission, runtime funding and identity enforcement are integrated with native controls and security review. Builders/corpus foundations qualify. Graph-owned identity policies pass security review and production-root controls. Sessions binds deployment policy once per graph while evaluating current login groups. Replacement-matrix and native-fact qualification remain open. Complete required production fixes before dependent qualification; prerequisites do not close the program.

### Foundation boundaries

Legacy isolation, native lint, explicit exports, native integers and domain-owned compose rules are implemented. Query wiring qualifies; per-call corpus qualification remains open. Sanctioned HTTP, auth and rate-policy entry homes remain. This is not complete foundation or application qualification. [Main findings](../../work/0977-main-reds-and-loose-ends-from-the-test.md) owns remaining reds. Legacy filename admission stays monotonic; strict reach excludes legacy evidence. Probes retain their cases and harness dependencies.

Testkit exists as a world-split package. The client mounting foundation delegates to production composition and supports named primitive isolation. The server root delegates to production composition. Native HTTP completion joins ordinary peer disconnects and retains unexpected stream faults. The selected notification lifecycle and capsule clone controls pass. Shared facts remain work. Canonical row builders and output suppliers meet their declared contracts. Wire-output boundary accounting and allocated native supplier qualification are established. The committed corpus serves each test layer. Tooling tests stay outside the application legacy migration; existing e2e files do not establish corpus adoption.

Corpus and builders qualify; selected consumers use production entries. Item 898 owns provider, auth, style, width and flow acceptance. Local evidence composes passing cases. Private intake qualifies on a disposable owner-data clone. Private Backup reaches native ZIP size refusal; qualify full-content folder restoration and shared native/ST classification before recovery. Owner-copy rendered flows and hosted acceptance remain open. Migrate the clone before seeding and capture. Keep source and personal artifacts outside Git, publication and CI. Item 977 owns UI findings. Shared readers block general ports, not smoke.

SDK execution joins native Query and observed direct-child completion, not arbitrary executable sandboxing or universal descendant containment.

### Architecture workstreams

1. **One code-facts engine.** Every reader of code lives once in `tooling/src/floor/code-facts/`, behind one fact store: built once per world program, updated incrementally from file changes, persisted, and queried by every caller. Consumers query facts without loading a Program. Extract only eligible demanded analysis worlds under D320, so concurrent `pnpm ast` verbs, gates and codemods share one load. `pnpm ast` verbs, codemods and gates call it. A reader in `tooling/src/ast/lib/`, `tooling/src/codemod/lib/` or `tooling/src/verify/lib/` that answers the same question is deleted. Start with drizzle query facts (tables, joins, columns, reads and writes) and shape identity, then symbol references and member reads, import doors and reach, liveness, tRPC wiring, ambient calls and casts. Compare parser cases from AST, gates and codemods. Preserve stronger correct recognition and native refusals. Record changed findings.
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

Then rebuild corpus e2e smoke, server domains on the composition root, CTs on the door with builder stubs, and remaining suites. Tooling suites stay outside the application legacy migration.

### Rules

- Repair product, security and checker defects. Preserve useful legacy cases for replacement; stop fixture polish, copied-harness repair and waiver bookkeeping as independent deliverables.
- Rejudge waivers and grants against their actual subjects. Their existence does not establish authority or justify weakening enforcement.
- Recover unfinished production branches by coherent current-tree changes, not wholesale stale merges. The work items for contract derivation and stored-value parsing own their security blockers.
- Complete bounded-engine and replacement qualification remains open; source integration alone is not completion.
- A rebuilt test calls production through a public entry, builds data through a builder, and carries no fake that stands in for domain logic.
- A ported suite keeps every case of the file it replaces; the verifier checks the case list.
- Retrofit work on fake-heavy server harnesses stops; those rows move to the rebuild.
- Each test layer answers its own question. e2e owns user flows and every wire: router, auth, streams, the database and the plugin host. CT owns component behaviour, rendered measurement and states a real backend does not produce on demand; a CT never mounts a route to walk a flow. Server integration tests own domain logic and permissions on the composition root. Unit tests own pure logic in `@orb/kit` and `@orb/contracts`.

### Why the rebuild, not the retrofit

Copied composition drifts from production. Spine-Testing requires real composition with scripted external edges. Replace assemblies while preserving meaningful cases.

### Every check is one kind of thing

Checks differ by subject and cadence.

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
| Liveness | `pnpm ast` dead, orphans, testonly and chains; `tests/tooling/doc/ledger-paths.suite.repo.int.test.ts`, testid-liveness | 1162 |
| tRPC wiring | `pnpm ast` unwired, clientgap and viewgap; floor `trpc-doors` | 1163 |
| Ambient calls: clock, random, timers, environment | no-raw-clock, no-raw-random, test-determinism, platform-spellings, `orb/sole-env-reader` | 1164 |
| Casts | Native assertion rules; shared brand and assignability facts retain semantic judgments | 1041; 973 widens the id gates |

Gate families fold onto the shared readers:

- Type homes: Spine-TypeScript section 7.4 owns the canonical home table. Native restrictions, typed owner data and tests replace placement proxies under D321. KEEP relational analysis stays shared. Preserve service-presence and ledger-field claims until their successors qualify. Component APIs stay beside components; lower-owned data stays derived.
- JSON columns: json-column-read-parsed, json-column-write-parity and open-json-column-key-parity become one JSON-column fact with three judgements.
- Copies: contract-structural-copy, the contract-derives-native test, test-hand-shape and test-production-clone become one copy family over the shape reader, judged by population.

Item 965 measures supported commands on a standard hosted runner. Preserve shared facts; D328 replaces general proof obligations with explicit bounded contracts.

### Shared semantic inventory store

The [native inventory item](../../work/1002-persist-native-semantic-inventory-facts-and-release-world.md) owns qualification. Facts live in `tooling/src/floor/code-facts/`; workers live in `tooling/src/floor/compiler/`. Collectors retain their judgments through shared native facts. Routing, bounded persistence and lazy readers are integrated. Reuse remains partition-level; complete replay and consumer equivalence remain open. Unported typed readers retain native programs.

Factory readers pin complete-generation, query-only snapshots. Raw binding reuse stays snapshot-owned; borrowed readers stay fresh. Owned invocation identity and private partition membership remain validated. Session admission retains current caller keys and graph checks. Acquisition verifies exact native membership. Source wrappers are reused without assuming immutable contents or epochs. Installed controls qualify these boundaries. Maintained-support findings remain separate.

Reviewed reference indexing and versioned name links are integrated. Complete DOM publication qualifies currentness, lazy reads and release. Warm readers preserve answers, pinned generation and disposal. Complete equivalence, cross-process reuse and hosted acceptance remain open. Evidence: `reports/review/1045-current-tests-dom-qualification.md` and `reports/review/1045-current-tests-dom-warm-reuse.md`.

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

Capture validation and lexical classification reuse current facts. D328 stops the general proof campaign; the isolated diagnostic stays unlaunched. Codemod acquisition/replay cost and transaction isolation remain acceptance obligations. Evidence: `reports/review/1002-current-predicate-cost-next-step.md`.

The store-backed inventory corpus is a separate syntax carrier over the complete authored-root inventory. Its readers query native facts explicitly. Keep the existing native `SourceCorpus` contract, including browser-native `getType`, for consumers not yet ported. Do not give those consumers a syntax carrier with synthetic compiler options.

Terminal optional sibling continuations preserve nullish or closed-absent receivers and unsafe-use refusals. Evidence: `reports/review/1002-default-binding-continuations-ordinary.md`. Direct awaited module aliases preserve native identity and consumer closure. Evidence: `reports/review/1002-module-alias-ordinary.md`. Captured catch transfer and ordinary call demand pass scoped controls and security review. Ordinary demand preserves private lifetime and requires actual publication; context-free transfer refuses. Evidence: `reports/review/1002-namespace-call-demand-ordinary.md`. These controls do not require general callable completion under D328.

The generation prototype census passes review. Its target refusal remains recorded; D328 replaces further callable closure with bounded enforcement. Current-store cost and supported security-policy coverage remain open. Evidence: `reports/review/1002-d323-original-census-result.md`.

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

AST verbs share native references without changing judgments. Liveness retains checked witnesses; `typeonly-alive` omits unused families. Bounded controls pass review; world cost stays open. Evidence: `reports/review/965-ast-demand-routing.md`. Codemod overlays never publish transaction facts. Unported typed readers remain native.

Prove native world differences, alias and dynamic-import identity, complete populations and separate consumer classes. Test invalidation, atomic publication, worker release and concurrent reuse. Changed extraction inputs must refuse publication; cross-world readers must never receive mixed generations. Compare collector output on matching controls. Replay the frozen inventory after controls and migration pass review. Measure peak memory; heap limits are not measurements.

### Gates move to native enforcement

[D321](../../adr/0321-native-gate-replacements-and-keep-only-analysis.md) owns the migration rulings. [The migration item](../../work/1041-replace-audited-gates-with-native-enforcement.md) follows the assigned SQL delivery, not complete retained-reader or cost qualification. The canonical external audit is in /home/inktomi/Desktop/gate-audit. Read its README, folder CSVs and raw results; loose Desktop copies are obsolete.

D322 permits schema-only exports. Membership hygiene is removed; authored parity and issues-origin enforcement remain. Evidence: `reports/review/1041-native-zod-surface-ordinary.md`.

The audit and implementation census guide native replacement; neither qualifies a successor.

Run the migration in this order: security replacements; mechanical native lint/import moves; typed production registries; runtime/type tests; stylelint and CSS moves; obsolete family scaffolding; KEEP-only engine qualification and memory measurement. Security-executor lands real composition-root tests and native boundaries before deleting a security gate. A planted violation must fail.

The chat engine receives narrow capabilities; inferred inputs reject extra authority across context and RPG unions. Chat binds memory outside the engine. Native imports exclude request contexts and guards; identity and role gates remain. Maintained cases observe the public production root. Evidence: `reports/review/1041-engine-authority-ordinary.md`. Legacy direct constructors still require adoption; preserve meaningful cases before deletion.

Device-local factory names derive from the production registry. Native factory option types require version, partialize and migrate. Private implementation imports remain restricted; the legacy adapter admits only its existing callers. Evidence: `reports/review/1041-persisted-factory-ordinary.md`. Runtime migration behavior remains the factories' responsibility.

Native lint owns lexical class, skin, banned utilities, z-index and determinism. Mandatory ESLint enforces CORS without inline suppression. Real HTTP controls enforce mounted mutation limits and order. Public URL policy rejects caller-supplied configured authority. Real composed controls enforce regex deadlines; ordinary integrated runtime and native type controls pass. Raw-origin and asset policies remain. Stylelint owns motion, color and integer/rest CSS; their semantic checks and complete CSS-variable enforcement remain. Review, ordinary main controls and isolated frozen-PNPM CSS qualification pass. Existing compiler and certification reds remain. Evidence: `reports/review/1041-native-wave-ordinary.md`.

Native Base UI lint owns derivation, handlers, state styling and qualified portal checks. Surface/anatomy contracts run in Node CI; CSS semantics remain structural. Metadata admission invalidates caches. Maintained CTs use captured reads. Bounded controls pass; complete migration remains open. Evidence: `reports/review/1041-native-baseui-ledger-ordinary.md` and `reports/review/1041-qualified-native-batch.md`.

Context/register lint preserves publication and count owners. Parallel-map timing remains open. Native spacing, typography and hover syntax qualify; home-health and ink semantics remain. Evidence: `reports/review/1041-native-frontend-class-wave-ordinary.md`. Native derived-store syntax and parser-owned selector stability pass bounded controls. Evidence: `reports/review/1041-native-derived-store-ordinary.md` and `reports/review/1041-qualified-native-batch.md`.

Production registries supply config anchors and safe navigation; cleanup cancels delayed jumps. Native types enforce planned/live sections, dormant tiles and rail mobile policy. Native lint rejects route literal maps. Other semantic readers remain. Evidence: `reports/review/1041-native-client-registries-ordinary.md`. Legacy direct mounts require real-door replacement; application qualification stays open.

Opaque roles and root-derived Principals preserve internal authority. Public Caller DTOs expose raw roles, so role gates remain. Native lint owns the lowercase engine-name restriction; canonical Principal-origin analysis stays. Evidence: `reports/review/1041-native-turn-role-authority-ordinary.md`. Legacy adoption remains open.

Native Node/browser assertions and real-root controls replace bus secret-name checks. Source health and its readers remain; scoped main controls pass.

Native HARD lint owns tooling entry identity, invalidation and missing-owner refusal. Bounded server declaration traversal completes without heap exhaustion. Adapter homes are corrected; unsupported coverage still refuses. Scoped discovery cost remains open. Evidence: `reports/review/1042-native-boundary-successor.md`.

Native schemas enforce portability; runtime owns DevTools bytes. Lint owns client literals, positioning, sealed sizes and suppression refusal. Story and generated-token readers remain. Manifest/token and compiler-expiry contracts use Node CI. Containment and memo enforcement remain. Floorless geometry uses public UI metadata; complete frontend qualification remains open. Native imports judge tests and tooling; raw reach remains custom. Engine-test private imports require production-root adoption. Evidence: `reports/review/1041-native-test-tooling-imports-ordinary.md`. Git/text checks pass; application qualification fails on legacy collection.

Typed KEEP claims include bus production, failure ownership, structural copies, JSON writes, unions, owner reads and test shapes/clones. Compose retains its per-call claim. D328 bounds their implementations; KEEP does not authorize arbitrary callable proofs. Preserve syntax/resource consumers and required contracts.

Required producers cannot disappear with their audit row. Replace bus definitions, schema/catalog data, static-class and floorless-control inputs before removing an upstream producer used by KEEP consumers. Preserve meaningful unavailable-data and lifecycle refusal. Retire redundant certification, not the remaining consumer's failure behavior.

Move law tables into their production owners and type total registries against canonical unions. CI V8 coverage replaces contract-verb-presence and executes every domain verb implementation. Native database constraints enforce stored freeze-provenance normalization; complete canon body writers and production-root defect controls preserve freshness. Evidence: `reports/review/1041-freeze-provenance-ordinary.md`. Migration preserves coherent bytes and refuses invalid stored rows atomically. Inert DB, statement and batch wiring preserves native operands and atomicity. Native import/loader rules own the query boundary; custom per-call analysis remains. Evidence: `reports/review/1041-compose-query-capability-ordinary.md`.

Rejudge waivers and grants at their subjects. D321 permits reasoned native inline exceptions and shrinking ESLint bulk migration debt, not automatic permission copying. Reviewed exceptions preserve actual transferred lifetimes, derived replacements and native compatibility boundaries. Item 1006 owns broader disposition. Evidence: `reports/review/1006-native-exception-classes-ordinary.md`. Installed catalog entries are leads; confirm effective rules and scope before deleting enforcement. Missing example rule names do not authorize another dependency. Stylelint is approved for its assigned CSS claims; CSS coverage does not replace TypeScript value-flow claims.

D325 native assertion rules replace custom cast facts. Bounded observation and lifecycle controls pass; complete qualification stays open. Evidence: `reports/review/1041-maintained-boundary-delivery.md`.

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

D317 owns the pre-push check. Follow the orchestrator and lane skills; protect the release container.

### Compose holds wiring only

`entry/compose` builds the graph. A decision that runs once while the graph is built, on config, mode or which dependencies exist, is wiring. A decision inside any business operation compose hands out (an op, a port method, a business callback, a handler) runs per call on live data, so it lives in its owning domain. Native graph disposal follows entry lifecycle ownership in Tier-5-Entry. Compose calls no drizzle query. The only exemption is the forward-if-set idiom for optional fields. Item 964 builds the gate and moves the rules; item 958 builds the test composition root on the result, so every rule is reachable from its domain.

`compose-wiring-only` judges compose and the entry helpers it reaches, not arbitrary test assemblies. The server harness work item must enforce one test composition home that delegates to production. Reject copied domain assemblies outside that home while admitting production-derived builders and external-edge adapters. Use existing import and clone checks or native restrictions where they express the boundary; add no certification framework.

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

Each engine move compares supported outputs and records intentional unsupported outcomes under D328. Native or partial security successors need planted negative and production-root controls. Each replacement preserves meaningful cases and catches a production defect. Legacy admission remains monotonic.
