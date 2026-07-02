# 04 — Type Catalog (86 shared RPG types)

> All exported RPG types live in `packages/shared/src/types/`, across four files. **No Zod schemas** —
> these are hand-written TS interfaces with no runtime validation at the DB boundary (the untyped-blob
> root cause). Counts and field lists are source-verified. Load-bearing types are expanded; the rest
> are named with a pointer.

Source files: `game-state.ts` (9 types) · `game.ts` (41) · `combat-encounter.ts` (23) · `scene.ts` (13).
Plus RPG bits in `character.ts` (`RPGStatsConfig`, `RPGStatPool`).

---

## `game-state.ts` — the per-turn snapshot layer (9 types)

`TrackerFieldLocks`, **`GameState`**, `PresentCharacter`, `CharacterStat`, `CustomTrackerField`,
`PlayerStats`, `RPGAttributes`, `InventoryItem`, `QuestProgress`.

```typescript
interface GameState {              // the game_state_snapshots row shape (see 01-state-model)
  id; chatId; messageId; swipeIndex;               // identity + swipe key
  date; time; location; weather; temperature;      // scene scalars (string|null)
  presentCharacters: PresentCharacter[];
  recentEvents: string[];
  playerStats: PlayerStats | null;
  personaStats: CharacterStat[] | null;
  committed?: boolean;                             // tentative vs locked-in
  manualOverrides?: Record<string,string> | null; // user edits surviving regen
  fieldLocks?: TrackerFieldLocks | null;           // per-cell agent-write locks
  createdAt;
}
interface PresentCharacter {       // 15 fields — richer than the draft showed
  characterId; name; emoji; mood; appearance; outfit;
  action?/*@deprecated*/; avatarPath?; avatarCrop?;
  portraitFocusX?; portraitFocusY?; portraitZoom?;   // tracker portrait framing
  customFields: Record<string,string>; stats: CharacterStat[]; thoughts;
}
interface PlayerStats { stats: CharacterStat[]; attributes: RPGAttributes|null;
  skills: Record<string,number>; inventory: InventoryItem[];
  activeQuests: QuestProgress[]; status; customTrackerFields?: CustomTrackerField[]; }
interface RPGAttributes { str; dex; con; int; wis; cha; }   // classic D&D
interface CharacterStat { name; value; max; color; }
```

---

## `game.ts` — the campaign/config/combat/HUD layer (41 types)

**Enums/unions:** `GameActiveState`, `GameGmMode`, `GameSessionStatus`, `GameSpotifySourceType`,
`ElementPresetName`, `PartyDialogueType`, `HudWidgetType` (8 members), `CheckpointTrigger` (7 members).

**Maps:** `GridCell`, `MapNode`, `MapEdge`, `GameMap` (grid **or** node graph; `id?`, `type`,
`width?/height?`, `cells?`, `nodes?`, `edges?`, `partyPosition`).

**Party/cast:**
```typescript
interface GameSetupConfig {         // the game's authored config (in chats.metadata.gameSetupConfig)
  genre; setting; tone; difficulty; playerGoals; gmMode: GameGmMode;
  rating: "sfw"|"nsfw"; gmCharacterId?; partyCharacterIds: string[]; personaId?;
  sceneConnectionId?;                            // connection for the scene-wrap turn
  enableSpriteGeneration?; imageConnectionId?; artStylePrompt?; imageStyleProfileId?;
  activeLorebookIds?; enableCustomWidgets?; /* + more */
}
interface GameNpc { id; name; emoji; description; descriptionSource?: "model"|"library"|"narration"|"user";
  gender?; pronouns?; location; reputation/*-100..100*/; notes: string[]; avatarUrl?; }
interface GameCharacterCard { name; shortDescription; class; abilities[]; strengths[]; weaknesses[];
  extra: Record<string,string>; rpgStats?: { attributes; hp; pools? }; }
interface PartyArc { … }  interface PartyDialogueLine { … }
```

**Session:**
```typescript
interface SessionSummary {          // one per concluded session (metadata.gamePreviousSessionSummaries)
  sessionNumber; summary; resumePoint; partyDynamics; partyState;
  keyDiscoveries[]; characterMoments[]; littleDetails[];
  statsSnapshot: Record<string,unknown>; npcUpdates[]; nextSessionRequest?; timestamp;
}
```

**Dice/checks/combat (overworld):** `DiceRollResult`, `SkillCheckResult`, `Combatant`,
`CombatStatusEffect`, `CombatSkill`, `ElementInfo`, `CombatAttackResult`, `CombatRoundResult`,
`CombatPlayerAction`, `GameCombatStateSnapshot`, `CombatSummary` (← lives here, **not** in
`combat-encounter.ts`).

**Direction/intro:** `DirectionEffect`, `DirectionCommand` (the intro-sequence command language).

**HUD:**
```typescript
interface HudWidget { id; type: HudWidgetType; label; icon?; position: "hud_left"|"hud_right"; accent?; config: HudWidgetConfig; }
type HudWidgetType = progress_bar | gauge | relationship_meter | counter | stat_block | list | inventory_grid | timer;  // 8
interface HudWidgetConfig { /* per-type: value/max/milestones/dangerBelow; count; stats[]; items[]; slots/categories/contents[]; seconds/running; valueHints */ }
```

**Blueprint/campaign:**
```typescript
interface GameBlueprint { hudWidgets: HudWidget[]; introSequence: DirectionCommand[]; visualTheme: BlueprintVisualTheme; campaignPlan?: GameCampaignPlan; }
interface GameCampaignPlan { openingSituation?; pressureClocks?: CampaignPressureClock[]; factions?: CampaignFaction[]; questSeeds?: string[]; encounterPrinciples?: string[]; }
interface GameCheckpoint { id; chatId; snapshotId; messageId; label; triggerType: CheckpointTrigger; location; gameState; weather; timeOfDay; turnNumber; createdAt; }  // 12 fields
```
Also `BlueprintVisualTheme`, `CampaignPressureClock`, `CampaignFaction`, `WidgetMilestone`, `WidgetUpdate`.

---

## `combat-encounter.ts` — the combat sidecar contract (23 types)

A self-contained turn-based-combat protocol (init/action/summary), separate from overworld combat.
See [`06-subengines.md`](06-subengines.md) for flow.

Models: `CombatAttack`, `CombatStatus`, `CombatItemEffect`, `CombatDialogueCue`, `CombatMechanic`,
`CombatVisualRequest`, `CombatPartyMember`, `CombatEnemy`, `CombatStyleNotes`, `CombatInitState`,
`CombatEnemyAction`, `CombatPartyAction`, `CombatPlayerActions`, `CombatActionResult`,
`EncounterLogEntry`, `NarrativeStyle`, `EncounterSettings`.

Request/response envelopes: `EncounterInitRequest/Response`, `EncounterActionRequest/Response`,
`EncounterSummaryRequest/Response`.

```typescript
interface CombatAttack { name; type: "single-target"|"AoE"|"both"; power?; cooldown?; element?; statusEffect?; }
interface CombatMechanic { name; trigger: "round_interval"|"hp_threshold"|"on_hit"|"on_attack"|"passive";
  effectType?: "damage_all"|"damage_one"|"buff_self"|"debuff_party"|"status_party"|"status_enemy"; counterplay?; }
```

---

## `scene.ts` — the scene fork/merge system (13 types)

`SceneMeta`, `SceneFullPlan`, `SceneForkMode` (`"clone"|"convert"`), and request/response pairs for
`Create`/`Conclude`/`Abandon`/`Fork`/`Plan`. See [`06`](06-subengines.md).

```typescript
interface SceneFullPlan {           // LLM-authored fork plan
  name; description; scenario/*hidden*/; firstMessage; background;
  characterIds[]; systemPrompt; rating; relationshipHistory; participationGuide;
}
interface SceneMeta {               // persisted on the forked chat
  sceneOriginChatId; sceneInitiatorCharId; sceneDescription; sceneScenario;
  sceneBackground; sceneSystemPrompt; sceneRelationshipHistory; sceneRating;
  sceneStatus: "active"|"concluded";
}
```

---

## Port implications

- **86 interfaces, zero runtime schemas.** The port's first structural win is contract schemas
  (Zod/valibot) at the persistence + LLM-payload boundaries — the thing that makes the JSON-repair
  gauntlet ([`02`](02-endpoint-flows.md)/[`07`](07-port-map.md)) mostly unnecessary.
- **Type homes are split sensibly already** (`game-state` = turn layer, `game` = campaign layer) —
  mirror that split in `domain/rpg/contract/`.
- **`character.ts` `RPGStatsConfig`** is the card-baseline → snapshot bridge; it stays a `character`
  concern that `rpg` reads, not an `rpg`-owned type.
