# 02 — Endpoint Flows (the mega-file pulled apart)

> `game.routes.ts` is 8,659 lines / 41 registered endpoints (45 handler nodes incl. nested). Each
> handler was decomposed with ts-morph into its **ordered call sequence**, tagged by operation class.
> The raw spines are in [`game.routes.flow.md`](game.routes.flow.md),
> [`encounter.routes.flow.md`](encounter.routes.flow.md), [`scene.routes.flow.md`](scene.routes.flow.md).
> This doc groups them by concern and flags the architecturally-loaded ones.
>
> **Tags:** `[LLM]` provider/completion call · `[IMAGE]` image generation · `[DBWRITE]` snapshot/table
> write · `[READ]` load/parse · `[PARSE]` JSON-repair path · `[MUTATE]` metadata-blob mutation ·
> `[STORE]` storage-factory instantiation.

---

## The shape every handler repeats (the anti-pattern)

Nearly every mutating endpoint follows the same open-coded sequence — this repetition *is* the
"pipeline duplication" flaw:

```
createChatsStorage(app.db)        [STORE]   ← re-instantiate storage per request
chats.getById → parseMeta         [READ]    ← re-parse the untyped metadata blob
(resolveConnection→createLLMProvider) [LLM]  ← re-resolve connection/model from scratch
runGameChatComplete(...)          [LLM]     ← out-of-band completion
extractLeadingThinkingBlocks→parseJSON [PARSE] ← scrape structured output
(validate…Payload → sendJsonRepairError) [PARSE] ← hard-fail to the manual repair modal
apply…Payload / merge…Metadata    [MUTATE]  ← hand-mutate metadata + write snapshot
mirrorGameMessageToDiscord        (side FX)
```

An Orbweaver port collapses the `STORE`/`READ`/`LLM`/`PARSE` preamble into the shared chat
GATHER/BUILD pipeline; only the `[MUTATE]` tail is genuinely per-feature.

---

## Group 1 — Game creation & setup (LLM-heavy, JSON-repair-gated)

| Endpoint | LOC | Flags | Role |
| --- | --- | --- | --- |
| `POST /create` | 123 | DBWRITE | Create a game chat; seed HUD widgets, system prompt, gen params. |
| `POST /setup` | **347** | LLM:3 PARSE:4 | The big one. Build a setup prompt from party cards + persona + lorebooks + macros, run an LLM completion, validate/repair the JSON payload, `applyGameSetupPayload`. |
| `POST /setup/apply-json` | 61 | PARSE:6 | Client resubmits human-fixed JSON → validate → apply → `loadSetupRpgContext`. |
| `POST /start` | 64 | — | Flip session status; seed first snapshot. |

The `apply-json` twin of `/setup` exists **only** because structured output fails often enough to need
a human-in-the-loop repair modal. In Orbweaver (native tool-use / Tier-1 JSON mode) these twins
collapse to one path; the repair logic ports as a Tier-3b polyfill (see `05`/`07`).

## Group 2 — Session lifecycle (recap/conclude/campaign, all LLM + repair twins)

`POST /session/start` (272, LLM) · `/session/conclude` (LLM, recap+journal+checkpoint+lorebook-keeper
queue) · `/session/conclude/apply-json` · `/session/regenerate-lorebook` · `/session/lorebook-keeper/apply-json`
· `/session/regenerate-conclusion` (+apply-json) · `/session/update-campaign-progression` (+apply-json)
· `GET /:gameId/sessions`.

Pattern: every "generate narrative artifact" endpoint has a paired `apply-json` repair endpoint.
**8 of these are the repair twins** — pure duplication driven by unreliable structured output.

## Group 3 — Party management

`POST /party/recruit` (LLM — generate an NPC party card from a name, merge into metadata) ·
`POST /party/remove` (prune from metadata) · `POST /party-turn` (LLM — generate NPC companion
dialogue; **one of the client-orchestrated out-of-band turn calls**).

## Group 4 — Deterministic mechanics (server math, NO LLM — the clean part)

| Endpoint | Calls into | Notes |
| --- | --- | --- |
| `POST /dice/roll` | `rollDice` | pure |
| `POST /skill-check` | `resolveSkillCheck`, `getGoverningAttribute`, `attributeModifier` | reads snapshot for attributes |
| `POST /combat/round` | `resolveCombatRound` | pure round resolution |
| `POST /combat/loot`, `/loot/generate` | `generateCombatLoot`, `generateLootTable` | weighted tables |
| `POST /encounter/roll` | `rollEncounter`, `rollEnemyCount` | |
| `POST /reputation/update` | `processReputationActions` | mutates metadata morale/rep |
| `POST /morale` | `applyMoraleEvent`, `buildMoraleMetadataUpdates` | |
| `POST /time/advance` | `advanceTime`, `updateLatestGameStateWithTrackerLocks` | writes snapshot |
| `POST /weather/update` | `inferBiome`, `generateWeather`, `shouldWeatherChange` | writes snapshot |
| `GET /elements/presets`, `/elements/preset/:name` | `listElementPresets`, `getElementPreset` | read-only |

These map almost 1:1 to `domain/rpg` verbs with zero LLM involvement — the highest-confidence port.

## Group 5 — World state & maps

`POST /state/transition` (`validateTransition` + checkpoint) · `POST /map/generate` (LLM — generate a
`GameMap`) · `POST /map/move` (deterministic position update in metadata).

## Group 6 — Journal / notes / widgets / checkpoints

`POST /journal/entry` (dispatch to `addLocationEntry`/`addNpcEntry`/`addCombatEntry`/`upsertQuest`/… ) ·
`GET /:chatId/journal` · `PUT /:chatId/notes` · `PUT /:chatId/widgets` (`sanitizeGameHudWidgets`) ·
`POST /checkpoint` · `GET /:chatId/checkpoints` · `DELETE /checkpoint/:id` · `POST /checkpoint/load`
(restores a snapshot + tracker locks).

## Group 7 — Media / visual (out-of-band, image-gen inline — see `05`)

| Endpoint | Flags | Role |
| --- | --- | --- |
| `POST /scene-wrap` | LLM+IMAGE | **The other client-orchestrated turn call.** Analyzes narration → JSON for HUD/music/visuals; may trigger scene illustration + background + NPC avatars inline. |
| `POST /generate-assets` / `/generate-assets/preview` | IMAGE | Generate backgrounds + scene illustration + NPC portraits; crop/resize; push to gallery + client out-of-band. |
| `POST /spotify/candidates`, `/spotify/play` | — | Scene → track query → external Spotify. |

## Companion route files

- **`encounter.routes.ts`** (805 lines, 3 endpoints) — combat encounter sidecar init/action/summary. See [`06-subengines.md`](06-subengines.md).
- **`scene.routes.ts`** (870 lines, 5 endpoints) — `create`/`conclude`/`abandon`/`fork`/`plan`. See [`06`](06-subengines.md).
- **`turn-games.routes.ts`** (94 lines, 5 endpoints) — `catalog`/`state`/`start`/`move`/`resign`. See [`06`](06-subengines.md).

---

## What the flow spines reveal for the port

1. **13 out-of-band LLM calls in one file** across setup/session/party/scene/map — every one rebuilds
   context. GATHER/BUILD eliminates the rebuild; Workloads eliminate the client sequencing.
2. **~10 `apply-json` repair endpoints** exist solely to recover failed structured output. Native
   tool-use deletes the need; the repair heuristics become a local-model polyfill, not a route.
3. **Group 4 (deterministic mechanics) has no LLM at all** — port it first, it's pure and testable.
4. **Metadata mutation is smeared across transport** (`apply*Payload`, `merge*Metadata`,
   `withActiveGameMapMeta`) — every one is a tier violation to be pulled into `persistence/` + verbs.
