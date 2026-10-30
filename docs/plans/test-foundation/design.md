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

Start a replacement batch when its actual harness dependencies are available.

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

### Selected case map: card and bundle serde, provider rows, seed theme pairing and workload estimates

This is a bounded case map for six reference files. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). Serialization cases live at the contract layer, because the subject is a pure parse and emit pair. Persistence, funding and ownership cases live in server integration.

#### Character card serde

Reference: `server/primitives/serde/card/index.test.ts`. No maintained test called the reader or the emitter directly. The [import suite](../../../tests/server/domain/import/loader/import-bundle.int.test.ts) reaches them only through whole files.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| V3 flatten, V1 and Pygmalion reads, fallback name, placeholder note, spec capture, unknown spec | Contract: [card serde](../../../tests/server/primitives/serde/card/card-serde.contract.test.ts) | Rebuild. Wire cards are JSON text, and canonical values come from the production reader. |
| V3 promotions, group-only fold, residue, multilingual notes fold, assets passthrough | Contract: card serde | Rebuild. One table covers the notes fold: English first, first non-empty, creator notes win, malformed ignored. |
| Favourite flag read as `true` only, live star written on export | Contract: card serde. Integration: [star through restore](../../../tests/server/domain/import/loader/import-bundle.int.test.ts) | Keep both. Integration owns persistence across a restore. Contract owns the strict boolean and the stale-residue rule. |
| Plugin namespace stays inert and round-trips | Contract: card serde | Rebuild. The hostile nested keys must not promote a typed field. |
| Emitter wire shape, ST disabled polarity, spec round trip, book only with entries, typed columns win over residue | Contract: card serde | Rebuild. |
| Round trips: full fields, null fields, promotions, group-only greetings, residue | Contract: card serde | Rebuild. The legacy "emitter output re-parses" and "own output parses" cases merge into these. |
| Content hash: key order, provenance exclusion, semantic change | Contract: card serde | Rebuild. The star is also outside the hash. |
| Import hash: book residue, kept activation fields, art, spec, key order, notes, script id | Contract: card serde. Integration: [identity across export and restore](../../../tests/server/domain/import/loader/import-bundle.int.test.ts) | Keep both. Integration proves one character per box across crossings. Contract owns each identity rule. |
| Book entry export: constant, insertion order, at-depth encoding, keyless entry | Contract: card serde | Rebuild through `buildCardV3`. The entry mapper is closure-private, and no export was added for the test. |
| Entry read: columns, metadata, position table, native at-depth, `use_regex`, literal keys | Contract: card serde | Rebuild. The matcher is called on both sides of the regex flag. |
| `extractLorebook` and `selectBestCharacterBook` | Contract: card serde | Rebuild. |
| Hand-built canonical card literal for the hash cases | None | Drop. A reader-built card replaces it. |

#### Chat bundle serde

Reference: `server/primitives/serde/chat-bundle/index.test.ts`. The [import suite](../../../tests/server/domain/import/loader/import-bundle.int.test.ts) and the [portable JSON boundaries](../../../tests/server/domain/rpg/persistence/portable-json-boundaries.int.test.ts) cover the export and restore wiring. Neither calls the parser on hostile files.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Envelope stamp, canonical read, byte-identical round trip, gameless chat | Contract: [chat bundle serde](../../../tests/server/primitives/serde/chat-bundle/chat-bundle-serde.contract.test.ts) | Rebuild. The two legacy round-trip cases and the gameless case merge. |
| Foreign kind, non-JSON and newer version refuse by name | Contract: chat bundle serde | Rebuild. The current version parses as the positive control. |
| Pending observations: positional parents, byte identity, duplicate ordinals refuse | Contract: chat bundle serde | Rebuild. A dangling source drops its fact, which the reference file did not cover. |
| Native usage: zero, unknown axes, served model, partial modalities, price provenance | Contract: chat bundle serde | Rebuild. The legacy cost factory is replaced by the production usage schema. |
| Contradictory legacy token copy refuses | Contract: chat bundle serde | Rebuild. The agreeing copy is the control. |
| Provenance label re-derived, never a refusal | Contract: chat bundle serde | Rebuild. |
| Dangling rpg references prune per plane; hand journal entry survives | Contract: chat bundle serde | Rebuild. In-range anchors are the control. |
| Missing tool-call issues heal to an empty list; sheet handle blank and over-cap | Contract: chat bundle serde | Rebuild. The legacy check that the healed array is unfrozen is dropped as implementation detail. |
| Export refuses malformed stored rpg planes; null planes export | Integration: [portable JSON boundaries](../../../tests/server/domain/rpg/persistence/portable-json-boundaries.int.test.ts) | Keep. Not a reference case, and not repeated here. |

#### Provider rows and plugin claims

Reference: `server/domain/connection/persistence/provider-rows.int.test.ts`. The [testkit provider capture](../../../tests/support/node/factories/plugin.int.test.ts) covers one claim and its tombstone on disable.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Admin row: replace in place, one drop, second drop refused | Persistence: [provider rows](../../../tests/server/domain/connection/persistence/provider-rows.int.test.ts) through the registry | Rebuild. The functions are called through the connection service registry. |
| Admin id cannot take a plugin namespace | Persistence: provider rows. Database: [namespace check](../../../tests/db/schema/provider-row-namespace.int.test.ts) | Move the table check to the database tier with both namespaces as controls. The registry refusal stays in provider rows. |
| Owners of one definition share a row; each release narrows its own install; tombstones keep the row | Persistence: provider rows through real plugin install, consent and disable | Rebuild. |
| Another owner's different definition never blocks or answers | Persistence: provider rows | Rebuild. |
| Changed definition refused before any write, even after uninstall | Persistence: provider rows | Rebuild. The unchanged definition re-linking is the control. |
| Two plugins of one owner claim one id concurrently | None | Drop. A plugin may claim only ids under its own manifest id, and an owner holds one install per slug, so no production path races two claims of one id. The post-write re-read in `replacePluginProviderRows` is a possible dead guard. |
| Reconciliation reaps a definition no claim names | None | Drop. Claims are permanent, and no verb deletes an owner, so the only path is a raw claim delete. The reap arm of `reconcilePluginClaims` is a possible dead guard. |
| Reads re-parse every stored row | None | Drop. Only a raw write of an unproducible row reaches it. The provider schema owns its refusal. |

#### Seed theme pairing

Reference: `server/domain/settings/seed-theme-pairing.suite.test.ts`. Nothing maintained pairs the server overrides with the ui palette. [Seed theme rows](../../../tests/server/domain/settings/persistence/system-themes.int.test.ts) read the same registry but not the palette.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Each seed colour field equals its ui palette value | Suite: [seed theme pairing](../../../tests/server/domain/settings/seed-theme-pairing.suite.test.ts) | Rebuild. Each field must also be set, because two unset values compared equal in the reference. |
| Font and radius name tokens the base palette defines | Suite: seed theme pairing | Rebuild. The literal font and radius names are dropped. |
| Value sets equal the seeds other than Hearth | Suite: seed theme pairing | Rebuild. |
| The shipped set is exactly three named palettes | None | Drop. The set equality owns it, and a hand list only confirms itself. |

#### Workload estimates

Reference: `server/domain/workloads/verbs/estimate-model-calls.int.test.ts`. Maintained [owner authority](../../../tests/server/domain/workloads/persistence/every-owner-authority.int.test.ts), [funded rows](../../../tests/server/domain/workloads/persistence/funded-tenant-rows.int.test.ts) and [refinery score sweeps](../../../tests/server/domain/refinery/persistence/score-sweep-rows.suite.int.test.ts) exercise the verb through the production root. The chat memory estimate suite owns the memory counts.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Singular count follows the caller's library and funder | Integration: owner authority, refinery score sweeps | Keep. The reference asserted a mock's arguments; the maintained cases assert real counts and funding. |
| Bulk estimate is the box owner's alone | Integration: owner authority, refinery score sweeps | Keep. |
| Retry counts the row's owner, funder and params | Integration: funded rows, owner authority | Keep. |
| Retry keeps the retry gates; a bulk row is not found for a non-owner admin | Integration: owner authority | Keep. |
| Stranger and missing id give the same not-found | Integration: [estimate verbs](../../../tests/server/domain/workloads/verbs/estimate-model-calls.int.test.ts) | Rebuild. The maintained cases only assert that a throw occurs. |
| A kind with no model call answers null; a mode the kind lacks is refused | Integration: estimate verbs | Rebuild. |
| Refused run counts zero unless the confirm assumes admission; retry agrees with retry | Integration: estimate verbs through a real memory room | Rebuild. The refused retry is checked against the retry verb. |
| Poison row answers null and the estimator is never asked | Persistence: [poison row](../../../tests/server/domain/workloads/persistence/estimate-poison-row.int.test.ts) | Rebuild. The healthy row of the same kind is the control. |

#### Image sweep

Reference: `server/domain/embeddings/verbs/embed-assets.int.test.ts`. The [indexer capture](../../../tests/support/node/factories/embedding-images.int.test.ts) and the [corpus image variants](../../../tests/support/node/corpus-image-variants.int.test.ts) cover the admission floor and its recorded skip. [Knowledge variants](../../../tests/support/node/corpus-knowledge-variants.int.test.ts) cover both embedding lenses under a joint encoder.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Fresh sweep, resume at no cost, force, one row per lens | Persistence: [image sweep rows](../../../tests/server/domain/embeddings/persistence/image-sweep-rows.int.test.ts) | Rebuild. Requests at the provider edge are counted, and the quote is compared with the spend. |
| Both lenses per avatar under a joint encoder | Integration: knowledge variants | Keep. |
| Text fallback sweep records the text space as complete | Persistence: image sweep rows | Rebuild. The recorded space must equal the vectors' own space. |
| Aborted sweep records nothing | Persistence: image sweep rows | Rebuild. It runs under an owner scope, because a global scope reaches no completion arm. |
| Event-indexed avatar promotes its generation without a second spend | Persistence: image sweep rows | Rebuild. |
| Progress positions | Persistence: image sweep rows | Rebuild. |
| Below-floor asset: recorded skip, honored on rerun, not bypassed by force | Integration: indexer capture, corpus image variants | Keep. |
| Quote is zero once analysed; force quotes every avatar | Persistence: image sweep rows | Rebuild. |
| Quote for an avatar re-uploaded under its id | None | Drop. Bytes of one asset id are immutable in the store, so the state is not producible. |
| Vanished asset row is a skip | None | Defer. A deleted row mid-sweep has no deterministic production seam. A deleted blob under a live row throws and fails the sweep. |
| Quote is zero for a Utility model that reads no pictures | None | Defer. Needs a text-only summarize connection built through the connection door. |
| Captioned row from before the facet breakdown is work, not a skip | None | Defer. Needs a sanctioned historic-state home in the testkit README. |
| Fused caption request body; local-light two-tower caption; refused joint-encoder update during routing | None | Defer. The first two are backend wire cases for the inference tests. The third needs the connection probe harness. |

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
