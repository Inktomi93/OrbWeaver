---
kind: plan
status: active
updated: 2026-10-11
---

# Tests run the product

## Goal

Every test follows a product change without edits. Tests call production, derive types, import constants, mount the real door, and prove presence by reach. Spine-Testing section 10 is the law; this plan is the order of work and the index of known violations.

## Shape

### Order of work

Do the steps in order. A later step may run in parallel only where its row says so.

1. **Land the work in flight.** Merge the architecture-law lane (867 to 870) first, because it changes how tests import package internals. Then 879, 863/873/866, the chat-art batch, 842/874 and 885. Starting test cleanup before these merge causes conflicts.
2. **Stop new rot: item 899, first half.** One Opus lane. Rewrite Core-0 section 5 and Spine-Testing sections 2 and 5 for the directory mirror and reach-based presence. Replace the file-name checks in test-layout, test-presence and test-presence-inference with a reach gate (a test imports the module and references an export, or declares an @subject header). Add the ratchets at today's baseline: CT door parity, no hand-declared wire shapes in e2e and support, a tests-only CPD ratchet, and a test file size cap with an exception list for the current monoliths.
3. **Fix the tests that lie: items 889, 888 and 890.** Two or three lanes in parallel after step 2.
4. **Typed tRPC recorder: item 891.** Mostly mechanical. It can run beside step 3 when the files do not overlap.
5. **Smoke matrix: item 898,** after item 887 provides the seeded corpus and the stage-db plus local-auth path.
6. **Everything else as lanes touch an area:** items 892, 893 and 894, the monolith splits, and folding thin per-file tests into feature suites. Every product brief restates Spine-Testing section 10, and the lane cleans the tests it touches.

### Rules that hold during the work

- Do not add a new per-file mirror test beyond what the current gate forces. Prefer a feature suite.
- Do not mass-move test files. Folding happens when a lane touches an area.
- Mutation testing is out of scope.
- The persona-resolution suite stays byte-untouched.

### Burn down the waivers

A green structure run hides findings that are waived one by one. The largest waiver populations are `caught-failure-ownership`, `no-test-fabrication` and `ct-no-oneshot-live-read-assert`, followed by `test-determinism`, the id-brand gates and `owner-scoped-reads` and `owner-scoped-writes`. Item 899 adds a ratchet per waived gate so the waived count can only fall. Review the owner-scoped waivers first, because they concern tenancy.

### Known violations by item

Each row names the test site, the production counterpart, and the fix. The four audit reports in the owner archive (orbweaver-reviews, test-mirror client, server, e2e-ui-contracts and inference-tooling-gates) hold the full tables.

**889, CT door.**

- `tests/support/browser/ct-data-providers.tsx:214` lists one tool renderer; production `packages/client/src/compose/authed-app.tsx:210` registers the dice renderer too. Derive from the door list.
- `ct-data-providers.tsx:223` lists four home tiles; `compose/home-tiles.ts:27-35` ships seven. Import the production list.
- `ct-data-providers.tsx:400` lacks the plugin commands and bug report widgets that `authed-app.tsx:344` registers.
- `tests/client/features/chat/_ct-stories.tsx:204` and `:208` mount with empty surface and tool-renderer registries; `authed-app.tsx:168-197` and `:210` register them. Derive both.
- `chat/_ct-stories.tsx:1946`, `chat/hooks/_slash-command-stories.tsx:80` and `:1969` omit imagery and plugin slash commands and two palette sources (`authed-app.tsx:223-240`).
- `tests/client/state/config-section-partition.dom.test.ts:235-280` omits five door sections from `compose/config-sections.ts:54-132`.
- `tests/client/state/chrome-registry-context.ct.tsx:27` and `context-tabs-panel.ct.tsx:78-84` snapshot rosters the product no longer ships. Build them from production.
- `ct-config-mirror-parity` compares a multiset only; add order and the other registries (folds 0476).

**888, e2e shapes.**

- `tests/e2e/support/trpc.ts:276` declares `WireCapture.backend`; the server type at `packages/server/src/foundation/observability/debug/wire-capture.ts:77-100` has `providerId`. `rpg-lite-loop.spec.ts:418` and `live-parity-plus-capstone.spec.ts:371` can never match.
- Unpinned hand shapes in `trpc.ts` with a contracts home: MessagesPage (`contracts/chat/message-pages.ts:12`), ChatDetail (`chat/detail.ts:24`), StartedChat (`chat/views.ts:248`), AssemblyPreview (`views.ts:143`), VariantSummary (`views.ts:136`), ThemeRow (`settings/index.ts:934`), CharacterListPage (`character/index.ts:822`), CreatedGame (`rpg/results.ts:10`), CheckpointRow (`rpg/views.ts:535`). Server-homed and needing a contracts home first: WireCapture, RpgTraceRecord (`packages/server/src/domain/rpg/contract/trace.ts:107`), ChatDbInspection, and PresetRow, whose config is a bare record.
- Spec-local copies: `live-context-cutoff.spec.ts:27`, `live-member-strip.local.spec.ts:47`, `multi-human-visibility.local.spec.ts:43,63`, `card-import.spec.ts:15`.

**890, copied logic.**

- Server harness queries copied from un-exported compose closures (the 879 class): the automation harness copies `getMessageFact` and `getTurnOrigin` without the chat scope; the gallery import re-link copy drops the owner scope; the workloads registry copy omits refinery; a hand `isAdmin` excludes the owner. Rows A4, A5, A6, A20 and A21 in the server report.
- Compose closures copied into server harnesses, already drifted: `tests/server/domain/embeddings/space-completion.suite.int.test.ts:96-132` and `target-move-rebuild.suite.int.test.ts:378-418` hand-write the vector-sweep ops from `packages/server/src/entry/compose/services.ts:1267-1319` (export a `createVectorSweepOps`); `target-move-rebuild.suite.int.test.ts:1074-1085` swallows errors where `services.ts:614-631` rethrows; `tests/server/domain/chat/memory/_support.ts:311-363` drops the host-coherence guard and error type of `compose/chat.ts:1405-1459`; `tests/server/domain/chat/_support.ts:633-644` prunes every generation where `domain/embeddings/verbs/prune-memory-blocks.ts:29` prunes only the target generation; `tests/server/domain/stats/persistence/latency.int.test.ts:134-162` plans a hand query instead of `stats/persistence/latency.ts:65-74` (run the real read on a counted db and explain its recorded statement).
- Compose closures copied identically (extract and export, then call from both sides): `characterOwned` and `loadCoParticipantOwner` (`compose/assets-character.ts:179-262`), the gallery character ops (`assets-character.ts:376-383`, the import copy also drops the owner scope), `verifyPersonaOwned` and `verifyCharactersOwned` (`compose/chat.ts:1385-1388`, `compose/roster-preset.ts:45-59`), `resolveUserEnabled` (`compose/chat.ts:1321-1324`), the seed avatar ops (`assets-character.ts:442-509`), the rpg trace inspector (`entry/lifecycle.ts:930-950`).
- The four widest server harnesses (`tests/server/domain/automation/_support.ts`, `assets/_support.ts`, `workloads/_support.ts`, `search/_support.ts`) reach most server domains; fix them first.
- `tests/db/schema/rate-limit.int.test.ts:46-56,95-98` copies `packages/server/src/transport/rate-limit.ts:57-73` and never calls the limiter.
- Client fixtures: `tests/client/features/chat/fixtures.ts:46-77` (list paging and search), `character/fixtures.ts:179-221` (sort cursors), `databank/fixtures.ts:96-173` (an impossible indexing state and the golden at `databank-library-surface.ct.tsx:299`), `credentials/_connection-fixtures.ts:162-176` (label mint), `rpg/fixtures.ts:35-40` (effective delivery), `user-admin/auth-config-fixtures.ts:10-28` (cookie modes), `forms/editor/autosave-convergence.suite.test.ts:45-53` (shallow versus deep merge).
- Story harnesses: `chat/_ct-stories.tsx:1244` copies the removed `surfaceWarning`; `chat/_reaction-stories.tsx:115-152` copies a moved wrapper; `auth/_ct-stories.tsx:183-188` re-implements session recovery; `user-admin/components/share-card.ct.tsx:94-145` partly copies the share refusal rule; `components/greeting-studio.fixtures.tsx:17-36` wires a path production never takes.
- Inference and tooling: `tests/inference/capability/synthesize.test.ts:12` and `resolve/resolve-task.suite.test.ts:346` copy `requireGenerationCapability`; two showcase plugin suites copy a toast floor that has diverged from `ui-outbox.ts:85`; `tests/support/tool-fixtures.ts:59-62` copies `tooling/src/codemod/lib/plans.ts:70-73`.

- Contracts: `tests/contracts/rpg/extraction.contract.test.ts:63` and `rpg/tracker.contract.test.ts:34` copy the actor-key scheme from `packages/contracts/src/rpg/actor.ts:138-146`; `rpg/structured-patch.contract.test.ts:47-65` copies the tool builder from `packages/server/src/entry/compose/rpg.ts:1082-1120` (move it to contracts); `prose/index.contract.test.ts:37,116-130` copies the hash and version rule from `tooling/src/verify/ops/gen/prose.ts:37-60`; `rpg/extraction.contract.test.ts:1082-1105` copies the name-map walker from `packages/inference/src/wire-subset.ts:95`.
- UI: `tests/ui/art/web-weave/web-weave-spider.dom.test.ts:40` copies `wrapToPi` (`packages/ui/src/art/web-weave/web-weave-math.ts:26`); `tests/ui/content/sandbox-frame/sandbox-frame.ct.tsx:325` carries a stale copy of the server CSP; `sandbox-frame.ct.tsx:166` and `content/immersive-card/immersive-card.ct.tsx:93,130` serve frames by hand instead of through `frameHeaders`; `lib/selection-ring.ct.tsx:99-109` re-spells `SELECTION_RING_SELECTED`.
- Tests that assert their own literal, and so test nothing: `tests/contracts/chat/index.contract.test.ts:18-31,152-199` (the server and client sides call one function twice), `chat/messages.contract.test.ts:57-101`, `session/index.contract.test.ts:19-44`, `search/index.contract.test.ts:60-149`, `portability/index.contract.test.ts:85-125`, `stats/index.contract.test.ts:226-247`, `identity/index.contract.test.ts:73-117`, `rpg/bus.contract.test.ts:25-57`. Parse each fixture through its real schema, move compile-only checks to `.test-d.ts`, or delete. Fixtures with fake ids (`tag/index.contract.test.ts:19`, `assets/index.contract.test.ts:70`) must be minted, because the strict schemas reject them.

**891, typed recorder.**

- `tests/support/node/route-trpc.ts:471-477,569-573`: `lastInput` and `inputs` return unknown, so client tests cast to hand shapes. Type them by procedure with `TrpcInput`.
- The `lastPatch` helper copied across the settings section CTs; the untyped `auth/me` stubs; the untyped upload caps in `chat/_gallery-fixtures.ts:75-90`; `TrpcFixture` accepting any non-empty subset.

**892, constants.** Also the private constants tests re-spell: web-weave, snap, reveal and glint timings, the touch floor (`SNAPPED_LENGTH_BASE_PX` in `packages/ui/src/tokens/index.ts`), contract caps and defaults kept private in `settings/appearance.ts`, `character/index.ts`, `refinery/index.ts` and `databank/index.ts` (export them), and token px literals in the layout primitive CTs. The AA floor, the talkativeness default, max output tokens, max image bytes, blur surfaces, chat styles, owned settings keys, the frozen clock, config anchor ids, the CSRF header, chat-with names, test ids, the chat width default (`chat/_ct-stories.tsx:2104-2107` measures at 50dvw against a production default of 60), and the inline e2e timeouts.

**893, contrast engine.** Also `tests/ui/charts/chart/use-chart-theme.ct.tsx`, `content/theme-scope/theme-scope.ct.tsx`, `primitives/switch/switch.ct.tsx`, `primitives/toast/toast.ct.tsx`, `markdown/markdown.ct.tsx` and `tokens/index.test.ts`; `palette-contrast.suite.test.ts` copies five kit colour functions. Copies in `rules-section.ct.tsx:1154-1161`, `appearance-sizing-section.ct.tsx:171-173`, `app-shell.ct.tsx:5377-5391`, `home-surface.ct.tsx:1372-1374` (diverging knee), `tests/support/browser/part-vs-surface.ts:44-56`, `badge.ct.tsx:77-86` and `tests/ui/content/theme-scope/palette-contrast.suite.test.ts:35`. One engine: `tooling/src/_shared/wcag.ts`.

**894, seeders.** Local seeders in `tests/db/schema` with a fake content hash; raw settings and preset mutations in two live specs where `trpc.ts` helpers exist.

**899 second half, gates for Spine-Testing §10.** The design and false-positive classes are in the inference-tooling-gates report: the reach gate, the @subject header, an advisory clone census, a hand-shape detector, extending no-test-fabrication to non-literal casts and test-mock-doctrine to spies on internal modules.

## Rejected

Mutation testing of the whole tree: too slow at this size. A mass move of test files to a new layout: churn with no product gain. A dedicated cleanup marathon that pauses product work: cleanup rides each lane's own area instead.

## Coupled sites

Item 887 (seeded corpus and stage paths) gates item 898. The architecture-law lane gates every step because it changes test imports. Item 0476 folds into 889 and 899.

## Test plan

Each gate lands with a planted failing control and a passing control. Each fix shows a red when the production rule it now calls is changed. The smoke matrix runs headless in CI on the seeded corpus.
