# 06 — Sub-engines: Combat Encounter, Scene, Turn-Games

> Three self-contained systems that hang off the RPG core, each in its own route file. All three are
> "fork out → play → merge back" shaped.

---

## A. Combat Encounter Sidecar

**Files:** `encounter.routes.ts` (805 LOC, 3 endpoints), `combat-encounter.ts` (23 types),
`encounter.service.ts` (overworld encounter *rolls*, distinct from the sidecar).

Two combat systems coexist — don't conflate:
- **Overworld combat** (`combat.service.ts` + `game.ts` `Combatant`/`CombatRoundResult`) — inline,
  per-round, resolved during normal play via `POST /combat/round`. Deterministic math ([`03`](03-services-and-mechanics.md)).
- **Encounter sidecar** (`combat-encounter.ts` + `encounter.routes.ts`) — a **separate structured
  turn-based combat modal**. The player enters a dedicated encounter UI, fights through rounds against
  generated enemies with boss mechanics, and on conclusion a `CombatSummary` (from `game.ts`) is
  injected back into the main chat to resume roleplay.

### The sidecar protocol (3 endpoints, request/response envelopes)
- `EncounterInitRequest → EncounterInitResponse` — set up party (`CombatPartyMember[]`), enemies
  (`CombatEnemy[]`), `EncounterSettings`, `NarrativeStyle`, `CombatInitState`.
- `EncounterActionRequest → EncounterActionResponse` — one turn: `CombatPlayerActions` →
  `CombatActionResult` + `CombatEnemyAction`/`CombatPartyAction` + `EncounterLogEntry[]`.
- `EncounterSummaryRequest → EncounterSummaryResponse` — wrap up → `CombatSummary`.

### Boss mechanics (the interesting structured part)
```typescript
interface CombatMechanic { name;
  trigger: "round_interval"|"hp_threshold"|"on_hit"|"on_attack"|"passive";
  effectType?: "damage_all"|"damage_one"|"buff_self"|"debuff_party"|"status_party"|"status_enemy";
  counterplay?; }
interface CombatAttack { name; type: "single-target"|"AoE"|"both"; power?; cooldown?; element?; statusEffect?; }
```
Enemies carry attacks + mechanics; `element` ties into the `element-reactions.service` aura system.
`CombatVisualRequest` / `CombatDialogueCue` drive per-turn art + barks.

**Port note:** the sidecar is a clean sealed subsystem — verb-entered (`initEncounter`/`encounterAction`
/`concludeEncounter`), no route logic, `CombatSummary` merged back via a `domain/rpg` verb. Whether it
shares the overworld combat math or stays fully separate is an open call (they're separate today).

---

## B. Scene Fork/Merge System

**Files:** `scene.routes.ts` (870 LOC, 5 endpoints), `scene.ts` (13 types),
`services/game/session.service.ts` + scene helpers.

A mechanical fork for side-quests/mini-RPs: the LLM authors a `SceneFullPlan` (hidden `scenario`,
custom `systemPrompt`, user `participationGuide`), the chat forks into a bubble, plays out, and on
conclude a summary merges back into the main `GameState` timeline.

### Endpoints & flow ([`scene.routes.flow.md`](scene.routes.flow.md))
- `POST /plan` — LLM authors a `ScenePlanResponse` (proposes the scene) from origin chat context.
- `POST /create` — instantiate the fork: build persona/character context, first message, `SceneMeta`.
- `POST /conclude` — LLM summarizes the scene → merge back; `sceneStatus: "concluded"`.
- `POST /abandon` — drop the fork without merging.
- `POST /fork` — `SceneForkMode: "clone" | "convert"` — clone origin or convert in place.

```typescript
interface SceneMeta { sceneOriginChatId; sceneInitiatorCharId; sceneDescription; sceneScenario;
  sceneBackground; sceneSystemPrompt; sceneRelationshipHistory; sceneRating; sceneStatus: "active"|"concluded"; }
```

**Port note:** "fork a chat, play it, merge a summary back" is a **chat-domain** concept, not RPG-only
(any roleplay can fork a scene). Strong candidate to live in `domain/chat` with `domain/rpg` consuming
it, rather than duplicating fork/merge inside rpg. Flag for the chat-scaffold decision.

---

## C. Turn-Games (board/card game runner)

**Files:** `turn-games.routes.ts` (94 LOC, 5 endpoints), `services/turn-games/turn-game-runner.service.ts`
+ `turn-game-bot-runner.service.ts`, `packages/shared/src/features/turn-games/` (plugin registry).

A generalized **seat-based turn-game engine** with a **plugin registry** (`TURN_GAME_ENGINES`,
generated). Supports human + bot seats; the bot runner drives AI opponents.

- **Currently exactly ONE engine registered: `uno`** (`features/turn-games/uno/`). The framework is
  built for more (registry + `engine.types.ts` + generated registry), but Uno is the only implementation.
- Endpoints: `GET /catalog` (`listTurnGames`), `GET /:chatId/state`, `POST /:chatId/start`,
  `POST /:chatId/move`, `POST /:chatId/resign`.
- Runner API: `startTurnGame`, `applyTurnGameMove`, `getTurnGameView`, `getActiveTurnGame`,
  `getTurnGameContextText` (feeds game state into the chat prompt), `resignTurnGame`.
- Seats carry `"human"`/`"bot"` kinds; `getTurnGameContextText` is how the running game surfaces into
  the roleplay context.

**Port note:** lowest priority — it's a single-game (Uno) framework. Port the *pattern* (a pluggable
seat-based game runner whose state feeds the chat context) only if there's product demand for more than
Uno; otherwise it's a self-contained feature that can graft on later. The `getTurnGameContextText`
seam (game → chat prompt) is the only real coupling to the core.

---

## Summary: three "fork-and-merge" shapes

| Sub-engine | Fork | Play | Merge back | Port priority |
| --- | --- | --- | --- | --- |
| Combat encounter | enter encounter modal | structured rounds | `CombatSummary` → chat | medium (clean sidecar) |
| Scene | fork chat bubble | free roleplay | scene summary → `GameState` | medium — **maybe `domain/chat`** |
| Turn-games | start game (seats) | move/resign loop | game context → prompt | low (Uno-only) |
