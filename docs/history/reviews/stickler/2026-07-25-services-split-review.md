---
kind: history
status: archived
updated: 2026-08-01
---

# Stickler review — compose/services.ts split (uncommitted, 2026-07-25)

Diff under review: `packages/server/src/entry/compose/` — `services.ts` (1,632 → 527 lines) + 9 new
seam files (`admin.ts`, `assets-character.ts`, `automation-plugin.ts`, `databank.ts`, `imagery.ts`,
`minter.ts`, `portability-runner.ts`, `search-discovery.ts`, `world-info.ts`). Baseline:
`git show HEAD:packages/server/src/entry/compose/services.ts` (HEAD = 93e69466 throughout the session).
Intent: pure structural MOVE with exactly two sanctioned transform classes (closure→deps-object,
import-path adjustments) and two declared non-mechanical deltas (shared `minter.ts`; five consts
promoted to module scope in `automation-plugin.ts`).

## Findings (ranked)

### F1 — MEDIUM — `pnpm check` is RED because of this diff (knip: unused exported type)

- **Where:** `packages/server/src/entry/compose/portability-runner.ts:33`
- **Defect:** `export interface PortabilityChatSlice` is exported but referenced ONLY inside its own
  file (`portability-runner.ts:66` — `readonly chat: PortabilityChatSlice;`). The `deps:knip` stage
  fails on exactly this symbol, which fails the whole battery.
- **Failure scenario:** the green-to-commit bar (constitution §0.1.6: `pnpm check` AND `pnpm test`
  both green) cannot be met — any commit attempt on this tree ships a red battery.
- **Evidence (this session):**
  - `pnpm check` → exit 1; `reports/verify.json`: 11 stages OK, `deps:knip` FAIL.
  - `reports/verify/deps-knip.log`: `Unused exported types (1) — PortabilityChatSlice interface
    packages/server/src/entry/compose/portability-runner.ts:33:18`.
  - `/usr/bin/grep -rn "PortabilityChatSlice" packages tests` → 2 hits, both in
    `portability-runner.ts` (lines 33, 66). No external consumer.
- **Remediation shape (orchestrator's call):** drop the `export` keyword (in-file interface use is
  fine), or fold the shape inline into `PortabilityRunnerComposeDeps.chat`. Zero runtime impact
  either way.

### F2 — LOW — undeclared rewrite: inline `import()` type annotation in `ServicesResult`

- **Where:** `packages/server/src/entry/compose/services.ts:132`
- **Defect:** HEAD had `import type { PortabilityRegistry } from "@orb/contracts/portability";` +
  `readonly portability: PortabilityRegistry;`. The new keystone rewrote this to
  `readonly portability: import("@orb/contracts/portability").PortabilityRegistry;` — neither of the
  two sanctioned transform classes covers it, and it was not one of the two declared deltas.
- **Consequence:** behavior-neutral, but it is the SOLE inline `import()` type annotation in the
  entire `packages/*/src` tree (grep evidence below) and inconsistent with the file's own style
  (every other `ServicesResult`/`ServicesDeps` field uses a top-level imported type). Passes all
  gates (biome/eslint green), so no gate will ever push it back — this review is the only check.
- **Evidence:** `/usr/bin/grep -rn 'import("@orb' packages/*/src --include="*.ts"` → exactly 1 hit,
  this line. HEAD line 21/207 shows the original top-level-import form.

### F3 — LOW — undeclared non-mechanical additions: two exported wrapper functions in `world-info.ts`

- **Where:** `packages/server/src/entry/compose/world-info.ts:110-112`
  (`buildCopyCharacterBooks`) and `:116-123` (`buildImportStandaloneLorebook`)
- **Defect:** the lane declared exactly two non-mechanical deltas; these two new exported functions
  are a third class. `buildCopyCharacterBooks(db, now)` wraps `createCopyCharacterBooks({ db, now })`
  (consumed by `assets-character.ts:220`); `buildImportStandaloneLorebook(db, now)` wraps
  `createImportStandaloneLorebook({ db, now, newBookId, newEntryId })` (consumed by the keystone at
  `services.ts:459`). Bodies are byte-equivalent to the HEAD inline factory calls (HEAD lines 506 and
  1531-1536) — behavior identical.
- **Consequence:** none at runtime. The pure-move alternative existed (`assets-character.ts` could
  import `createCopyCharacterBooks` from `#domain/world-info` directly, exactly as HEAD's keystone
  did; ditto the keystone for the standalone-lorebook factory). Reported because the review bar for
  this diff class is "anything else non-mechanical is a finding" — the orchestrator should decide
  whether the indirection stays.
- **Evidence:** side-by-side above; the absence/reverse sweeps (below) confirm the bodies carry the
  same minter prefixes (`worldBook`/`worldEntry`) and the same `{db, now}` deps.

## Verified clean (what my silence covers)

Every claim below was produced this session by reading the HEAD original IN FULL (both pages), every
new file IN FULL, plus two mechanical sweeps: an **absence sweep** (every normalized non-comment HEAD
code line must reappear verbatim in the new set — 70 misses, ALL accounted to sanctioned transforms /
the declared deltas / F2-F3) and a **reverse sweep** (every novel non-import code line in the new set
enumerated — all are deps-interface declarations, `deps.` renames, builder signatures, the promoted
consts, or F2/F3). Scripts: `reports/stickler/scratch/absence-sweep.mjs`, `reverse-sweep.mjs`.

1. **Region-by-region equivalence** — every moved block verified against the original hunk:
   - `assets-character.ts` vs HEAD 367-664: assetsCtx (all three co-participant query arms, alias
     names, `.limit(1)`s, join predicates identical), assets, materializeBackground rebind, character
     (all 12 injected ops), galleryCtx, both seeders (markSeeded patch logic identical incl. the
     defaultPersonaId/currentPersonaId branch pair). Greeting constants 0.3 / 1024 byte-identical.
   - `search-discovery.ts` vs HEAD 666-840: embeddings/indexer (all 5 minters, `env.VLLM_EMBED_DIM`
     both dims), the corpusAutoindex-gated subscription (switch arms + `assertNeverEvent` moved with
     it), the always-on character.updated→chat fan, persona (repointSeedsAfterPersonaDelete logic +
     synthetic Principal identical), presetCtx/preset/stats/search/discovery (similar-narrowing map
     field-by-field; `tier0RangeOf` still a LIVE `getEffectiveConfig()` deref per call),
     notifications, workloads, `enqueueEmbedReindex` body identical (both workload starts, `caller:
     null`, `mode:"bulk"`, `ownerId: null`, swallowed catches).
   - `admin.ts` vs HEAD 842-909: sessions re-stamp, vllm status-merge, embed sub-bundle, `toolUse =
     createToolUseService({ can, clock: now })`, exportService — identical.
   - `imagery.ts` vs HEAD 146-153 + 911-996: `IMAGERY_WARNING_CODES` guard, all 10 injected ops, the
     extractQuiet IIFE (visibility gate → leak-free `DomainNotFoundError` → `historyFloorSeq`
     threading), tool-registration loop — identical.
   - `databank.ts` vs HEAD 998-1037: all ctx fields incl. both enqueue ops (`mode:"singular"`,
     ownerId threaded), `ensureChatHost`/`ensureChatMember` on the same `requireHost`/
     `requireParticipant` predicates — identical.
   - `world-info.ts` vs HEAD 1080-1123: worldInfo (host/member guards, `emitWiEvent` = chat's
     durable-first `emitBusEvent`), importWorldInfo ports, bulkImportChats (all 5 minters + the
     landed-asset filter), bulkImportPersonas, `resolveOwnerPrincipal` — identical.
   - `automation-plugin.ts` vs HEAD 1125-1509: automationOps (requestTurn's HARDCODED
     `initiator:"automation"`, funder = author; the quiet:false postNarratorMessage belt with
     `{initiator:"automation", automationDepth}`; upsertEntries/emitNotification/generatePicture/
     listBackgroundChoices/setChatBackground/summarizeQuiet arg-for-arg), pluginHostOps (listMessages
     via `loadPluginMessages`, `resolveViewerVisibility` = the SAME real const, variables trio under
     `resolveOwnerPrincipal`, registrar's tool-namespace template + transform order-band + the
     subscribeEvent fan-out incl. the `capFactContent` field-cap and per-fact `loadPresentRole`
     read), plugin service (assets trio, `resolveChatAuthority`) — identical.
   - `portability-runner.ts` vs HEAD 1511-1583: enqueueImportBackfill/reconcileImportStats,
     portability registry (all 19 fields, `assetsCtx: galleryCtx` preserved), runnerEnv (lazy
     `getPortabilityRegistry` thunk, both backfill ops, conditional staging-dir spreads, the full
     profileImport bundle) — identical.
   - Keystone: the untouched-in-place region (presence→roleClients→tag→chatBus) is byte-equivalent to
     HEAD apart from comment edits.
2. **The three late-bind/forward-ref threads** — evaluation timing preserved:
   - `materializeBackgroundOp` holder: still minted in the keystone before settings; character/
     seeders receive the WRAPPER (`deps.materializeBackground`); the real op is constructed inside
     `buildAssetsCharacter` and rebound at `services.ts:315`. The rebind now happens after
     character/seeders are built (HEAD rebound between assets and character) — verified nothing in
     that widened window derefs the holder (all deref sites are request-time; createServices
     completes before any request).
   - `enqueueEmbedReindex`: inert no-op holder → assigned at `services.ts:336` immediately after
     `buildSearchDiscovery` returns (HEAD: immediately after workloads). Nothing between can trigger
     a settings write.
   - `resolveViewerVisibility`: imagery receives a THUNK (`services.ts:365`) deref'd only at request
     time inside extractQuiet (same forward-ref semantics as HEAD's closure over the later const);
     automation-plugin receives the REAL const (built at `:420`, consumed at `:439` — after chat, as
     in HEAD). All three consumers (imagery gate, plugin listMessages bridge, automation fan-out) hit
     the SAME `createResolveViewerVisibility({db})` instance, as in HEAD. No build-time deref → no
     boot crash, no stale binding.
3. **Construction order** — builder-call order matches HEAD's top-to-bottom order for every
   block that consumes a value or subscribes. Two inert reorders found and cleared: (a) chatBus now
   constructs BEFORE assets (HEAD: after) — `createChatBus` is construct-only, assets never touches
   it, no subscription involved; (b) the materializeBackground rebind moved later (cleared in 2).
   Both eventBus subscriptions stay in the same relative slot (after seeders, before persona); no
   boot-time emission exists in the moved window.
4. **getPreset/getPersona request-time thunks** — HEAD ALSO resolved these lazily: character's
   greeting resolver referenced the `preset` const declared 254 lines later, and personaSeeder's
   createPersona referenced `persona` declared 96 lines later (legal — deref at request time). The
   getters make the same semantics explicit; `buildAssetsCharacter` never invokes them at build time.
5. **automation-plugin interleaving** — preserved exactly: automationNotify → automationOps →
   automationEnabled → pluginSubscribers → automationTransforms → automation → `await
   automationEnabled.reload()` → `await automationTransforms.reload()` → pluginTransformSeq →
   pluginHost → pluginHostOps → plugin. The reloads still complete before the plugin block and before
   portability/runnerEnv (buildAutomationPlugin is awaited at `services.ts:435`, before
   `buildPortabilityRunner` at `:451`).
6. **Services bundle + ServicesResult + ServicesDeps** — field-by-field identical membership and
   order vs HEAD (21 services; same 20 result fields; same 15 deps fields incl. the still-unused
   `rpgTrace` passthrough, unused in HEAD too).
7. **minter.ts + the five promoted consts** — `minter` body byte-identical (+ `export`).
   `AUTOBG_TEMPERATURE` 0.2 ✓, `AUTOBG_MAX_TOKENS` 32 ✓, `AUTOBG_SYSTEM` string byte-identical ✓,
   `PLUGIN_MESSAGE_CONTENT_CAP` 16\_384 ✓, `PLUGIN_TRANSFORM_ORDER_BASE` 1000 ✓.
8. **The randomUUID/globalThis substitution class (the lane's admitted-and-reverted drift)** — per
   -file counts match HEAD exactly: `randomUUID` 2 uses (settings `newBackgroundEntryId`, pluginHost
   `mintId`), `Math.random` 4 uses (transforms/automation/runArm prng + pluginHost nextRandom), zero
   `Date.now()` in code (comment only), zero `globalThis`.
9. **Live-vs-snapshot dep threading (the compatible-type wrong-binding hunt)** — three suspicions
   raised and REFUTED by reading the sources:
   - `vllmEngine` snapshot into buildAdmin vs HEAD's per-call `registry.vllmEngine`: the registry
     returns a plain frozen property (`infra/providers/index.ts:127-135`) — snapshot ≡ live.
   - `embedModel` snapshot into buildAdmin/buildDatabank vs HEAD's call-time `roleClients.embedModel`:
     plain string property on the bound bundle (`role-clients.ts:85`) — snapshot ≡ live.
   - `maxImageBytes`/`getEffectiveConfig`: threaded as GETTERS everywhere HEAD deref'd live
     (`services.ts:308/330/364`) — still per-call.
   - The two `createHostPrincipalResolver(sessions)` instances are NOT cross-wired: keystone's
     `resolveHostPrincipal` → chat only; world-info's `resolveOwnerPrincipal` → automation/plugin/
     portability/runnerEnv — exactly HEAD's routing (and HEAD also had two instances).
10. **Gates + tests run this session:**
    - `pnpm check` (whole tree, quiesced — only this diff in status): 11/12 stages green; the one red
      is F1. biome, eslint, all 5 type stages, structure:full (test-layout/presence), depcruise
      (compose sibling imports legal), docs:format all OK.
    - `pnpm vitest run tests/server/entry/compose/` → 11 files, 70 tests, ALL PASS, no type errors —
      including `services.test.ts` (19 tests) against the split keystone and the composed-real
      `chat.int.test.ts` watchdog test.
11. **Consumer surface:** `compose/index.ts` unchanged and correct — `ServicesDeps`/`ServicesResult`/
    `createServices` still exported; the seam map's only real importer (`entry/lifecycle.ts`) is
    untouched. The new builders are compose-internal and correctly NOT front-doored.
12. **Test mirrors for the new seam files:** none added; not a gate violation (structure:full green —
    sibling compose files `portability.ts`/`automation-watcher.ts`/`effective-config.ts` likewise
    have no mirrors) and `services.test.ts` still mirrors the surviving `services.ts`. Noted for the
    orchestrator: the seam map §4 anticipated moving describe blocks per-file; the gate does not
    force it and the lane did not do it.

## Observations (not findings)

- Deps-interface field style: most fields use derived types (`Pick<...>`, `Type["field"]`,
  `Parameters<typeof fn>[0][...]`) per the lane's declared rule, but several hand-spell function
  types (`audit`, `resolveOwnerPrincipal`, `maxImageBytes`, `emitChatEvent`, `getEffectiveConfig`,
  `newUserId`, `hashPassword`) and `databank.ts:35` hand-rolls `embedModel: string` where its sibling
  `admin.ts:36` derives `RoleClientsWithSignal["embedModel"]`. This exactly matches the named
  precedent's style (`buildChatService`'s `ChatComposeInput` hand-spells the same shapes), so the
  precedent wins — behavior-neutral, tsc-checked, not reported as a finding.
- `AssetsCharacterComposeResult.assetsCtx` is returned but not destructured by the keystone (HEAD
  used it only to build galleryCtx, which now happens inside the seam). knip does not flag interface
  members; harmless.

## Unconfirmed suspicions

None — every suspicion raised during the review was either confirmed (F1-F3) or affirmatively
refuted (item 9 above).

## Regions NOT read

- `compose/chat.ts` (878 lines): read only the `ChatComposeInput`/`ChatComposeResult` region +
  export surface (the diff does not touch it; the keystone's 26-field buildChatService call was
  verified arg-for-arg against HEAD).
- The untouched compose siblings (`portability.ts`, `runner-env.ts`, `automation-watcher.ts`,
  `materialize-background.ts`, `event-bus.ts`, `emit-*`, `effective-config.ts`,
  `plugin-chat-reads.ts`, `resolve-image-ref.ts`): not re-read except `role-clients.ts` (in full) and
  the `vllmEngine` region of `infra/providers/index.ts` — the diff calls them with
  equivalence-verified arguments.
- Domain service factories (`create*Service`): out of scope — both sides call the same factories;
  equivalence was proven at the argument level.
