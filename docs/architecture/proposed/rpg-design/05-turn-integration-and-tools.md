# 05 — Turn Integration: GATHER, BUILD slots, the Tool Registry, the Bus

> **Status: PROPOSED design (prescriptive).** How a game turn rides chat's ONE pipeline
> (RESOLVE→GATHER→BUILD→SHAPE, chat.md Part II) with zero chat-domain knowledge of rpg. The model's
> entire side-effect surface is the D48 tool registry below — there is NO text-tag grammar
> (marinara's `[reputation:]`/`[state:]`/`[widget:]`/1,124-line client parser evaporates; corpus 08).

---

## 0. The wiring principle — chat stays rpg-blind (`no-if(isGame)`)

`domain/chat` gains NOTHING rpg-specific. The graft is three injected, OPTIONAL ops on
`ChatContext` (wired at `entry/compose`; absent in non-rpg deploys/tests — a `null` op is the
no-op), following the committed `{{databank}}`-GATHER-branch precedent (databank.md §4) and the
expressions post-turn-hook precedent:

| Injected op (chat side) | Provided by `domain/rpg` | Called at |
|---|---|---|
| `rpg.gatherTurnContext(chatId, turn) → RpgGatherResult \| null` | `verbs/gather-turn-context.ts` | GATHER phase, after WI pool. `null` = not a game ⇒ byte-identical non-game turn |
| `rpg.onUserCommit(chatId, messageId)` | `verbs/on-user-commit.ts` | SEND verb, after the user row commits (fires snapshot COMMIT, 03 §2.4, + consumes queued rolls §6) |
| `rpg.onTurnCompleted(chatId, messageId, variantId)` | `verbs/on-turn-completed.ts` | post-turn background step (flush provisional quest writes, emit trace, poke the director cadence counter) |

Tool EXECUTION needs no chat-side rpg op: rpg tools are registered in the ONE `domain/tool-use`
registry (D48 source (a), builtin/host) at compose time; chat's recurse loop executes them like any
other tool. The registry entries close over the rpg service (the same closure pattern buddy's MCP
tools use).

**Enforcers:** dep-cruiser — `domain/chat/**` never imports `domain/rpg/**` (and vice versa; both
sides talk through contracts + injection); a contract test pins that a non-game chat's assembled
prompt is byte-identical with the rpg ops wired vs absent.

## 1. `RpgGatherResult` (contract/gather.ts) — what a game turn contributes

```ts
export interface RpgGatherResult {
  /** MacroContext additions — the preset's rpg sections render through these (06 §1).
   *  All volatile:true except rpgWorld (semi-static; changes bust the static cache). */
  macros: {
    rpgWorld: string;        // world overview + genre/setting/tone/difficulty frame
    rpgSecrets: string;      // storyArcSecret + plotTwists + hidden clocks + campaign plan  (GM-only ring)
    rpgContinuity: string;   // all session summaries (compact) + latest-session detail block (decay design, 06 §5)
    rpgCast: string;         // party sheets + arcs + persona; tracked NPCs (top 12 by |reputation|)
    rpgSceneState: string;   // resolved snapshot: clock/date/location/weather/present/recentEvents
    rpgMap: string;          // active map: current + connected (+ discovered list only on first-turn-or-moved — marinara's diffing rule)
    rpgPerception: string;   // <passive_perception> hints (04 §10) — server-computed, may be empty
    rpgMorale: string;       // <party_morale> tier prose
  };
  /** The format reminder — ONE depth-0 system injection into chat's single Injection[] list
   *  (ignoreBudget: operator-tier). Recency-bias placement: nearest to generation. (06 §2.) */
  injections: readonly ChatInjection[];
  /** Tool names to attach this turn (chat resolves them against the tool-use registry and merges
   *  into the request tools[]). Varies by mode: overworld set vs encounter set (§3). */
  tools: readonly string[];
  /** Turn-variant flags GATHER computed (drive reminder variants — 06 §2): */
  flags: { playerRolledDice: boolean; addressMode: "scene" | "party" | "gm"; encounterActive: boolean };
}
```

WHY macros + one injection (rejected: rpg builds prompt strings itself à la `gm-prompts.ts`): the
preset owns ordering/tunability (09a), chat owns budgeting/caching; rpg only supplies VALUES. The
recency split (static identity/rules/secrets in the system half; volatile state + format contract
as the last thing the model reads) is marinara's best structural idea — here it falls out of
existing machinery: semi-static macros render in preset sections (cache-stable), the reminder is a
depth-0 injection (always adjacent to generation).

Gather is READ-ONLY (pure assembly from persistence + substrate). Perception hints are computed
here (server-side, from live hidden state) — the model receives them as facts to weave.

## 2. Where tool WRITES land (the one subtle rule)

Every state-mutating tool writes through `verbs/apply-tool-call.ts`, which targets the PENDING
snapshot of the variant being generated (lazily cloned-forward on first write — 03 §2.4), except:

- **game-scoped rows** (npcs, journal, clocks, widgets defs, maps): written immediately (they are
  not swipe-volatile), BUT `rpg_quests` status flips and `rpg_clocks` ticks triggered from inside a
  turn are staged on the snapshot (`pendingEffects` in the tool executor's turn state) and FLUSHED
  by `onUserCommit` when that variant is accepted — so a swiped-away "the ritual completes" never
  half-fires. Journal entries + NPC upserts apply immediately (append-only, harmless if swiped;
  rejected: staging everything — it makes NPC references dangle mid-turn).
- **dice/check results**: no state write at all beyond consequences; the roll is recorded in the
  turn's `ToolCallRecord` (D48 persistence on `message_variants.toolCalls`) — provenance for free.

## 3. The tool registry (contract/tools.ts) — the COMPLETE set

Registered once at compose into `domain/tool-use` (ONE registry, two projections — D48). Every
tool: `name`, JSON schema (zod-to-JSON-schema from the contract), owning verb, `can()` capability.
All run as the turn principal (`runAsUserId` = host — D19; the GM acts with host authority; the
capability column is the ceiling the registry checks). Results are structured JSON;
errors-as-data (a schema violation returns an error result the model corrects — never a repair
modal).

**Overworld set** (attached when no encounter is active):

| # | Tool | Args (schema summary) | Owning verb | Effect / result |
|---|---|---|---|---|
| 1 | `roll_dice` | `{notation, reason?}` | `rollDice` | pure roll (04 §1) → `{rolls, modifier, total}` |
| 2 | `skill_check` | `{actorRef, skill, dc(2..30), advantage?, disadvantage?, reason}` | `resolveCheck` | 04 §2 → `{band, usedRoll, modifier, total, dc, consequence}`; consequence side-effects (clock tick / pool cost / time cost) applied server-side before return; morale event on crit/fumble |
| 3 | `update_scene` | `{location?, calendarDate?, presentCharacters?: upsert/remove patches, recentEvent?}` | `patchSnapshot` | lock-merged snapshot patch (03 §2.3); returns applied fields + lock rejections |
| 4 | `advance_time` | `{action(enum RPG_TIME_ACTIONS) \| minutes \| setTimeOfDay(label)}` | `advanceTime` | clock advance + weather-change roll + (explore/travel/rest/map_move) encounter roll → `{clock, weather?, encounter?: {type}}` (04 §8-11) |
| 5 | `update_party` | `{memberRef, hpDelta?, poolDeltas?, addCondition?, removeCondition?, status?}` | `patchPartyVolatile` | lock-merged; clamps to 0..max; returns new values |
| 6 | `update_inventory` | `{memberRef, add?: item[], remove?: {itemId\|name, quantity}[]}` | `patchInventory` | snapshot inventory patch |
| 7 | `update_reputation` | `{npcRef, action: enum RPG_REPUTATION_ACTIONS}` | `applyReputation` | 04 §6; returns `{newValue, tier, milestone?}` |
| 8 | `upsert_npc` | `{name, description?, emoji?, gender?, pronouns?, location?}` | `upsertNpc` | creates/updates `rpg_npcs` (name-matched); NEW NPCs auto-journal + may enqueue portrait workload (08) |
| 9 | `create_clock` | `{name, segments(4\|6\|8\|12), kind, visibility, consequence}` | `createClock` | GM-authored pressure |
| 10 | `tick_clock` | `{clockRef, ticks(1..2)}` | `tickClock` | staged (§2); completion → `rpg.clockCompleted` event + result flag `completed:true` so the model narrates the consequence NOW |
| 11 | `upsert_quest` | `{name, action: create\|update\|complete\|fail, description?, objectives?}` | `upsertQuest` | staged status flips (§2); max 3 active (marinara rule) |
| 12 | `add_journal_entry` | `{type(7-enum), title, content}` | `addJournalEntry` | immediate append |
| 13 | `move_party` | `{destination}` | `moveParty` | alias-match → reveal (fog) → position sync → map_move encounter roll → `{matchedNode?, revealed[], encounter?}` |
| 14 | `add_map_node` | `{label, connectedTo, emoji?}` | `addMapNode` | node maps: farthest-point placement (04 §11) |
| 15 | `set_widget_value` | `{widgetId, value?\|count?\|statPatch?\|addItem?\|removeItem?\|timer?}` | `setWidgetValue` | `source:"custom"` widgets only (bound widgets reject — 03 §8); snapshot-keyed |
| 16 | `resolve_combat_round` | `{party: typed actions, enemies: brief specs}` | `resolveOverworldRound` | 04 §3 quick-scuffle math → full round result JSON to narrate |
| 17 | `start_encounter` | the BLUEPRINT: `{concept, enemies: [{name, description, maxHp, attacks[], mechanics?[]}], environment, isBoss?}` | `startEncounter` | 07 §1 — creates `rpg_encounters`; the MODEL designs the fight in the args (schema-validated); server hydrates deterministic stats. Kills marinara's separate 12k-token `/encounter/init` LLM call |
| 18 | `grant_loot` | `{source: encounter\|chest\|npc\|quest, count?}` | `grantLoot` | server-rolled from the campaign loot table (04 §5) → items into inventory patch |
| 19 | `transition_state` | `{state: 4-enum}` | `setActiveState` | flips `rpg_games.activeState`; combat_start/combat_end checkpoints fire here |
| 20 | `request_illustration` | `{title, prompt, subjects: string[]}` | `requestIllustration` | cadence-gated (08 §3) → enqueues `rpg-illustration` workload → async `MessageMedia` message |
| 21 | `end_session` | `{reason}` | `flagSessionEnd` | marks the session `concluding`; the HOST confirms (a verb, not auto) — model proposes, table disposes |
| 22 | `offer_choices` | `{choices: string[] (2..4)}` | `offerChoices` | CYOA quick-replies: staged on the turn; the client renders choice chips under the GM message (11); a click sends the choice text as that player's normal message. TERMINAL by convention (the reminder says: last thing in a turn). *(marinara's `[choices:]` cards, kept — a strong agency affordance. Its `[qte:]` timed overlays are DROPPED: real-time reflex timers fight an async multi-human chat; rejected with that reason, not deferred.)* |

**Encounter set** (attached instead of 16/17 while an encounter is active — 07 §2):
`encounter_round` (per-member typed actions → full deterministic round), `attempt_flee`,
`conclude_encounter` (server has already flagged terminal; returns the `RpgCombatSummary`).

Tool-count sanity: ~21 defs ≈ marinara's tag grammar + bespoke endpoints, but every one is
schema-validated, capability-gated, provenance-recorded, and consumed by exactly one verb.
`ModelCapability.tools` absent ⇒ game chats REQUIRE a tool-capable model — `rpg.createGame`
validates the chat's resolved connection up front and refuses with a clear error (the Tier-3b
textual-tool-call polyfill, 09 §polyfill, is the local-model escape hatch).

## 4. The recurse loop in a game turn (worked sequence)

```
player: "I pick the lock before the guard rounds the corner."
→ chat GATHER: rpg.gatherTurnContext → macros/injection/tools (overworld set)
→ model streams: brief tension beat … emits skill_check{actor:"Vex", skill:"sleight_of_hand", dc:15}
→ chat loop: toolUse.execute → rpg.resolveCheck → rolls 11+3=14 → band "partial",
   consequence {tick-clock: "Guard Patrol" 1/6→2/6 (visible), timeCost 15}
   (server applied the tick + advance_time BEFORE returning)
→ recursed model narrates: the lock clicks open AS bootsteps grow louder — success at a cost,
   the patrol clock visibly ticks on every player's HUD (rpg bus → client)
→ model may chain update_scene / add_journal_entry, then finishes prose
→ persist: variant + ToolCallRecords; snapshot row committed=0 until the next player send
```

One user-visible turn. Marinara needed: generate + client tag-parse + `/game/skill-check` +
message-rewrite + `/game/scene-wrap` + `/game/generate-assets` — and fed dice back one turn late
unless the model faked its own rolls.

## 5. The rpg bus + events (contract/events.ts)

`domain/rpg/bus.ts` — its OWN per-chat SSE bus (replay-ring, `@orb/kit/replay-buffer`,
`ASSUMES(single-replica)` annotated), fanned out by a tRPC `rpg.stream(chatId)` subscription
(member-gated). WHY not the chat bus: `ChatBusEvent` is a closed union with a frozen durable CHECK
(D50) and rpg events are a different consumer surface (HUD/tracker/map), exactly the
buddy/workloads precedent. *(Rejected: widening ChatBusEvent — a schema migration + 24→35 members
polluting every chat consumer.)*

```ts
export type RpgBusEvent =
  | { type: "snapshotPatched"; chatId: ChatId; snapshotId: RpgSnapshotId }        // client refetches tracker/HUD
  | { type: "clockChanged"; chatId: ChatId; clockId: RpgClockId }                  // visible clocks only
  | { type: "clockCompleted"; chatId: ChatId; clockId: RpgClockId }
  | { type: "checkResolved"; chatId: ChatId; band: RpgCheckBand; skill: string }   // dice-toast UI
  | { type: "reputationMilestone"; chatId: ChatId; npcId: RpgNpcId; tier: RpgReputationTier; direction: "up" | "down" }
  | { type: "mapChanged"; chatId: ChatId; mapId: RpgMapId }
  | { type: "encounterStarted" | "encounterRound" | "encounterEnded"; chatId: ChatId; encounterId: RpgEncounterId }
  | { type: "questChanged"; chatId: ChatId; questId: RpgQuestId }
  | { type: "sessionChanged"; chatId: ChatId; sessionNumber: number; status: RpgSessionStatus }
  | { type: "gameChanged"; chatId: ChatId };                                        // catch-all (config/state/widgets)
```

Id-only payloads (the D38 discipline — subscribers re-read canon); hidden-clock changes emit
NOTHING on the member stream (P3; the host stream includes them). A curated subset
(`rpg.clockCompleted`, `rpg.sessionConcluded`, `rpg.encounterEnded`, `rpg.reputationMilestone`,
`rpg.checkResolved`) is ALSO mirrored onto the closed domain-event bus (`@orb/contracts/events`,
additive members) so D46 Tier-1 automation can trigger on them (09b).

## 6. Player dice queueing (the composer path — kept from marinara)

The client dice button calls `rpg.rollDice` (a normal member-gated verb, server RNG) and inserts
the canonical text `[dice: 2d6 = 9 (4,5)]` into the composer; it rides the user message as plain
text. GATHER detects `/\[dice\b/i` in the pending user text → `flags.playerRolledDice` → the
reminder variant instructs "use the player's roll as the base" and `skill_check` passes it as
`preRolledD20` (04 §2.5). ZERO chat-domain changes; the roll is server-made; the model can't lie
about it (the text is server-generated, and the check re-reads it server-side from the message —
the tool arg is advisory, the server's parse of its own emitted tag is authoritative).

## 7. Address modes (Scene / Talk-to-Party / Talk-to-GM — kept, trivially)

A composer toggle prefixes the literal `[To the party]` / `[To the GM]` (marinara's convention —
GAME_MODE.md). GATHER sniffs the prefix → `flags.addressMode` → reminder variant: party-conference
(companions confer, scene does not advance) or GM-OOC (out-of-character answer, no narration).
No schema, no new verbs. *(Rejected: a typed send-mode field on chat's send params — touches the
chat contract for a prefix convention the reminder fully handles.)*

## 8. Test plan (integration layer)

- **Registry contract test:** every tool name ↔ schema ↔ verb wiring exhaustive over the tuple
  (mapped-type Record, `exhaustive-dispatch`).
- **Loop goldens (mocked model):** scripted tool-call sequences through the REAL chat recurse loop
  → assert snapshot/journal/clock effects + `ToolCallRecord` persistence + staged-flush on commit.
- **No-game byte-identity:** rpg ops wired but chat has no game ⇒ assembled request byte-equals
  the ops-absent build.
- **Reminder variants:** dice-flag / address-mode / encounter-active each flip exactly their block.
- **Bus hygiene:** hidden-clock tick emits on host stream only; every event carries chatId; replay
  ring works after late subscribe.
