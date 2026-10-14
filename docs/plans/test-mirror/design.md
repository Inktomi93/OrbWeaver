---
kind: plan
status: active
updated: 2026-10-14
---

# Tests run the product

## Goal

Preserve useful migration cases and production contract concerns for the test-foundation program. Tests call production, derive types and inputs, mount the real door and prove exercised behavior. Spine-Testing section 10 owns the law; test-foundation owns execution order.

## Shape

### Program ownership

[test-foundation](../test-foundation/design.md) owns execution order, the legacy boundary, shared readers, production composition, builders/corpus and replacement suites. This plan retains candidate cases and production contract concerns; it does not authorize a separate legacy retrofit queue.

The work items own live status. Contract, stored-value and current wire-boundary recovery is integrated through canonical type homes, ownership before private parsing and refusal before effects. Complete harness and corpus qualification remain open. The smoke matrix follows those foundations.

### Using the inventory

Each site below is an investigation lead, not a current verdict or assignment. Re-derive it against the current product and its work item before editing. Keep meaningful regression cases in legacy CI until replacement carries them.

A product rule copied into a harness moves to its owning production domain under compose cleanup. The replacement test then calls the real composition root. Do not export a function solely to preserve a copied legacy harness, repair the widest old harnesses first, or split disposable suites for size compliance.

Contract shapes, typed responders, production constants and real shared helpers remain valid improvements where maintained consumers need them. Test-only machinery belongs in testkit only when it supports the new population; it cannot contain copied domain rules.

### Enforcement

Follow D317 for verification cadence and D318 for public package doors. Use maintained lint, resolver, compiler and dependency tools where they express the claim. Shared code-facts readers own the remaining typed judgments; do not introduce a second detector.

Existing waivers and grants need semantic judgment, not automatic preservation. Real defects are fixed; false positives are repaired in the checker. Do not create waiver debt or regenerate budgets merely to get green.

The test-foundation plan owns lane floors, review completion and application-check scheduling. A replacement suite proves real product behavior with preserved cases and a production defect control. Whole-tree mutation and legacy fixture polish are not migration phases.

### Known violations by item

Each row names a candidate test site and production counterpart. These sites require current-tree confirmation before assignment. Audit material supplies cases for replacement, not instructions to retrofit legacy harnesses.

**889, CT door.**

- `tests/support/browser/ct-data-providers.tsx:214` lists one tool renderer; production `packages/client/src/compose/authed-app.tsx:210` registers the dice renderer too. Derive from the door list.
- `ct-data-providers.tsx:223` lists four home tiles; `compose/home-tiles.ts:27-35` ships seven. Import the production list.
- `ct-data-providers.tsx:400` lacks the plugin commands and bug report widgets that `authed-app.tsx:344` registers.
- `tests/legacy/client/features/chat/_ct-stories.tsx:204` and `:208` mount with empty surface and tool-renderer registries; `authed-app.tsx:168-197` and `:210` register them. Derive both.
- `chat/_ct-stories.tsx:1946`, `chat/hooks/_slash-command-stories.tsx:80` and `:1969` omit imagery and plugin slash commands and two palette sources (`authed-app.tsx:223-240`).
- `tests/legacy/client/state/config-section-partition.dom.test.ts:235-280` omits five door sections from `compose/config-sections.ts:54-132`.
- `tests/legacy/client/state/chrome-registry-context.ct.tsx:27` and `context-tabs-panel.ct.tsx:78-84` snapshot rosters the product no longer ships. Build them from production.
- `ct-config-mirror-parity` compares a multiset only; add order and the other registries (folds 0476).

**888, e2e shapes.**

- `tests/e2e/support/trpc.ts:276` declares `WireCapture.backend`; the server type at `packages/server/src/foundation/observability/debug/wire-capture.ts:77-100` has `providerId`. `rpg-lite-loop.spec.ts:418` and `live-parity-plus-capstone.spec.ts:371` can never match.
- Unpinned hand shapes in `trpc.ts` with a contracts home: MessagesPage (`contracts/chat/message-pages.ts:12`), ChatDetail (`chat/detail.ts:24`), StartedChat (`chat/views.ts:248`), AssemblyPreview (`views.ts:143`), VariantSummary (`views.ts:136`), ThemeRow (`settings/index.ts:934`), CharacterListPage (`character/index.ts:822`), CreatedGame (`rpg/results.ts:10`), CheckpointRow (`rpg/views.ts:535`). Server-homed and needing a contracts home first: WireCapture, RpgTraceRecord (`packages/server/src/domain/rpg/contract/trace.ts:107`), ChatDbInspection, and PresetRow, whose config is a bare record.
- Spec-local copies: `live-context-cutoff.spec.ts:27`, `live-member-strip.local.spec.ts:47`, `multi-human-visibility.local.spec.ts:43,63`, `card-import.spec.ts:15`.

**890, copied logic.**

- Server harness queries copied from un-exported compose closures (the 879 class): the automation harness copies `getMessageFact` and `getTurnOrigin` without the chat scope; the gallery import re-link copy drops the owner scope; the workloads registry copy omits refinery; a hand `isAdmin` excludes the owner. Rows A4, A5, A6, A20 and A21 in the server report.

- Compose closures copied into server harnesses, already drifted: `tests/legacy/server/domain/embeddings/space-completion.suite.int.test.ts:96-132` and `target-move-rebuild.suite.int.test.ts:378-418` hand-write the vector-sweep ops from `packages/server/src/entry/compose/services.ts:1267-1319` (export a `createVectorSweepOps`); `target-move-rebuild.suite.int.test.ts:1074-1085` swallows errors where `services.ts:614-631` rethrows; `tests/legacy/server/domain/chat/memory/_support.ts:311-363` drops the host-coherence guard and error type of `compose/chat.ts:1405-1459`; `tests/legacy/server/domain/chat/_support.ts:633-644` prunes every generation where `domain/embeddings/verbs/prune-memory-blocks.ts:29` prunes only the target generation; `tests/legacy/server/domain/stats/persistence/latency.int.test.ts:134-162` plans a hand query instead of `stats/persistence/latency.ts:65-74` (run the real read on a counted db and explain its recorded statement).

- Compose closures copied identically (extract and export, then call from both sides): `characterOwned` and `loadCoParticipantOwner` (`compose/assets-character.ts:179-262`), the gallery character ops (`assets-character.ts:376-383`, the import copy also drops the owner scope), `verifyPersonaOwned` and `verifyCharactersOwned` (`compose/chat.ts:1385-1388`, `compose/roster-preset.ts:45-59`), `resolveUserEnabled` (`compose/chat.ts:1321-1324`), the seed avatar ops (`assets-character.ts:442-509`), the rpg trace inspector (`entry/lifecycle.ts:930-950`).

- The wide server harnesses under automation, assets, workloads and search contain candidate cases. Replace their assemblies through the real root rather than repairing them as a prerequisite.

- `tests/legacy/db/schema/rate-limit.int.test.ts:46-56,95-98` copies `packages/server/src/transport/rate-limit.ts:57-73` and never calls the limiter.

- Client fixtures: `tests/legacy/client/features/chat/fixtures.ts:46-77` (list paging and search) and `character/fixtures.ts:179-221` (sort cursors) still stand in for server code a test cannot call: the page and cursor policy is inline in `domain/chat/verbs/read.ts` and `domain/character/verbs/list.ts`, and the search is SQL. Move the cursor mint and the page rule to `@orb/contracts`, call them from the verb and from the responder, and add a sort-aware cursor for every character sort.

- Inference and tooling: `tests/legacy/inference/capability/synthesize.test.ts:12` and `resolve/resolve-task.suite.test.ts:346` copy `requireGenerationCapability`; two showcase plugin suites copy a toast floor that has diverged from `ui-outbox.ts:85`; `tests/support/node/tool-fixtures.ts:59-62` copies `tooling/src/codemod/lib/plans.ts:70-73`.

- Contracts: `tests/legacy/contracts/rpg/_extraction-support.ts:24` and `rpg/tracker.contract.test.ts:34` copy the actor-key scheme from `packages/contracts/src/rpg/actor.ts:138-146`; `rpg/structured-patch.contract.test.ts:47-65` copies the tool builder from `packages/server/src/entry/compose/rpg.ts:1082-1120` (move it to contracts); `prose/index.contract.test.ts:37,116-130` copies the hash and version rule from `tooling/src/verify/ops/gen/prose.ts:37-60`; `rpg/extraction-wire-subset.contract.test.ts:25-48` copies the name-map walker from `packages/contracts/src/inference/wire-subset.ts:95`.

- UI: `tests/legacy/ui/content/sandbox-frame/sandbox-frame.ct.tsx:325` carries a stale copy of the app CSP. Derive it from `securityHeaders` once its directive table lives in a package a CT can import (kit): a CT cannot import `@orb/server/entry/http`, because the babel transform of `domain/chat/contract/errors.ts` rejects its `declare` fields.

- Tests that assert their own literal, and so test nothing: `tests/legacy/contracts/chat/index.contract.test.ts:18-31,152-199` (the server and client sides call one function twice), `chat/messages.contract.test.ts:57-101`, `session/index.contract.test.ts:19-44`, `search/index.contract.test.ts:60-149`, `portability/index.contract.test.ts:85-125`, `stats/index.contract.test.ts:226-247`, `identity/index.contract.test.ts:73-117`, `rpg/bus.contract.test.ts:25-57`. Parse each fixture through its real schema, move compile-only checks to `.test-d.ts`, or delete. Fixtures with fake ids (`tag/index.contract.test.ts:19`, `assets/index.contract.test.ts:70`) must be minted, because the strict schemas reject them.

**891, typed recorder.**

- `tests/support/node/route-trpc.ts:471-477,569-573`: `lastInput` and `inputs` return unknown, so client tests cast to hand shapes. Type them by procedure with `TrpcInput`.
- The `lastPatch` helper copied across the settings section CTs; the untyped `auth/me` stubs; the untyped upload caps in `chat/_gallery-fixtures.ts:75-90`.

**892, constants.** Also the private constants tests re-spell: web-weave, snap, reveal and glint timings, the touch floor (`SNAPPED_LENGTH_BASE_PX` in `packages/ui/src/tokens/index.ts`), contract caps and defaults kept private in `settings/appearance.ts`, `character/index.ts`, `refinery/index.ts` and `databank/index.ts` (export them), and token px literals in the layout primitive CTs. The AA floor, the talkativeness default, max output tokens, max image bytes, blur surfaces, chat styles, owned settings keys, the frozen clock, config anchor ids, the CSRF header, chat-with names, test ids, the chat width default (`chat/_ct-stories.tsx:2104-2107` measures at 50dvw against a production default of 60), and the inline e2e timeouts.

**893, contrast engine.** Also `tests/legacy/ui/charts/chart/use-chart-theme.ct.tsx`, `content/theme-scope/theme-scope.ct.tsx`, `primitives/switch/switch.ct.tsx`, `primitives/toast/toast.ct.tsx`, `markdown/markdown.ct.tsx` and `tokens/index.test.ts`; `palette-contrast.suite.test.ts` copies five kit colour functions. Copies in `rules-section.ct.tsx:1154-1161`, `appearance-sizing-section.ct.tsx:171-173`, `app-shell.ct.tsx:5377-5391`, `home-surface.ct.tsx:1372-1374` (diverging knee), `tests/support/browser/part-vs-surface.ts:44-56`, `badge.ct.tsx:77-86` and `tests/legacy/ui/content/theme-scope/palette-contrast.suite.test.ts:35`. One engine: `tooling/src/floor/instrument/wcag.ts`.

**894, seeders.** Local seeders in `tests/legacy/db/schema` with a fake content hash; raw settings and preset mutations in two live specs where `trpc.ts` helpers exist.

**899 second half, gates for Spine-Testing §10.** The gates are `test-hand-shape`, `test-production-clone`, `test-file-size`, the value-cast check in `no-test-fabrication`, the spy check in `test-mock-doctrine` and the `cpd:tests` ratchet. Their baselined findings name items 888, 890 and 906; the spies and the oversized files still need a burn-down item.

## Rejected

Whole-tree mutation and a separate legacy retrofit campaign. Replacing one copied assembly with another does not prove production behavior.

## Coupled sites

The test-foundation plan owns composition, builders/corpus, the CT door and reader dependencies. Its work items own current assignments. The inference-flow plan owns funding and runtime ownership concerns.

## Late tooling cleanup

Follow [test-foundation's late tooling cleanup](../test-foundation/design.md#late-tooling-cleanup) after the foundations and replacement suites. The checker-recertification assignment owns the deletion population and measured costs. It is not a separate prerequisite or a legacy retrofit queue.

## Test plan

Use verdict-logic controls for checker changes and production defect controls for replacement suites. Preserve meaningful cases, then delete the replaced legacy assembly. The smoke matrix drives the real stack on the shared corpus.
