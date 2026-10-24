---
kind: work
status: open
updated: 2026-10-24
priority: P2
plan: restoration-register
---

# Testing law holds in the test kit

## What

The maintained kit under `tests/support/**` holds [Spine-Testing](../law/Spine-Testing.md) sections 3 and 9. Time, ids and randomness are injected. Server composition calls production. Every root has a joined lifetime. Provider recipes, cancellation reporting and software snapshots keep their observable outcomes.

The measured gap is small. The kit has no ambient business clock and no unseeded id source. The work is the list below.

### Measured inventory

Scope: every `.ts` and `.tsx` file tracked under `tests/support`. Both languages were scanned with `ast-grep`. An `rg` pass backs each negative claim.

| Category | Finding | Sites |
| - | - | - |
| Business time | No `Date.now()`, no-argument `new Date()`, `performance.now()` or `DateTime.now()`. | 0 |
| Derived dates | `new Date(x)` over an injected value: `corpus-surface-wire.ts:21`, `:22`, `x509.ts:63`, `oidc-issuer.int.test.ts:71`. Compliant. | 4 |
| Physical timing | `setTimeout`, `setInterval`, `AbortSignal.timeout`, `Atomics.wait`, `setImmediate` and `node:timers/promises` waits, all at a child, socket or provider edge. Section 3 permits them. | 25 |
| Delay as barrier | A fixed delay or turn count decides completion: `corpus-fixture-lifetime.int.test.ts:50`, `corpus-execution.int.test.ts:43`, `:132`, `corpus-workloads.int.test.ts:49`, `showcase-guest.ts:43` (24 turns). Section 7 needs a lifecycle signal. | 5 |
| Second epoch | `atlas-guest.ts:9` `FIXED_EPOCH` beside the shared `FROZEN_AT_MS`. | 1 |
| Duplicate timer seam | `createManualTimer` (`iso/clock.ts:55`, one consumer `tests/inference/roles/side-gen.int.test.ts`) beside `createControlledTimers` (`iso/timers.ts:17`). | 2 seams |
| Unseeded ids and randomness | No `randomUUID`, `Math.random`, `nanoid` or bare `typeid()`. Ids come from `createSeededIds` (`iso/ids.ts`), `createIdSource(ids.next)` (`server.ts:543`) and `ids.uuid` (`server.ts:581`). | 0 |
| Entropy in tests | `randomBytes(32)` as the secret-box key, in nine files. Twenty-eight sites in five files already use `Buffer.alloc(32, 1)`. | 19 |
| Ambient process reads in the root | `server.ts:572` `hostEnvAllowlist` and `:573` `authModeSource()` read the real process. | 2 |
| Copied assemblies | See the next table. | 3 |
| Plain resource bindings | Triage by file found one file without cleanup: `node/db.int.test.ts` opens eight in-memory handles and closes none. The other bindings adopt through `defer`, `use` or `using`. | 8 handles |

The kit calls `createServices` once, in `server.ts:570`. Checked and not copies: the `ServicesDeps` field list (`server.ts:570-597`, type-checked against production), `ENV_SEAMS` (a `Record` over production env keys with the production parse), the auth mode tables (read `AUTH_MODE_DEFAULT_FALLBACK`) and the browser mount (`ct-runtime.ts:25`, `ct-data-providers.tsx:33` call `createClientRuntime` and `createAuthedComposition`).

| Copy | Production owner it duplicates |
| - | - |
| `server.ts:602-609` `workloadExecution` literal, and `workloadsFor` (`:483-511`) that runs one workload by hand | `buildServiceJobs` runner deps and worker (`packages/server/src/entry/compose/service-jobs.ts:44-57`) |
| `server.ts:641-656` `createContext` parts for `internalCallerFor` | the tRPC mount (`packages/server/src/entry/app.ts:371-383`) |
| `db.ts:20-66` `freshDb` pushes the live schema with drizzle-kit | `runMigrations` (`packages/db/src/client/index.ts:376`), which `corpus.ts:769` already calls |

Real-root controls that exist: `seeded-ids.test.ts`, `server-lifetime.int.test.ts`, `server-native.int.test.ts`, `http-graph-teardown.int.test.ts`, `http-lifetime.int.test.ts`, `network-lifetime.int.test.ts`, `plugin-lifetime.int.test.ts`, `sdk-lifetime.int.test.ts` (identity replay), `model-kernel.int.test.ts`, `corpus-fixture-lifetime.int.test.ts`, `corpus-server.int.test.ts:127` (two roots write identical rows) and `oidc-issuer.int.test.ts` (frozen-time verification).

Controls that do not exist: a direct test of `createControlledTimers` and `createFrozenClock`, a test that `freshDb` matches the migrated chain, and a test for the two ambient process reads. The `db.ts` header cites a parity test at `tests/tooling/verify/ops/db-baseline-parity.int.test.ts`. That file does not exist.

## Why

Rebuilt tests need stable inputs and the actual production graph, not copied domain behavior.

## Done when

- `rg 'randomBytes' tests/support` finds no test or factory key.
- No fixed delay or turn count decides completion in the kit. Each negative assertion has a positive control.
- The kit has one timer seam and one frozen epoch.
- `server.ts` builds workload execution and internal callers from production owners, not copied literals.
- A control proves `freshDb` matches the migrated schema, or `freshDb` runs the migrated chain.
- A control covers `createControlledTimers` order, repeat and disposal.
- No test in `node/db.int.test.ts` leaves a database handle open.
- The root reads no real process input beyond the record it parsed.

## Plan

Run the legs in order. Legs 1, 2, 4, 5 and 6 touch only `tests/support`. Leg 3 reads production builders through their existing doors. Run each leg's named tests bare and by full path.

### Leg 1: one secret-box key (codemod candidate)

One rule across many files. Replace `randomBytes(32)` and `Buffer.alloc(32, 1)` with one exported kit constant. Follow `.claude/skills/codemod/SKILL.md` for the 47 sites. Keep a second distinct key where a case needs two.

Files: `corpus-connection.int.test.ts`, `corpus-library-views.int.test.ts`, `corpus-sdk-sessions.int.test.ts`, `corpus-recipe.ts`, `corpus-image-variants.int.test.ts`, `corpus-search-publication.int.test.ts`, `corpus-library-clone.int.test.ts`, `factories/credentials.int.test.ts`, `corpus-publication.int.test.ts`, plus the five files that use `Buffer.alloc(32, 1)`.

Done: no `randomBytes` under `tests/support`. The listed test files pass. `corpus-library-clone` keeps source and clone keys distinct.

### Leg 2: lifecycle signals replace delays (per-site judgment)

Five sites, each with its own signal: the abort event, the `ready` promise, or the held-statement release. Do not share a helper. Show each old form red under a slowed timer, then green.

Files: `corpus-fixture-lifetime.int.test.ts`, `corpus-execution.int.test.ts`, `corpus-workloads.int.test.ts`, `showcase-guest.ts`.

Done: no `physicalDelay` or turn loop decides completion in these files. Each negative assertion keeps a positive control.

### Leg 3: root builds from production owners (per-site judgment)

Call the production builders, `buildServiceJobs` and the `createContext` assembly, through the doors they already have. Add no production export that only tests use (0989). If a builder has no door, route its parts through the composition root's existing output instead. Then delete `workloadExecution`, `workloadsFor` and the `createContext` literal from `server.ts`.

Files: `tests/support/node/server.ts`, and read-only `packages/server/src/entry/compose/service-jobs.ts`, `packages/server/src/entry/compose/services.ts`, `packages/server/src/entry/app.ts`.

Done: `server.ts` holds no copy of either literal. `corpus-execution.int.test.ts`, `corpus-workloads.int.test.ts` and `server-lifetime.int.test.ts` pass. A production defect in runner deps fails them.

### Leg 4: `freshDb` schema parity (one site)

Default: keep the drizzle-kit push, which Spine-Testing names for `freshDb`, and add a control. Compare `sqlite_master` of `freshDb` with a database from `runMigrations(db, SHIPPED_MIGRATIONS)`. Repoint the `db.ts` header.

Files: `tests/support/node/db.ts`, `tests/support/node/db.int.test.ts`.

Done: the control fails when a table, column or index differs. It passes on the current tree. The header cites an existing file.

### Leg 5: timer and clock seams (per-site judgment)

Fold `createManualTimer` into `createControlledTimers` and move its two consumers. Point `atlas-guest.ts` at `FROZEN_AT_MS`. Add a unit test for timer order, repeat and disposal.

Files: `tests/support/iso/clock.ts`, `tests/support/iso/timers.ts`, `tests/support/iso/index.ts`, `tests/support/node/atlas-guest.ts`, `tests/inference/roles/side-gen.int.test.ts`.

Done: one timer seam is exported. The new test fails when due-order or disposal changes.

### Leg 6: root inputs and handle lifetimes (per-site judgment)

Replace `hostEnvAllowlist` and `authModeSource()` in `server.ts` with values from the parsed record, or a fixed value. Add a control that a developer shell variable does not change the root. Close the eight handles in `db.int.test.ts` through `AsyncDisposableStack`.

Files: `tests/support/node/server.ts`, `tests/support/node/env-seams.int.test.ts`, `tests/support/node/db.int.test.ts`.

Done: the control fails on the old code with a planted shell variable. The handles close.

## Evidence

The server harness exposes business clock, ID, random and timer seams. Existing support has selected runtime qualification; that does not establish complete replacement coverage.

[D319](../adr/0319-native-protocol-time-in-scripted-test-edges.md) preserves native signed-protocol timestamps and verification. It does not authorize ambient business clocks.

## Selected asset and imagery cases

This comparison covers `materialization-boundaries.test.ts` and `generation-policy.test.ts`. The selected replacements pass through production composition. This does not qualify either domain completely.

The replacements are [materialization boundaries](../../tests/server/domain/assets/verbs/materialization-boundaries.int.test.ts) and [generation policy](../../tests/server/domain/imagery/verbs/generation-policy.int.test.ts). Domain behavior runs through production composition. Canonical pure resolvers supply expected instruction text.

| Original behavior and assertions | Decision and maintained evidence |
| - | - |
| Background store fixes kind and magic; optional cap reads change between calls. | Rebuild live-cap changes through `settings.addExternalBackground`, actual egress and CAS. Assert stored kind, MIME and bytes. Keep [seed art](../../tests/server/domain/assets/verbs/seed-art.int.test.ts) for storage magic refusal. Drop exact forwarded argument objects and omitted-option checks. |
| Generated store preserves kind; owner-id storage resolves Principal and reads changing caps. | Keep actual generated ownership and MIME in [native inline images](../../tests/server/domain/chat/engine/inline-reply-images.suite.int.test.ts). Rebuild live cap changes through native chat generation. Drop fake Principal-resolution and forwarded-kind argument assertions. |
| Background and inline URL downloads use public policy, sniff MIME and preserve the supplied owner. | Rebuild background private-DNS refusal with a public success control, real egress and CAS. Keep the [public egress matrix](../../tests/server/infra/network/egress-public-policy.int.test.ts) for redirect and configured-endpoint permutations. Native base64 output proves generated ownership and MIME sniffing. Drop the fabricated inline URL delivery permutation; the inspected native providers supply data files, not URL files. The compatibility downloader branch remains unqualified. |
| SVG, byte cap and excessive dimensions refuse background, inline base64 and inline URL before storage. | Rebuild background and native-base64 live caps and dimensions with unchanged actual asset rows. A native PNG carrying an SVG MIME claim still stores as PNG. Keep native inline bad-magic/no-link/prose assertions and [surface outputs](../../tests/support/node/corpus-surface-outputs.int.test.ts) for background bad-image refusal. Inline URL-only permutations remain outside qualified producer coverage. |
| Non-success responses dispose unread; thrown download details stay off results; no storage occurs. | Rebuild background raw response cancellation and physical fetch rejection through actual egress. Assert sanitized refusal and unchanged assets. Inline URL-only lifecycle remains unqualified without a production supplier. Drop the warning-spy call assertion: operator logging is not a user-result contract. |
| Gallery refusal propagates exact owner and character arguments. | Drop fake-error forwarding. Keep seed-art foreign-subject refusal, owned placement and deduplication; surface outputs also prove foreign asset and subject refusal. |
| Image resolution uses run-as; capability, image, warning and usage forwarding remain unchanged; thrown execution rejects. | Keep [image variants](../../tests/support/node/corpus-image-variants.int.test.ts) for positive image warnings, parsed accounting, stored connection/model and owner. Rebuild negative warning filtering through actual `imagery.generatePicture`. Native Google emits an unsupported-count warning; the avatar gate supplies the positive dropped-edit warning. The actual inference executor provides a warning-producer control only. Keep [credential authority](../../tests/server/domain/embeddings/verbs/runtime-credential-authority.suite.int.test.ts) for real imagery auth rejection and revoked-key no-spend. Rebuild distinct run-as selection through real imagery generation. Drop object-reference equality and exact request-forwarding assertions. |
| Caption uses run-as Utility binding and preset, sends instruction/image/posture, trims text and retains cost. | Rebuild through actual imagery preview, persisted Utility settings/preset and physical provider requests. Assert live model/temperature/instruction/image, parsed cost and normalized prompt. Use distinct host/member settings and actual binding refusal with no additional physical request. |
| Caption accepts an injected empty items array as empty text and null cost. | Drop the fabricated result state. Native summarize produces an item for each supplied input. Rebuild the useful empty-reply purpose with a supported physical empty completion and the public preview refusal. |
| Template, caption and negative defaults and overrides load only run-as settings. | Rebuild through real settings writes, imagery preview/generation and physical requests. Derive defaults from canonical resolvers. Distinct member settings must not replace host instructions or negative prose. |

Use `createServerHarness` and the existing native image supplier. Script only DNS, physical fetch and provider response bytes. Keep storage, identity, connection admission, funding, preset resolution and accounting in production.

Do not assemble domain factories in these tests. The inline URL compatibility branch needs a real producer before application-path qualification. Keep that limitation explicit instead of creating a test-only service path.

The replacement suites and selected maintained cases pass. Isolated production defects in live caps, dimension checks, response cancellation and Utility preset selection fail their intended assertions. Mutation targets are restored exactly. Affected compiler, lint and import checks pass. Inline URL-only producer compatibility remains unqualified.
