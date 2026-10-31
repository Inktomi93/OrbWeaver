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

### Selected case map: plugin distribution, provider contributions, bridge and RPG authority

This is a bounded case map for seven reference files. It is not an audit of the plugin or RPG domains. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). The plugin-host sandbox and membrane belong to the security batch. A case that needs a guest to reach the bridge is recorded as "Move to security batch".

#### Distributed plugins

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| A re-publish replaces the record and keeps the first publication instant | Integration, storage subject: [distributed plugins](../../../tests/server/domain/plugin/persistence/distributed-plugins.int.test.ts) runs `installForAllUsers` twice on the injected clock and reads `listDistributedPlugins`. | Rebuild. |
| The view carries policy only, never the asset or the publisher | Contract: [view contract](../../../tests/contracts/plugin/view.contract.test.ts) refuses private fields. [Corpus plugin](../../../tests/support/node/corpus-plugin.int.test.ts) compares the real `listDistributed` output with the five-key view. | Keep. |
| Withdrawing the record leaves the publisher's asset | Integration: the same distributed plugins file runs `uninstallForAllUsers` and reads the asset. [Garbage collection](../../../tests/server/domain/assets/verbs/collect-garbage.int.test.ts) owns reference-protected assets. | Rebuild. |
| Deleting the asset removes the record | The publisher's own install references the same asset with a restrict key, so the delete is refused. Garbage collection never deletes a referenced asset. | Drop. No product path produces this delete. |
| Deleting the publishing admin's account removes their distributions | Integration, storage subject: the distributed plugins file deletes the admin row. No product verb deletes an account, so the row delete is the subject. | Rebuild. |

#### Provider contributions

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| A provider is offered after activation and after a restart. Disable and uninstall withdraw it. The owner's claim outlives the install | Integration with real guests: [provider contributions](../../../tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts). The tombstone is proven by behavior: the same definition serves again and a changed one is refused. [Plugin factories](../../../tests/support/node/factories/plugin.int.test.ts) hold only the disable tombstone rows. | Rebuild. Drop the row counts. |
| Identical definitions are served to each owner. A changed definition is refused only for its own owner | The same provider contributions file. | Rebuild. Drop the shared-row count, which is storage trivia. |
| A squatted provider id blocks and shadows nobody, before or after a restart | The same provider contributions file. | Rebuild both squat cases as one. |
| An invalid provider row is refused before anything is stored | Contract: [manifest providers](../../../tests/contracts/plugin/manifest-providers.contract.test.ts) owns namespace, duplicate, host declaration and wire refusal. Integration: the provider contributions file owns the install refusal and the empty list. | Rebuild. |
| A stranger is not offered the provider and is refused at every provider door | The same provider contributions file refuses `create`, `draftCatalogModels` and a provider switch with the unknown-provider code. | Rebuild. |
| An admin-distributed provider plugin serves each recipient once they enable their own copy | The same provider contributions file. | Rebuild. |
| A retained connection never follows its provider id to another definition | The same provider contributions file seals a real credential, then checks `catalogModels`, the claim and the reinstall. | Rebuild. |
| A connection saved before the scope existed stops resolving at every read | The legacy state came from a direct row insert that no product path produces. The retained-connection cases reach the same refusal through a real uninstall: `catalogModels` in the retained-definition case, and `capabilities`, `resolve`, `probe` and the summarize role client in [provider contributions](../../../tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts), which also holds the control that the same reads succeed while the install is enabled and counts no request leaving. | Rebuild. |
| The installer lists models, saves a connection and generates through the relay | The provider contributions file lists models, saves a connection that names its plugin, resolves it and generates a summary through the corpus provider execution, with the harness resolver and provider fetch scripted for the relay host. It reads the credential each request carried and the host it reached. | Rebuild. |
| No request leaves the box for a refused stranger | The provider contributions file records every request that reaches the scripted peer: a stranger refused at the listing, create and provider-switch doors sends none, and the installer's call is the control that the peer records. | Rebuild. |
| Restart reconciliation removes a crash-window contribution from an errored plugin | Storage subject: [provider crash window](../../../tests/server/domain/plugin/persistence/provider-crash-window.int.test.ts) drives the third strike through `reportUiCrash` with a storage refusal armed on the claim unlink, so the install commits `errored` and teardown fails. A second root on the same database unlinks the claim and keeps the owner's definition. | Rebuild. |
| Uninstall waits for an in-flight enable | Integration: the provider contributions file issues `setEnabled` and `uninstall` back to back on a real guest and reads the empty list and the empty offer. The lane set has no door, and a test adds none. | Rebuild without the held hook. |

#### Bridge

The legacy file drove `buildPluginBridge` over a bundle of fake host operations and asserted what they recorded. The root does not expose those operations, so the fake bundle is dropped. The Tier-C relay `uiHostCall` reaches the real bridge without a guest, and its proxy tuple admits the canon reads and the variable operations. Those cases are rebuilt there. The other cases test plugin capability enforcement. They are rebuilt through a real guest on the production host: a guest whose one command runs a named host call in the invoking room and logs what it saw ([guest command](../../../tests/server/domain/plugin/substrate/_guest-command.ts)). Each suite reads the outcome through the owner's plugin log and the product's own read verbs.

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Floor mechanics: ceiling, window release, per-plugin keys and per-room notice keys | Unit: [call floors](../../../tests/server/domain/plugin/substrate/call-floors.test.ts) calls the production floor factories with test limits on the injected clock. | Move. |
| The pairing of each capability with its production limit as composed in `entry/compose/automation-plugin.ts`, including `search.query` | Integration with a real guest: [guest call floors](../../../tests/server/domain/plugin/substrate/guest-call-floors.suite.int.test.ts) drives `llm.quiet`, `search.query`, `net.fetch` and `net.fetchAsset` to their production ceilings, counts the requests that leave the box, and checks a second plugin's budget and the hour roll. It also owns the notice cooldown on the root's clock. | Rebuild. |
| The synchronous-claim burst on the floors | Each floor is one synchronous step by construction. The ordering that matters is the bridge claiming before it awaits the operation: in [guest call floors](../../../tests/server/domain/plugin/substrate/guest-call-floors.suite.int.test.ts), a quiet claim taken after the paid call lets one request leave past the ceiling. | Drop the floor-only burst. Rebuild the ordering. |
| A snippet with no plugin identity cannot egress or spend | Integration: [guest installer scope](../../../tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts) runs a real snippet. `llm.quiet`, `net.fetch` and `search.query` refuse with the capability error and no request leaves, while its own `chat.read` grant reads. The bridge's identity check is the second layer: a widened snippet grant reaches it and is refused with another error. | Rebuild. |
| `llm.quiet` closes the installer and shares one hourly lane with its options. The paid call never starts over the ceiling. Liveness becomes the provider abort signal | [Guest installer scope](../../../tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts): another owner's image id is refused before any request, the installer's own image is attached, and disabling the plugin aborts the in-flight provider request. [guest call floors](../../../tests/server/domain/plugin/substrate/guest-call-floors.suite.int.test.ts): plain and structured calls share one lane, and no request leaves past the ceiling. | Rebuild. |
| `turn.trigger` attributes the installer and threads the depth | [Guest room reads](../../../tests/server/domain/plugin/substrate/guest-room-reads.suite.int.test.ts): a member's request becomes the host's to confirm and runs no turn, and a host who hands the seat off mid-invocation runs no further turn. [Plugin origin stamps](../../../tests/server/domain/chat/persistence/plugin-origin-stamps.int.test.ts) owns the depth and the invoking room. | Rebuild. |
| Canon reads carry the installer's history floor and hidden-content verdict | Integration: [relay bridge](../../../tests/server/domain/plugin/verbs/ui-host-call-bridge.int.test.ts) reads through `uiHostCall` as a from-join member and as a host. The host read is the positive control. | Rebuild. |
| Variable operations close over the installer | Integration: the same relay bridge file sets, reads and deletes as two users and checks that neither sees the other's values. | Rebuild. |
| A non-member installer reads nothing. Roster, book and entry reads are member-gated and attachment-gated | [Guest room reads](../../../tests/server/domain/plugin/substrate/guest-room-reads.suite.int.test.ts): an installer kicked while the guest waits mid-invocation reads no canon, roster, variables or books, and entries come only from a book attached to the invoking room. The viewer decision is owned by [role authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts) and [member visibility](../../../tests/server/domain/chat/substrate/member-visibility.int.test.ts). | Rebuild. |
| A guest lore write has macros neutralized, needs an attached book, is title-namespaced per plugin and capped at the entry ceiling | [Guest lore write](../../../tests/server/domain/plugin/substrate/guest-lore-write.suite.int.test.ts): the turn that renders a guest's live `{{setvar}}` entry changes no variable, while a human entry's macro on the same key runs. An unattached book is refused, each plugin keeps its own entry per key, and the ceiling is `PLUGIN_LORE_ENTRIES_PER_BOOK_MAX` in `@orb/contracts/plugin`. | Rebuild. |
| Asset, search, databank and character ingest operations close over the installer | [Guest installer scope](../../../tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts): an asset read resolves only the installer's own storage, a databank document and a character ingest land in the installer's library with the calling plugin's provenance, and with two owners' libraries in active spaces on one encoder, each guest's `search.documents` ranks only its installer's document. [guest call floors](../../../tests/server/domain/plugin/substrate/guest-call-floors.suite.int.test.ts) owns the search ceiling. | Rebuild. |
| Card-state operations stamp the plugin's own slug and the installer | The storage walls are rebuilt below. [guest installer scope](../../../tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts): a sibling plugin of the same installer reads nothing and does not overwrite, a foreign character is refused, and another installer's plugin with the same slug cannot read. | Rebuild. |
| Imagery returns the asset id and never the cost | [Corpus plugin host](../../../tests/support/node/corpus-plugin-host.int.test.ts) generates through a real guest and reads the asset bytes and its generation's room and connection. The `imagery.generatePicture` op in the plugin domain's contract returns `{ assetId }` only, so a cost field fails `tsc`. | Keep. |

#### Plugin card data

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Round trip under the reserved plugin key, empty state reads found-with-null, a first write coalesces a null column | Integration, storage subject: [plugin card data](../../../tests/server/domain/character/persistence/plugin-card-data.int.test.ts) calls the production read and write on cards made by `character.create`. | Rebuild. |
| A foreign card writes nothing and reads like an absent card | The same file, with the owner's read as the positive control. | Rebuild. |
| One slug touches only its own key. Sibling plugin and vendor keys stay byte-identical | The same file. | Rebuild. |
| A state write never changes the content hash | The same file. | Rebuild. |
| A non-object under a plugin key reads as empty state | The same file. | Rebuild. |

#### RPG authority

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| Host-gated verbs refuse a member as forbidden and a non-member as not-found | Integration: [authority grid](../../../tests/server/domain/rpg/verbs/authority.suite.int.test.ts) calls each verb as host, member and non-member. [Role authority](../../../tests/server/domain/chat/verbs/role-authority.int.test.ts) keeps the `updateConfig` and `getGame` refusals for its chat role subject. | Rebuild as one grid. Keep the chat case. |
| A refused write leaves the plane untouched, and promotion mints no seat | The same grid, with the host's write as the positive control. | Rebuild. |
| Member-gated reads and dice admit a member and refuse a non-member | The same grid. | Rebuild. |
| Game birth and the dangling-pointer heal gate before a game exists | The same grid. | Rebuild. |
| A member writes only their own sheet row. The tracker exceptions need the host | The same grid. | Rebuild. |
| A host cannot reach another game's journal entry by id | The same grid. The victim entry is read back through `listJournal`. | Rebuild. |
| Each host-gated verb keeps its own refusal sentence | The sentence is copy. The error class and the gate are asserted. | Drop. |

#### RPG update config

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| An unrelated write keeps every tuned knob, including the falsy `reconcileEveryBeats: 0` | Integration: [update config](../../../tests/server/domain/rpg/verbs/update-config.int.test.ts) writes a value that differs from the born value, reads it, then writes an unrelated field. It covers the hint maps, hidden-channel, card, play-style, extraction, date, capture-vehicle, tracker and macro knobs. | Rebuild as one matrix. |
| Born defaults of each knob | The matrix derives the changed value from the born value and does not copy defaults. | Drop. |
| A passed tracker or macro list replaces the whole set | The same file. | Rebuild. |
| A ruleset change merges additively, switching back hides nothing, and re-sending the ruleset resurrects nothing | The same file. | Rebuild. |
| The preset override sets, survives, and clears on an explicit null | The same file. | Rebuild. |
| An unknown extraction mode is refused | The same file. | Rebuild. |
| Profile add is legal and a referenced remove is refused | The same file. | Rebuild. |
| Duplicate attribute, inverted range, dangling default, duplicate tracker and tracker cap refusals | The same file asserts the refusal code and an unchanged config. The cap and the unset spelling are the positive controls. | Rebuild. |
| The engaged flip survives an unrelated write. A retry repairs an interrupted pointer mirror | The same file arms a real SQLite refusal on the chat metadata write instead of a fake pointer. | Rebuild. |
| A wire-level prose patch writes nothing | Contract: [update config input](../../../tests/contracts/rpg/update-config-input.contract.test.ts). | Move. |
| A non-member cannot update the config | The authority grid. | Keep. |

#### RPG stale actor key

| Behavior | Primary home and maintained evidence | Decision |
| - | - | - |
| A snapshot actor row under the retired `cast` arm fails the whole read loudly | Contract: [actor ref](../../../tests/contracts/rpg/actor-ref.contract.test.ts) refuses the arm and projects the live keys. Integration, storage subject: [stale actor key](../../../tests/server/domain/rpg/persistence/stale-actor-key.int.test.ts) reads the corrupt row through `getTrackerView`. | Rebuild. |
| A stale presence key silently reads the NPC as offstage | The owner ruled a wipe, not a migration ([vocabulary map](../../law/vocabulary-map.md)). No product path writes the old spelling. The case pins a known silent orphan. | Drop. |
| A stale lock path silently detaches the manual-edit pin | The same ruling and reason. | Drop. |

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
| The shipped set is Hearth, Mocha and Light | Suite: seed theme pairing | Rebuild. The seeded ids and names are compared with their production constants, because the set equality passes when a seed and its value set are deleted together. |

#### Workload estimates

Reference: `server/domain/workloads/verbs/estimate-model-calls.int.test.ts`. Maintained [owner authority](../../../tests/server/domain/workloads/persistence/every-owner-authority.int.test.ts), [funded rows](../../../tests/server/domain/workloads/persistence/funded-tenant-rows.int.test.ts) and [refinery score sweeps](../../../tests/server/domain/refinery/persistence/score-sweep-rows.suite.int.test.ts) exercise the verb through the production root. The [backfill estimate suite](../../../tests/server/domain/chat/substrate/backfill-estimate.int.test.ts) owns the memory counts.

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
| Half-embedded avatar (raw vector only) is resumed, not skipped | None | Defer. The state needs a joint-encoder connection whose caption step fails mid-asset. The text fallback writes one lens, so the sweep cannot be interrupted between two. |
| Vanished asset row is a skip | None | Defer. A deleted row mid-sweep has no deterministic production seam. A deleted blob under a live row throws and fails the sweep. |
| Quote is zero for a Utility model that reads no pictures | None | Defer. Needs a text-only summarize connection built through the connection door. |
| Captioned row from before the facet breakdown is work, not a skip | None | Defer. Needs a sanctioned historic-state home in the testkit README. |
| Fused caption request body; local-light two-tower caption; refused joint-encoder update during routing | None | Defer. The first two are backend wire cases for the inference tests. The third needs the connection probe harness. |

### Selected case map: chat teaching, identity, read, backfill and persona resolution

This is a bounded case map. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). Every rebuilt case runs the composed server root and reads native provider bytes or a public service read. Each rebuilt guard was checked against a planted production defect that made it fail for its stated reason. Open rows are unresolved and keep their register row Partial.

The legacy collector and contribution cases exercised `collectTeaching` and the contributions with a synthetic registry or a synthetic game gather. The chat door exports neither the collector nor a registry seam, and no test-only door is added. The exact-duplicate guard is reachable through production and is rebuilt below. The remaining collector laws are not: the composed registry registers chat, then tool-use, then automation, and only chat and automation emit injections while only chat and tool-use emit tool names, so no two contributions that share an axis can arrive out of order. No production contribution throws.

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
| Exact-duplicate guard: two contributions emitting the identical injection reach the model once | Rebuild | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts): the host's frame and cyoa slot make the choices teach equal the reaction-attribution note for a reacted line. Skipping the dedupe delivers it twice. Host-authored rows stay uncollapsed, in the next case. |
| Identity-keyed guard, first survivor, ascending order, stable tie, toolNames union, throwing contribution, shared context instance | Drop | Collector internals that need a synthetic registry. Chat and automation share the injection axis and chat and tool-use share the tool-name axis, and each pair registers in ascending order, so a planted change to the sort or the union changes no production output. |
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
| Each row resolves `{{user}}` to its own stamp, including rows stamped by different humans | Rebuild | [Persona resolution](../../../tests/server/domain/chat/persona-resolution.suite.int.test.ts): a two-human room where each human's stored line keeps its own persona. A null stamp falls back to the anchor in [canon input writers](../../../tests/server/domain/chat/persistence/canon-input-writers.suite.int.test.ts). |

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
| Character seated mid-chat is counted for the blocks it witnessed | Rebuild | Same suite, with the exact count the sweep yields. A late `addCharacterToChat` replaces the forced join sequence, which production cannot produce. |
| Edited block is counted again | Rebuild | Same suite. |
| Group room counts its unminted shared bucket and mints nothing; memory off costs nothing | Rebuild | Same suite. The per-host off check is reached only by the bulk estimate, which the case asks through `mode: "bulk"`. |
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
| Preview honesty: budget partition by source and rack section, per-member card cost, preset override and an unowned override, GM preset redirect and its precedence, window ceiling, preset cap and guessed window, persona-swap leak, departed and disabled members, the preview's `{{user}}` binding, narrator and per-speaker shape, viewer time zone for the assembly and the action templates, guided steer, the template readout's identity and fire-time tokens, the active preset read, an unknown rack row, no persist | Rebuild | [Read preview honesty](../../../tests/server/domain/chat/verbs/read-preview-honesty.int.test.ts): each case reads the host preview through the composed root and, where a turn can follow, checks it against the provider bytes of that turn. |
| Preview game state block and its budget row | Keep | [Turn teaching](../../../tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts): the `game-state` source exists for a game, its opening line reaches the provider, and a plain chat has none. |
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

### Selected case map: boot migration, data layout and env floors

Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). The case map records every case of its reference files. Maintained homes:

| Home | Layer and production entry |
| - | - |
| [Boot migration](../../../tests/server/entry/boot/persistence/migrate.int.test.ts) | Integration on a real file database, `runBootMigrations`; pre-migration databases come from the shipped chain cut before its last migration |
| [Data-layout move](../../../tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts) | Integration on a real filesystem and database, `migrateDataLayout`; the legacy flat tree is the historic state the move exists for; every crash state is a real failed rename; the idle-holder case runs two real processes through [the holder](../../../tests/support/node/db-holder.ts) and [the migration script](../../../tests/support/node/migrate-data-layout.ts) |
| [Layout resolver](../../../tests/server/foundation/data-layout/index.test.ts) | Unit, `resolveDataLayout`; expectations derive from the layout's own `LEGACY_ENTRIES`, and a mapped record over `DataLayoutInput` fails `tsc` when a key is added |
| [Boot migration deps](../../../tests/server/entry/boot/migrate.test-d.ts) | Type, `runBootMigrations` accepts no posture or reset option |
| [Env floor](../../../tests/server/foundation/env/record/floor-defaults.test.ts) | Unit, the production `parseEnv` through `createTestEnv` |
| [Env file load](../../../tests/server/foundation/env/env-file-load.int.test.ts) | Integration, the production process env module in a fresh node process per case ([child](../../../tests/support/node/env-file-child.ts)); the load runs once at import from the working directory and process environment, so one process cannot vary it |
| [Host env allowlist](../../../tests/server/foundation/env/host-env-allowlist.int.test.ts) | Integration, `hostEnvAllowlist` and the boot secret scrub in a fresh node process ([child](../../../tests/support/node/host-env-child.ts)), because the scrub deletes from the process environment |
| [Boot disclaimer](../../../tests/server/entry/boot/disclaimer.test.ts) | Unit, `composeBootDisclaimer` with posture values derived from a parsed record |

Decisions for `server/entry/boot/migrate.int.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Forward migration over a populated baseline keeps prior bytes | Keep | [Provenance migration](../../../tests/db/schema/chat-freeze-provenance.repo.int.test.ts) runs a boot over a copied file database and compares rows and the pre-migration backup. The boot suite adds the second boot that takes no copy. |
| `resolveMigrationsFolder` ends in `migrations` | Drop | Private helper; every default-folder boot in the boot suite resolves it. |
| Baseline applied on a fresh database, integrity gate, foreign keys on | Rebuild | Boot suite, first case, on a file database with the default folder. |
| Second boot is a no-op | Rebuild | Same case, with the backup listing unchanged and the baseline `current`. |
| Raw `runMigrations` crashes on a stale record | Drop | Asserts drizzle's behavior. The product refusal is the drifted-chain case. |
| Regenerated-baseline dev database auto-resets | Drop: the reset arm is deleted under D163 | The `launched` option, `DB_LAUNCHED`, the boot reset branch and the database reset function are deleted, so `tsc` refuses a caller that passes the option ([type case](../../../tests/server/entry/boot/migrate.test-d.ts)). |
| Backup taken on a migrating boot into the passed dir, skipped on a no-op boot | Rebuild | Boot suite, first case. |
| Backup restores a commit still in the WAL | Rebuild | Boot suite on a database one migration behind, in place of the reset trigger. It also proves the copy predates the migration. |
| Backup failure aborts before the reset | Rebuild | Boot suite: an unwritable backup dir aborts before the forward migration, and the retry migrates. The proxy that forced a transaction failure is dropped as fabricated. |
| Debris at the stamped backup path is replaced | Rebuild | Boot suite. The name comes from `backupBeforeMigrate`, not a copy of its rule. |
| A reset boot backs up first, then prunes to the cap | Rebuild, narrowed; the reset trigger is deleted | Boot suite asserts the migrating boot prunes the oldest copy and keeps the newest, and a no-op boot prunes nothing. Retention counts, pins and daily rollup stay with the database client batch. |
| Shipped posture refuses a diverged chain on a file database before any backup | Rebuild | Boot suite, last case: the refusal is the boot's own typed `DomainOperationError`, which a drizzle crash from re-applying the chain is not, and the database, the rows and the copies are unchanged. |
| A launched memory database refuses to auto-wipe | Keep | Covered by the file-database case above. |
| Omitting `launched` fails closed | Drop: the reset arm is deleted under D163 | No posture option remains to omit; the type case guards it. |

Decisions for `server/entry/boot/migrate-data-layout.int.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Fresh install gets the container dirs | Rebuild | Layout move suite. |
| Legacy tree moves every named entry with a snapshot first | Rebuild | Layout move suite, derived from `LEGACY_ENTRIES`. It also covers the WAL-only row, modes, the stores that never move and the absent journal. |
| Second run is a no-op | Rebuild | Same case. |
| Target holds data: refuse before any rename | Rebuild | Layout move suite with a clearing control. The sizes in the refusal text are not asserted. |
| Explicit slot, `DATABASE_URL` and `CREDENTIALS_KEY` keep an entry in place | Rebuild | One table over every keyed entry in `LEGACY_ENTRIES`, including the secrets and the no-snapshot rule for a kept database. |
| Live-pid journal refuses | Rebuild | Layout move suite, from a journal a real failed rename left. |
| Journal under this process's pid resumes | Rebuild | Same suite, default liveness. |
| Source on another filesystem | Rebuild | Same suite, injected device probe, with a same-device control. |
| Target container linked onto another filesystem | Rebuild | Same suite. |
| Data root that is a symlink | Rebuild | Same suite. |
| Resume re-plans against the current env | Rebuild | The apply-time failure case, keyed per entry, replays under an env that keeps the entry. |
| Idle holder of the legacy database refuses | Rebuild | Same suite, two real processes and a released control; the poll loop is replaced by a process message. |
| Zero-byte legacy database is ignored | Rebuild | Same suite. |
| Dead-pid journal resumes | Rebuild | Same suite. |
| Resume refuses when source and target both hold data | Rebuild | Same suite, tampering with a real crash state and a control that clears it. |
| Resume refuses when neither side exists | Rebuild | Same suite. |
| Empty mount point at a target | Rebuild | Same suite, with the keyed and keyless remedies. |
| Failing resume boots leave one snapshot | Rebuild | Apply-time failure case. |
| Apply-time rename failure keeps the journal until the env names the remedy | Rebuild | Same case, with the no-op boot after the remedy. |
| Legacy database on another filesystem refuses with the `DATABASE_URL` value that keeps it | Rebuild, narrowed | The keeper table runs the working value from `fileDatabaseUrl`. The refusal wording and the value parsed from it are not asserted. |
| Kept keyfile is warned with its keeper | Rebuild | Layout move suite, through the migration script in a child process whose production logger's warnings ride the outcome. A control boot without the key moves the keyfile and warns nothing. |
| Stranded session secret is warned on every boot | Rebuild | Same suite: two boots with a different `SESSION_SECRET` each warn with the file and its keeper; the same pepper and no explicit secret are silent. |

Decisions for `server/foundation/data-layout/index.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Slots derive from the default root, relative | Rebuild | Layout resolver, by relation to the root. |
| `DATA_DIR` re-roots every slot | Rebuild | Same, for an absolute and a relative root. |
| Explicit slot wins and lands in the explicit set | Rebuild | Same, one key at a time against the derived tree. |
| Every slot key honoured, empty counts as unset | Rebuild | Same, over a record that lists every `DataLayoutInput` key by kind. |
| Non-file `DATABASE_URL` carried through | Keep | [Native file identity](../../../tests/server/foundation/data-layout/persistence/file-identity.int.test.ts) covers the explicit URL inputs; the resolver suite adds the remote case. |
| `DATA_LAYOUT_SKIP` parsing | Rebuild | Same. |
| `DATA_LAYOUT_SKIP` refuses the database, keyfiles and keyed slots, and an unknown name | Rebuild, narrowed | Same, one case per keyed entry plus a control. The naming of the key in the message is not asserted. |
| Database remedy carries the `DATABASE_URL` value | Drop | Message wording; the working value is run by the move suite. |
| Explicit secrets land in the explicit set | Rebuild | Same. |
| Import domain default equals the resolver | Drop | The import domain derives `DEFAULT_IMPORT_STAGING_DIR` from `resolveDataLayout`, so the two cannot differ. |

Decisions for `server/foundation/env/floor-defaults.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Debug and observability gates default off | Rebuild | Env floor. |
| Single-user default needs no SSO or secret keys | Rebuild | Env floor, the fallback derived from `AUTH_MODE_DEFAULT_FALLBACK`. |
| `LOCAL_LIGHT_CACHE_DIR` default under the data root and override | Rebuild | Env floor reads every slot against the resolver. |
| `LOCAL_LIGHT_CPU_PERCENT` default and invalid values | Rebuild, narrowed | Env floor keeps the valid value and every refusal. The default of fifty is a copy of production and is dropped. |
| Data slots resolve from `DATA_DIR` | Rebuild | Env floor. |
| `DATA_LAYOUT_SKIP` is checked at parse | Rebuild | Env floor. |
| Rate-limit budgets have the documented floor | Drop | Asserts copies of production defaults. |
| Boolean toggles transform | Rebuild | Env floor, on a non-security knob. |
| Boolean knobs refuse widened spellings | Rebuild | Same. |
| Boolean knobs accept exactly `true` and `false` | Rebuild | Same. |
| `processEnvSnapshot` is a copy | Rebuild | Host env allowlist: an edit to a returned baseline never reaches the next read, and after the boot scrub the app secret is gone while the host's own variable stays. |

Decisions for `server/foundation/env/env-file-load.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| `.env` beats a shell export | Rebuild | Env file load. |
| Override off under `VITEST` and under `ORB_ENV_NO_OVERRIDE`; the file still fills unset keys | Rebuild | Same, one case per hatch. |
| No `.env`, and an unreadable `.env` | Rebuild | Same, compared with a baseline process. |
| Parser tolerance for comments, quotes, `export`, junk and CRLF | Drop | Behavior of the platform parser, not the loader. |
| UTF-8 byte-order mark | Rebuild | Same. |
| `KEY: value` lines ignored | Drop | Behavior of the platform parser. |
| `ORB_ENV_NO_FILE` skips the load | Rebuild | Same, with a control. |
| The test config sets `ORB_ENV_NO_FILE` | Drop | A runner configuration literal; the tooling mirror owns runner configuration. |
| `AUTH_FALLBACK` in `.env` is boot-fatal, and absent boots clean | Rebuild | Env file load, for `AUTH_FALLBACK` and `AUTH_FALLBACK_TRUSTED_PEERS`: the line in `.env` refuses the boot, while the same file without it boots at the mode's default and the launch environment may set it. The refusal text is not asserted. |
| Deleted `SESSION_COOKIE_INSECURE` stays inert | Rebuild | Env file load, for each spelling from the launch environment and from `.env`: the boot proceeds and the record has no such field. |

Decisions for `server/entry/boot/disclaimer.test.ts`:

| Case | Decision | Evidence |
| - | - | - |
| Topics in order | Rebuild | Boot disclaimer. |
| Healthy loopback single-user carries the caveat and no security line | Rebuild | Same. |
| Caveat rides a widened-peer single-user box | Rebuild | Same. |
| Login modes carry no caveat | Rebuild | Same, over every login mode in the auth-mode tuple, with a row record that fails `tsc` for a new mode. |
| Each exposure is one security warning | Rebuild | Same, for every exposure kind: bind, owner peers, diagnostics and break-glass. |
| Closed forward-header door warns but is not an exposure | Rebuild | Same. |
| Every security line is a warning | Rebuild | Folded into the exposure case, asserted for each kind. |
| Break-glass line | Rebuild | Same, with a control per ingredient. |

Defect controls: each guarded production behavior was planted in a worktree and the named case failed for its intended reason. The planted behaviors are the drifted-chain refusal, the posture option type, the backup gate, the abort on a failed backup, the retention sweep and its boot gating, debris replacement, the target-conflict check, the cross-device pre-flight, the sole-holder claim, the first-boot snapshot, own-pid and live-pid journal handling, keeper and skip-list planning, zero-byte handling, the resume snapshot rule, the skip validation, explicit-set recording, the boolean vocabulary, the gate defaults, the parse-time skip check, the override direction, the byte-order mark, `ORB_ENV_NO_FILE`, each disclaimer gate, the kept-keyfile and stranded-secret warnings, the launch-only `.env` refusal, the dropped cookie knob, and the baseline's copy and fresh read.

### Selected case map: inference backends, import identity and composition

This is a bounded case map for eight reference files. Legacy paths are relative to the external source named in [Spine-Testing](../../law/Spine-Testing.md#2-the-tree). Inference cases run the real executor on the composed root and read the bytes at the provider edge, because the body shaper, the Anthropic turn and the registry have no public door and none is added. Import and composition cases run the composed server root through its HTTP doors, its descriptors and its workload contributions. A case about a credential, a secret or authentication is recorded as "Move to security batch" and left. Open rows are unresolved and keep their register row Partial.

#### OpenAI-compatible body (`inference/backends/openai-compat/body.test.ts`)

Home: [body shaping](../../../tests/inference/backends/openai-compat/body-shaping.int.test.ts), integration through `runChatTurn` on a scripted endpoint.

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Extras win over a preset knob and a computed key; a belt-owned key is dropped by name; a fresh key rides | Rebuild | Body shaping, with the unextended turn as the control. The SDK-object purity check is dropped as implementation detail. |
| The OpenRouter transport takes only its modelled keys and names the rest | Rebuild | Body shaping reads the body and the warning events. The side-generation suite keeps the log case. |
| Prototype-pollution keys never land | Rebuild | Body shaping, through the connection extras parser. |
| `includeBody` replaces a modelled field and an extra whole; `excludeBody` wins | Rebuild | Body shaping. |
| The cap rename and a cap the user's body states | Rebuild | Body shaping, for extras, `includeBody` and `excludeBody`. |
| Template thinking switch beside the user's kwargs; the user's own switch outranks it; the budget at zero; a user budget key wins | Rebuild | Body shaping on the vLLM row. |
| Prefill pair, thinking interlock and a user-decided prefill | Rebuild | Body shaping. A mandatory-reasoning model skipping the interlock stays Open. |
| A messages array the user set takes no prefill pair and no interlock from the plan | Rebuild | Body shaping, with the unextended prefill turn as the control. |
| A reasoning-on turn tells the template to think, never over an off the user already set | Rebuild | Body shaping. The interlock's own off outranking the switch is asserted by the prefill case. |
| A messages array the user set keeps its cache marker, takes no name, media or detail stamp, and is not folded | Open | These rules need the assembly's cache plan on an OpenRouter row, or a named-speaker or image history. |
| `preserve_reasoning`, and kwargs the user set to a non-object | Open | The switch is asserted; the preserve key and the non-object values are not. |
| An effort the row cannot spell is dropped | Rebuild in part | The row-level drop and the user's effort surviving are asserted. The shaper's own strip is a possible dead guard: the SDK never writes the key on such a row. |
| Re-attachment of assistant media and participant names; image detail; reply-image modalities | Open | Each needs an image or named-speaker history through the chat assembly. |
| Cache-marker move onto the nearest text part; same-role fold | Open | Both need the assembly's cache plan on an OpenRouter row with a tool-call history. |

#### Endpoint diagnostics (`inference/backends/openai-compat/diagnostics.test.ts`)

Home: [endpoint inspection](../../../tests/inference/backends/openai-compat/endpoint-inspection.int.test.ts), through `diagnostics.inspect`.

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| 401 and 403 are revoked with the reason scrubbed of every credential literal; a 500 body is no classification evidence | Move to security batch | Credential health and secret redaction. |
| Unreachable carries the status when the server answered and none when nothing did | Keep | [Corpus connection](../../../tests/support/node/corpus-connection.int.test.ts) asserts a 502 probe and a refused inspection. |
| An Ollama row's test request takes the native route and shaping its chat turn takes | Rebuild | Endpoint inspection compares the recorded URL and options of both calls. |
| A Custom row's test request takes the same route and body as its chat turn | Rebuild | Endpoint inspection, with the row's extras and cap spelling. |
| A 2xx reply the chat path cannot read is not ok | Rebuild | Endpoint inspection. |
| A hung endpoint fails at the row's request timeout | Rebuild | Endpoint inspection, on the root's observed timer. |

#### Anthropic chat (`inference/backends/anthropic-messages/chat.test.ts`)

Home: [chat wire](../../../tests/inference/backends/anthropic-messages/chat-wire.int.test.ts), integration through `runChatTurn` on a scripted SSE endpoint, on each model's curated capability.

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Thinking and tool loop replays the signed block; redacted block; no reasoning is not redacted; the conversation rung's row shape and its control | Rebuild | Chat wire. |
| Trailing assistant row on a model that refuses prefill | Rebuild | Chat wire: a typed refusal and no request. |
| An SDK-dropped sampler warns | Keep | [Unsupported settings](../../../tests/inference/conformance/unsupported-settings.suite.int.test.ts). The applied receipt log line is dropped as log trivia. |
| Mandatory clamp, Opus and Sonnet off spelling, an explicit level, the non-mandatory control | Rebuild | Chat wire, including the recorded applied effort. |
| Forced tool choice downgraded to auto, with its controls; manual thinking refuses a forced choice | Rebuild | Chat wire. |
| Parallel-tool switch | Rebuild | Chat wire. |
| Tool cache marker on the last tool alone; strict and input examples; eager input streaming | Rebuild | Chat wire. The cache receipt count is dropped as log trivia. |
| Rate-limit headers, generation id, classifier refusal | Rebuild | Chat wire, with a header-less and a plain-end control. |
| Prefix-bound carry asks to drop a stale block, for both carry rungs, with controls; an unmeasured id fails closed | Rebuild | Chat wire. |
| Every measured older id keeps its wire | Rebuild, narrowed | Chat wire keeps three controls. The full table copies curated rows and is dropped. |
| A dropped thinking block is counted on the record and raised as an alarm | Rebuild | Chat wire, with a clean-turn control. |
| Turn-scoped system cue with `clear_at` and its beta; per-turn system half stays in `system[]` | Rebuild | Chat wire. |
| Full request body byte equality | Rebuild | Chat wire: one `toEqual` over the whole body of a minimal turn, with the owner digest matched as a string. Named-field assertions cover the rest. |
| Turn span events | Open | The root exposes a span seam that no case scripts. |

#### Provider registry (`inference/registry/providers.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| A plugin row answers only its owners; admin and built-in rows answer everyone; widen and narrow on install and drop | Keep | [Provider rows](../../../tests/server/domain/connection/persistence/provider-rows.int.test.ts) and [provider contributions](../../../tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts). |
| Two owners' definitions of one id; a changed definition refused | Keep | The same two suites. |
| An older refresh cannot republish after a removal; failed activation compensation; a failed refresh does not poison later publication | Open | The cases hold a store read or fail one. The root's store is the real database and no door holds a read, so the publication-order guard is reached only by a synthetic store. |

#### Library backup round trip (`server/entry/import/bundle-round-trip.suite.int.test.ts`)

Homes: [library planes](../../../tests/server/domain/import/loader/library-planes.int.test.ts), [import bundle](../../../tests/server/domain/import/loader/import-bundle.int.test.ts), [portability routes](../../../tests/server/entry/http/portability-routes.int.test.ts).

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Gallery, inline images, attachment link, background, signed replay provenance, seeded cards, star, databank and imagery onto owned bytes; zero failures and no dangling reference | Keep | Import bundle. |
| Preset, tag and theme rows land for the uploader and a second import adds none | Keep | Portability routes. |
| Persona, world book, global databank attachment and a settings value land; a second restore adds none | Rebuild | Library planes. |
| Prose injections and the chat tag overlay restore by value | Rebuild | Library planes. |
| Campaign: game, hand journal, checkpoint and its snapshot position | Rebuild | Library planes. The checkpoint restores only when its position resolved. |
| Turn-anchored snapshot, journal and tool-call rows land on the restored variant of their own turn | Rebuild | Library planes, through a bundle written by the production writer, with the earlier assistant turn as the control. |
| Second restore writes zero new rows | Rebuild | Library planes, for the room, injections, checkpoints and journal. |
| A re-import after the room lost a later message keeps the game and reports nothing lost | Rebuild | Library planes. The campaign cannot be re-placed once the slots stop aligning, so only the existing-game check keeps the import from a false loss note. |
| Avatar blob byte identity; derived runtime variables do not travel; room blob, compact summary and variable picks by value | Open | Not asserted end to end. The serde contract parses them. |

#### Import identity (`server/entry/import/import-identity.suite.int.test.ts`)

Home: [import identity](../../../tests/server/entry/http/import-identity.int.test.ts), through the Characters dialog upload and the tree upload.

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| Card tags apply at once through both doors; a model suggestion stays pending across a re-import | Rebuild | Import identity. |
| A split folder mints each persona once, with its avatar, and every upload's chats attribute to it | Rebuild | Import identity, with uploads shaped as the identity ruling states. The client planner that splits the folder has no maintained test and is Open as a client unit case. |
| JSON card, its PNG and the JSON again are one character; the same text under other art is a second | Rebuild | Import identity. The alternate art is a PNG with one extra ancillary chunk, because the fixture builder varies only the card chunk, which is not art. |
| Two different embedded books under one name land as the name and its numbered twin | Rebuild | Import identity, with each card's own link. |
| A world name-link binds the book its own import landed, including a renamed book | Rebuild | Import identity. |
| Keep-both on a persona collision never copies an equal persona | Rebuild | Import identity. Not a reference case. The merge default hides the equal-content guard. |
| Two profiles in one upload bind a repeated world name to the first profile's book | Open | The tree route's layout admission for two profile roots is not exercised. |

#### Compose databank (`server/entry/compose/databank.int.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| A databank settings write is what the composed read returns; owner isolation; the chat-only slot budget is excluded | Keep | [Databank settings](../../../tests/server/domain/settings/verbs/get-databank-settings.int.test.ts). |
| Unwritten section reads the grounded defaults | Drop | Asserts copies of production defaults. The other owner's unchanged read is the control. |
| The room's host sees a hidden document flagged and a member never receives it | Keep | [Corpus databank](../../../tests/support/node/corpus-databank.int.test.ts). |

#### Compose services (`server/entry/compose/services.test.ts`)

| Reference case | Decision | Maintained home or reason |
| - | - | - |
| The graph builds and yields every service key | Drop | Every composed suite builds the graph, and the services type is checked by `tsc`. |
| Admin revoke evicts that user's live sockets | Keep | [Session policy](../../../tests/server/domain/admin/verbs/session-policy.int.test.ts). Also an auth case for the security batch. |
| Bulk card tag attaches through the real tag wiring | Keep | [Tag row clocks](../../../tests/server/domain/tag/persistence/row-clocks.int.test.ts). |
| Seed: manifest content and no rooms; a deleted seeded card stays deleted across a cold graph; an explicit welcome pick is kept; a campaign roster | Keep | [Corpus seed](../../../tests/support/node/corpus-seed.int.test.ts), [seed ledger](../../../tests/server/domain/settings/persistence/seed-ledger-tags.int.test.ts), [default persona seeder](../../../tests/server/domain/persona/seeder/default.int.test.ts) and [roster seed](../../../tests/server/domain/roster-preset/verbs/seed.int.test.ts). |
| Indexer subscription with a stub store and a copied dispatcher | Drop | A copied assembly. The gate's observable outcome is rebuilt below. |
| `corpusAutoindex` off writes nothing, saving it on indexes the next write, off again leaves an edit unindexed | Rebuild | [Autoindex gate](../../../tests/server/domain/embeddings/persistence/autoindex-gate.int.test.ts), storage subject. The once-only catch-up queue stays Open. |
| `character.updated` stores the card-text projection; a flag-only update drives zero store work | Rebuild in part | Autoindex gate: a content edit re-embeds under a new content hash, and a star toggle spends no embedding request and keeps the hash. The handler's own skip is a possible dead guard, because the store's content-hash gate alone gives the same output. The stored text itself is not compared, because the scripted embedder returns one vector for every input. |
| `asset.created` stores both image lenses from the real CAS bytes | Open | The event path needs a joint-encoder connection. The corpus embed connection is text only, and an avatar upload with indexing on writes no image row and sends no request. The sweep path keeps both lenses in [image sweep rows](../../../tests/server/domain/embeddings/persistence/image-sweep-rows.int.test.ts) and [corpus knowledge variants](../../../tests/support/node/corpus-knowledge-variants.int.test.ts). |
| Fresh seeded content rebuilds text for its recipe while reusing unchanged raw-image seeds | Open | Needs the shipped local-light seed vectors and a scripted local-light cache, which no maintained root composes. Image sweep rows covers a seeded avatar sweep with its own spend, not the shipped raw vectors. |
| Chat kick lands durably and on the recipient's live bus | Keep in part | [Recipient inbox](../../../tests/server/domain/notifications/verbs/recipient-inbox.int.test.ts) and [corpus notifications](../../../tests/support/node/corpus-notifications.int.test.ts) own the durable half and the live correction. |
| Persona switch fans `personaSwitched` onto the live room channel | Open | Needs the live room stream through the transport. |
| Persona remove re-points the current and default pointers, names the new default, and re-seats a worn seat | Rebuild | [Remove re-point](../../../tests/server/domain/persona/verbs/remove-repoint.int.test.ts). A seat its owner already left stays Open. |
| Embed-space rebuild trigger: unbind and re-bind queue nothing, a move queues forced sweeps, two triggers queue one, boot sweeps stale owners, an enqueue failure is logged | Open | The legacy state was a raw generation row. A production move needs two real encoders. |
| Generated-image rule forwards its diffusion knobs through the composed graph | Open | [Automation dispatch](../../../tests/server/domain/automation/engine/dispatch.int.test.ts) fires the action; the forwarded parameters are not asserted. |
| Search completes when memory is off or has no summarizer | Keep in part | [Empty-owner completion](../../../tests/server/domain/embeddings/persistence/empty-owner-completion.suite.int.test.ts) owns the owner with no hosted room. Old-model memory vectors and memory on without a summarizer stay Open. |

Defect controls: each rebuilt guard was checked against a planted production defect that made it fail for its stated reason. The planted behaviors are in the shaper the belt drop, the OpenRouter key allowlist, the cap rename over a user cap, the budget and switch deferrals, the prefill pair over a user key, the prefill interlock, the effort deferral and the pollution-safe merge. In the inspector they are the cap, the native route, the extras and the idle bound. On the Anthropic wire they are the carry binding, the off spelling, the prefill belt, the drop alarm, the tool cache marker, the parallel switch, the rate-limit and id capture, the budget-thinking forced choice, the clear-at row, the applied effort, the refusal event and the downgrade. In import they are the text identity, the art re-key, the free-label mint, both world-link rules, the persona reuse, the card tag status, the injections, the tag overlay, the checkpoints, the hand journal, the variant anchor, the chat identity hash, the settings merge and the global attachment. In composition they are the persona fallbacks, the default-move report, the seat re-seat and the autoindex gate in both directions.

Further planted behaviors: the whole-body reshape (the adaptive display), the existing-game check on a re-import whose campaign cannot be placed, the prefill pair over a user messages array, the switch over the interlock's off, the switch on a reasoning-on turn, and a character update that never flags its content change.

Possible dead guards, each a plant that changed no output: the shaper's own effort strip on a row that spells no effort, because the SDK never writes the key there; the inspector's `failure === undefined` term in `ok`, because the catch arm already returns false; and the embeddings indexer's `contentChanged` skip, because the store's content-hash gate alone gives the same rows and requests. The rpg existing-game check is live: without it, a re-import whose campaign cannot be placed reports a loss while the room still has its game.

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
