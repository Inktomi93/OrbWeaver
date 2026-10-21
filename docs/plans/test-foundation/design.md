---
kind: plan
status: active
updated: 2026-10-21
---

# Tests on the production harness

## Goal

Rebuild the legacy test population through production composition, production-derived builders, the shared corpus and real client mounting. Preserve meaningful regression cases and delete copied legacy assemblies when qualified replacements land.

## Shape

### Program ownership

This plan owns the test rebuild and its execution order. The [test-mirror inventory](../test-mirror/design.md) supplies candidate cases, not a separate retrofit queue. Work items own current assignments, blockers and evidence.

### Scope

The program covers testkit, production-root test composition, builders, corpus data, the client mounting door and replacement suites. Change production only when a selected replacement exposes a real defect or needs a genuine composition seam.

Semantic engines, fact stores, AST and codemod development, compiler experiments, checker migrations, checker recertification, global lint/export cleanup and performance projects are outside this plan. Their unfinished work is parked independently and is not a prerequisite for this rebuild.

Testkit support and runner configuration needed to execute a concrete replacement remain in scope. Add only machinery required by that case. Report unrelated tooling failures separately instead of expanding their implementation or qualification here.

Use existing repository checks for changed behavior. Parking tooling work does not remove production rules or authorize new suppressions.

### Execution sequence

| Phase | Work | Exit condition |
| - | - | - |
| Production seams | Use the actual production graph; fix only defects or missing injectable edges demonstrated by selected tests. | The selected cases reach production without copied domain logic. |
| Server harness | Qualify the existing server composition root, isolated database, injected business time and external-edge adapters. | Cases prove permissions, outputs and joined cleanup through the real graph. |
| Inputs and mounting | Qualify production-derived builders, the shared corpus and the existing client composition door. | Inputs satisfy production contracts and mounted registries derive from production. |
| Corpus flows | Complete corpus-backed e2e smoke across the required authentication, provider and viewport modes. | The actual wires and user-visible results pass without private owner data in artifacts. |
| Replacement suites | Rebuild server domains, component CTs and remaining cases in substantial related batches. | Meaningful cases survive, a production defect control fails, and the replaced legacy assembly is deleted. |

Independent replacement batches may run in parallel once their actual harness dependencies are available. Do not wait for parked analyzer or checker projects.

### Current foundation

The production server graph, world-split testkit, builders, corpus and client mounting door already exist. Their existence does not complete replacement coverage or runtime qualification.

Use these foundations rather than rebuilding their tooling. Qualify remaining corpus and support lifetimes through actual maintained cases. Keep source delivery, passing runtime cases and unqualified acceptance distinct.

### Rules

- Call production through its real public entry and composition root.
- Keep business decisions in their production domains; testkit supplies composition machinery and external-edge adapters, not copied rules.
- Derive inputs and response shapes from production contracts, builders or the corpus.
- Inject business clocks, IDs, randomness and timers through composition. Keep native protocol and physical timing under [Spine-Testing section 3](../../law/Spine-Testing.md#3-determinism--mock-doctrine).
- Preserve meaningful legacy regression execution until the replacement carries its cases.
- Retire legacy-only support with its replacement rather than making it a new foundation dependency.
- Add no production export or testkit door solely to keep a legacy harness compiling.
- Stop fake-heavy legacy fixture retrofits; rebuild the cases in their correct layer.
- Keep unrelated architecture, export and checker cleanup outside the replacement assignment.

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
6. Compare the replacement case list with the legacy source before deleting its copied assembly.
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

Delete test-only production hooks and legacy-only helper exports with the cases that replace them. This is local replacement work, not a global export census or a new lint project.

Keep the existing legacy CI and native typecheck obligations under D320. Legacy extraction, analyzer expansion and checker qualification are not migration phases.

### Completion and verification

A batch completes when its replacement preserves meaningful cases, exercises the real entry, qualifies its defect controls and removes the replaced assembly. Match evidence to the actual source, selected population and runtime.

Use D317 and the orchestrator/lane completion policy for existing verification. A timeout or tool failure supplies no behavioral verdict. Record unrelated limitations without silently restarting parked tooling work.

## Rejected

Copied production assemblies, fake-heavy legacy retrofits, test-only production doors, and unrelated architecture or tooling campaigns as prerequisites. Moving tests out of the repository also discards the regression net needed during replacement.

## Coupled sites

The [test-mirror inventory](../test-mirror/design.md) retains candidate cases and production contract concerns. [Spine-Testing](../../law/Spine-Testing.md) owns test composition, layer responsibilities and legacy boundaries. The inference-flow plan remains separate and supplies only dependencies required by a selected production case.

## Test plan

Qualify production-root behavior, deterministic inputs, ownership, physical cleanup and the actual client mounting door. Preserve meaningful cases, prove production defects are caught, and delete the corresponding legacy assemblies. Complete corpus flows before general server and component replacement batches.
