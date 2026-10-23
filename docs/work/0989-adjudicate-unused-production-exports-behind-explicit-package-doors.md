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

No runtime definition, schema or package door is deleted by this selection. Existing parser regression purposes remain distinct from type-identity trivia. The selected source passes maintained contract and reflective-reader tests, affected compiler programs, scoped lint, dependency checks and independent review. Native default and production scans remove the selected findings without adding findings. The package-wide remainder is open.

## Selected inference and RPG contract surfaces

| Selected purpose | Decision and boundary |
| - | - |
| Inference, provider and role-client auxiliary declarations with actual local use | Localize unused export modifiers. Preserve canonical bodies, schema constraints, initializer order, correlated signatures and independent type checks. |
| RPG, refinery and prose declarations with actual local use | Localize unused export modifiers, including locally used marked declarations. Preserve canonical tuples, schemas, readonly interfaces and enclosing public contracts. |
| Declaration-only RPG and refinery inferred aliases | Remove audit-only aliases with no current, generator, SDK or original assertion consumer. Preserve their canonical schemas and the externally consumed RpgAddJournalEntryInput. |
| PREFIX_CACHE_ACTIONS, bindingActorKindSchema and structuredSchemaComplexity | Hold pending original-purpose comparison and qualified current-boundary coverage. Do not manufacture consumers or weaken correlated schemas. |
| ConnectionRef and WIRE_SCHEMA_KEYWORD_VOCABULARY marker claims | Remove unsupported public suppression claims. Hold declarations visibly for separate purpose decisions. |
| payloadSchemaFor and patchToolsOnlyFields | Hold callable definitions pending current-owner comparison and qualification of meaningful original assertions. |
| trackerGloss | Hold under D113. Existing transition formatting differs from absolute readings; investigate actual standalone-provider behavior without forcing a helper call. |
| Original parser, formatter and patch-expressibility permutations | Keep restoration partial. Pure permutations belong in unit or contract tests; integration owns distinct production composition and provider wiring. Record selected replacements and defect controls before acceptance. |

This selection passes scoped lint, maintained runtime tests, affected compiler programs, dependency checks and independent review. Native scans remove the selected findings and expose only the held declarations whose unsupported markers were removed. It does not complete the wider contract restoration or authorize runtime-body changes.

## Selected tracker wiring cases

| Behavior | Primary layer and disposition |
| - | - |
| Tracker numeric narrowing, value totality and ceiling permutations | Unit or contract through actual public production helpers. Rebuild uncovered cases there; do not repeat their matrix through SEND. |
| Absolute readings and vocabulary formatting | Unit or contract. Hold helper-specific trackerGloss assertions with D113; preserve meaningful reading behavior independently. |
| Persisted actor and game trackers reaching standalone macro and CEL provider fragments | Integration through actual SEND, production composition and native provider capture. Rebuild this distinct wiring case; existing user-macro tests do not prove it. |
| Carried-unset labels, effective ceilings and vocabulary placement | Keep representative integration assertions for real carriage and composition. Pure punctuation and input permutations remain unit or contract work. |
| Selected snapshot and quiet output | Integration. Verify the real selected variant has a snapshot before trusting negative output. Reuse existing swipe and regeneration coverage. |
| Other delta, reminder and guide projection cases | Remain partial and outside this selection. No complete reference file is declared restored. |

The tracker integration replacement passes runtime, affected compiler and dependency checks and independent review. Removing hint emission makes its isolated provider-fragment assertion fail while vocabulary assertions still pass. Its external execution is scripted; application composition, persistence and macro assembly remain production-owned.

## Selected cache-policy ownership and obsolete audit artifacts

| Finding and original purpose | Decision and qualification |
| - | - |
| PREFIX_CACHE_ACTIONS defines the prefix action axis | Preserve the canonical tuple as a local declaration. Derive each existing correlated literal from its tuple member, following healthResponseSchema precedent. Preserve branch order and every field constraint. |
| Prefix parser and producer behavior | Contract owns admitted actions and correlated-field refusals. The actual resolveCachePolicy producer owns effective none, automatic-request and marker outcomes; use production-derived contexts rather than copied resolution logic. Preserve existing replay coverage. |
| ConnectionRef audit alias | Remove the unconsumed inferred alias. Keep connectionRefSchema and its actual branded-id and model-stripping behavior; original parser cases remain separate from the unused alias spelling. |
| WIRE_SCHEMA_KEYWORD_VOCABULARY tooling projection | Remove the unused concatenation for removed checker consumers. Preserve the engine's actual private keyword tables and public scrub behavior. No replacement checker or fabricated consumer is required. |

This bounded selection passes runtime, affected compiler and dependency checks and independent review. Controlled weakening of the inactive-prefix constraint and manual-depth floor makes the selected assertions fail; both production files are restored exactly. bindingActorKindSchema remains held for its separate actual admission-boundary comparison.

## Selected plugin and knowledge contract surfaces

| Purpose | Decision and boundary |
| - | - |
| Plugin UI vocabularies, caps, recursive schema anchors and supporting types | Localize unused owner exports only. Preserve public node/spec contracts, all validation and recursive type conformance. Independent SDK mirrors are not application import consumers. |
| Plugin manifest budgets, frame result key and snippet/suggestion axes | Keep canonical declarations and every runtime use; remove unused export modifiers. Preserve generator inputs, SDK distribution doors and actual template authoring types. |
| PluginUpdateSource audit alias | Remove the unconsumed alias and correct its stale comment reference. Keep the update-source tuple and actual PluginView wire contract. |
| Embedding metadata axes, prune variants, extraction format tables and search parser components | Localize selected unused exports while retaining every definition, constraint, readonly field, presence distinction and enclosing public contract. |
| Original plugin and knowledge boundary cases | Preserve meaningful cap, refusal, serialization, branding and type-conformance purposes. Modifier cleanup does not declare their broader restoration complete. |
| Memory clip reservations | Retain the file and vocabulary under D55. The world-state plan is parked pending owner scope and terminology; leave the unused-file finding visible without fabricated wiring. |

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
| rosterMemberSpecSchema and RosterMemberSpec | Retain the explicitly named spine reservation without inventing a caller or implementing parked seat branches. The live character-member schema remains separate. |
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

This selection awaits bounded JSSG preservation, scoped runtime/compiler/import qualification and independent review. No capability, schema constraint, package door or runtime body is removed.

## Selected preset, settings, theme and regex surfaces

| Purpose | Decision and boundary |
| - | - |
| Preset vocabularies, version lifts, field partitions and parser components | Localize unused export modifiers. Keep all actual migrations, defaults, transforms, field constraints and public enclosing types. CONFIG_LIFTS remains used by stored parsing and native-file import. |
| Settings, appearance, regex and theme support declarations | Localize unused exports only. Preserve canonical types, schema-derived boundaries, placement correlations and theme privacy projections. |
| Production-only test and tool consumers | Retain appearanceSettingsSchema, userSettingsSchema, guidedActionsSchema, promptConfigViewSchema and FormatStringKey. These serve real production-derived builders or type assertions. |
| importStChatCompletionPreset, PRESET_GUIDED_SLOT_IDS and VIEWER_SACRED_THEME_KEYS | Hold definitions pending bounded original-purpose comparison and qualified current-public-entry coverage. Do not invent consumers or declare their meaningful assertions obsolete. |
| Original stored-data compatibility and import matrices | Keep restoration partial. Reach actual parsers and typed import results, not private lift-table identity or obsolete exception wrappers. |

This modifier-only selection awaits bounded preservation, scoped runtime/compiler/import qualification and independent review. No UI behavior or schema constraint changes.

## Selected credential and health support identities

| Identity | Decision and boundary |
| - | - |
| RESOLVED_SECRET_KINDS | Keep the canonical tuple and derived secret-kind/brand coupling; localize its unused value export. Minting, ownership, AAD and execution evidence remain unchanged. |
| HealthResponse | Remove the unconsumed inferred alias. Keep the actual health schema, strict response arms, public parser and physical-peer identity gate. |
| Original credential and health purposes | Keep actual authority and HTTP coverage. Drop only the private-tuple equality assertion; do not add an export-identity test or replacement harness. |

This selection awaits scoped preservation, real credential/health boundary tests, affected compiler/import checks and independent review.
