---
kind: plan
status: active
updated: 2026-10-21
---

# Tests on the production harness

## Goal

Preserve meaningful behavior at the appropriate test layer, not every reference file. Rebuild missing cases through production composition, production-derived builders, the shared corpus and real client mounting. Remove redundant tests and copied assemblies with their qualified replacements.

## Shape

### Program ownership

This plan owns the test rebuild, its execution order and the [restoration register](#restoration-register). The [task index](tasks.md) owns the execution queue. Work items own current assignments, blockers and runtime evidence; an open item does not make its completed subareas unfinished.

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

### Restoration register

Read this register before selecting reference cases to port. Follow the maintained test links and compare assertions before adding another test.

This is the current coverage index for reviewed restoration scopes, not a generated test inventory or an archive of closed work items.

| Porting state | Meaning |
| - | - |
| Accounted for | The named reference cases have maintained homes or explicit drop decisions. Do not port them again. |
| Partial | Only the named subset is compared. Preserve its coverage and inspect the listed remainder. |
| Unreviewed | No complete case comparison is recorded. This does not mean tests or implementation are missing. |

Porting state and runtime qualification are separate. An implemented case awaiting execution needs qualification, not a second implementation.

Legacy paths below are relative to the external reference source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree).

| Reference scope | Porting state | Maintained home or decision | Remaining action |
| - | - | - | - |
| `client/features/chat/anchors/join-invite-dialog.ct.tsx` | Accounted for | [Invite CT](../../../tests/client/features/chat/anchors/join-invite-dialog.ct.tsx) owns component states, focus and completion. [Wording unit test](../../../tests/client/lib/invite-copy.dom.test.ts) owns formatting; duplicate copy-only CTs are dropped. | None for these reference cases. Reopen only for a named uncovered behavior or regression. |
| `client/features/auth/components/login-pending-join.ct.tsx` | Accounted for | [Pending-join CT](../../../tests/client/features/auth/components/login-pending-join.ct.tsx) owns controlled states and requests. [Wording unit test](../../../tests/client/lib/invite-copy.dom.test.ts) owns anonymous-preview wording. [OIDC E2E](../../../tests/e2e/oidc-pending-join.oidc.spec.ts) owns dismissal and URL cleanup. | The unavailable-state CT exercises return to sign-in without confirmation. The OIDC journey is [qualified](#e2e-runtime-qualification), including stored-token retirement and preservation of unrelated URL/history state. |
| Chat permissions and history | Partial | Keep the maintained integration and browser cases in the [selected case map](#selected-case-map-chat-permissions-and-history). | Do not label the entire chat domain restored. Compare additional reference cases individually. |
| `server/entry/http/join.test.ts` | Partial | [Real HTTP tests](../../../tests/server/entry/http/auth-meta.int.test.ts) cover capability refusal and redirect. Drop the mock-app harness. | Compare the encoded-token assertion with maintained coverage before adding it. |
| `server/domain/chat/substrate/wire-history.test.ts`; `db/query/chat-visibility.int.test.ts` | Unreviewed | Existing chat coverage remains authoritative for its named behaviors. | Complete case-by-case comparison; neither file is declared missing or obsolete. |
| `client/data/invalidation-initial-read.suite.test.ts` | Partial | [Headless client tests](../../../tests/client/data/invalidation-initial-read.dom.test.ts) cover initial-read reconciliation, facade coalescing, inactive reads, refetch targets, errors, cancellation and removal through production providers. | Compare canonical-view carrier coverage. Restore native view-transition settlement only in a browser case; headless coalescing does not qualify it. |
| `client/data/bus/post-event-source.test.ts`; `client/data/bus/post-event-source.int.test.ts` | Partial | [Public transport tests](../../../tests/client/data/bus/post-event-source.dom.test.ts) cover POST/CSRF, committed resume cursors, one-shot termination, terminal HTTP refusal, cancellation and retry cleanup. | Remaining comparison includes parser boundaries, malformed connected metadata, serialized errors, live idle expiry and private retry-option cases. The [case decisions](../../work/0977-rebuild-client-lifecycle-and-boundary-regression-cases.md#selected-lifecycle-case-decisions) define the tested boundary. |
| `client/data/auth-config.test.ts` | Accounted for | [Client bootstrap/share tests](../../../tests/client/data/auth-config.dom.test.ts) own memoization, retries and fresh live-share reads. [Contract tests](../../../tests/contracts/auth-config/bootstrap.contract.test.ts) own malformed and missing fields; [HTTP tests](../../../tests/server/entry/http/auth-meta.int.test.ts) own served configuration and disclosure. | None for these reference cases. Drop the duplicate client schema matrix and private-fetcher/reimport harness. |
| `client/components/list-pane-header.ct.tsx` | Partial | [Common-header CT](../../../tests/client/components/list-pane-header.ct.tsx) owns count semantics, typography, accent, keyboard callbacks, optional action and constrained title priority through the public host. | Exact token spacing and baseline alignment remain open. Mobile band shedding, retained scoped/action rows, desktop shell behavior and device-pixel alignment need real-shell coverage. Drop the copied shell fixture and custom audit-ratio calculation, not those behaviors. |
| Feature list headers: character, discovery, plugin and databank | Unreviewed | Their reference files identify distinct cases in the [header case map](../../work/0977-rebuild-client-lifecycle-and-boundary-regression-cases.md#selected-list-header-case-decisions). Shared zero-count assertions are covered by the common-header CT. | Complete feature-specific maintained-coverage comparisons for control-width budgets, denominator/filter data, maintenance/refusal states and Add-dialog behavior. Reading the references alone does not qualify these features. |

An unlisted area is unreviewed, not missing. Neither filenames nor test counts establish whether its behaviors need restoration.

Update the existing row with its replacement commit's changes; do not append another completion record for the same scope. Name uncovered cases when marking a scope partial. Keep links to maintained tests here when the owning work item closes. A completed row may reopen only with a specific missing behavior, failing regression or changed product contract.

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

### Layer ownership and overlap

Give each failure mode a primary test home. Choose the least expensive layer that exercises the actual behavior.

| Layer | Owns | Does not replace |
| - | - | - |
| Unit | Pure production calculations, reducers, formatters and transformations; inexpensive input permutations. | I/O or business behavior reconstructed with fake services. |
| Contract | Real schema acceptance and refusal, serialization, round trips and stored-data compatibility. | A hand-written schema copy or a browser journey. |
| Type | Invalid IDs and combinations, required inputs and inferred outputs under the owning compiler world. | Runtime authorization, persistence or resource cleanup. |
| Server integration | Business rules, ownership, transactions, cancellation and lifetimes through production composition and real persistence. | UI behavior or a copied implementation. |
| CT | Real component interactions, controlled loading/error/empty states, focus, accessibility, geometry, viewports and themes. | Complete application journeys over a fabricated backend. |
| E2E | Important journeys connecting the browser, authentication, transport, server, persistence and visible result. | Every lower-layer input, permission or presentation permutation. |

Use the real HTTP entry for HTTP-specific integration cases. An internal caller does not prove cookie, CSRF or request-authentication behavior.

Script external execution at its real boundary. Ordinary application coverage does not require live model-provider execution.

A suite groups related cases; it is not another test layer. The `.suite` suffix does not require duplicate standalone or global tests.

Retain cross-layer coverage only when it catches a distinct failure. Record that distinction in the batch's case map. Do not repeat an edge-case matrix at every layer.

For settings, integration owns sibling-field preservation and concurrent writes. CT owns pending/error presentation. E2E owns saving through the browser and observing persistence after reload.

Use risk and distinct behavior to choose cases, not test-count targets, coverage percentages or per-file quotas.

Move flow-walking route and app-shell CT cases to corpus e2e. Keep component, measurement and controlled-state cases in CT.

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

Independent reviewers compare the original cases with the case map and maintained assertions, not only the implementation diff. Check each keep or drop decision against its cited evidence. Confirm the replacement reaches production and the defect control fails for the intended reason.

Record omitted or unresolved cases explicitly. Keep the register partial until every case in its named scope has a supported decision. Use the existing work item and register; add no separate tracking system.

### Selected case map: chat permissions and history

This is a bounded case map, not an exhaustive chat audit. Linked work items own runtime evidence; existing E2E source is not a fresh runtime verdict. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree).

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Joining, host/member/outsider authority and host handoff | Integration: [role-authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts), [participants](../../../tests/server/domain/chat/verbs/participants.int.test.ts). | Keep. Do not restore another service-level role matrix. |
| Full/from-join history, pages, message windows and fork lineage | Integration: [role-authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts), [corpus chat outputs](../../../tests/support/node/corpus-chat-outputs.int.test.ts). | Keep. Browser coverage should prove wiring, not repeat cursor and permission permutations. |
| Hidden bytes across replay cursors and recipient-scoped live delivery | Integration: [member visibility](../../../tests/server/domain/chat/substrate/member-visibility.int.test.ts), [recipient isolation](../../../tests/server/transport/trpc/stream/recipient-isolation.int.test.ts). | Keep. These exercise production replay and authenticated transport, not only a UI filter. |
| Card disclosure and co-member updates | Integration: [member card clamp](../../../tests/server/domain/chat/verbs/member-card-clamp.int.test.ts), [member fanout](../../../tests/server/domain/chat/verbs/member-fan.int.test.ts). | Keep. Rendered controls do not replace authorization checks. |
| Shared history and role-specific controls after browser reload | E2E: [shared corpus](../../../tests/e2e/corpus-shared.local.spec.ts), [multi-human visibility](../../../tests/e2e/multi-human-visibility.local.spec.ts). | Keep the distinct browser/transport assertions. Compare overlapping API-only permutations before retaining both. |
| Invite landing after the first-run persona step | E2E: [corpus joiner](../../../tests/e2e/corpus-joiner.local.spec.ts). | Keep. Do not rebuild the complete journey as a network-stubbed CT. |
| OIDC callback, pending-join dismissal and precise URL/history cleanup | E2E: [OIDC pending join](../../../tests/e2e/oidc-pending-join.oidc.spec.ts). | Keep the [qualified OIDC journey](#e2e-runtime-qualification). It includes stored-token retirement; do not restore a duplicate dismissal journey. |
| Capability-dependent `/join/:token` refusal and redirect | HTTP integration: [auth metadata](../../../tests/server/entry/http/auth-meta.int.test.ts). Legacy `server/entry/http/join.test.ts` also checks encoded token bytes. | Keep existing coverage. Add the encoded-token case through real HTTP only if uncovered; drop the mock-app harness. |
| Invalid invite disclosure, focus ordering and dismissal without redemption | CT: [invite dialog](../../../tests/client/features/chat/anchors/join-invite-dialog.ct.tsx). | Keep the rebuilt controlled cases, including late popup focus and refusal after a ready preview. Membership remains an integration responsibility. |
| Persona validation/focus, approval, refused confirmation and unavailable pending invite | CT: [pending join](../../../tests/client/features/auth/components/login-pending-join.ct.tsx). | Keep public login-surface state and outgoing-request assertions. These do not prove session cookies or backend authentication. |
| Shared invite sentence formatting, withheld host and unnamed-room fallback | Unit: [invite wording](../../../tests/client/lib/invite-copy.dom.test.ts) calls production [invite-copy](../../../packages/client/src/lib/invite-copy.ts). | Keep the pure-function case; drop duplicate capitalization-only CTs. DOM declarations do not require browser execution. |

The controlled invite-component replacements are maintained under [client regression work](../../work/0977-rebuild-client-lifecycle-and-boundary-regression-cases.md). Reuse them when comparing further reference cases. The remaining client lifecycle and boundary cases stay open. The E2E runtime qualification below records the separate browser acceptance.

Keep the server coverage above. Legacy `server/domain/chat/substrate/wire-history.test.ts` and `db/query/chat-visibility.int.test.ts` still need case-by-case comparison with their current owners. This map does not classify those files as missing or obsolete.

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

A batch completes when every selected case has a keep, rebuild, move or drop decision with evidence. Required replacements exercise production, pass relevant controls and remove superseded support. Existing qualified coverage is a valid result; an additional test is not required for every reference case.

Use D317 and the orchestrator/lane completion policy for existing verification. A timeout or tool failure supplies no behavioral verdict. Record unrelated limitations separately.

## Rejected

Copied production assemblies, fake-heavy legacy retrofits, test-only production doors, and unrelated architecture campaigns as prerequisites.

## Coupled sites

[Spine-Testing](../../law/Spine-Testing.md) owns test composition, layer responsibilities and legacy boundaries. The inference-flow plan remains separate and supplies only dependencies required by a selected production case.

## Test plan

Qualify production-root behavior, deterministic inputs, ownership, physical cleanup and the actual client mounting door. Preserve meaningful cases and prove production defects are caught. Run each replacement batch when its concrete dependencies are qualified; unrelated corpus flows do not block it.
