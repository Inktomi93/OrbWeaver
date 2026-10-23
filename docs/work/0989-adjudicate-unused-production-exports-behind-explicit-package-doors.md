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
