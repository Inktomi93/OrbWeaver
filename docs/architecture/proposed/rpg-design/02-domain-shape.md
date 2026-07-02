# 02 — The Domain Shape: `domain/rpg`, its Satellites, and One Home per Mechanic

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** The code geography. ONE new domain (`domain/rpg`,
> 8-slot template) + additive arms in committed homes. No `domain/director`, no `domain/journal`,
> no `domain/campaign` — everything game-shaped lives in `rpg` (they exist only together, for a
> game); everything NOT game-shaped lands in its committed owner (the domain-of-affect rule,
> Agent-Port-Map §4).

---

## 1. The one-domain decision

**DECISION: one `domain/rpg`** with named internal subsystems, per the port-map lean (confirmed).
*(Rejected: split `domain/campaign`/`domain/journal`/`domain/encounter` — they share the
`rpg_games` root FK, one bus, one gather, one auth scope; three domains means three front doors
injected into each other for one feature. Rejected: `domain/director` as its own thin domain (the
Agent-Port-Map's roleplay-mode suggestion) — the GAME director's data (secrets, clocks) is rpg
data; a general-roleplay director would be a different, future feature.)*

Satellite work in committed homes (additive, small):

| Home | Addition | Doc |
|---|---|---|
| `@orb/contracts/rpg` | NEW contracts module (views, tuples, bus events, tool result schemas) | 03 §12 |
| `@orb/contracts/events` | additive rpg members on the closed domain-event union | 05 §5 |
| `@orb/db/schema/rpg.ts` | the 14 tables | 03 |
| `@orb/kit/ids` | the rpg TypeID prefixes | 03 §0 |
| `kit/macro` registry | the 8 `rpg*` data-fed macros | 06 §1 |
| `domain/tool-use` | nothing structural — rpg registers via the existing registry API at compose | 05 §3 |
| `domain/workloads` | 8 new `WorkloadKind`s + runners + `WorkloadRpgEnv` on the runner-env | 06 §3 |
| `domain/chat` | NOTHING (three optional injected ops on `ChatContext`, wired at entry) | 05 §0 |
| `domain/world-info` | an `upsertEntries` bulk op exposed for injection (lorebook upkeep) | 06 §3 |
| packaged preset seed | the "RPG Game Master" preset (a seed asset, preset domain unchanged) | 06 §1 |
| `entry/compose` | the wiring: rpg service + chat ops + tool registration + workload env + bus | §4 |

## 2. The 8-slot layout

```
domain/rpg/
├── index.ts            FRONT DOOR — RpgService, createRpgService, RpgServiceDeps, bus surface, errors
├── service.ts          COMPOSITION ROOT — wires ~40 verb factories. Zero logic.
├── context.ts          DI BUNDLE — explicit `export interface RpgContext` (§3)
├── bus.ts              the rpg SSE bus + replay ring (05 §5) — ASSUMES(single-replica) annotated
├── contract/           (03 §12 — the full file list)
├── verbs/              one logical verb per file, grouped:
│   ├── game.ts             createGame · startGame · updateConfig · assignGmSeat (doc 12) · getGame/getHud/getTracker/… (reads)
│   ├── world-gen.ts        applyWorldGen · regenerateWorldGen (workload enqueue + apply)
│   ├── gather-turn-context.ts   the chat GATHER op (05 §1) — read-only assembly
│   ├── apply-tool-call.ts  the tool executor entry: dispatch table over the tool tuple (mapped-type
│   │                        Record — exhaustive-dispatch) → the owning verb per tool
│   ├── snapshot.ts         patchSnapshot · editSnapshot · onUserCommit · onTurnCompleted · resolve reads
│   ├── checks.ts           rollDice · resolveCheck (consequence application lives here) · requestCheck/resolvePendingCheck (the doc-12 handshake)
│   ├── time-weather.ts     advanceTime (+weather roll + encounter roll piggyback)
│   ├── party.ts            joinParty · patchPartyVolatile · patchInventory · recruitNpc · confirmCharacterDeath
│   ├── npcs.ts             upsertNpc · applyReputation
│   ├── clocks.ts           createClock · tickClock (staging rules 05 §2)
│   ├── quests-journal.ts   upsertQuest · addJournalEntry · listJournal/listQuests
│   ├── maps.ts             moveParty · addMapNode · getMap
│   ├── widgets.ts          widget CRUD · setWidgetValue
│   ├── sessions.ts         startSession · concludeSession · applySessionOutcome · flagSessionEnd · listSessions
│   ├── checkpoints.ts      save · restore · list · remove
│   ├── encounter-verbs.ts  startEncounter · encounterRound · attemptFlee · concludeEncounter · retractRound
│   ├── scenes.ts           planScene · createScene · concludeScene · abandonScene
│   └── imagery-verbs.ts    requestIllustration · generateNpcPortrait (enqueue) · offerChoices
├── persistence/        QUERIES ONLY — one file per table family:
│   ├── games.ts snapshots.ts (incl. resolveSnapshotForTurn ladder) npcs.ts party.ts clocks.ts
│   ├── journal.ts quests.ts maps.ts sessions.ts checkpoints.ts widgets.ts encounters.ts scenes.ts
│   └── (every JSON column parse-on-read through contract schemas — 03 §0)
├── substrate/          PURE (04): dice.ts check.ts combat.ts morale.ts reputation.ts clocks.ts
│   ├── time.ts weather.ts perception.ts encounter-roll.ts loot.ts map.ts elements.ts consequence.ts
│   ├── locks.ts            applyLockedPatch (03 §2.3)
│   ├── reminder.ts         the format-reminder builder (06 §2)
│   └── constants.ts        every table/tuple from 04
├── encounter/          NAMED SUBSYSTEM (07 §1): engine.ts blueprint.ts legality.ts summary.ts
├── imagery/            NAMED SUBSYSTEM (08 §2): prompts.ts references.ts cadence.ts
└── crew/               NAMED SUBSYSTEM (06 §3): one prompt+parse module per WorkloadKind
    ├── world-gen.ts session-distill.ts recap.ts director.ts lorebook-upkeep.ts
    ├── scene-plan.ts scene-distill.ts recruit-card.ts
    └── (each: buildMessages(inputs) pure + parsePayload(zod) — the workload RUNNER in
         domain/workloads/runners/ is a thin wrapper calling these through WorkloadRpgEnv)
```

## 3. `RpgContext` — the injected ops (one-way flow; wired at `entry/compose`)

```ts
export interface RpgContext {
  db: Db; clock: Clock; rng: Rng; newId: IdMint; log: Logger;
  emitBus: (e: RpgBusEvent) => void;                 // own bus
  emitDomainEvent: EmitDomainEvent;                  // the closed contracts/events bus (05 §5 mirror set)
  // cross-feature ops (types declared here; values wired at entry):
  chat: {
    forkChat: (p: ForkChatParams) => Promise<ForkChatResult>;          // scenes (07 §2)
    postNarratorMessage: (chatId, content, media?) => Promise<MessageId>; // recaps/summaries/illustrations
    setGroupConfig: (chatId, cfg) => Promise<void>;                    // narrator-mode at createGame (07 §3)
    setActivePreset: (chatId, presetId) => Promise<void>;
    kickParticipant / addCharacterToChat: …;                           // scene roster pruning, recruit
  };
  character: { getCard: …; create: … };              // sheets seeding, recruit promotion
  worldInfo: { upsertEntries: …; listEntryIndex: …; readConstantEntries: … };  // lorebook upkeep + world-gen canon
  imagery: { generatePicture: … };                   // 08
  assets: { readBytes: …; store: … };                // avatar references
  preset: { clonePackaged: (key: "rpg-gm", ownerId) => Promise<PresetId> };
  workloads: { start: … };                           // crew enqueue
  connection: { resolveChatCapability: (chatId) => Promise<ModelCapability> };  // tool-capable gate (05 §3)
  can: CanOp;                                        // the ONE authority seam (07 §3.1)
}
```

Chat-side (the mirror): `ChatContext` gains `rpg?: { gatherTurnContext, onUserCommit,
onTurnCompleted }` (05 §0). Workloads-side: `WorkloadRunnerEnv` gains `rpg: WorkloadRpgEnv`
(the crew's ops: read game/campaign slices, apply crew payloads, plus `agentTurn` — the sealed
`infra/providers` runner, buddy Option B) — declared in `domain/workloads/contract/runner-env.ts`,
built at entry like every other sub-env.

**Flow check (the physics):** rpg imports NO sibling domain; chat/workloads import NO rpg
internals; the client imports `@orb/contracts/rpg` only. Enforcers: package deps +
`domain-no-cross-feature` dep-cruiser + the 05 §8 byte-identity test.

## 4. One home per duped mechanic (the corpus-08 kill list, resolved)

| Mechanic (marinara homes) | THE home here | Everything else |
|---|---|---|
| dice (server ×2 + client ×1, three range policies) | `substrate/dice.ts` | client dice button calls `rollDice` verb; NO client roller |
| skill-check resolution + crit authority (server math + client tag-trust — TWO crit authorities) | `substrate/check.ts` | client renders the ToolCallRecord result |
| attribute modifier (server + client mirror) | `substrate/check.ts` | client displays server-computed modifiers in views |
| reputation tiers (server 7-tier + client 5-tier DRIFT) | `substrate/reputation.ts`; tier LABELS ship in views | client renders `view.tier` |
| tag grammar (client 1,124-line parser + 2 server mirrors + segment grammar ×3) | DELETED — tools + prose | the one client text-parse: its own `[dice:]` canonical format (08 §6) |
| element aura application (server resolver + client tag path that skipped reactions) | `substrate/elements.ts`, applied ONLY in `encounter/engine.ts` | — |
| inventory arithmetic (client-authoritative in marinara) | `verbs/party.ts` via snapshot patches | client drag-drop calls verbs |
| time formatting/phases (server service + client re-derivation) | `substrate/time.ts`; display strings in views | — |
| widget values (metadata bag mutated by tags + client timer ticking + list caps) | bindings + snapshot `widgetValues` (03 §8) | client interpolates timer display off `endsAt` only |
| macro engines (properly shared in marinara — the one non-dupe) | `kit/macro` (already the law) | — |
| token estimate (≥6 `ceil(len/4)` copies) | `@orb/kit/tokens` (already the law) | — |
| GM prompt assembly (`gm-prompts.ts` 1,312 lines) | the preset + `substrate/reminder.ts` + gather macros | — |
| structured-output repair (`jsonish.ts` + textual-tool-call parser) | `infra/providers` Tier-3b local-model polyfill (09 §polyfill) — NOT rpg code | rpg sees only valid-or-failed |

## 5. The `RpgService` surface (contract/service.ts, ~40 verbs)

Groups: **game lifecycle** (createGame, startGame, updateConfig, regenerateWorldGen, applyWorldGen);
**reads** (getGame, getHud, getTracker, getMap, getParty, listJournal, listQuests, listSessions,
listCheckpoints, getEncounter); **turn seam** (gatherTurnContext, onUserCommit, onTurnCompleted,
applyToolCall); **player/host actions** (rollDice, editSnapshot, joinParty, recruitNpc,
confirmCharacterDeath, widget CRUD, addJournalNote, checkpoint save/restore, startSession,
concludeSession, applySessionOutcome, scene plan/create/conclude/abandon, retractRound,
requestIllustration-force); **crew appliers** (applySessionDistill, applyDirectorPass,
applyRecruitCard — called by workload runners through the env, never by transport). The tRPC
router (`transport/trpc/routers/rpg.ts`) is a thin shim over the read + action groups; the turn
seam and crew appliers are NOT on the wire surface.

## 6. Test plan (shape level)

`test-presence`/`test-layout` per house law: every verb, every persistence module, every contract
schema, every substrate engine carries its mirror test. The two shape-specific gates:
the tool dispatch table is a mapped-type Record over the tool tuple (compile-time exhaustive);
`RpgContext`/`WorkloadRpgEnv` are explicit interfaces (`no-inline-types`).
