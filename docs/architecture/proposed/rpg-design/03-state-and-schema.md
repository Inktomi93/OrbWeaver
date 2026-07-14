---
kind: spec
status: active
updated: 2026-07-03
---

# 03 — State Model & Schema (every table, every contract, every semantic)

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** The complete persistence design for `domain/rpg`.
> Everything here is buildable from this doc alone: full DDL intent per table (columns/FKs/CHECKs),
> the zod contract schema for every JSON column, and the behavioral semantics (swipe keying, commit,
> locks, clone-forward) with their rationale. Marinara evidence: the archived research corpus (git history; tombstone at
> [`../rpg/`](../rpg/README.md)) + the deep-dive findings cited inline as `(marinara: …)` one-liners.

**The governing split (kept from marinara, typed in orbweaver):**

```
per SWIPE   → rpg_snapshots        volatile scene+party state, keyed by message_variants (D26)
per GAME    → rpg_games + satellites  campaign config/canon: real TABLES, never a metadata blob
per SESSION → rpg_sessions          the campaign heartbeat (summaries, resume points)
```

Marinara's Layer B was ~30 untyped `meta.game*` keys mutated from route handlers — every key below
gets a real column or table. **`chats.metadata` carries exactly ONE rpg key:** `rpg: { gameId }`
(a pointer for cheap "is this a game?" checks in chat's injected ops; the truth is `rpg_games.chatId`).

---

> **RIDER STATUS: the 14 tables + 14 brands ✓ LANDED 2026-07-09** (owner-authorized R1-subset). All 14
> tables are in `db/schema/rpg.ts` (rode the regenerated `0000_baseline`), every CHECK/XOR/RESTRICT/
> partial-unique DDL-verbatim; the 14 TypeID brands are in `@orb/kit/ids`; the MINIMAL `@orb/contracts/rpg`
> (enum tuples + the `$type<>` JSON-column schemas ONLY) backs the columns. Columns 03 defers to a later
> doc (`lootTable`→04 §5, `widgetValues`/custom-config→11-ui, `result`→04 §2, encounter `state`/`summary`→
> 07/R8) got DOCUMENTED CONSERVATIVE schemas (permissive typed blobs), tightened by their owning chunk. The
> `styleProfileId` design gap was fixed (brand minted — see §1.1 note). The domain leaf/verbs/views + the
> substrate goldens are R1-proper.

## 0. Schema file + conventions

CREATE `packages/db/src/schema/rpg.ts`, exported from the schema barrel, tables born into
`0000_baseline` (pre-launch squash rule, D50 precedent). Conventions (non-negotiable, house law):
TypeID text PKs with new prefixes registered in `@orb/kit/ids` (`rpggame_`, `rpgsnap_`, `rpgparty_`,
`rpgnpc_`, `rpgclock_`, `rpgjournal_`, `rpgquest_`, `rpgmap_`, `rpgsession_`, `rpgcheck_` (checkpoints),
`rpgpend_` (pending checks), `rpgwidget_`, `rpgenc_`, `rpgscene_`); integer ms timestamps `default(sql\`(unixepoch()*1000)\`)`;
enum columns derive from `@orb/contracts/rpg` tuples (never inline — `no-inline-union-redecl`);
per-type FKs only (D24); NO `ownerId` on any rpg table — authority derives through
`rpg_games.chatId → chat_participants` membership (D18/D20 discipline).

**Every JSON text column is `.$type<T>()`d to a contract type and is parse-on-read /
serialize-on-write through its zod schema in `domain/rpg/contract/`** — the single discipline that
deletes marinara's 413 raw `JSON.parse` + 324 casts (corpus 08). A failed parse is a typed
`RpgStateCorruptError`, never a silent default.

---

## 1. `rpg_games` — the campaign root (one per chat)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK `RpgGameId` | |
| `chatId` | text notNull FK → `chats.id` CASCADE, **UNIQUE** | one game per chat; the game dies with the chat |
| `status` | text notNull CHECK in `RPG_GAME_STATUSES` | `setup → ready → active → concluded` (marinara: the shared type omitted `ready` — the runtime had 4 states; we model all 4) |
| `sessionNumber` | int notNull default 1 | current session ordinal |
| `gmUserId` | text FK → `users.id` SET NULL, nullable | **the GM SEAT** (doc 12 §1 — authoritative). NULL = the AI holds the seat (narrator); non-null = that human participant is the GM. Host-assigned (`assignGmSeat`), audited |
| `gmPresetId` | text FK → `presets.id` SET NULL, nullable | **the game's GM voice** (02 §1.1 #1 — the domain-of-affect home; a chats-side preset binding is REJECTED, Nate 2026-07-02, "neo's sin"). Set by `createGame` after the packaged-preset clone; re-pointable via the game config verb; NULL/stale ⇒ turns degrade to the host's normal default preset. Consumed via `RpgGatherResult.presetOverride` (05 §1) |
| `config` | text(json) `RpgGameConfig` notNull | the session-zero wizard output (§1.1) |
| `worldOverview` | text notNull default `''` | player-visible world intro |
| `storyArcSecret` | text notNull default `''` | **HIDDEN** — GM-only narrative spine |
| `plotTwists` | text(json) `string[]` notNull default `[]` | **HIDDEN** — the twist bank |
| `artStylePrompt` | text notNull default `''` | unified visual style for all generated art (marinara: world-gen emits 20–40 words) |
| `activeMapId` | text FK → `rpg_maps.id` SET NULL | the one active map |
| `morale` | int notNull default 50 CHECK 0..100 | party morale (04 §7 — mechanically WIRED here, unlike marinara's dead `moraleDiceModifier`) |
| `activeState` | text notNull default `'exploration'` CHECK in `RPG_ACTIVE_STATES` | `exploration\|dialogue\|combat\|travel_rest` — gates prompt flavor + encounter/perception behavior |
| `lootTable` | text(json) `RpgLootTable` nullable | campaign-authored item tables (04 §5); null = built-in defaults |
| `lastIllustrationTurn` / `lastIllustrationSession` | int nullable | illustration-cadence bookkeeping (08 §3) |
| `createdAt` / `updatedAt` | int notNull | |

**Hidden-column rule (pillar P3):** `storyArcSecret` + `plotTwists` (and `rpg_clocks` rows with
`visibility='hidden'`, quest `gmNotes`, scene `scenario`) are projected ONLY into (a) the GM system
half of the prompt and (b) host-only read verbs. The member-facing `RpgGameView` contract type has
no fields for them — leak prevention is type-level, not filter-level. *(Enforcer: the view schema +
a contract test asserting the member view parse strips them.)*

### 1.1 `RpgGameConfig` (zod, `contract/config.ts`)

The setup-wizard product. CREATE as:

```ts
export const rpgGameConfigSchema = z.object({
  genres: z.array(z.string().min(1)).min(1).max(4),      // joined for prompts; "Fantasy, Horror"
  setting: z.string().max(2000).default("A fantasy world"),
  tones: z.array(z.string().min(1)).min(1).max(3),
  difficulty: z.enum(RPG_DIFFICULTIES),                   // ["casual","normal","hard","brutal"]
  rating: z.enum(["sfw", "nsfw"]),
  language: z.string().default("English"),
  playerGoals: z.string().max(2000).default("Have an adventure"),
  additionalPreferences: z.string().max(4000).default(""), // content limits / tropes / pacing
  gm: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("standalone") }),           // synthetic GM persona (default)
    z.object({ kind: z.literal("character"), characterId: typeIdSchema("char") }),
  ]),
  houseRules: z.object({                                   // NET-NEW: the mechanics dials (04)
    failForward: z.boolean().default(true),
    criticalRange: z.number().int().min(19).max(20).default(20),
    deathRule: z.enum(["defeat-only", "character-death"]).default("defeat-only"), // brutal ⇒ character-death allowed — DECIDED (D58): a kill ALWAYS requires per-death host confirm
    elementPreset: z.enum(RPG_ELEMENT_PRESETS).nullable().default(null),          // 04 §12; null = off — DECIDED (D58): ship-last-optional (R8b)
    playerRollsOwnChecks: z.boolean().default(false),                              // doc 12 §3 — flips the AI GM to the request/resolve handshake
  }).default({}),
  assist: z.object({                                    // doc 12 §4 — the AI's role at a HUMAN-GM table
    npcActors: z.boolean().default(false),
    recapOnSessionStart: z.boolean().default(true),
    lorebookUpkeep: z.boolean().default(false),
  }).default({}),
  imagery: z.object({
    enabled: z.boolean().default(false),
    autoIllustrations: z.boolean().default(true),
    useAvatarReferences: z.boolean().default(true),
    includeCharacterAppearance: z.boolean().default(true),
    promptInstructions: z.string().max(1200).default(""),
    styleProfileId: z.string().nullable().default(null), // DESIGN GAP FIXED: `StyleProfileId` brand minted 2026-07-09 (owner: no unbranded id strings) — the R1-subset uses `typeIdSchema(ID_PREFIX.styleProfile)`; the style-profile entity (imagery-owned) adopts it when it lands.
  }).default({}),
  lorebook: z.object({
    keeperEnabled: z.boolean().default(false),
    keeperBookId: typeIdSchema("wibook").nullable().default(null),
  }).default({}),
});
```

WHY these fields: they are the marinara wizard set (GAME_MODE.md — genre/setting/tone/difficulty/
goals/preferences/rating/language/GM-mode) minus what orbweaver homes elsewhere: **connections**
(the chat's connection + `resolveRole` own model choice — no `sceneConnectionId`/`imageConnectionId`
twins; rejected: per-purpose connection ids in game config, because connection is a `domain/connection`
concern), **party/persona pick** (the ROSTER is the party — 07), **generation params/preset**
(the preset system owns them — 09a), **Spotify/DJ keys** (dropped feature),
**custom HUD widgets** (real rows in `rpg_hud_widgets`, not a config blob).

---

## 2. `rpg_snapshots` — the per-swipe tracker (Layer A, upgraded)

One row per **message variant** that carries game-state changes. This is marinara's
`game_state_snapshots` re-keyed onto orbweaver's D26 variant model — the swipe axis is a REAL FK,
not a loose `swipeIndex` int.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK `RpgSnapshotId` | |
| `gameId` | text notNull FK → `rpg_games.id` CASCADE | |
| `messageId` | text notNull FK → `messages.id` CASCADE | (marinara: cascade was app-level; ours is a real FK) |
| `variantId` | text notNull FK → `message_variants.id` CASCADE, **UNIQUE** | THE swipe key. One snapshot per variant; delete-then-insert dedupe is dead |
| `clock` | text(json) `RpgClockTime` notNull | `{day:int≥1, hour:0-23, minute:0-59}` (04 §8) |
| `calendarDate` | text | freeform in-world date label ("3rd of Frostfall") |
| `location` | text notNull default `''` | |
| `weather` | text(json) `RpgWeather` nullable | `{type, temperatureC, description, wind, visibility}` (04 §9) |
| `presentCharacters` | text(json) `RpgPresentCharacter[]` notNull default `[]` | §2.1 |
| `recentEvents` | text(json) `string[]` notNull default `[]` | rolling beat list, max 12 entries (server-trimmed) |
| `partyState` | text(json) `RpgPartyVolatile[]` notNull default `[]` | §2.2 — per-member HP/pools/conditions/inventory (VOLATILE half; the sheet lives on `rpg_party`) |
| `widgetValues` | text(json) `Record<RpgWidgetId, RpgWidgetValue>` notNull default `{}` | custom-widget values (§8 — swipe-keyed so a swiped "the crowd turns on you" rewinds the meter) |
| `fieldLocks` | text(json) `Record<string, true>` nullable | §2.3 |
| `committed` | int notNull default 0 | §2.4 |
| `createdAt` | int notNull | |

### 2.1 `RpgPresentCharacter` (zod)

```ts
export const rpgPresentCharacterSchema = z.object({
  key: z.string().min(1),                 // SERVER-MINTED stable row id (nanoid) — the lock anchor
  characterId: typeIdSchema("char").nullable(),  // roster character, or null for an NPC
  npcId: typeIdSchema("rpgnpc").nullable(),      // rpg_npcs row, or null for a roster character
  name: z.string().min(1),
  emoji: z.string().default("🧑"),
  mood: z.string().default(""),
  appearance: z.string().nullable().default(null),
  outfit: z.string().nullable().default(null),
  thoughts: z.string().nullable().default(null),  // GM flavor; visible in tracker
  customFields: z.record(z.string(), z.string()).default({}),
}).refine(c => !(c.characterId && c.npcId), "characterId XOR npcId");
```

Dropped from marinara's 15-field shape: `action` (deprecated there), `avatarPath/avatarCrop/
portraitFocus*/portraitZoom` (avatars resolve at RENDER time via `characterId`→character avatar or
`npcId`→`rpg_npcs.avatarAssetId`; framing is client presentation, not game state), per-character
`stats` (a present NPC's combat numbers exist only inside an encounter — overworld NPC stats were
never used mechanically).

### 2.2 `RpgPartyVolatile` (zod) — the numbers that must be swipe-keyed

```ts
export const rpgPartyVolatileSchema = z.object({
  partyMemberId: typeIdSchema("rpgparty"),
  hp: z.object({ value: z.number().int(), max: z.number().int().min(1) }),
  pools: z.array(z.object({ name: z.string(), value: z.number().int(), max: z.number().int().min(1) })).default([]),
  conditions: z.array(z.object({ name: z.string(), stat: z.enum(["attack","defense","speed","hp"]).nullable(), modifier: z.number().int(), turnsLeft: z.number().int().min(1).nullable() })).default([]),
  inventory: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().default(""), quantity: z.number().int().min(0), location: z.string().default("on_person") })).default([]),
  status: z.string().default(""),          // freeform condition line ("exhausted, rope-burned")
});
```

WHY volatile-vs-sheet split: HP taken in a swiped message must rewind when the user swipes
(marinara got this right via snapshots); attributes/skills/class change only at session boundaries
(downtime), so they live on `rpg_party` (§4) un-swiped. Rejected alternative: everything on
`rpg_party` — breaks swipe-safety for HP/inventory; everything in snapshots — re-copies the static
sheet every turn for nothing.

**Fixes marinara's dead-attributes bug:** at `startGame`, `partyState` is SEEDED from each member's
sheet (`hp.max` full, pools full) — marinara never instanced card stats into `playerStats`
(`attributes` stayed null forever; skill checks silently used modifier 0). Our skill-check verb
reads attributes from `rpg_party.sheet` and volatile state from the snapshot — no dead fields.

### 2.3 Field locks — kept, with the mini-language DELETED by schema design

Marinara's lock system re-keys index-based lock paths on every write (`normalizeTrackerFieldLocksForState`,
~400 lines of `id:/name:/index:` ref grammar + URL-encoded segments + legacy migration). We keep the
FEATURE (a user pins a tracker cell; the model may not overwrite it; a locked row cannot be deleted
by the model) and delete the machinery by making every lockable row carry a **server-minted stable
`key`/`id`** (§2.1/§2.2 shapes). Lock keys are then plain dot-paths over stable ids:

```
scene.location · scene.clock · scene.weather · scene.calendarDate
characters.<key>.<mood|appearance|outfit|thoughts|custom.<field>>
party.<partyMemberId>.<hp|pools.<name>|status|inventory.<itemId>>
widgets.<widgetId>
```

Semantics (all enforced in ONE substrate function `applyLockedPatch(current, patch, locks)`,
golden-tested): a locked leaf keeps its current value against any tool write; a row whose subtree
holds any lock is **re-appended if a patch omits it** (locked-row resurrection — marinara's rule,
kept because "the model forgot my character exists" is the actual failure it guards); locks are
presence-only (`Record<string, true>`); UI unlock deletes the key. **No index refs → no migration
pass, no orphan re-keying.** Orphaned locks (path no longer resolves) are inert and swept
opportunistically on write.

**Manual overrides: DROPPED as a separate mechanism.** Marinara kept a 5-field `manualOverrides`
map with one-shot-vs-accumulate split semantics. In this design a user tracker edit IS a snapshot
write (`rpg.editSnapshot` verb, member-gated for own party row / host-gated for scene+others) that
**auto-locks the edited field** (a per-edit "keep unlocked" opt-out). Same user power — "my edit
survives the model" — one mechanism instead of two. Rejected alternative: port the override map —
double bookkeeping for the same intent; even marinara's own type doc lied about its semantics.

### 2.4 Commit + resolution (the swipe-safety contract)

- **Write path (clone-forward, kept):** the turn's tool executor lazily creates the snapshot row
  for the assistant variant being generated: clone ALL fields from the **resolution base** (below),
  then apply tool patches through `applyLockedPatch`. Only changed fields are ever sent by tools;
  everything else inherits. (marinara: `updateByMessage` clone-then-overlay — the load-bearing rule.)
- **Commit:** when a turn commits a NEW USER message, the engine's injected `rpg.onUserCommit` op
  sets `committed=1` on the snapshot of the last assistant message's **selected** variant
  (marinara: the single `commit()` call site — "lock in the state the user was seeing"). Session-seed
  and checkpoint-restore snapshots are born committed.
- **Resolution ladder** (`resolveSnapshotForTurn(gameId, opts)` in `persistence/`):
  1. regen/swipe of message M → the snapshot of M's currently-selected sibling variant (the swipe
     baseline), excluding M's own new variant;
  2. else the snapshot of the last visible assistant message's selected variant (what the user SEES);
  3. else latest committed by `createdAt`;
  4. else latest any.
  This collapses marinara's `preferLatestVisible`/`visibleAnchor`/exclude/fallback ladder into
  variant-pointer walks — the selected-variant pointer already encodes "visible".
- **Swipe select is a no-write:** flipping `selectedVariantId` flips which snapshot resolves. State
  rewinds with the swipe by construction.

**Reconciling the TWO swipe-state mechanisms (the D46 question, answered):** D46 runtime variables
are per-variant DELTAS folded along the selected chain; rpg snapshots are per-variant FULL STATE
resolved by the same pointer walk. Same principle (derive along `selectedVariantId`), two encodings
— deltas suit tiny scalar bags; full-row-with-clone-forward suits a large structured tracker where
folding hundreds of deltas per read would be silly and per-field inheritance is already explicit.
**Game state does NOT ride `message_variants` variable deltas**, and macro variables do NOT gain
game fields; the two systems stay separate with one shared story: *"swipe-scoped state keys on the
variant; the selected pointer is the truth."* (One deliberate touch point: `{{getvar}}` and rpg
macros coexist; an automation CEL predicate can read BOTH — 09b.)

---

## 3. `rpg_npcs` — the living cast

| Column | Type | Notes |
|---|---|---|
| `id` | text PK `RpgNpcId` | |
| `gameId` | text notNull FK CASCADE | |
| `name` | text notNull | unique-per-game enforced app-side with suffixing on generate |
| `emoji` | text notNull default `'🧑'` | |
| `description` | text notNull default `''` | |
| `descriptionSource` | text CHECK in `["model","library","narration","user"]` | provenance |
| `gender` / `pronouns` | text nullable | feeds portrait prompts (08) |
| `location` | text notNull default `'Unknown'` | |
| `reputation` | int notNull default 0 CHECK −100..100 | 04 §6 |
| `notes` | text(json) `string[]` notNull default `[]` | reputation-milestone + GM notes |
| `avatarAssetId` | text FK → `assets.id` SET NULL | generated portrait (08) — a CAS asset, not a loose file |
| `characterId` | text FK → `characters.id` SET NULL | set when the NPC is promoted/recruited from/to the library |
| `createdAt` / `updatedAt` | int notNull | |

## 4. `rpg_party` — party membership + the persistent sheet

The party IS the chat roster (07 §party); this table carries the game-mechanical overlay per
participating actor.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK `RpgPartyMemberId` | |
| `gameId` | text notNull FK CASCADE | |
| `characterId` | text FK → `characters.id` CASCADE, nullable | an AI companion (roster character) |
| `userId` | text FK → `users.id` CASCADE, nullable | a human player’s seat |
| — | CHECK `(characterId IS NULL) <> (userId IS NULL)` | XOR, mirrors `chat_participants` |
| — | UNIQUE(`gameId`,`characterId`) + UNIQUE(`gameId`,`userId`) | one seat per actor |
| `sheet` | text(json) `RpgSheet` notNull | §4.1 |
| `arc` | text(json) `RpgPartyArc` nullable | `{name, arc, goal, completed?, resolution?}` — the personal quest hook (world-gen output) |
| `provenance` | text CHECK in `["setup","recruited","joined"]` notNull | |
| `joinedSession` | int notNull | |
| `leftSession` | int nullable | leaving is a horizon, not a delete (memory-witnessing analogue) |

### 4.1 `RpgSheet` (zod) — instanced at setup from the card, evolved at session wrap

```ts
export const rpgSheetSchema = z.object({
  className: z.string().default("Adventurer"),
  shortDescription: z.string().default(""),
  attributes: z.object({ str: attr, dex: attr, con: attr, int: attr, wis: attr, cha: attr }), // attr = z.number().int().min(1).max(30)
  skills: z.record(z.string(), z.number().int().min(-5).max(15)).default({}),  // skill → modifier
  abilities: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  maxHp: z.number().int().min(1),
  poolDefs: z.array(z.object({ name: z.string(), max: z.number().int().min(1) })).default([]), // MP/Sanity/…
  speed: z.number().int().min(0).default(10),
  attack: z.number().int().min(0).default(5),   // encounter-engine baselines (04 §3)
  defense: z.number().int().min(0).default(5),
});
```

Seeding: `character.getCard` → the card's `RPGStatsConfig` extension when present (free-form
attribute names mapped onto the fixed six via the 04 §2 alias map), else world-gen proposes the
sheet (setup flow, 06). Humans get sheets seeded from their persona + wizard picks. Sheet EVOLUTION
happens only via `rpg.applySessionOutcome` (session-wrap workload proposes, host accepts — ±1–3
bumps, marinara's conservative card-evolution intent) — never mid-scene, never by a turn tool.

## 5. `rpg_clocks` — progress clocks (NET-NEW mechanic)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK `RpgClockId` | |
| `gameId` | text notNull FK CASCADE | |
| `name` | text notNull | "The Ritual Nears Completion" |
| `segments` | int notNull CHECK in (4,6,8,12) | Blades sizes |
| `filled` | int notNull default 0 CHECK `filled BETWEEN 0 AND segments` | |
| `kind` | text CHECK in `["front","project","countdown"]` notNull | front=threat, project=party effort, countdown=timer |
| `visibility` | text CHECK in `["visible","hidden"]` notNull default `'visible'` | hidden clocks are the GM's hand (P3) |
| `consequence` | text notNull default `''` | **HIDDEN** — what fires at full |
| `status` | text CHECK in `["active","completed","abandoned"]` notNull default `'active'` | |
| `createdAt` / `updatedAt` | int notNull | |

Filling to `segments` flips `status='completed'` and emits `rpg.clockCompleted` on the bus — the
director workload (06) and automation rules (09b) react; the GM narrates the consequence next turn
(it enters GATHER as a "fired consequence" system note).

## 6. `rpg_journal` + `rpg_quests`

`rpg_journal`: `id` PK, `gameId` FK CASCADE, `type` CHECK in
`["location","npc","combat","quest","item","event","note"]`, `title` text notNull, `content` text
notNull, `sourceMessageId` FK → `messages.id` SET NULL, `createdAt`. Dedup rules from marinara kept
as verb logic (same-title+content note upsert; 10s inventory-echo suppression is dropped — tool
calls don't double-fire like tag parsing did).

`rpg_quests`: `id` PK, `gameId` FK CASCADE, `name` notNull, `status` CHECK in
`["active","completed","failed"]`, `description` text default `''`, `objectives` text(json)
`{id,text,completed}[]` (stable ids — lockable), `gmNotes` text default `''` (**HIDDEN**),
`discoveredAt`, `resolvedAt` nullable. Quests are game-scoped rows, not snapshot fields (a quest's
existence isn't swipe-volatile; a swiped "quest complete!" is handled by the completion landing only
on user-commit — the `upsert_quest` tool writes `status` changes into the snapshot's pending patch
and the verb flushes them to `rpg_quests` at commit time; before commit the tracker shows the
snapshot's provisional view). *(This provisional-then-flush rule is the one subtle piece: spec'd in
05 §tool-writes; golden-tested.)*

## 7. `rpg_maps`

`id` PK, `gameId` FK CASCADE, `name` notNull, `kind` CHECK in `["grid","node"]`, `data` text(json)
`RpgMapData` (discriminated union), `createdAt`/`updatedAt`. Active map = `rpg_games.activeMapId`.

```ts
export const rpgMapDataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("grid"), width: z.number().int().min(2).max(12), height: z.number().int().min(2).max(12),
    cells: z.array(z.object({ x: z.number().int(), y: z.number().int(), emoji: z.string(), label: z.string(),
      terrain: z.string().default(""), revealed: z.boolean().default(false) })),
    partyPosition: z.object({ x: z.number().int(), y: z.number().int() }) }),
  z.object({ kind: z.literal("node"),
    nodes: z.array(z.object({ id: z.string(), emoji: z.string(), label: z.string(),
      x: z.number().min(0).max(100), y: z.number().min(0).max(100), revealed: z.boolean().default(false) })),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
    partyPosition: z.string() }),                       // node id
]);
```

`discovered` → **`revealed`** (fog of war, 01 §5 ADD): the member map view projects only revealed
cells/nodes (+ edges between revealed nodes); the host/GM view sees all. Node placement math
(farthest-point + 16-offset ring + clamp [8,92]) ports verbatim into `substrate/map.ts` (04 §11).
Movement stays narrative-synced (the map is a live diagram, not a board — marinara verdict); the
`move_party` tool does alias-match → reveal → position, plus an encounter roll (04 §13).

## 8. `rpg_hud_widgets` — definitions as rows, values as BINDINGS

`id` PK, `gameId` FK CASCADE, `type` CHECK in the 8-member `RPG_WIDGET_TYPES`
(`progress_bar|gauge|relationship_meter|counter|stat_block|list|inventory_grid|timer`), `label`
notNull, `icon` text, `position` CHECK in `["hud_left","hud_right"]`, `accent` text, `sort` int,
`binding` text(json) `RpgWidgetBinding`, `createdAt`.

```ts
export const rpgWidgetBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("party-hp"), partyMemberId: typeIdSchema("rpgparty") }),
  z.object({ source: z.literal("pool"), partyMemberId: typeIdSchema("rpgparty"), pool: z.string() }),
  z.object({ source: z.literal("clock"), clockId: typeIdSchema("rpgclock") }),
  z.object({ source: z.literal("reputation"), npcId: typeIdSchema("rpgnpc") }),
  z.object({ source: z.literal("morale") }),
  z.object({ source: z.literal("time") }), z.object({ source: z.literal("weather") }),
  z.object({ source: z.literal("custom"), config: rpgCustomWidgetConfigSchema }), // value/max/milestones/dangerBelow/items…
]);
```

WHY bindings beat marinara's mutable `gameWidgetState` bag: bound widgets can NEVER disagree with
the truth they display (HP widget reads the snapshot; clock widget reads the clock row) and need no
writes at all; only `source:"custom"` widgets have model-writable values, and those live in
**`rpg_snapshots.widgetValues`** — swipe-keyed, so the "Kingdom Wealth 50→47" write rewinds on
swipe. (marinara: widget values in chat metadata mutated by tags/scene-wrap = swipe-unsafe + a
second state home.) Blueprint cap: ≤4 model-authored widgets at setup (marinara's cap, keeps the
HUD legible); host can add more.

## 9. `rpg_sessions` — the campaign heartbeat

`id` PK, `gameId` FK CASCADE, `sessionNumber` int notNull, UNIQUE(`gameId`,`sessionNumber`),
`status` CHECK in `["active","concluding","concluded"]`, `summary` text(json) `RpgSessionSummary`
nullable (null until concluded), `startedAt`, `concludedAt` nullable.

```ts
export const rpgSessionSummarySchema = z.object({
  summary: z.string(),                 // 2-4 paragraph narrative recap
  resumePoint: z.string(),             // where the next session opens
  partyDynamics: z.string().default(""),
  partyState: z.string().default(""),
  keyDiscoveries: z.array(z.string()).default([]),
  characterMoments: z.array(z.string()).default([]),
  littleDetails: z.array(z.string()).default([]),
  npcUpdates: z.array(z.object({ name: z.string(), update: z.string() })).default([]),
  nextSessionRequest: z.string().nullable().default(null),  // the player's ask, captured at wrap
});
```

**Sessions do NOT create new chats.** Marinara forked a new chat per session (its chats had no
membership model); orbweaver keeps ONE game chat — a session boundary is a `rpg_sessions` row + a
narrator recap message + memory's own digesting (09f). Rejected alternative: chat-per-session —
fights D27 fork semantics, splinters membership/invites, and orbweaver memory already solves the
context-pressure problem sessions existed to patch.

## 10. `rpg_checkpoints`

`id` PK, `gameId` FK CASCADE, `snapshotId` FK → `rpg_snapshots.id` **RESTRICT**, `label` notNull,
`trigger` CHECK in `["manual","session_start","session_end","combat_start","combat_end"]`,
`createdAt`. A checkpoint is a POINTER (marinara's model, kept) — RESTRICT makes "restore silently
broken because the snapshot got deleted" a constraint error instead (marinara's documented bug).
Display context (location/time/weather) derives via join — no denormalized copies (derive-don't-stamp).
Marinara's `location_change`/`auto_interval` trigger enums had zero producers — not carried;
automation rules (09b) can create `manual` checkpoints if wanted. `restore` = clone the pointed
snapshot as a new committed snapshot on a fresh narrator message (locks preserved), restore
`activeState`; campaign tables are NOT rolled back (same as marinara — a checkpoint is a scene
bookmark, not a full save; the doc for the verb says so loudly).

## 10b. `rpg_pending_checks` — the check request/resolve handshake (doc 12 §3 — authoritative)

`id` text PK `RpgPendingCheckId` (`rpgpend_`), `gameId` FK CASCADE, `targetPartyMemberId` FK → `rpg_party.id` CASCADE, `skill` text
notNull, `dc` int CHECK 2..30, `advantage`/`disadvantage` int(bool), `reason` text, `requestedBy`
CHECK in `["gm-seat","gm-model"]`, `status` CHECK in `["pending","resolved","declined","expired"]`,
`result` text(json `RpgCheckResult`) nullable, `createdAt`, `resolvedAt` nullable. Partial unique
index: one `pending` row per `targetPartyMemberId`. Used by the human GM always; by the AI GM when
`houseRules.playerRollsOwnChecks` is on.

## 11. `rpg_encounters` + `rpg_scenes`

`rpg_encounters`: `id` PK, `gameId` FK CASCADE, `status` CHECK in
`["active","victory","defeat","fled","abandoned"]`, `round` int notNull default 0, `state`
text(json) `RpgEncounterState` (07 §2 — combatants/initiative/cooldowns/mechanics/log; zod'd),
`startedMessageId` FK SET NULL, `summary` text(json) `RpgCombatSummary` nullable, `createdAt`,
`endedAt` nullable. Partial unique index: **one `active` encounter per game**
(`uniqueIndex.on(gameId).where(status='active')` — the workloads single-active pattern).

`rpg_scenes`: `id` PK, `gameId` FK CASCADE, `forkChatId` FK → `chats.id` CASCADE, `status` CHECK in
`["active","concluded","abandoned"]`, `plan` text(json) `RpgScenePlan` (`{name, description,
scenario /*HIDDEN*/, firstMessage, participationGuide, characterIds[], rating}`), `summaryText` text
nullable, `createdAt`, `concludedAt` nullable. Fork/merge semantics: 07 §3.

---

## 12. Contract layout (`domain/rpg/contract/`) + view projections

```
contract/
├── service.ts      RpgService interface (02 §verbs)
├── config.ts       rpgGameConfigSchema · houseRules · RPG_DIFFICULTIES/RPG_ELEMENT_PRESETS tuples
├── state.ts        snapshot sub-schemas (§2.1-2.2) · lock path helpers · RpgClockTime · RpgWeather
├── campaign.ts     npc/party/sheet/arc/quest/journal/map/session/checkpoint/clock schemas
├── widgets.ts      RPG_WIDGET_TYPES · binding union · custom config
├── encounter.ts    RpgEncounterState + per-round envelopes (07)
├── scene.ts        RpgScenePlan + merge shapes (07)
├── tools.ts        the tool registry defs — name/description/JSON-schema/capability (05)
├── gather.ts       RpgGatherResult — what chat's GATHER receives (05)
├── views.ts        RpgGameView (member) · RpgGmView (host) · RpgHudView · RpgTrackerView · RpgMapView(member/host)
├── params.ts / results.ts / errors.ts
└── events.ts       RpgBusEvent union (05 §bus)
```

Cross-boundary (client-consumed) shapes — `RpgHudView`, `RpgTrackerView`, `RpgMapView`,
`RpgBusEvent`, the widget tuples, `RPG_DIFFICULTIES` — live in **`@orb/contracts/rpg`** (client
imports contracts, never `@orb/server`); domain-internal params/results stay in `domain/rpg/contract/`
(§7.4 homes rule). `@orb/db` imports the enum tuples from `@orb/contracts/rpg` (the D34 precedent).

**Two mandatory zod edges** (corpus 08 directive): persistence (every JSON column above) and the
LLM edge — every structured completion in 06 (setup/world-gen, session distill, director, encounter
init) parses through its contract schema with ONE bounded retry-on-invalid, then a typed failure
that surfaces as a Workload failure (NEVER a human repair modal; the Tier-3b local-model polyfill is
where lenient parsing lives — 09 §polyfill).

## 13. Test plan (state layer)

- **Round-trip per schema:** every zod contract parse⇄serialize round-trips (fixture per shape).
- **Swipe safety:** golden flow test — turn A writes HP 10→6 on variant V1; swipe creates V2 with
  HP 10→8; select V1 vs V2 flips resolved HP; user send commits the selected one only.
- **Resolution ladder:** 4 fixtures (regen-sibling / visible-selected / committed-fallback / any).
- **Lock semantics:** locked leaf survives patch; locked row resurrects after omission; unlock
  allows write; orphan lock inert.
- **Quest provisional-then-flush:** swiped quest completion never reaches `rpg_quests`.
- **Hidden-state projection:** member `RpgGameView`/`RpgMapView` parse strips
  secret/twists/hidden-clocks/gmNotes/unrevealed geometry (type-level + runtime test).
- **FK behavior:** chat delete cascades the whole game; checkpoint RESTRICT blocks snapshot delete.
- All deterministic (injected clock/ids — house `test-determinism` gate).
