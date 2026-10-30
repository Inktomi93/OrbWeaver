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

### Selected case map: chat teaching, identity, read, backfill and persona resolution

This is a bounded case map. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). Every rebuilt case runs the composed server root and reads native provider bytes or a public service read. Each rebuilt guard was checked against a planted production defect that made it fail for its stated reason. Open rows are unresolved and keep their register row Partial.

The legacy collector and contribution cases exercised `collectTeaching` and the contributions with a synthetic registry or a synthetic game gather. The chat door exports neither the collector nor a registry seam, and no test-only door is added. The production registry never emits two identical injections, never throws, and registers in ascending order, so those laws have no production observable beyond the cases rebuilt below.

#### Teaching (`substrate/teaching.int.test.ts`, `substrate/teaching.test.ts`, `teaching-contribution.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Zero-contribution chat: host rows reach the model | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts): two identical host rows both reach the model. |
| Host rows ordered before the state block at one depth | Open | The order is the candidate walk's entry-id tie-break; no ruling names it. A swap in the merge changed no maintained output, so no guard was written. |
| Game state block keeps its content and `game-state` stamp, cyoa off and on | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts): the budget source `game-state` exists for a game turn, its opening line reaches the provider, and a plain chat has none. |
| Game cyoa on and room knob on: exactly one teach | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts): game and knob combinations through a real game turn, including the host's rewrite of the slot. |
| Game cyoa off and room knob on: chat teaches; non-game room with the knob on: chat teaches | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts) and [offer choices](../../../tests/server/domain/chat/verbs/turn-offer-choices.suite.int.test.ts). |
| Host override of the teach slot; `{{user}}` and `{{char}}` render as names; no persona floors to the default persona name | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts) on the native Anthropic wire. |
| Teach is delimited from a player's line; the frame slot is the host's to replace | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts). The production shape sends the framed teach as its own row after the player's line; the case asserts the invariant, that the teach never sits inside the player's text. |
| Game reminder that already carries the framed teach suppresses the room's teach | Drop | Needs a synthetic gather. The shipped reminder carries the bare teach, which the game combinations exercise. |
| Exact-duplicate guard, identity-keyed guard, first survivor, ascending order, stable tie, toolNames union, throwing contribution, shared context instance | Drop | Collector internals reachable only with a synthetic registry. The production registry cannot produce them; a planted removal of the guard changes no production output. |
| Registry ids and orders | Drop | Implementation listing; its observable effects are the cases above. |
| Gather injections keep their order; gather `tools` become tool names | Drop | The production gather emits one injection and no registry tools. Both need a synthetic gather. |
| Non-game chat and knob off contribute nothing | Keep | [Offer choices](../../../tests/server/domain/chat/verbs/turn-offer-choices.suite.int.test.ts) and the react-tool combinations in [turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts). |
| Offer-choices precedence: room value wins, absent inherits the host default | Keep | [Offer choices](../../../tests/server/domain/chat/verbs/turn-offer-choices.suite.int.test.ts). |
| Reaction knob precedence; react tool attaches only when both knobs resolve on | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts): host and room combinations read the provider's tool declarations. |

#### Identity (`persistence/identity.int.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Seated character and active persona resolve with their kind; avatar-less entities keep a null hash | Rebuild | [Identity](../../../tests/server/domain/chat/persistence/identity.int.test.ts) through `getChat`. |
| Pin names an identity no seat or line names; anchor state follows the pin's owner | Rebuild | [Identity](../../../tests/server/domain/chat/persistence/identity.int.test.ts): a host handoff and the founder's leave. |
| Persona stamped on a line but not seated | Rebuild | [Identity](../../../tests/server/domain/chat/persistence/identity.int.test.ts) through `listMessages`. |
| Removed character keeps its portrait | Rebuild | [Identity](../../../tests/server/domain/chat/persistence/identity.int.test.ts). |
| Empty room, null ids, omitted arguments | Rebuild | [Identity](../../../tests/server/domain/chat/persistence/identity.int.test.ts): an empty room has an empty set. |
| Dedupe of an id named by a seat and a line | Drop | The loader selects by id, so a duplicate row cannot exist; no planted change reaches it. |
| Coverage is member-gated, not owner-gated | Rebuild | [Identity](../../../tests/server/domain/chat/persistence/identity.int.test.ts): a member's persona resolves for the host and the member reads the same set. |
| Each row resolves `{{user}}` to its own stamp | Keep | [Persona resolution](../../../tests/server/domain/chat/persona-resolution.suite.int.test.ts) and [canon input writers](../../../tests/server/domain/chat/persistence/canon-input-writers.suite.int.test.ts). |

#### Persona resolution (`persona-resolution.suite.int.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Worked examples: anchor and seat the same; swap; re-pin; description follows the anchor | Rebuild | [Persona resolution](../../../tests/server/domain/chat/persona-resolution.suite.int.test.ts) on the native Anthropic wire. |
| Card `{{persona}}` resolves the anchor's description | Rebuild | Same suite. |
| Seat swap and re-pin never rewrite a stored persona stamp | Rebuild | Same suite, with the next send as the positive control. |
| Cases the reference file defers to other files: resolver binding, held pin, trigger without a seat persona | Keep | [Turn personas](../../../tests/server/domain/chat/assembly/turn-personas.int.test.ts) and [prompt config triggerer](../../../tests/server/domain/chat/verbs/prompt-config-triggerer.suite.int.test.ts). |

#### Backfill estimate (`substrate/backfill-estimate.int.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Estimate equals the sweep's summarize calls and falls to zero once built | Rebuild | [Backfill estimate](../../../tests/server/domain/chat/substrate/backfill-estimate.int.test.ts) through `workloads.estimateModelCalls` and the admitted workload. |
| Character seated mid-chat is counted for the blocks it witnessed | Rebuild | Same suite. A late `addCharacterToChat` replaces the forced join sequence, which production cannot produce. |
| Edited block is counted again | Rebuild | Same suite. |
| Group room counts its unminted shared bucket and mints nothing; memory off costs nothing | Rebuild | Same suite. |
| Import window counts and sweeps only the span's chats | Rebuild | Same suite, with a later import as the out-of-span room. A second owner's import in the same span is not exercised. |
| Consolidation parents above tier zero | Open | The suite runs tier zero only. |
| Import window over a very large chat set | Open | Needs bulk persistence seeding in a persistence suite. |

#### Read (`verbs/read.int.test.ts`)

| Reference case group | Decision | Maintained home or reason |
| - | - | - |
| Inspector gates: `peekPrompt`, `previewAssembly`, `previewSection`, `previewActionTemplates`, `getShapeTrace`, `getVariantWire` are host-only; outsiders get not-found; member reads carry no full-only card bytes | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts), with the host read of the same call as the positive control. |
| Cross-room variant read: refusal matches an unknown id; sibling list is room-scoped | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts). |
| Non-participant gets not-found on every room read | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts): a table of reads with a host and a member as controls. |
| Library lists only the caller's rooms; archived and temporary rooms; viewer role | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts). |
| Search and count never reveal a hidden span, pre-join text or the body of a tail carrying a hidden tag | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts); the floor on the tail search is also in [history floor reads](../../../tests/server/domain/chat/verbs/history-floor-reads-agree.int.test.ts). |
| Join-history floor on message lists, pagination at the floor, picture render | Keep | [Role authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts), [message cursors](../../../tests/server/transport/trpc/message-history-cursor.int.test.ts), [history floor reads](../../../tests/server/domain/chat/verbs/history-floor-reads-agree.int.test.ts), [co-participant render](../../../tests/server/domain/chat/verbs/co-participant-render-floor.int.test.ts). |
| Column default `full`, promoted host unclamped, re-join floors at the latest join, host restricts and restores | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts). |
| Sibling-variant list refuses a pre-join slot | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts). |
| Durable replay and live delivery withhold pre-join bytes, including a later edit of a pre-join row | Keep | [Recipient isolation](../../../tests/server/transport/trpc/stream/recipient-isolation.int.test.ts). |
| Replay clamps by delta slot; attach bounds carry the caller's floor | Open | Neither value is asserted on its own; [recipient isolation](../../../tests/server/transport/trpc/stream/recipient-isolation.int.test.ts) exercises both through the transport. |
| Hidden-span stripping for members across resume cursors | Keep | [Member visibility](../../../tests/server/domain/chat/substrate/member-visibility.int.test.ts) and [role authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts). |
| Strip inside a closed card, tool-call offsets, durable reasoning channel, deception handoff, replayed committed view | Open | [Content policy](../../../tests/server/domain/chat/substrate/content-policy.suite.int.test.ts) covers the class table; the member payload cases need a deception-active game. |
| Member card clamp by visibility level | Keep | [Member card clamp](../../../tests/server/domain/chat/verbs/member-card-clamp.int.test.ts) and [corpus chat outputs](../../../tests/support/node/corpus-chat-outputs.int.test.ts). |
| Macro render of surviving card fields; bypass through full-only macros; hidden spans on card fields; lore level | Open | [Section render PRNG](../../../tests/server/domain/chat/assembly/section-render-prng.int.test.ts) covers stable random picks only. |
| Chat detail, connection read with label hiding, send availability, unbound fit, variants, windows, lineage, pages | Keep | [Corpus chat outputs](../../../tests/support/node/corpus-chat-outputs.int.test.ts). |
| Fork list is membership-scoped | Rebuild | [Read gates](../../../tests/server/domain/chat/verbs/read-gates.int.test.ts). |
| Preview honesty: budget partition, per-member card cost, preset override, GM preset redirect, window ceiling, persona-swap leak, consent set, narrator shape, viewer time zone, no persist | Open | One group of preview cases through a bound connection and a game; not compared case by case. |
| Fit preview: boundary, blown budget, compaction marker, card and choices pricing | Open | [Managed compaction trim](../../../tests/server/domain/chat/engine/managed-compaction-trim.suite.int.test.ts) reads the fit; boundary and wire-pricing cases are not compared. |
| Effective regex: tiers, run order, levers, preset tier label | Open | Only the disabled-room read is asserted, in corpus chat outputs. |
| Library detail: preview text projection, viewer last turn, participant names, portraits, game flags, keyset ties, page ceiling, character projection, search predicates, recency order | Open | Page and cursor basics are in corpus chat outputs; the remaining projections are not compared. |
| Owned-character fields: gallery subject and owned ids | Open | Not asserted by a maintained case. |
| Compaction checkpoint withheld from a clamped member; preview image quality; Ollama window; connection attribution after deletion; malformed stored blobs degrade to null; plugin provider identity | Open | No maintained runtime case; each needs its own fixture. |
| Stream ring resume | Keep | [Stream event rows](../../../tests/server/domain/chat/persistence/stream-event-rows.int.test.ts). |
| Durable bus log resume and first-turn head deltas | Keep | [Bus golden](../../../tests/server/domain/chat/bus-golden.suite.int.test.ts) and [composed root](../../../tests/server/domain/chat/composed-root.suite.int.test.ts). |

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
