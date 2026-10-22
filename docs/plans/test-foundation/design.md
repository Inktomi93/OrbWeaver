---
kind: plan
status: active
updated: 2026-10-21
---

# Tests on the production harness

## Goal

Rebuild meaningful legacy cases through production composition, production-derived builders, the shared corpus and real client mounting. Remove copied assemblies from maintained tests when qualified replacements land.

## Shape

### Program ownership

This plan owns the test rebuild and its execution order. The [task index](tasks.md) owns the execution queue. Work items own current assignments, blockers and evidence.

### Scope

The program covers testkit, production-root test composition, builders, corpus data, the client mounting door and replacement suites. Change production only when a selected replacement exposes a real defect or needs a genuine composition seam.

The external legacy source named by [Spine-Testing](../../law/Spine-Testing.md) is reference-only. It is not part of this repository's tests, typecheck or CI.

Testkit support and runner configuration needed to execute a concrete replacement remain in scope. Add only machinery required by that case.

Use existing repository checks for changed behavior. Keep unrelated failures separate from replacement work.

### Execution sequence

| Phase | Work | Exit condition |
| - | - | - |
| Production seams | Use the actual production graph; fix only defects or missing injectable edges demonstrated by selected tests. | The selected cases reach production without copied domain logic. |
| Server harness | Qualify the existing server composition root, isolated database, injected business time and external-edge adapters. | Cases prove permissions, outputs and joined cleanup through the real graph. |
| Inputs and mounting | Qualify production-derived builders, the shared corpus and the existing client composition door. | Inputs satisfy production contracts and mounted registries derive from production. |
| Corpus flows | Complete corpus-backed e2e smoke across the required authentication, provider and viewport modes. | The actual wires and user-visible results pass without private owner data in artifacts. |
| Replacement suites | Rebuild server domains, component CTs and remaining cases in substantial related batches. | Meaningful cases survive, a production defect control fails, and the replacement contains no copied assembly. |

Start a replacement batch when its actual harness dependencies are available.

### Current foundation

The production server graph, world-split testkit, builders, corpus and client mounting door already exist. Their existence does not complete replacement coverage or runtime qualification.

Use these foundations for the remaining cases. Qualify corpus and support lifetimes through maintained cases. Keep source delivery, passing runtime cases and unqualified acceptance distinct.

### Remaining work

- Qualify existing server, corpus, client and E2E mechanisms through their maintained cases.
- Rebuild meaningful reference cases through those mechanisms, including client lifecycle and recall behavior.
- Correct product defects exposed by selected cases, with behavioral regression coverage.
- Review unused support and production test hooks in the owning replacement batch.

Source delivery is not runtime acceptance. The OIDC issuer, typed tRPC recorder and production-backed CT mount already exist; qualify them instead of rebuilding them.

Keep the external reference source outside the test population. Do not restore deleted probes, checker infrastructure or legacy compiler programs.

### Candidate cases

| Area | Preserve | Replacement approach |
| - | - | - |
| Client composition | Registry entries and order, session recovery, subscriptions, nested mounts and disposal. | Mount the production composition door; assert observable behavior. |
| User flows | Routes, app-shell journeys, pending joins, imports and exports. | Run E2E against the shared corpus and actual authentication modes. |
| Server composition | Ownership, host checks, participant scope, targeted pruning, search and persistence. | Call the real server root instead of copying queries or domain assemblies. |
| Inference and plugins | Capability refusal, target selection, provider failures and guest behavior. | Use production entries with scripted external edges. |
| Contracts | Valid and invalid boundary inputs, actor keys, wire subsets and serialization. | Parse production-derived inputs through real schemas; use type assertions for compile-only properties. |
| Paging and imports | Cursor behavior, batch limits, skipped files and replanning. | Exercise the owning production operation, not a responder's copied algorithm. |
| Rendered behavior | Error and loading states, geometry, focus, accessibility, contrast and themes. | Use component CTs and retained measurement helpers. |
| Fixtures and constants | Valid identities, hashes, ownership, settings defaults and served security policy. | Use production-derived builders or corpus data; import shared constants when maintained consumers need them. |

### Rules

- Call production through its real public entry and composition root.
- Keep business decisions in their production domains; testkit supplies composition machinery and external-edge adapters, not copied rules.
- Derive inputs and response shapes from production contracts, builders or the corpus.
- Inject business clocks, IDs, randomness and timers through composition. Keep native protocol and physical timing under [Spine-Testing section 3](../../law/Spine-Testing.md#3-determinism--mock-doctrine).
- Retire legacy-only support with its replacement rather than making it a new foundation dependency.
- Add no production export or testkit door solely to keep a legacy harness compiling.
- Stop fake-heavy legacy fixture retrofits; rebuild the cases in their correct layer.
- Keep unrelated architecture and export cleanup outside the replacement assignment.

### Each layer answers one question

| Layer | Owns | Does not replace |
| - | - | - |
| e2e on the corpus | User flows and actual auth, cookies, CSRF, router, streams, database, migrations, uploads and plugin-host wires. | Component states that require controlled responses. |
| CT | Component behavior, hard states, rendered geometry, contrast, focus, accessibility, viewports and themes. | A route or app-shell user flow over fabricated backend calls. |
| Server integration | Domain logic, permissions, cross-tenant behavior and persistence through the production composition root. | Domain behavior with a copied implementation. |
| Unit | Pure logic in kit and contracts. | I/O or application flows. |

Move flow-walking route and app-shell CT cases to corpus e2e. Keep component, measurement and controlled-state cases in CT.

### How a replacement is written

1. Inventory the meaningful cases of the legacy file and identify the production entry each case must exercise.
2. Build data through production-derived builders or the corpus.
3. Use the real composition root and isolate its database and external edges.
4. Assert observable behavior, permissions, persistence and cleanup rather than a literal the test created.
5. Plant a production defect or remove a required behavior and show the corresponding control fails.
6. Compare the replacement case list with the reference source; remove copied assembly from maintained tests.
7. Run the affected maintained tests and applicable existing repository checks; record precise limitations.

### Server composition

The test root delegates to production entry composition. Each domain case uses that graph instead of constructing a domain assembly inside a fixture.

Production owns business rules and persistence. The harness owns injected time and identity sources, external-edge scripts and physical resource lifetimes. Unexpected stream or child failures remain observable; ordinary disconnect and disposal join before completion.

### Builders and corpus

Use the canonical production-derived builders and corpus across server tests, CTs and e2e. Keep contract defaults, valid minted identities, ownership and native database behavior.

Qualify corpus producer, clone, search and cleanup lifetimes through their maintained cases. Do not weaken boundary parsing or fabricate missing fields to preserve old fixtures.

Keep private owner data, credentials, files and personal artifacts outside Git, publication and CI. Private recovery evidence is not a substitute for a public synthetic-corpus test.

### Client mounting

Production data construction remains in `packages/client/src/compose/client-runtime.ts`. Authenticated registries remain in `packages/client/src/compose/authed-composition.tsx` and are delivered through `packages/client/src/compose/authed-providers.tsx`.

`tests/support/browser/ct-data-providers.tsx` mounts through that production door. It controls document capabilities and network responses without replacing application modules or copying registry tables.

Primitive subjects use `CtIsolation` from `tests/support/browser/ct-isolated-subject.tsx`. Registry variants use the named exception in `tests/support/browser/ct-isolation.ts`.

Qualify query teardown, document and notification bindings, nested mounts, session recovery and bus subscriptions through observable behavior. Flow tests remain e2e rather than another application assembled inside CT.

### Public entries and legacy retirement

Follow D318 and the existing public package doors. Rebuilt tests use production entries and testkit world subpaths.

Adjudicate test-only production hooks and unused helpers with their owning cases. Delete unsupported adapters; retain production-derived helpers needed by selected replacements.

Use the sibling legacy source only to identify cases. It is not part of this repository's tests, typecheck or CI.

### Completion and verification

A batch completes when its replacement preserves meaningful cases, exercises the real entry, qualifies its defect controls and removes copied assembly from maintained tests. Match evidence to the actual source, selected population and runtime.

Use D317 and the orchestrator/lane completion policy for existing verification. A timeout or tool failure supplies no behavioral verdict. Record unrelated limitations separately.

## Rejected

Copied production assemblies, fake-heavy legacy retrofits, test-only production doors, and unrelated architecture campaigns as prerequisites.

## Coupled sites

[Spine-Testing](../../law/Spine-Testing.md) owns test composition, layer responsibilities and legacy boundaries. The inference-flow plan remains separate and supplies only dependencies required by a selected production case.

## Test plan

Qualify production-root behavior, deterministic inputs, ownership, physical cleanup and the actual client mounting door. Preserve meaningful cases and prove production defects are caught. Run each replacement batch when its concrete dependencies are qualified; unrelated corpus flows do not block it.
