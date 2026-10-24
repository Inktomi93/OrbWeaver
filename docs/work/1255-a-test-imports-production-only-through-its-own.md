---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: tests
---

# A test imports production only through its own mirror's front door

## What

Production enforces tier direction and forbids sideways domain imports (`.dependency-cruiser.ts`, the `domain-feature-front-door` and tier rules). The test tree mirrors the source tree but has no equivalent rule: a test under `tests/server/domain/<x>/` may import another domain's front door (eleven sites today: chat tests import `admin`, stats import `chat`, plugin import `settings`, settings import `persona`, `character` and `assets`, rpg and tool-use import `chat`) and may reach into `entry/` or `foundation/` (thirty-five files, mostly `authConfigFromEnv` from `entry/auth` and `getLog`, `logRing`, `recentTraces` from `foundation/observability`). The composed root already exposes every service and the harness owns auth config, so these are tests reaching past the product's own doors.

## Why

A test that imports another domain or a lower tier directly asserts on wiring the product does not expose, and a storage or tier refactor breaks it; the cake is only a cake if tests obey it too.

## Done when

A dependency-cruiser rule using a capture group: a module under `tests/server/<tier>/<name>/` may import production only from `packages/server/src/<tier>/<name>/index.ts` (its mirror's front door), `@orb/contracts`, `@orb/kit`, `@orb/db` types, and testkit doors; everything else reaches the test through the composed root or a harness seam; the eleven cross-domain and thirty-five cross-tier sites are swept onto `root.services.*`, `root.app.*`, `harness.authConfig` and a harness log seam (`harness.logs` or the existing capture) where one exists, or the missing seam is added to the harness; a planted probe pair proves the rule; the same shape for the `tests/client`, `tests/inference`, `tests/kit`, `tests/contracts` and `tests/db` mirrors is item 1282; README "What is enforced" and Spine-Testing §2 name the rule.

## Evidence

Measured on main `e468a413a3` with the new rules, server suites only: 108 edges in 80 files (type-only included); 89 edges in 72 files once a type-only import of another door is legal. After the sweep: 0.

| Group | Files | Outcome |
| - | - | - |
| Type-only import of another door's type (`role-data`, `query-capability`, `env-record-seams`, `egress-seams`, `timers-seams`, `variant-payloads`, `room-reach-rows`, `live-bus-isolation`) | 9 | legal under the rule, unchanged |
| Log and trace reads from `foundation/observability` | 20 | seam: `processObservability` on the composed door |
| A physical loopback peer built from `infra/network` and `infra/timers` | 1 | seam: `servePhysicalPeer`, also the corpus provider server's one home |
| A Principal's role through `isOwner`, `isAdmin`, `can` | 7 | seam: re-exported from `@orb/testkit/node/auth`, moved by `move-import-names` |
| A constant another module owns | 10 | moved: 4 (`TURN_ABORTED_OP_CODE`/`TURN_LOCKED_OP_CODE` from `@orb/contracts/chat`, `SEED_MANIFEST` from `@orb/default-content`, the record's own `AUTH_FALLBACK` default); constant: 6 listed in `SERVER_TEST_REACHES` |
| Another domain's op factory assembled by hand | 16 | moved to composed objects or product verbs: 10 (`app.contentSeeder`, `app.personaSeeder`, `app.examplePluginSeeder`, `app.distributedPluginApplier`, `app.rpgTrace`, `chat.getChat`, `character.generateGreeting`, a restarted root as the cold seed, the user-settings export, the root's workload driver); seam: 6 (`showcaseBundles`, `app.cas`, `app.crossFeatureOps`) |
| A test whose subject lives in another mirror | 5 | moved to the owner's mirror (assets, embeddings, imagery, `entry/boot`, sessions persistence) |
| Suites reaching `entry/compose`, `domain/import`, `domain/plugin`, `infra/storage`, `foundation/env`, `foundation/data-layout`, `transport/trpc` | 15 | seam: `createTestEnv`, `configureOidc`, `SessionsCrypto`, `extractZip`, `stagedImportsOf`, `trpcProcedures`, `seedPluginFetchedAsset` |
| A boot wrapper or the host principal resolver from `entry/` | 4 | moved: the domain's own seed function, `harness.principalFor` |
| Refused | 0 | |

A file can sit in two groups. The other test trees are item 1282.
