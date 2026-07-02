# 07 — Sub-Engines: the Encounter Engine, Scenes, and Party Play

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** Three sealed subsystems. The governing template is
> marinara's ONE well-engineered subsystem — the turn-game framework (pure engine, engine-authored
> legality, seeded RNG, snapshot-anchored rewind, tool-call moves with deterministic fallback) —
> applied to combat; its two badly-engineered ones (the no-authority LLM combat sidecar; the
> metadata-blob scene machine) are replaced. Marinara evidence: the archived research corpus (git history; tombstone at
> [`../rpg/`](../rpg/README.md)) + the verified deep-dive (cited `(marinara: …)`).

---

## 1. ONE combat system (kills the dual-runtime split)

Marinara ran TWO combat runtimes off one blueprint endpoint: a roleplay "sidecar" where the LLM
resolved entire rounds with zero server math (HP/cooldowns/victory all prompt-enforced — verified
no-authority), and a game-mode path where the server resolved rounds deterministically. **Orbweaver
builds only the deterministic one** (`domain/rpg/encounter/` — a named subsystem):

```
encounter/
├── engine.ts        the round state machine (pure; consumes substrate/combat + elements + rng)
├── blueprint.ts     hydrate the model-authored blueprint → deterministic combatants
├── legality.ts      legal actions per actor per round (the turn-game lesson)
└── summary.ts       RpgCombatSummary builder + snapshot merge patch
```

### 1.1 Entry — the blueprint comes from the TURN, not a bespoke endpoint

The GM model calls `start_encounter` (05 §3 #17) with the fight DESIGN in the tool args
(schema-validated `RpgEncounterBlueprint`): enemies `{name, description, maxHp, attacks:
CombatAttackDef[], mechanics?: CombatMechanicDef[]}`, environment, `isBoss`. *(Rejected: marinara's
separate `/encounter/init` LLM call — a second 12k-token completion whose output the roleplay
consumer then mostly discarded; the in-turn GM already holds full context and D48 structured args
are the validated channel.)* Hydration (`blueprint.ts`, marinara's derivation kept as the default):
`level = f(maxHp)`, `attack = 9 + 2·level`, `defense = 4 + level`, `speed = 5 + level` unless the
blueprint overrides. Party combatants hydrate from `rpg_party.sheet` + the snapshot's volatile
state (current HP/pools/conditions carry INTO the fight — no free heal on encounter start; marinara
started at full HP, rejected: it erased attrition).

**Mechanic triggers — schema forbids what the engine doesn't run.** `CombatMechanicDef.trigger ∈
{round_interval, hp_threshold, on_hit}` — all three IMPLEMENTED. Marinara's type accepted
`on_attack|passive` and silently never fired them (verified) — the model was invited to design
dead rules; here un-runnable triggers are unrepresentable. `counterplay` is REQUIRED on boss
mechanics (the puzzle, not the sponge — 01 §5) and is surfaced to players in the encounter panel.

### 1.2 The round loop (one round per GM turn)

While `rpg_encounters.status='active'`, GATHER swaps the tool set (05 §3): `encounter_round`,
`attempt_flee`, `conclude_encounter`; the reminder adds the adjudication block (06 §2.4). Flow:

1. Players post declarations in plain prose ("I hurl the lantern at the oil slick").
2. The GM turn calls `encounter_round` with **typed per-member actions**
   (`{actorRef, action: attack|skill|item|defend, targetRef?, skillName?, itemRef?}` per living
   party member), mapping each human's declaration and choosing companion actions itself.
3. The server resolves the FULL round deterministically (04 §3: initiative → actions in order →
   boss mechanics → status ticks → element reactions when enabled) and returns the structured
   round result: per-actor outcomes (hit/miss/crit/damage/heal), mechanic firings (+ counterplay
   reminders), fallen actors, round number, and terminal flag (`victory|defeat` computed by the
   ENGINE, never declared by the model — marinara's sidecar let the model declare `combatEnd`,
   rejected).
4. The recursed model narrates the resolved numbers. State writes: `rpg_encounters.state` +
   the snapshot's `partyState` (lock-merged; HP/pools/conditions are swipe-keyed — a swiped round
   rewinds, because `rpg_encounters.state` snapshots per-round keyed by the message variant in
   `state.rounds[]`, and the resolution base follows the selected variant like everything else).
5. On terminal: the tool result INCLUDES the `RpgCombatSummary` (marinara's shape kept verbatim:
   outcome/rounds/party[hp,ko,statuses]/enemies[defeated,hp]/loot) — **the model narrates the
   aftermath in the SAME turn.** *(This deletes marinara's `[combat_result]`-as-next-user-message
   hack — the recurse loop IS the merge-back channel.)* Server side-effects: morale event
   (victory/defeat/boss/ally_lost), `combat_end` checkpoint, `grant_loot` eligibility,
   `activeState` back to exploration, `encounterEnded` bus event.

**Validation honesty:** action legality (`legality.ts` — MP affordability, cooldown
`round % cooldown === 0`, alive targets, one action per actor) is engine-enforced; an illegal arg
returns errors-as-data listing legal actions (the turn-game pattern: the model self-corrects or the
engine's deterministic fallback acts). **v1 trust note (FLAG, not stub):** the engine cannot verify
that the GM's mapping of a HUMAN's declaration matches what they typed — mitigations: the round
result echoes each mapped action to the encounter panel (players SEE the mapping), and any member
can `rpg.retractRound` before the next user send (host auto-approves own) which voids the round's
staged effects (a swipe of the GM message does the same for free). A per-player
declared-action-widget upgrade is reserved (10 §later).

`attempt_flee` = the 04 §3 group check. `conclude_encounter` is only legal post-terminal (returns
the summary again — idempotent).

### 1.3 Elements + dialogue cues

`houseRules.elementPreset` non-null ⇒ attacks/skills carry `element`; auras resolve inside
`engine.ts` round resolution ONLY (04 §12 — the one aura path). Marinara's `dialogueCues` (bark
scripts) are DROPPED — the in-turn GM narrates barks natively; a cue script is machinery for a
narrator you don't have in the loop, which we do.

## 2. Scenes — fork/merge over CHAT's fork (the standing lean, confirmed)

**DECISION: a scene = `chat.forkChat` (D27 deep copy) + an `rpg_scenes` row + room-overrides in
the fork.** rpg consumes chat's committed fork verb via an injected `chat.forkChat` op; it never
re-implements forking. *(Rejected: marinara's zero-copy scene chat + a 3000-char tail-truncated
context string — verified to lose almost all origin context at the boundary; orbweaver's deep copy
carries full history and the memory substrate regenerates lazily per D27. Rejected: adding a new
fork mode to chat — D27's copy semantics already fit; a scene needs no message-subtree axis.)*

Lifecycle (verbs, host-gated):

1. **`rpg.planScene(prompt?)`** — a small structured completion (inline in the verb via the
   injected `agentTurn`? NO — workload `rpg-scene-plan`, same crew rules) → `RpgScenePlan`
   (marinara's `SceneFullPlan` field design kept — verified good product spec: hidden `scenario`
   vs shown `description`, `participationGuide`, POV-locked `systemPrompt`, `rating`). The model
   may also PROPOSE a scene mid-turn via a `propose_scene` tool variant — v1 defers that tool;
   scenes are host-initiated (marinara's character-initiated `[scene:]` tag lived in conversation
   mode, out of game scope).
2. **`rpg.createScene(plan, participants)`** — `forkChat` → prune the fork's roster to the plan's
   participants (normal roster verbs) → write the plan's `scenario`+`systemPrompt` as the fork's
   **room overrides** (`scenario` + `main_prompt` — the committed host-only override mechanism,
   chat.md Part III §9; NSFW gating follows the plan's `rating`, fixing marinara's verified
   unconditional-NSFW-guidelines bug) → post `participationGuide` as a narrator message →
   `rpg_scenes` row (`status:'active'`). The ORIGIN chat gets a narrator "…slip away into a scene"
   line. The fork is a plain chat (game tools DON'T attach — a scene is roleplay inside the
   campaign, not a second game; `rpg_games.chatId` UNIQUE enforces this).
3. **`rpg.concludeScene`** — workload `rpg-scene-distill` (≤200-word past-tense summary — marinara
   temp/length spec kept) → origin narrator message *"X and Y returned… {summary}"* + snapshot
   `recentEvents` append + a journal `event` entry + optional `update_reputation`-equivalent NPC
   note; `rpg_scenes.status='concluded'`. The fork chat REMAINS (it's canon; memory digests it).
   *(Marinara appended unbounded `characterMemories` to card extensions — dropped; orbweaver's
   memory substrate is the recall system, and the summary message feeds it naturally.)*
4. **`rpg.abandonScene`** — status `abandoned`, origin cleanup line; the fork remains (host may
   delete the chat normally; RESTRICT nothing — `rpg_scenes.forkChatId` CASCADE cleans the row).

## 3. Party play — the roster IS the party (orbweaver's structural win)

No party machinery is built that chat doesn't already provide (comparison doc Part C: roster +
membership + arbitration + per-agent isolation are BUILT):

- **Players** = human `chat_participants` (invites/kick/handoff all standard). Each gets an
  `rpg_party` row (sheet from persona + wizard) on join-accept (`rpg.joinParty`, host-approved).
- **Companions** = character participants with `rpg_party` rows. Their VOICE is the GM's
  (narrator-mode output; the party-boundary reminder block) — marinara converged on the same
  design after its party-turn agent went vestigial (verified: zero client importers).
- **The GM turn** = a narrator-mode group turn: game chats set
  `GroupConfig{output:'narrator'}` at `createGame` — the landed narrator arm is `.strict()` and
  OMITS `cardScope` (`narrator ⇒ merged` is enforced by shape; a literal `cardScope` on that arm
  is REJECTED at parse — design-review RPG-3); narrator turns are
  authored by the synthetic group character (never NULL — chat Part III §10), which makes the GM
  a real authoring identity for memory/attribution for free.
- **Arbitration**: humans post freely (never scheduled); the GM responds via normal narrator
  arbitration. Multi-human pacing needs no new machinery: multiple player posts between GM turns
  simply all sit in history (chat serializes via the lock; the GM addresses them together —
  actually BETTER than round-robin for a table).
- **Recruiting an NPC** (`rpg.recruitNpc`, host verb): promotes an `rpg_npcs` row → a real
  `characters` card (via injected `character.create` op) → roster add → `rpg_party` row
  (`provenance:'recruited'`). Sheet/card generation: workload `rpg-recruit-card` — STEAL
  marinara's brief (*"Ground the card in the existing campaign state… Respect the supplied card as
  canon"*) INCLUDING its secrets-in/one-card-out trick (06 §6). Removal = roster leave +
  `rpg_party.leftSession` stamp (history preserved; memory witnessing handles recall).

### 3.1 The `can()` matrix (rpg's half of the auth spine)

> **Seat amendment (doc 12 §2 — authoritative where they differ):** the matrix below predates the
> GM SEAT. Doc 12 splits the "host" column into **GM seat** (narrative authority — snapshot/clock/
> NPC/map/encounter/scene/loot verbs + their tool twins) vs **host** (room/config authority —
> config, sessions, checkpoints, seat assignment, death confirm, recruit, world-gen), and re-keys
> GM-eyes reads to the seat holder (host only while the seat is NULL). Rows below not named by
> doc 12 §2 stand unchanged.

Every rpg verb routes `can(principal, action, {kind:'chat', roster})` — membership from
`rpg_games.chatId`; no rpg-private auth code (the committed chat `can()` seam):

| Action | Authority |
|---|---|
| createGame · startGame · start/concludeSession · applySessionOutcome · checkpoint save/restore · create/edit clocks · widgets CRUD · scene verbs · recruitNpc · confirmCharacterDeath · edit game config · regenerate world-gen | **host** |
| editSnapshot on OWN party row (+ lock toggles) · joinParty (accept) · queue dice (`rollDice`) · add `note` journal entries · read member views (HUD/tracker/map-revealed/journal/quests) | **member** |
| read GM views (secrets, hidden clocks, full map, gmNotes) | **host** |
| tool execution (model-emitted) | runs as `runAsUserId` (host) — the registry capability entry is `can(host,…)`; the propose-don't-dispose ceilings are the HOST-CONFIRM verbs (session end, character death, sheet evolution) |

Enforcement: the default-deny enforcer list (chat.md Part III §11) extends to every `rpg.*`
chatId-bearing verb + the `rpg.stream` subscription (host-stream vs member-stream split — 05 §5).

## 4. Test plan

- **Encounter engine goldens** (seeded RNG): full-round fixtures (initiative order incl. skips,
  each action type, defend interactions, all 3 mechanic triggers, DoT ticks, terminal detection
  both ways, flee success/failure, element reactions per preset when enabled); blueprint hydration
  fixtures; legality table per state.
- **Swipe-rewind:** a swiped `encounter_round` GM message rewinds `state.rounds` + partyState.
- **Scene flow:** fork → roster pruned → overrides set → conclude → origin message + journal +
  recentEvents; rating gates the override text; abandoned scene leaves origin clean.
- **Party:** narrator turns authored by the group character; recruit round-trip (npc→card→roster→
  party row); leftSession stamps; the auth matrix as a table-driven `can()` test (every verb ×
  role → allow/deny, default-deny asserted).
