---
kind: history
status: archived
updated: 2026-08-01
---

# Seam map — `packages/server/src/entry/compose/services.ts` (1,632 lines)

> Scout survey 2026-07-25 (read in full + callers + gate grep). Input for the ratified
> services.ts split (the chat/index.ts F5 playbook, adapted — this one is NOT a pure move).
> Owner receipt: "check out the services.ts mess, we have quite a few god files."

## 1. Natural sections (line ranges as of 80eca58e)

| Lines | Section |
| - | - |
| 1–234 | header + imports + `ServicesDeps`/`ServicesResult` + `minter`, `assertNeverEvent` |
| 238–353 | infra bootstrap: presence · audit · eventBus · sessions · settings · effectiveConfig warm · imageAdapter · backendRegistry · executor/diagnostics · secretBox/cas/variants · credentials · connection |
| 352–364 | `bindRoleClients` → boot-global `roleClients`; `tagCtx`/`tag` |
| 367–535 | assetsCtx/assets (+co-participant/asset-ref resolvers) · `materializeBackgroundOp` LATE-BIND · character (greeting-studio closures) |
| 539–664 | galleryCtx · characterSeeder · personaSeeder |
| 666–716 | embeddings · indexer · corpusAutoindex subscribe · character-updated→chat fan |
| 718–810 | persona (seed re-point closures) · presetCtx/preset · stats · search · discovery |
| 811–840 | notifications · workloads · `enqueueEmbedReindex` LATE-BIND |
| 842–901 | admin (sessions/vllm/embed sub-bundles) |
| 903–909 | ONE tool-use registry · exportService |
| 911–996 | imagery (+extractQuiet visibility gate, imagery tool registration) |
| 998–1037 | databankCtx · databank · databankIngest |
| 1039–1078 | chat compose: `resolveHostPrincipal` · `buildChatService` · `resolveViewerVisibility` |
| 1080–1123 | worldInfo · import ports · bulkImportChats/Personas · `resolveOwnerPrincipal` |
| 1125–1274 | automation: automationOps (closes over chat/imagery/settings/notifications) · automationEnabled · pluginSubscribers · automationTransforms · automation service · reloads |
| 1276–1509 | plugin: pluginHost · pluginHostOps (chat/storage/notifications/quickReply/imagery/variables/registrar) · plugin service |
| 1511–1583 | portability (+enqueueImportBackfill/reconcileImportStats) · runnerEnv |
| 1585–1632 | final `services` bundle + return |

## 2. Consumer surface (tiny — split is low-blast-radius)

Exports: `ServicesDeps`, `ServicesResult`, `createServices` → re-exported via
`compose/index.ts:19-20`; the ONLY real importer is `entry/lifecycle.ts:46,142`. Two
comment-only references (persona/context.ts:3, chat-events-bus.ts:8).

## 3. Entanglements a split must thread (NOT a pure move)

- Ubiquitous locals: `db` · `now` · `audit` · `eventBus` · `roleClients` · `settings`/`effectiveConfig` · `assets` · `character` · `workloads`.
- TWO late-bound holder patterns breaking circular init: `materializeBackgroundOp` (367–535) and `enqueueEmbedReindex` (833) — preserve the pattern or reorder construction.
- `resolveViewerVisibility` is built AFTER chat (1078) but forward-referenced by imagery's extractQuiet closure (defined \~948) — a genuine forward-reference cycle.
- TWO separate `createHostPrincipalResolver(sessions)` calls (`resolveHostPrincipal` 1041, `resolveOwnerPrincipal` 1123) thread into automationOps, pluginHostOps, portability, runnerEnv.
- automation + plugin are the MOST tangled pair (both close over imagery/chat/notifications/worldInfo/settings/resolveOwnerPrincipal; plugin reuses automation's op objects) — extract together or plugin imports automation's exported ops; do this pair LAST.
- Extracted builders take an EXPLICIT deps object (the `buildChatService` signature precedent in compose/chat.ts) — never close over keystone locals.

## 4. Path-keyed hazards

- `scripts/check/gates/no-vanity-alias.ts:272` names the file only inside a fixture/example — NOT a live path key (verified: no silent-green on rename).
- **`tests/server/entry/compose/services.test.ts` (821 lines, 8 describes) is the path-mirror** — the split MUST move its describe blocks into per-file mirrors in lockstep (test-layout gate) and may touch the no-test-fabrication baseline.
- No other literal `compose/services.ts` references in scripts/.

## 5. Recommended split

`services.ts` stays as the keystone (infra bootstrap + types + ordered builder calls + final
bundle). Extract: `assets-character.ts` (367–664 incl. gallery+seeders) ·
`search-discovery.ts` (666–810; persona peels later if it grows) · `admin.ts` (842–909 incl.
tool-use+export or a tiny sibling) · `imagery.ts` (911–996) · `databank.ts` (998–1037) ·
`world-info.ts` (1080–1123, as automation's prerequisite inputs) · `automation.ts` (1125–1274)
· `plugin.ts` (1276–1509, paired with automation) · `portability-runner.ts` (1511–1583).
chat already lives in compose/chat.ts (the precedent).
