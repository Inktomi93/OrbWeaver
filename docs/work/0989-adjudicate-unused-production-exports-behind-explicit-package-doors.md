---
kind: work
status: doing
updated: 2026-10-21
priority: P2
area: packages
---

# Adjudicate unused production exports behind explicit package doors

## What

Use the native production Knip inventory and shrink-only baseline to review unused public re-exports and implementation exports in cohesive package or domain batches. Remove unnecessary surface, follow real callers, delete genuinely unused code, and retain deliberately supported external APIs with their actual contract. Explicit package paths are implemented; symbol-level adjudication is not complete.

## Why

Closing wildcard package paths exposes unused symbols but does not remove them. Tests and tooling must not keep production code falsely alive, and a baseline entry is debt rather than authority.

## Done when

The recorded production inventory is fully adjudicated in package/domain batches. Each batch records production roots and consumer scope. Removed exports preserve real callers; retained external APIs have explicit contracts. Baseline debt shrinks without new exemptions. No custom liveness reader or fake consumer is added.

## Evidence

Detailed implementation and qualification evidence is preserved in `reports/review/tooling-park-2026-10-21/work-before/0989-adjudicate-unused-production-exports-behind-explicit-package-doors.md`.

Continue owner-authorized package batches. Keep other scopes parked and preserve their source, reports and unfinished qualifications.

## Selected kit cases

| Behavior | Decision and maintained home |
| - | - |
| Macro coercion, argument bounds, diagnostics and strict rendering | Rebuild through the production evaluator and registry in [argument enforcement](../../tests/kit/macro/argument-enforcement.test.ts). Remove the redundant `validateMacroArgs` facade. |
| Accepted-base foreground margin and ramp/input correction | Rebuild with live solvers in [accepted-base foreground](../../tests/kit/theme-derivation/accepted-base-foreground.test.ts). Preserve the attainable derivation target in D202. |
| Emitted foreground pairs, input composition and opaque reading bands | Move appearance checks to [native ThemeScope CT](../../tests/ui/content/theme-scope/emitted-contrast.ct.tsx). Remove unused convenience wrappers without changing live derivation. |
| Generated handle tables and runtime Unicode agreement | Keep provenance and move compatibility coverage to the [repository-contract test](../../tests/kit/handle-key/unicode-version.repo.int.test.ts). Add no production import door. |
| Tooling-only kit consumers | Keep existing pure APIs with maintained tooling consumers. Production-only findings do not establish unused code across the workspace. |

Registry completeness, autocomplete, other handle-key cases and unrelated theme reference cases remain outside this selected restoration scope. The [restoration register](../plans/test-foundation/design.md#restoration-register) records these bounds.

## Selected server boundaries

| Surface | Disposition |
| - | - |
| Unused boundary type forwarders | Remove unused aliases while retaining canonical definitions, consumed public exports and emitted JavaScript. |
| Generated AppRouter declaration entry | Keep the compiler source entry. Model its actual client consumers through native Knip source mapping. |
| Plugin Git packer | Preserve the implementation and use its module front door from the production Git adapter. |
| Domain contexts | Follow [the context construction rule](../law/Core-0-Architecture-and-Structure.md#4-the-per-feature-template--the-legibility-engine). Import types from their canonical contracts; retain real dependency adapters and state owners. |

The context migration uses JSSG against a resolved import inventory. Compiler, runtime-output equivalence and composed application checks qualify the changed boundaries.

## Selected database surface

Check database findings against schema registration, relational metadata, migration generation, raw SQL and actual consumers before changing an export. Runtime and generation both consume the complete schema barrel; keep its tables, relations and codec registration intact.

| Selected surface or behavior | Decision and primary layer |
| - | - |
| Unused root codec and result-type forwards | Remove forwarding sites only. Keep the canonical codec used by schema declarations and actual lifecycle result types. |
| Module-local constraint vocabulary, ownership-column shape, scoping type and backup pin suffix | Localize unused export modifiers. Preserve their actual declarations, classifier, query predicates, registry and backup naming behavior. |
| Cascading lifecycle result-type exports | Localize only when removing an unused root forward leaves no named external consumer. Keep actual function signatures and inferred results unchanged. |
| SQL literal-list formatting | Rebuild meaningful quote, backslash and canonical-member cases through the existing `@orb/db/query` function. This pure calculation belongs in unit tests, not a fabricated database service. Keep the supported entry. |
| Reset-script construction | Rebuild transaction framing, dependent-object ordering, quoted identifiers and empty-input behavior through the existing `@orb/db` function. These unit cases prove generated SQL, not native rollback. Keep the function and remove its unused public directive. |
| Schema and migration metadata | Keep. A missing named import does not establish unused database registration. No schema, relation, migration or live database is changed by this selection. |

Ordinary native Knip includes DB entry exports and reports no unused findings. Production-only findings retain actual test and tooling consumers without public-marker exemptions. Affected compiler, lint, dependency and selected native behavior checks pass. Isolated literal-quote and identifier-quote defects fail the intended unit assertions while their positive cases pass; sources are restored exactly.

The schema, relations, codec, migration inputs and existing function bodies remain unchanged. Other database reference cases need separate comparison; this batch does not qualify native reset rollback or complete database restoration.

## Selected data-contract surface

This selection covers character, databank, discovery, persona, roster-preset, stats, tag and world-info contract owners. Resolve actual direct, alias, namespace, computed and generated consumers before narrowing an export.

| Selected surface | Decision and preserved owner |
| - | - |
| Implementation-only exports used by their enclosing live schemas or types | Localize export modifiers only. Preserve canonical schemas, tuples, initializers, readonly fields, strictness, type-first interfaces and schema checks. |
| `GreetingsColumn`, `PersonaBackupWire`, `CreateRosterPreset` | Remove unused type identities and their hiding directives. Actual callers retain the canonical schema-derived results and existing domain input types. No parser or wire field is removed. |
| SDK, author-support generation and package compatibility | Preserve actual supported consumers and published SDK/toolchain doors. Contracts remain checked rather than receiving a package-wide exemption. |
| Mounted parser and schema enumeration tests | Keep actual mounted-input coverage. Generic export enumeration does not establish a business consumer for every internal schema. Qualify the selected public surface without weakening its constraints. |

No runtime definition, schema or package door is deleted by this selection. Existing parser regression purposes remain distinct from type-identity trivia. The selected source passes maintained contract and reflective-reader tests, affected compiler programs, scoped lint, dependency checks and independent review. Native default and production scans remove the selected findings without adding findings. The remaining governed contract findings are recorded below; broader original-case restoration remains partial.

## Selected inference and RPG contract surfaces

| Selected purpose | Decision and boundary |
| - | - |
| Inference, provider and role-client auxiliary declarations with actual local use | Localize unused export modifiers. Preserve canonical bodies, schema constraints, initializer order, correlated signatures and independent type checks. |
| RPG, refinery and prose declarations with actual local use | Localize unused export modifiers, including locally used marked declarations. Preserve canonical tuples, schemas, readonly interfaces and enclosing public contracts. |
| Declaration-only RPG and refinery inferred aliases | Remove audit-only aliases with no current, generator, SDK or original assertion consumer. Preserve their canonical schemas and the externally consumed RpgAddJournalEntryInput. |
| PREFIX_CACHE_ACTIONS, bindingActorKindSchema and structuredSchemaComplexity | Keep the canonical cache axis connected to its real schema; remove the orphan parsers/readers with the qualified public-entry replacements below. |
| ConnectionRef and WIRE_SCHEMA_KEYWORD_VOCABULARY | Remove the unconsumed audit alias and obsolete checker projection. Preserve the actual parser and wire engine. |
| payloadSchemaFor and patchToolsOnlyFields | Remove unused callable identities with their bounded reader/patch cases qualified below. Preserve actual payload parsing, generated grammar and decoding. |
| trackerGloss | Remove the unconsumed absolute-gloss helper. D113 protects actual standalone transition hints through the shared delta builder. |
| Original parser, formatter and patch-expressibility permutations | Keep restoration partial. Pure permutations belong in unit or contract tests; integration owns distinct production composition and provider wiring. Record selected replacements and defect controls before acceptance. |

This selection passes scoped lint, maintained runtime tests, affected compiler programs, dependency checks and independent review. Native scans remove the selected findings without weakening live behavior. The case maps below own bounded callable removals; wider restoration remains partial.

## Selected tracker wiring cases

| Behavior | Primary layer and disposition |
| - | - |
| Tracker numeric narrowing, value totality and ceiling permutations | Unit or contract through actual public production helpers. Rebuild uncovered cases there; do not repeat their matrix through SEND. |
| Absolute readings and vocabulary formatting | Unit or contract. Drop only helper-specific gloss assertions; preserve meaningful reading, vocabulary and ceiling behavior independently. |
| Persisted actor and game trackers reaching standalone macro and CEL provider fragments | Integration through actual SEND, production composition and native provider capture. Rebuild this distinct wiring case; existing user-macro tests do not prove it. |
| Carried-unset labels, effective ceilings and vocabulary placement | Keep representative integration assertions for real carriage and composition. Pure punctuation and input permutations remain unit or contract work. |
| Selected snapshot and quiet output | Integration. Verify the real selected variant has a snapshot before trusting negative output. Reuse existing swipe and regeneration coverage. |
| Other delta, reminder and guide projection cases | Remain partial and outside this selection. No complete reference file is declared restored. |

The tracker integration replacement passes runtime, affected compiler and dependency checks and independent review. Removing hint emission makes its isolated provider-fragment assertion fail while vocabulary assertions still pass. Its external execution is scripted; application composition, persistence and macro assembly remain production-owned.

## Selected cache-policy ownership and obsolete audit artifacts

| Finding and original purpose | Decision and qualification |
| - | - |
| PREFIX_CACHE_ACTIONS defines the prefix action axis | Keep the canonical tuple local. A complete key-correlated schema map preserves existing branch order and every field constraint. |
| Prefix parser and producer behavior | Contract owns admitted actions and correlated-field refusals. The actual resolveCachePolicy producer owns effective none, automatic-request and marker outcomes; use production-derived contexts rather than copied resolution logic. Preserve existing replay coverage. |
| ConnectionRef audit alias | Remove the unconsumed inferred alias. Keep connectionRefSchema and its actual branded-id and model-stripping behavior; original parser cases remain separate from the unused alias spelling. |
| WIRE_SCHEMA_KEYWORD_VOCABULARY tooling projection | Remove the unused concatenation for removed checker consumers. Preserve the engine's actual private keyword tables and public scrub behavior. No replacement checker or fabricated consumer is required. |

This bounded selection passes runtime, affected compiler and dependency checks and independent review. Controlled weakening of the inactive-prefix constraint and manual-depth floor makes the selected assertions fail; both production files are restored exactly. The binding-actor case map below owns the separate live admission-boundary replacement.

## Selected plugin and knowledge contract surfaces

| Purpose | Decision and boundary |
| - | - |
| Plugin UI vocabularies, caps, recursive schema anchors and supporting types | Localize unused owner exports only. Preserve public node/spec contracts, all validation and recursive type conformance. Independent SDK mirrors are not application import consumers. |
| Plugin manifest budgets, frame result key and snippet/suggestion axes | Keep canonical declarations and every runtime use; remove unused export modifiers. Preserve generator inputs, SDK distribution doors and actual template authoring types. |
| PluginUpdateSource audit alias | Remove the unconsumed alias and correct its stale comment reference. Keep the update-source tuple and actual PluginView wire contract. |
| Embedding metadata axes, prune variants, extraction format tables and search parser components | Localize selected unused exports while retaining every definition, constraint, readonly field, presence distinction and enclosing public contract. |
| Original plugin and knowledge boundary cases | Preserve meaningful cap, refusal, serialization, branding and type-conformance purposes. Modifier cleanup does not declare their broader restoration complete. |
| Durable-fact concept | D55 keeps the future design in the parked world-state plan. Remove the unconsumed vocabulary file without changing live conversational memory. |

This selection passes bounded JSSG preservation checks, maintained runtime tests, affected compiler programs, dependency checks and independent review. SDK packages, templates, generators and application behavior remain unchanged.

## Selected patch-expressibility and exact-zero grammar cases

| Original purpose | Primary home and decision |
| - | - |
| Every real tool field is patch-expressible | Rebuild through actual tool generation, generated patch schema and public decoder. Independently authored complete canonical inputs and patch entries must round-trip without loss. Check nested canonical shapes explicitly; comparing outputs of the same walker is insufficient. |
| Patch grammar has no optional or union-valued object properties | Rebuild raw and scrubbed checks through public countWireSchemas and checkWireSchema with explicit zero ceilings. Keep this distinct from fitting nonzero vendor budgets. |
| Closed envelopes, grouping, repeated lists and quiet tools | Retain selected contract assertions needed to prove complete generated grammar and decoded arguments. Preserve positive survivors alongside refusals. |
| Diagnostic helper identities | Remove patchToolsOnlyFields and structuredSchemaComplexity with qualified public-entry replacements. Preserve the live counting engine and unsupported-shape skip behavior. |
| Other patch intent, loss-record and composed planner cases | Numeric preference, second-actor split invocation, interleaved actors and broader loss/planner cases remain deferred. Pure decoder permutations belong in contract tests; actual planner selection and retry belong in production-root integration. |
| Call and item index boundaries | Remain deferred. Removing a diagnostic accumulator argument does not change index addressing; grammar constants, index validation and decoding remain unchanged. |

The selected tests pass before and after helper removal. Omitting an actual nested field fails the generated-grammar assertion; adding a nested canonical field fails the complete typed fixture. Nonzero controls exercise the real counters. Both mutation controls restore source exactly. No new production test door, copied application rule or generic checker is introduced.

## Selected identity and chat contract surfaces

| Purpose | Decision and boundary |
| - | - |
| Identity status, action and resource support declarations | Localize unused exports only. Preserve canonical axes, strict schemas, Can/ResourceRef coupling and all auth/share behavior. |
| Chat assembly, event, metadata, roster and projection support declarations | Localize unused exports while retaining exact bodies, readonly/presence contracts, refusal variants and enclosing public signatures. Hidden/reasoning stripping remains in the actual public member projection. |
| Op-code and invite-result audit aliases | Remove unused tagged aliases. Retain actual op-code constants, mounted parsers, auth writes and client reads. No substitute type or consumer is needed. |
| MemoryDigestInput | Keep the genuine cross-domain API and remove its inaccurate test-only claim. Preserve host/coherence guards and actual digest/storage wiring. |
| rosterMemberSpecSchema and RosterMemberSpec | Remove the unused single-character wrapper and type. Saved rosters retain the live character-member schema; future seat contracts belong to the resumed design. |
| Original member projection and roster cases | Preserve meaningful privacy, non-deception, inside-tag tool offsets, absent fields, invalid kinds and range distinctions. Private helper export removal does not complete those broader restoration matrices. |

This bounded selection passes exact JSSG preservation, maintained runtime tests, affected compiler and dependency checks and independent review. No authorization, credential flow, visibility rule or runtime operation changes.

## Selected portability, media and workload surfaces

| Purpose | Decision and boundary |
| - | - |
| Import profile/layout axes and filesystem support types | Localize unused export modifiers. Keep actual filesystem port shapes, missing-directory/error distinctions, secret filtering and native import admission. |
| Portability refusals, asset variants and imagery parser components | Localize unused owner exports while preserving serialized identities, strict schemas, refusal distinctions and enclosing public contracts. |
| Workload resume, progress and row support declarations | Keep all behavior, transforms, poison/result parsing and readonly/presence semantics; localize unused export modifiers. |
| ResolveBlobRefsParams, ResolveChatBlobRefsParams and WorkloadScheduleView | Remove unconsumed inferred aliases and their exclusive markers. Preserve actual mounted schemas and their input/output behavior. |
| GeneratePictureRequest | Retain the canonical type used by maintained required-prompt assertions; remove its suppression marker. |
| Production-only findings with maintained consumers | Keep PortableTextFile, PERSONA_COLLISION_CHOICES, sniffTreeLayout and canonical/forwarded WORKLOAD_UNFUNDED. Native test usage is legitimate, not an exemption. |
| Original parser and serialization matrices | Keep restoration partial. Preserve meaningful distinctions; do not restore obsolete free-mode assertions that omit the now-required prompt. |

This selection passes bounded JSSG preservation, scoped runtime tests, affected compiler and dependency checks and independent review. No capability, schema constraint, package door or runtime body is removed.

## Selected preset, settings, theme and regex surfaces

| Purpose | Decision and boundary |
| - | - |
| Preset vocabularies, version lifts, field partitions and parser components | Localize unused export modifiers. Keep all actual migrations, defaults, transforms, field constraints and public enclosing types. CONFIG_LIFTS remains used by stored parsing and native-file import. |
| Settings, appearance, regex and theme support declarations | Localize unused exports only. Preserve canonical types, schema-derived boundaries, placement correlations and theme privacy projections. |
| Production-only test and tool consumers | Retain appearanceSettingsSchema, userSettingsSchema, guidedActionsSchema, promptConfigViewSchema and FormatStringKey. These serve real production-derived builders or type assertions. |
| importStChatCompletionPreset, PRESET_GUIDED_SLOT_IDS and VIEWER_SACRED_THEME_KEYS | Remove the unused metadata and facade with qualified public-entry cases below. Preserve the actual mapper, editor defaults and privacy projection. |
| Original stored-data compatibility and import matrices | Keep restoration partial. Reach actual parsers and typed import results, not private lift-table identity or obsolete exception wrappers. |

This modifier-only selection passes bounded preservation, scoped runtime tests, affected compiler and dependency checks and independent review. No UI behavior or schema constraint changes.

## Selected credential and health support identities

| Identity | Decision and boundary |
| - | - |
| RESOLVED_SECRET_KINDS | Keep the canonical tuple and derived secret-kind/brand coupling; localize its unused value export. Minting, ownership, AAD and execution evidence remain unchanged. |
| HealthResponse | Remove the unconsumed inferred alias. Keep the actual health schema, strict response arms, public parser and physical-peer identity gate. |
| Original credential and health purposes | Keep actual authority and HTTP coverage. Drop only the private-tuple equality assertion; do not add an export-identity test or replacement harness. |

This selection passes scoped preservation, real credential/health boundary tests, affected compiler and dependency checks and independent review.

## Selected refinery payload-dispatch identity

| Original assertion or purpose | Decision and maintained home |
| - | - |
| payloadSchemaFor fixed-schema identity and overload-only output typing | Drop obsolete helper-specific assertions with the unconsumed callable. Preserve canonical stage payload schemas and independent output contracts. |
| Embedded custom schemas validate immutable run payloads | Keep actual corpus/listRuns coverage that reads embedded custom runs after the live schema row is deleted. Preserve current reader and generation-owned schema lifetimes. |
| Payload dispatch implementation | Remove only the unused overloads, exclusive conditional return alias and exclusive lift import. Correct coupled stale comments; do not change actual query parsing, schema lifting or payload validation. |

This selection passes current caller confirmation, real refinery corpus qualification, affected compiler and dependency checks and independent review. It introduces no replacement dispatcher or test door and does not claim broader corrupt-embed or read-heal coverage.

## Selected preset and theme purpose replacements

| Original purpose | Primary home and bounded decision |
| - | - |
| Guided defaults agree with editor slot metadata; adapted slots stay out of editable prose | Contract tests through actual TEMPLATE_DEFS, DEFAULT_GUIDED_ACTIONS, resolveProseText and isPresetProseSlotId. Preserve the shared response/swipe slot explicitly; then remove unused PRESET_GUIDED_SLOT_IDS metadata. |
| Cards carry atmosphere but not viewer ergonomics | Contract tests through actual cardEmbeddableSubset using a complete canonical ThemeOverride fixture. Preserve every allowed field, density exclusion, absent/undefined behavior and background carriage distinctions; then remove VIEWER_SACRED_THEME_KEYS and its exclusive local alias. |
| ST preset mapping, refusals and native round-trip | Contract tests through actual tryImportStChatCompletionPreset and native parsers. Preserve depth clamps, diagnostics, section counts, markers, sentinels, squash, dropped fields and format mappings. Drop throwing-facade identity/message assertions with its unused wrapper. |
| Unselected prose, migration and theme behavior | Remain partial. Do not restore removed checker/generator machinery, create a test door or claim the entire original suites restored. |

The replacements pass against unchanged production and after retirement. Guided-slot, sacred-density and typed-import defects fail the intended assertions; sources restore exactly. Actual mapping and projection behavior remains unchanged.

## Selected automation and streaming contract surfaces

| Purpose | Decision and boundary |
| - | - |
| Automation, event, preset and RPC support declarations | Localize unused exports while preserving canonical bodies, strict parsing, readonly/presence distinctions and enclosing contracts. |
| Stream-channel and preset-knob vocabularies | Retain canonical tuples as local schema/type inputs. Complete key-correlated maps feed every variant into the actual unions without changing fields or order. |
| Bus-registry declaration-location metadata | Remove BUSES and exclusive BusHome after current migration and checker-removal confirmation. Keep native type assertions and their shared registry in testkit. Preserve actual event vocabularies. |
| Output/discriminator aliases and suppression claims | Remove unsupported aliases and markers. Retain actual schema, native type-test, generator, SDK and stream-attach consumers. |
| Process-global compatibility APIs | Keep them deleted. Graph-owned runtime buses, subscriptions, sources, cursors, visibility and authority remain unchanged. |
| Original parser, descriptor and frame purposes | Rebuild selected cases through public schemas and types; preserve meaningful branding, mode/default, scoping and frame relationships. Keep broader automation restoration partial. |

The focused public contracts pass before and after alignment. Actual room/knob defects fail runtime assertions; a removed chat cursor fails the native frame assertion. No replacement checker, fabricated consumer or production test door is introduced.

## Selected binding actor parser purpose

| Original purpose | Primary home and bounded decision |
| - | - |
| Persisted user, rule and plugin kind admission | Extend the maintained connectionBindingSchema contract case with complete valid row equality, including the plugin case. |
| Unknown actor-kind refusal | Rebuild the original agent, chat, system and empty-kind refusals on an otherwise-valid row through the actual public parser. Preserve identity-correlation refusals. |
| Canonical persisted kind ownership | A complete schema map derives existing row tags from BINDING_ACTOR_KINDS. Preserve order, identity correlations and the distinct optional caller selector. |
| Orphan scalar parser identity | Remove only after the live row-boundary replacement and a discriminant-widening defect control qualify. Keep canonical vocabulary, selector separation and actual ownership/SQL controls. |
| Other connection-reference, selector and SQL cases | Remain partial. Contract parser tests do not claim HTTP authorization or migrated-SQL qualification. |

Tests use the actual production row schema, not a replacement validator or invented consumer. Valid rows pass; widening the real discriminator fails the unknown-kind assertion. The canonical row tags and orphan-parser removal pass final qualification.

## Owner-approved reservation cleanup

| Identity or concept | Decision and preserved behavior |
| - | - |
| trackerGloss | Remove the unused helper and preserve actual hinted transition lines. D113 names that behavior, not an unconsumed formatter. |
| rosterMemberSpecSchema and RosterMemberSpec | Remove the redundant wrapper/type and named graft reservation. Public saved-roster parsing still uses characterMemberSpecSchema and its existing bounds. |
| memory/index.ts | Remove unimplemented clip vocabularies. D55 retains the parked durable-fact concept; current chat memory and its preservation obligations remain unchanged. |

The live saved-roster contract cases pass and catch deliberate kind/range defects with valid positive controls. Actual tracker SEND/state cases pass without changing hint formatting. Default native Knip reports no contract findings; production-only entries retain actual maintained test, tooling and generator consumers. No suppression or fabricated consumer is added. Broader package work and legacy restoration remain partial.

## Canonical variant completeness

Stream rooms, preset knobs, persisted binding actors and prefix-cache actions use total schema maps over their canonical vocabulary. The descriptor union indexes its independent per-kind map. Actual union construction includes every map entry without a cast, runtime guard or new helper door.

Appending a distinct vocabulary member fails the native compiler at its missing map or descriptor entry. Sources restore exactly after each probe. Existing variant bodies, branch order, readonly/presence contracts and public application behavior remain unchanged.

## Production-only consumer placement

Production mode excludes maintained test, tool and generator consumers. Review declaration purpose before changing its home.

| Surface | Decision and evidence |
| - | - |
| Bus-registry assertion types | Move shared assertion machinery to `tests/support/iso/bus-registry.ts`. Keep Node and DOM cases under `tests/contracts/events/`; import actual production events. Remove the application package door. |
| Event discriminator declarations | Keep DOMAIN_EVENT_TYPES, which derives live DomainEventType, and RPG_BUS_EVENT_TYPES, which validates real trace events. Remove the automation mirror used only by assertion machinery; the actual client reducer remains exhaustive over AutomationBusEvent. |
| Canonical schemas, wire types, defaults, limits and error codes | Keep production ownership when testkit builds or parses genuine product data. Tests import the owner rather than duplicate its rules. |
| Plugin authoring vocabularies and SDK type conformance | Keep contracts ownership. The author-support generator and SDK conformance cases consume actual application contracts. Independent SDK declarations retain their distribution boundary. |
| Debug response schemas | Keep contracts ownership. E2E readers parse actual HTTP responses; the server uses inferred response types. |
| KIND_DEFS and KindDefs | Remove the redundant table and exclusive types. The actual capability parser uses a total, discriminator-correlated schema map; synthesis retains canonical floors and exhaustive dispatch. Rebuild the admin embedding case through production composition. |

The consumer inventory establishes references, not complete restoration coverage. Preserve the wider restoration register and review unresolved harness purposes separately.

## Selected capability and runtime ownership cases

| Original purpose | Primary home and decision |
| - | - |
| Canonical kind admission and task partition | Keep public modelKindSchema, TASK_DEFS and tasksOfKind assertions in the capability contract test. Preserve image and empty-kind refusals. |
| Capability floor validity, payload correlation and foreign-field stripping | Rebuild through actual capabilitySchema and canonical per-kind floors. Keep complete parse equality, serialization, missing and mismatched payload refusals. |
| KIND_DEFS schema and floor identities | Drop helper-specific identities with the unused table. Preserve exact public parser payload types in native compiler assertions. |
| Capability variant completeness | Derive the actual parser from a complete key/discriminator-correlated map over modelKindSchema. New kinds require an implemented parser variant. |
| Admin card ownership, textless refusal and fresh model selection | Rebuild the maintained fake-collaborator case through the public admin service, production root, real bindings and persistence. Script only provider transport. |
| Role-client task vocabulary | Import the canonical RoleClientTask into runtime resolution. Remove the private duplicate task axis. |
| RPG tool-name completeness | Couple actual tool implementations to RpgToolName with a key/name-correlated map. Preserve handler bodies and canonical tool order. |

These selections do not restore unrelated capability-reader, provider, RPG or admin cases.
