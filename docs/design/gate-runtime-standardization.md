---
kind: design
status: active
updated: 2026-09-06
---

# One ts-morph runtime for every Orb gate

This replaces the cancelled custom-ESLint Orb-policy cutover and supersedes [gate-config-system.md](gate-config-system.md). Native Biome/ESLint/community rules continue to own generic ecosystem lint. Every Orb-specific policy uses one ts-morph runtime and one capability contract. The migration is built in an isolated branch and lands atomically; no production state supports old and new descriptors together.

## Existing machinery we retain

This is a rewrite of the live gate runtime, not a second gate system. These existing homes survive and are changed in place at cutover:

- `pnpm gate:new` remains the only scaffold and continues to print every coupled site;
- `lib/loader.ts` remains the auto-registry; dropping a gate module into the corpus registers it;
- `mustFlag`/`mustPass` remain mandatory and run through the production dispatcher;
- `lib/pass.ts` keeps one kind-indexed walk, deterministic isolation, timing, and scan receipts;
- `pnpm check:structure`, its run manifest, JSON artifact, and `pnpm check:show` remain the verdict path;
- `gate-modernization` remains the permanent mechanical authoring owner, rewritten to consume shared facts.

`GATE-AUTHORING.md` describes the production runtime until the atomic cutover. Migration lanes read this design as the destination and read every assigned gate in full. At cutover `GATE-AUTHORING.md`, `gate:new`, the descriptor contract, the loader, and `gate-modernization` are rewritten together; no parallel authoring guide or scaffold survives.

The historical `codex/gate-authoring-conformance` and `codex/gate-authoring-mechanical-1584` branches implement ESLint rule ownership and are not inputs to this cutover. The reusable enforcement is already on this branch: the branded final descriptor and fail-closed loader plus the temporary `gate:contract` checks for legacy fields, descriptor indirection, private walks/Projects, mutable module state, and baseline ledgers. The three legacy authoring surfaces remain intentionally unchanged until the corpus converts, then they are rewritten directly against `defineGate` in the same cutover commit.

## Why this program exists

Current `main` has 255 gates. The shared node dispatcher is real, but most of the fleet can bypass it:

- 188 gates define their own `scanRoot`; 72 are multi-clause predicates and absence means admit-all.
- 99 gates own free-form `run` hooks.
- gate/helper code contains 250 `getDescendantsOfKind` calls across 84 files and 78 `getSourceFiles` calls across 57 files.
- six verify modules still construct their own ts-morph `Project`.
- 23 gates carry top-level `let` state; many more mutate module-level Maps/Sets reset by `begin`.
- only seven gates consume the canonical `symbol-reference` reader.
- nine baseline JSON files encode current exceptions/debt.

The recurring failure is semantic identity implemented as source spelling. Aliases, namespaces, re-exports, destructuring, computed keys, wrappers, shadows, writes, cycles, or unresolved resources then become silent greens. A shared AST walk cannot fix a gate that selects its own corpus or reinvents identity after dispatch.

## Final contract

Every gate is declared through one `defineGate` function. Types and the loader require every field; there are no defaults that turn absence into policy.

```ts
defineGate({
  id,
  family,
  authority: "hard" | "ordinary" | "reviewed-grant",
  severity: "error" | "warning",
  workItem: 1584, // required positive issue number for warning; forbidden for error
  population,
  analysis: "syntax" | "types" | "resource",
  execution: "selected-files" | "entire-population",
  facts: [sharedFactProvider], // explicit [] when none
  message,
  fix,
  create(context) {
    return { visitors, visitFile, evaluate };
  },
  mustFlag,
  mustPass,
});
```

- `population` replaces `scopeSafety` plus `scanRoot`. It is declared data resolved once into a manifest. File, folder, package, project, changed, whole, check, and family selection all use the same manifest algebra.
- `execution` states whether a verdict composes over an arbitrary selected subset or requires the gate's entire declared population. A narrowed request defers an `entire-population` gate, or refuses under strict scope. This is the non-lossy replacement for `scopeSafety`.
- `create` runs once per invocation and closes over mutable state. `begin`, module-global accumulators, and re-entry cleanup disappear.
- `visitors` retain the current kind-indexed single walk. A gate module cannot call descendant/project traversal APIs.
- `evaluate` consumes the resolved population, shared query/index services, compiler/checker, or explicit resources. It cannot access a raw `Project` and start another repository walk.
- central post-processing owns inline waiver lookup, typed-grant consumption/liveness, severity, sorting, completeness, and reporting. Gate order cannot change suppression/grant reconciliation.
- `status: dormant` is removed; it has zero occupants. A policy is registered or absent.

The exported `gate` is a direct `defineGate({ ... })` call with an object-literal argument. Descriptor indirection is forbidden because it hides required fields from the authoring checker and scaffold. Each descriptor has one authority and one severity; an old multi-arm module whose arms differ on either axis splits into separate policy ids under the same family.

Each module exports exactly one policy and `id` equals its filename. `family` is a validated kebab value and the live family set is derived from loaded descriptors; there is no family registry. A family means policies reuse the same computation or subject reader, not that their filenames share a prefix or their prose mentions the same topic. A policy with no proven sibling uses its own id as a singleton family. The existing `docRow` and hand-counted enforcement-roster row disappear. `gate:list`/`gate:explain` derive the machine roster from the loader, while the enforcement document keeps only system-level law. A split old module therefore becomes several small policy modules sharing one family instead of one descriptor with per-arm authority switches.

Every self-proof row declares its fixture mode and paths explicitly. Source/type fixtures run in the in-memory workspace; resource fixtures materialize their declared files. No default path inferred from population and no fake real-tree anchor decides which substrate a proof receives.

No proof writes `__g_`/`__dc_` files into the developer's working tree. Gitignore is not cleanup: it would hide crash leftovers while filesystem-based gates could still load them and change cross-file populations. Syntax/type proofs use virtual files, resource proofs use auto-cleaned temp roots, and real-corpus controls add a virtual overlay to the loaded Project. The current live-tree planting suite cleans reserved leftovers on entry and in `finally` during migration, then is retired at cutover with the reserved probe-artifact filters.

## Standard capabilities

Every Orb gate gets the same behavior without implementing it itself:

- one sanctioned `pnpm` command with tier plus file/folder/package/project/changed/whole scope;
- explicit `--check`, `--family`, strict-scope refusal, list/explain, JSON report, and stable exit codes;
- requested and effective population manifests, including deleted/renamed semantic paths;
- compiler-derived program membership and one lazy checker per workspace;
- error/warning severity with opt-in warning promotion;
- hard unsuppressible policy, exact ordinary occurrence waivers, and exact reviewed subject/operation grants;
- missing/empty/unresolved population refusal and failed-owner reconciliation withholding;
- per-gate files/members/resources/timing receipts;
- one pass-local shared-fact registry, with one collector over an exact population and read-only sibling consumers;
- the same fixture runtime for `mustFlag`/`mustPass`, with an explicit fixture mode instead of fake real-tree anchors.

The historical six-case marker probe becomes a central authority proof rather than six copied cases per gate. The ordinary-waiver engine proves unmarked, exact-position, stale/dead-position, malformed, over-broad, and consumption-order behavior once. Each ordinary policy proves that its own report supplies the correct policy and position identity. Hard policies have no waiver arm; reviewed-grant policies prove subject/operation identity while central grant tests own malformed/stale reconciliation. Every policy still carries its founding `mustFlag`, legitimate near-miss and declared-limit `mustPass` rows, and empty/unresolved-subject controls wherever its verdict depends on a derived population.

## Shared query boundary

Gate modules may inspect the node delivered to a visitor, iterate their resolved `ctx.files`, request a canonical source file, request the shared checker, and call shared readers. They may not call `Project#getSourceFiles`, `SourceFile#getDescendants*`, `forEachDescendant`, `new Project`, or maintain their own workspace cache.

Shared whole-population work is a first-class branded `defineFact` provider with its own id, population, analysis, resources, collector, finish hook, receipts, timing, and errors. Policies declare provider tokens in required `facts` (`[]` when none) and may read them only through `ctx.fact(provider)` during `evaluate`. The planner records each unique provider population/resource manifest; the dispatcher instantiates it once, feeds it in the same physical walk as policies, finishes it before policy evaluation, and withholds every dependent policy on failure. Early/undeclared reads, duplicate provider ids, selected-file consumers, unused dependencies, missing receipts, and unconsumed resources refuse. The registry is invocation-local and discarded after the command; no module cache or cross-command daemon exists.

API choice and performance guidance live in `tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md`; filesystem-backed providers also read `NODE-26-FILESYSTEM-CAPABILITIES.md`. These references are updated when the pinned ts-morph, TypeScript, or Node capability surface changes.

The shared reader layer owns:

- stable local binding resolution until write/cycle/dynamic ambiguity, with no hop cap;
- import/export/namespace/destructuring/computed-literal symbol origin;
- static string/number/object/tuple/Zod value resolution;
- class/JSX/DOM writer provenance;
- schema, finite-shape, bus, section, Base UI, tenancy, CSS, and resource facts;
- sanctioned-home and exact grant liveness.

A unique policy algorithm may live in `verify/lib`, but repository walking, binding identity, static-value unwrapping, and resource loading are shared primitives. Unsupported syntax returns an unresolved fact or tool error; it never returns absence.

`create` receives only the resolved files/resources, the lazy checker, shared query services, report/receipt sinks, and invocation metadata. It never receives a `Project`. Its returned `visitors`, optional `visitFile`, and optional `evaluate` run in that order; `evaluate` is the post-walk phase for cross-file judgments and stale-grant reconciliation.

## Population vocabulary

Use the parked dispatch-fence research as evidence, not verbatim policy. Run its off-tree equivalence diff against all 255 current predicates first. The owner has now supplied the previously missing second use: generic Orb policies must be intentionally applicable to `tooling/src` and `tests/tooling`, not excluded because a copied client/package predicate forgot them.

Named roots exist only for independently selectable workspace packages and top-level authored trees. Nested implementation directories such as DB schema, server domain/infra/transport, and the gate corpus use `under`/`notUnder` conventions; they do not get another hand-maintained root alias. Sanctioned homes remain exact reviewed grants with rename/deletion liveness, not population subtraction. Resource gates declare `@none` for TS dispatch and their explicit resource population. A predicate that cannot be represented without loss blocks that conversion until the shared algebra gains one reviewed, tested operator or the population change is explicitly classified; there is no custom-resolver escape hatch.

The final AST/compiler source universe is authored `.ts` and `.tsx` only. `.mts`, `.cts`, `.mjs`, and `.cjs` remain outside policy source populations as separate cleanup work; compiler membership cannot widen them back in. JSON/JSONC, CSS, Markdown, SQL, and other non-source formats participate only through explicit closed ResourceHost declarations. A hybrid policy may consume one `.ts`/`.tsx` path as both source syntax and a declared raw resource, but that dual role is explicit and receipted rather than inferred from the extension.

## Exceptions and debt

There is no gate-specific exemption grammar and no count ratchet.

- hard policy is unsuppressible;
- ordinary node/file occurrences use one rule-specific marker with reason, position, unused, and over-broad checks;
- recurring repository permissions use typed exact grants with `why` and `endsWhen` plus post-success liveness;
- unresolved debt is a warning tied to a positive numeric Project issue identity in `workItem`; an error policy cannot carry that warning-debt owner;
- authoritative runtime data such as `tokens.json` and generated-output parity remain enforced;
- current-population declaration counts, every-file manifests, and `*.baseline.json` debt retire.

Authority and severity are independent and required on every policy:

- `hard` findings have no suppression door;
- `ordinary` findings may consume the one central inline marker, bound to the exact policy and position with a mandatory reason; unused, malformed, and multi-occurrence over-broad markers are central reconciliation findings;
- `reviewed-grant` findings may consume only a typed central grant keyed by policy id, subject, and operation. The row requires `why` and `endsWhen`; a finding without those exact identity fields is a tool error. After a complete owner run, zero consumption is stale and more than one matching finding is over-broad and suppresses none;
- `error` findings block; `warning` findings remain visible in console/JSON and block only under the explicit warning-promotion option.

Grant and marker reconciliation runs only after every selected policy owner completed its population. A thrown, incomplete, empty, or unresolved owner withholds liveness judgments rather than falsely declaring its grants stale. Gate modules receive neither grant tables nor marker parsers.

## Existing migration machinery

Use `pnpm ast` as the receipted audit/discovery surface. `refs`, `aliases`, `stringy`, `respell`, `chains`, `regkeys`, `subset-callers`, `apisurface`, `literal`, and `rot` expose coupled sites, type/alias smuggling, duplicated subject readers, and likely family boundaries with an auditable scan ledger. Do not import the AST CLI, its module-global ledger, or its per-verb scope system into gate modules. Several lenses are intentionally heuristic/candidate-only and some carry stated limits. A pure collector becomes runtime machinery only after its fact computation is extracted behind the shared query boundary and planted controls establish the semantics a gate needs.

A proposed general `pnpm codemod migrate-gates` command was implemented and rejected after deep review. Only 14 current gates have an immediately mechanical descriptor shape, while the 827-line converter admitted semantic-manual gates, forbidden private machinery, symlink escapes, partial writes, corrupt context rewrites, and false idempotence. Repairing and then deleting that tool would cost more than converting the 14 reviewed files directly. The complete evidence is in [the migration-codemod audit](../reviews/stickler/2026-09-05-gate-migration-codemod.md). Migration lanes may use existing named codemod operations for transformations they already support, but no new general gate converter or private script enters the train. Every gate conversion remains a reviewed source edit with its exact file manifest, focused proof, and `gate:contract` delta.

## Atomic migration

Development commits may build migration tools and converted gate modules on this branch. The production runtime never accepts both shapes.

1. Build an off-tree census/equivalence command for descriptors, populations, direct walks, mutable state, baseline use, and shared-reader adoption.
2. Finish the population vocabulary and prove every old `scanRoot` admitted set byte-for-byte or record an intentional correction.
3. Build the new contract/runtime/query/authority/report path with planted host controls.
4. Consolidate shared readers before their gate families migrate. Replace fixed hop caps with visited-binding/write/dynamic refusal.
5. Convert every gate. Move state into `create`; replace direct walks with visitors/shared facts; replace baselines with fixes, exact grants, or warnings.
6. Run old/new differential over the same frozen/current corpus. Classify every changed finding and every population delta.
7. In one cutover state, switch loader/runner/CLI to the new contract and delete the old descriptor fields, old harness paths, legacy markers/baselines, temporary census command, and obsolete self-policing gates.

No adapter survives the branch. No gate is credited because a similarly named module exists; the loader, command, tests, and real run must exercise it.

### Closed migration census and waves

The current 255-module corpus has four mutually exclusive hook shapes: 122 node-visitor, 34 file-hook, 86 run-only, and 13 mixed run plus visitor/file-hook. The mixed 13 migrate last because their post-walk ordering is load-bearing. Cross-cutting prerequisites are 188 population predicates, 66 `begin` hooks, 80 `finalize` hooks, 81 gate modules with descendant walks, 49 with `getSourceFiles`, 53 `fsBacked` gates, and only seven current consumers of the canonical symbol reader.

The symbol-aware first-wave subset is 86 policies: 17 A-M and 69 N-Z have `visit`, no `visitFile`/`run`/`fsBacked`, and no proven direct walk. All 86 files were read in full and are mapped in [simple-visitors-a-m.md](../reviews/gate-runtime/simple-visitors-a-m.md) and [simple-visitors-n-z.md](../reviews/gate-runtime/simple-visitors-n-z.md). The resource manifest is separately closed at 53 policies: 29 resource-only, 24 hybrid, 50 entire-population, and three selected-file policies; its typed host and proof requirements are in [resource-gate-access-patterns.md](../reviews/gate-runtime/resource-gate-access-patterns.md). The disjoint remainder is 116 policies, classified by hook, population, authority, family dependency, and blocker in [uncovered-gate-conversion-census.md](../reviews/gate-runtime/uncovered-gate-conversion-census.md). Current exemptions, custom markers, grants, warnings, authoritative data, and deletion candidates are closed separately in [exception-authority-census.md](../reviews/gate-runtime/exception-authority-census.md). These sets are migration work shapes, not new production registries.

Within the 86 first-wave policies, exactly 14 were immediately mechanical source edits: four A-M rows and ten N-Z rows labelled `codemod-mechanical` in those reports. The earlier “15/69” handoff was wrong: 69 is only the N-Z visitor intersection, and the apparent fifteenth policy requires both a codemod-shaped edit and reviewed-grant migration. The rejected converter also proved that shallow visitor shape cannot establish semantic eligibility. Those 14 policies are now direct final descriptors; [mechanical-gates-1584.md](../reviews/gate-runtime/mechanical-gates-1584.md) records 89 passing proofs, exact old/new population equality over 7,006 files, zero current-corpus finding deltas, and the ruled kebab rename of `bus-on-data-no-store-write`.

The re-derived resource waves add `feature-owns-definition`, `package-layout`, `ui-exports-map-complete`, `server-layout`, `component-size`, and `component-size-ui`, bringing the credited total to twenty final legacy policies with 112/112 proofs. Their exact population and finding differentials are appended to [resource-layout-size-inventory.md](../reviews/gate-runtime/resource-layout-size-inventory.md); the remaining candidates stay uncredited until individually re-derived.

The bus producer wave adds four converted legacy policies on one first-class fact provider, bringing the credited total to twenty-four with 127/127 migrated-policy proofs; the new hard `bus-fact-health` support policy adds two fact-health proofs. After merging local `main` at `f4fd77dbf`, the full typed project has 7,128 files while the semantic subject is the exact 1,585 contracts/server files declared by the provider. Current old/new findings are 0/0 for all four. The isolated final run is still slower than legacy, so composed command performance/RSS remains a cutover requirement. Exact evidence and rejected designs are in [bus-family-1584.md](../reviews/gate-runtime/bus-family-1584.md).

`pnpm gate:contract` is the temporary migration census, not a second conformance runtime or a ratchet. On the 2026-09-05 base it reports 1,489 concrete sites across all 255 modules: 255 descriptor wrappers, 688 legacy fields, 345 symbol-proven direct walk/source lookups, two gate-owned Projects, 40 module-scope `let`/`var` statements, 145 proven mutated module bindings, and 14 baseline-path expressions. After the 14 mechanical conversions and final `defineGate` provenance repair, it reports 1,447 findings: 28 legacy-field sites and 14 false wrapper findings are gone. It is deleted after all counts reach zero and `gate-modernization` owns the permanent rules.

The emergency fold at integration commit `8c677f8c5` preserves every active task and subagent checkpoint in this branch. [checkpoint-2026-09-05.md](../reviews/gate-runtime/checkpoint-2026-09-05.md) is the exact resume ledger for resource declarations, waiver migration, schema, bus, registry, and CSS/static-class work. Several folded commits are candid red WIP; the 1,447 figure above is the last verified pre-WIP census and must be re-derived after the resume repairs before claiming further conversion credit.

The 2026-09-06 resume converted the schema-fact and registry-definition families (five and nine legacy modules; `asset-refs-fk-coverage` retired into a Drizzle-runtime static stage; two registry modules split off reviewed-grant siblings) and added the central reviewed-grant data home. At `aafe68db3` the corpus is 259 modules, 52 final and 207 legacy, and `gate:contract` reports 1,276 findings. The first composed measurement over all 52 final policies is 59.5 s wall and 5.74 GB peak RSS on 7,151 loaded sources with zero errors and zero effective findings; the exact receipts are in [checkpoint-2026-09-05.md](../reviews/gate-runtime/checkpoint-2026-09-05.md).

The wave-3 resume converted the canonical-origin client family (twelve policies on three new type-level origin readers) and the canonical-origin server and test family (fourteen policies on four new readers, including the Drizzle client identity read by METHOD declaration rather than handle spelling). Neither family needed a reviewed grant, and three permanent legacy ignore markers were deleted because the converted policies pass their sites by identity. At `a827f2426` the corpus is 259 modules, 78 final and 181 legacy, and `gate:contract` reports 1,202 findings. The composed measurement over all 78 final policies is 64.0 s wall and 6.38 GB peak RSS on 7,205 loaded sources with zero errors and two effective findings, both the real side-gen bypass filed as #1816; family evidence is in [origin-client-family-1584.md](../reviews/gate-runtime/origin-client-family-1584.md) and [origin-server-family-1584.md](../reviews/gate-runtime/origin-server-family-1584.md).

The wave-4 resume converted the two sanctioned-home families as exact reviewed grants (ten server gates into eleven policies with forty rows; fourteen client gates into fourteen policies with thirty rows and one authority split to ordinary), and modeled the `chatsChanged` conditional publisher in the shared bus producer fact: the blocking cause was the OVERLOADED `defineBusChannel` export closing the `.publish` door, which is now proven by the method's declaration home; a whole-union flow type is ruled a forward, never a producer and never a refusal. `user-bus-coverage` and `bus-definition-belts` then converted, the latter into four hard policies whose three legacy tables are derived from types and descriptors, and the deferred `connectionsChanged` member became typed warning debt on #1822. Every lane went through a fresh-context verifier loop (two, three and four rounds) whose findings were fixed on the warm lane before its fold. At `0688f876e` the corpus is 264 modules, 109 final and 155 legacy, and `gate:contract` reports 1,070 findings. The composed measurement over all 109 final policies on a near-quiet box is 83.3 s wall and 6.83 GB peak RSS on 7,243 loaded sources with zero errors and six effective findings, none introduced by the wave; family evidence is in [home-server-family-1584.md](../reviews/gate-runtime/home-server-family-1584.md), [home-client-family-1584.md](../reviews/gate-runtime/home-client-family-1584.md), [bus-pair-1584.md](../reviews/gate-runtime/bus-pair-1584.md) and the appended [bus-family-1584.md](../reviews/gate-runtime/bus-family-1584.md). The generic-producer consolidation the bus-family doc blocked on this relay is now unblocked.

The wave-5 resume closed the shared-reader row three families were waiting on and consolidated the producer
family. `resolveModuleMemberOrigin` used to refuse any multiply-declared export as `ambiguous`; a FUNCTION
overload set (same kind, same source file, at most one implementation body) now resolves to one home with the
declaration count carried in the verdict, while a value/type merge, a `function`+`namespace` merge, an
`export *` fan-in and a two-file split still refuse. 557 live import specifiers gained a precise verdict
(React's `useState`/`useRef`, query's `useQuery`, drizzle's `inArray`, our own `defineBusChannel` and
`createAutosaveEntityForm`), 88 correctly still refuse, two gate-local trace-declaration workarounds were
deleted as superseded, and the composed pre/post over the same corpus moved NOTHING — no per-policy count, no
finding, no waiver or grant consumption — which is evidence rather than a false clean because the arm is
proven reached by that census. The five per-union bus coverage policies then became one
`bus-producer-coverage` quantified over the belted roster, retiring `bus-coverage-owner` (its guarantee is now
the policy's own denominator plus two refusals) and its 270-module provider; all 21 proof rows moved verbatim
and the 66-member/271-anchor producer census is set-identical. At the lane tip the corpus is 259 modules, 104
final and 155 legacy, and the composed pass over all 104 is 237 raw = 157 waived + 78 granted + 2 effective
with zero alarms on 5 providers. Evidence: [checkpoint-2026-09-05.md](../reviews/gate-runtime/checkpoint-2026-09-05.md)
§"Resume 2026-09-06, wave 5" and [bus-pair-1584.md](../reviews/gate-runtime/bus-pair-1584.md) §5.

Work proceeds in dependency order:

1. population algebra plus old/new admitted-set equivalence;
2. final contract, invocation context, dispatcher, authority/severity/report path, and fixture runtime;
3. shared binding/symbol/static-value/resource readers needed by more than one gate family;
4. simple visitors and file hooks with no private walks;
5. descendant-walking gates after their shared reader exists;
6. run/resource gates, then the 13 mixed timing-sensitive gates;
7. frozen-corpus old/new differential, performance/RSS comparison, authoring/scaffold rewrite, and one atomic cutover.

Every implementation lane receives an exhaustive file manifest generated from the current corpus, reads those gate files in full, and owns no runtime or shared-reader architecture. A lane may request a missing shared primitive; it may not add a local walk, cache, scope predicate, exemption grammar, or registry. Membership and progress are derived from the loader and migration census rather than maintained as a second list.

The 13 mixed-hook modules have been read in full and are ruled before conversion:

| Current module | Final mapping |
| - | - |
| `agent-bridge-lock` | visitors plus exact-file `visitFile`; all cross-file reconciliation in `evaluate`; one hard policy |
| `design-audit-rule-proof` | registry/proof visitors plus `evaluate`; one hard policy |
| `no-inline-union-redecl` | ordinary union/respell policy, reviewed SDK-mirror grant policy, and hard grant-health policy under one family |
| `query-boundary-reservation` | ordinary unreserved-boundary policy plus hard duplicate/seam-health policies |
| `session-channel-boundary` | ordinary construction policy plus hard home-health policy |
| `sub-floor-disclosure` | ordinary occurrence policy plus hard vocabulary-health policy |
| `testid-liveness` | ordinary dead-consumer/row policy plus hard registry-health policy |
| `tooling-argv-front-door` | ordinary illegal-reader, reviewed entry-grant, and hard population-health policies |
| `tooling-front-door` | ordinary import-boundary policy plus reviewed root-config grant policy |
| `tooling-instrument-proof` | syntax/resource visitors plus `evaluate`; one hard policy |
| `tooling-ops-direct-invocation` | canonical exported-function/module-call facts plus `evaluate`; one hard policy |
| `tooling-shared-plumbing` | separate family ids for Project home, browser doors, artifact/run-slot, exit/CLI, child-process priority, ports, and clock budgets; each id has one authority |
| `ui-variant-axes-stamped` | hard recipe/duplicate/blindness policies plus work-item-linked warning debt; baseline deleted |

For all 13, `evaluate` runs after the shared walk and before central waiver/grant liveness reconciliation. This preserves the current load-bearing rule that a post-walk finding consumes its waiver before the waiver auditor judges staleness, without relying on filename order.

## Acceptance

- all 255 current policies have one live owner or explicit retirement;
- zero `scanRoot`, `scopeSafety`, `begin`, `finalize`, free-form `run`, direct project/descendant walk, gate-owned Project, or mutable module-state accumulator remains in gate modules;
- zero gate-owned filesystem glob, path-corpus regex, comment/suppression parser, binding/symbol resolver, static-value parser, resource loader, or workspace cache remains;
- every registered policy supports all declared command/scope/severity/report/authority capabilities;
- all source/helper/tests/exemptions were read in full and every current-main delta re-attested;
- aliases, namespace/re-export/destructure/computed/wrapper/shadow/write/cycle/dynamic variants are planted wherever identity matters;
- no baseline JSON or parallel registry remains;
- full structure, focused behavior, differential, failure/re-entry, broad CPD, and performance/RSS artifacts are read before owner review.
