---
kind: plan
status: active
updated: 2026-11-06
rank: 5
---

# Tests on the production harness

## Goal

Preserve meaningful behavior at the appropriate test layer, not every reference file. Rebuild missing cases through production composition, production-derived builders, the shared corpus and real client mounting. Remove redundant tests and copied assemblies with their qualified replacements.

## Shape

### Program ownership

This plan owns the test rebuild, its execution order and the [restoration register](../restoration-register/design.md). The [task index](tasks.md) owns the execution queue. Work items own current assignments, blockers and runtime evidence; an open item does not make its completed subareas unfinished.

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

Start a replacement batch when its actual harness dependencies are available. Owed proof runs on merged code, such as [1778](../../work/1778-owed-runs-on-merged-code-the-sillytavern-folder.md), run before a new batch opens.

### Current foundation

The production server graph, world-split testkit, builders, corpus and client mounting door already exist. Their existence does not complete replacement coverage or runtime qualification.

Use these foundations for the remaining cases. Qualify corpus and support lifetimes through maintained cases. Keep source delivery, passing runtime cases and unqualified acceptance distinct.

### Restoration register

The [restoration register](../restoration-register/design.md) is the coverage index for reference cases from the legacy test source. Read it before selecting a case to port.

| Porting state | Meaning |
| - | - |
| Accounted for | The named reference cases have maintained homes or explicit drop decisions. |
| Partial | Only the named subset is compared. |
| Unreviewed | No complete case comparison is recorded. |

### Remaining work

[Test audit findings by root cause](finding-triage.md) holds the audit findings, their root-cause groups and the lane order.

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

### Layer ownership and overlap

[Spine-Testing §10](../../law/Spine-Testing.md#10-choosing-the-test-layer) owns the layer table and the overlap rule.

### Restoration decisions

Before writing a replacement, record its behavior, existing coverage, primary layer, decision and any distinct cross-layer purpose in the owning work item.

| Decision | Use when | Action |
| - | - | - |
| Keep | Maintained coverage already exercises the behavior through production. | Reuse it; do not restore a duplicate. |
| Rebuild | A useful case has an unsuitable harness or fabricated business behavior. | Preserve the assertion's purpose through the real production entry. |
| Move | A useful case belongs at another layer. | Add only uncovered behavior there; remove the superseded maintained case. |
| Drop | A case is duplicate, obsolete, implementation trivia or only confirms its own fabricated data. | Record the reason or covering test; do not port the case. |

Prioritize authorization, data loss, critical journeys and known regressions. Compare case assertions, not filenames or test counts.

Do not restore a reference file wholesale because its cases once ran together. Keep reference harnesses outside the repository.

### How a replacement is written

1. Compare reference assertions with maintained coverage and record the restoration decisions above.
2. Select the production entry and layer for each uncovered behavior.
3. Build data through production-derived builders or the corpus; isolate physical resources and external execution.
4. Assert observable behavior, permissions, persistence and cleanup rather than a literal the test created.
5. Demonstrate that a relevant production defect makes the new regression case fail.
6. Remove redundant maintained cases and unsupported helpers with their qualified replacements.
7. Run affected tests and applicable existing checks; record remaining limitations without expanding the batch.

### Implementation and review briefs

Name the selected reference files, maintained test files and case-map location in both briefs. Include exclusions and required defect controls.

Implementers read the selected reference files in full before recording case decisions. Preserve distinct fields, inputs, states and assertions in that comparison. Similar test names or matching input types do not establish equivalent coverage.

Independent reviewers compare the original cases with the case map and maintained assertions, not only the implementation diff. They read every new test file in full and check each literal, list, table and shape against its production home: a roster or table derives from the production union or registry so a new member fails `tsc`, and a helper defined in a test file belongs in the testkit when a second file needs it or production already owns the rule. Check each keep or drop decision against its cited evidence. Confirm the replacement reaches production and the defect control fails for the intended reason.

Record omitted or unresolved cases explicitly. Keep the register partial until every case in its named scope has a supported decision. Use the existing work item and register; add no separate tracking system.

### Standing case decisions

These decisions come from the finished case maps. Do not port a dropped case again, and do not build a deferred case without its named seam. Each case below names the reason.

Chat, plugin and RPG:

- Keep the role-authority and participants suites as the one service-level role matrix. Add no second matrix.
- Prove history and invite journeys in the browser as wiring only. Cursor and permission permutations stay in integration.
- Drop the capitalization-only invite wording CTs and the mock-app `/join/:token` harness.
- Drop "deleting the asset removes the record": the publisher's own install holds a restrict key, so no product path produces it.
- Drop the floor-only synchronous-claim burst. Test only that the bridge claims before it awaits the operation.
- Drop each host-gated RPG verb's refusal sentence, which is copy, and the born defaults of each config knob.
- Drop the stale presence key and the stale lock path. The owner ruled a wipe, not a migration, and no product path writes the old spelling.

Serde, provider rows and workloads:

- Drop concurrent claims of one provider id by two plugins. A plugin claims only ids under its own manifest id, and an owner holds one install per slug.
- Drop "reads re-parse every stored row". Only a raw write of an unproducible row reaches it.
- Drop the hand-built canonical card literal and the unfrozen-array check on healed tool-call lists.
- Drop the quote for an avatar re-uploaded under its id. Bytes of one asset id are immutable.
- Defer these image-sweep cases until their seam exists: a half-embedded avatar resumed, a vanished asset row mid-sweep, a zero quote for a text-only Utility model, a captioned row from before the facet breakdown (it needs a sanctioned historic-state home in the testkit README), the fused caption request body, the local-light two-tower caption, and a refused joint-encoder update during routing (it needs the connection probe harness).

Chat teaching, identity and read:

- Drop collector internals that need a synthetic registry: the identity-keyed guard, ordering, the tool-name union, a throwing contribution, the shared context instance, registry ids and orders, and gather injection order.
- Drop the game reminder that already carries the framed teach, and the dedupe of an id named by both a seat and a line. The loader selects by id.

Boot, data layout and env floors:

- Drop the cases that assert platform or library behavior: a private helper's folder name, raw `runMigrations` on a stale record, parser tolerance for comments, quotes, `export`, junk and CRLF, and ignored `KEY: value` lines.
- Drop the cases that assert copies of production defaults: rate-limit budgets, the `LOCAL_LIGHT_CPU_PERCENT` default and the import staging default.
- Drop the regenerated-baseline auto-reset and omitting `launched`. D163 deleted the reset path, and a type case guards the option.
- Drop the database remedy wording, the `ORB_ENV_NO_FILE` test-config literal and the proxy that forced a transaction failure.

Inference, import and composition:

- Drop the SDK-object purity check, the applied-settings log line, the cache log count, the full older-id table (keep three controls), and the derived runtime variables of a portable chat.
- Drop the unwritten-section grounded defaults, the case that the graph yields every service key, the indexer subscription over a stub store and copied dispatcher, and the seeded local-light vector rebuild. No root composes the shipped seed vectors.
- Move the 401 and 403 credential-health and secret-redaction cases to the security batch.

### Selected case map: chat permissions and history

Done. The full map is in commit `11fa4d7fef` (`git show 11fa4d7fef:docs/plans/test-foundation/design.md`). Its standing decisions are in [Standing case decisions](#standing-case-decisions).

### Selected case map: plugin distribution, provider contributions, bridge and RPG authority

Done. The full map is in commit `11fa4d7fef` (`git show 11fa4d7fef:docs/plans/test-foundation/design.md`). Its standing decisions are in [Standing case decisions](#standing-case-decisions).

### Selected case map: card and bundle serde, provider rows, seed theme pairing and workload estimates

Done. The full map is in commit `11fa4d7fef` (`git show 11fa4d7fef:docs/plans/test-foundation/design.md`). Its standing decisions are in [Standing case decisions](#standing-case-decisions).

### Selected case map: chat teaching, identity, read, backfill and persona resolution

Done. The full map is in commit `11fa4d7fef` (`git show 11fa4d7fef:docs/plans/test-foundation/design.md`). Its standing decisions are in [Standing case decisions](#standing-case-decisions).

### E2E runtime qualification

The combined native selection boots and warms single-user, local, forward-header and OIDC modes. It passes the selected smoke, authentication, CSRF, debug-admission and pending-join cases without changing readiness or timeout budgets.

Run the selection with `E2E_LIVE=0 E2E_ALLOW_DEV_TARGET=0 pnpm e2e tests/e2e/smoke.spec.ts tests/e2e/auth-smoke.local.spec.ts tests/e2e/auth-smoke.forward.spec.ts tests/e2e/csrf-gates.forward.spec.ts tests/e2e/debug-gate.forward.spec.ts tests/e2e/oidc-pending-join.oidc.spec.ts`. The corpus-only case skips without a selected corpus; this is not full-suite qualification.

Playwright configuration does not load the operator's environment file. Its generated run token passes to native test workers. The SSO modes declare their own groups, and positive member fixtures carry the admitted group.

The existing OIDC journey reaches pending join through the real server and HTTPS issuer. Dismissal preserves unrelated URL bytes and history, clears the stored invite and omits it from the next login. The regression fails when production dismissal does not clear the invite.

The native [OIDC integration cases](../../../tests/server/entry/compose/oidc-native.int.test.ts) own transaction binding, replay, issuer, audience, nonce, PKCE, pending-signup admission and group refusal. The [issuer integration cases](../../../tests/e2e/support/oidc-issuer.int.test.ts) own HTTPS trust and code single-use. These selected cases pass; the browser journey does not duplicate their negative matrix.

### E2E disposable state

Ordinary isolated runs own separate directories under `.cache/e2e/runs/`. Native Playwright SIGTERM shutdown lets the existing supervisor join its children. The cleanup reporter removes only that runner's directory after the selected server and Vite ports close.

Failed runs retain bounded stack-log tails beside native traces and reports. Reusable model weights live in `.cache/e2e/models/`, outside disposable data; ordinary isolated runs disable background model prefetch. Developer-target data and caller-owned corpus fixtures keep their existing owners. Dry collection creates no certificate directories.

UI sessions, native timeouts, failed evidence retention or uncertain port release retain the directory and report its path. Hard termination or a reporter override can bypass the hook. Remove retained directories only after confirming their owner stopped; there is no automatic orphan sweep.

The native lifecycle exercises cover successful teardown, assertion failure with retained logs and occupied-port refusal without deleting another owner's files. The public server-process regression holds an actual HTTP request across repeated shutdown signals; every caller waits for the same drain completion.

### Selected case map: boot migration, data layout and env floors

Done. The full map is in commit `11fa4d7fef` (`git show 11fa4d7fef:docs/plans/test-foundation/design.md`). Its standing decisions are in [Standing case decisions](#standing-case-decisions).

### Selected case map: inference backends, import identity and composition

Done. The full map is in commit `11fa4d7fef` (`git show 11fa4d7fef:docs/plans/test-foundation/design.md`). Its standing decisions are in [Standing case decisions](#standing-case-decisions).

### Selected case map: flow-walking CTs

Done. The map lives in the Evidence of item 0977.

### Harness and execution

Mount the production `AppShell` under `CtClientProviders`. Use current request-aware corpus helpers; do not reconstruct a section registry or ambient backend per spec.

Use actual corpus room reads and production navigation for room subjects. Keep provider execution scripted only at external boundaries.

Journeys use the real stack and the corpus fixture wrapper. Select the appropriate single-user/local and desktop/phone projects; a bare E2E command without its corpus fixture can skip the intended cases.

Network shaping may hold a real read or replace a failed lazy chunk. Keep the real router, parser, boundary and production request handling.

Capture a new read only when the exact procedure/input lacks a supported capture. Reuse nested cohorts and request-aware production serving first.

Run applicable native CT, unit and E2E cases for changed behavior. Preserve cold failures, native artifacts and the difference between emitted source and executed behavior.

The path-rule owner must adjudicate the proposed shell/first-run/home verification guidance. This case map does not change `.claude/rules/browser-tests.md`.

### Server composition

The test root delegates to production entry composition. Each domain case uses that graph instead of constructing a domain assembly inside a fixture.

Production owns business rules and persistence. The harness owns injected time and identity sources, external-edge scripts and physical resource lifetimes. Unexpected stream or child failures remain observable; ordinary disconnect and disposal join before completion.

### Builders and corpus

Use the canonical production-derived builders and corpus across server tests, CTs and e2e. Keep contract defaults, valid minted identities, ownership and native database behavior.

Qualify corpus producer, clone, search and cleanup lifetimes through their maintained cases. Do not weaken boundary parsing or fabricate missing fields to preserve old fixtures.

Keep private owner data, credentials, files and personal artifacts outside Git, publication and CI. Private recovery evidence is not a substitute for a public synthetic-corpus test.

### Client mounting

Native Playwright mounts browser-owned stories through the application Vite pipeline. The [gallery authoring contract](../../law/Spine-Testing.md#7-client--browser-tests--native-playwright) owns typed props, exact story IDs, isolation, network setup and cleanup. Reuse this setup for replacement cases; do not rebuild the harness or restore the experimental CT pipeline. Development component coverage remains separate from production build and E2E qualification.

Production data construction remains in `packages/client/src/compose/client-runtime.ts`. Authenticated registries remain in `packages/client/src/compose/authed-composition.tsx` and are delivered through `packages/client/src/compose/authed-providers.tsx`.

`tests/support/browser/ct-data-providers.tsx` mounts through that production door. It controls document capabilities and network responses without replacing application modules or copying registry tables.

Primitive subjects use `CtIsolation` from `tests/support/browser/ct-isolated-subject.tsx`. Registry variants use the named exception in `tests/support/browser/ct-isolation.ts`.

Qualify query teardown, document and notification bindings, nested mounts, session recovery and bus subscriptions through observable behavior. Flow tests remain e2e rather than another application assembled inside CT.

### Public entries and legacy retirement

Follow D318 and the existing public package doors. Rebuilt tests use production entries and the testkit doors; a helper a door does not export is internal to the kit.

Adjudicate test-only production hooks and unused helpers with their owning cases. Delete unsupported adapters; retain production-derived helpers needed by selected replacements.

Use the sibling legacy source only to identify cases. It is not part of this repository's tests, typecheck or CI.

### Completion and verification

A batch completes when every selected case has a keep, rebuild, move or drop decision with evidence. Required replacements exercise production, pass relevant controls and remove superseded support. Existing qualified coverage is a valid result; an additional test is not required for every reference case.

Use D317 and the orchestrator/lane completion policy for existing verification. A timeout or tool failure supplies no behavioral verdict. Record unrelated limitations separately.

## Rejected

Copied production assemblies, fake-heavy legacy retrofits, test-only production doors, and unrelated architecture campaigns as prerequisites.

## Coupled sites

[Spine-Testing](../../law/Spine-Testing.md) owns test composition, layer responsibilities and legacy boundaries. The inference-flow plan remains separate and supplies only dependencies required by a selected production case.

## Test plan

Qualify production-root behavior, deterministic inputs, ownership, physical cleanup and the actual client mounting door. Preserve meaningful cases and prove production defects are caught. Run each replacement batch when its concrete dependencies are qualified; unrelated corpus flows do not block it.
