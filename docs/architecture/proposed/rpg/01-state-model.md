# 01 — The RPG State Model

> The most misunderstood part of the system, and the one the port hinges on. Marinara keeps RPG state
> in **two very different layers**. Conflating them (as "untyped JSON in metadata") is the mistake to
> avoid.

---

## Layer A — Per-turn scene state: the `game_state_snapshots` TABLE

A real relational table (`packages/server/src/db/schema/game-state.ts`), one row per
`(messageId, swipeIndex)`. **Typed scalar columns**, with the nested/complex parts held as JSON-text
columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `chatId` | text notNull | |
| `messageId` | text notNull | FK → `messages.id`, cascade handled **in app code**, not DB |
| `swipeIndex` | int notNull default 0 | **State is keyed per swipe** (regeneration variant), not just per message |
| `date`, `time`, `location`, `weather`, `temperature` | text (nullable) | Real scalar columns — queryable |
| `presentCharacters` | text notNull default `"[]"` | JSON array of `PresentCharacter` |
| `recentEvents` | text notNull default `"[]"` | JSON array of strings |
| `playerStats` | text (nullable) | JSON `PlayerStats` |
| `personaStats` | text (nullable) | JSON `CharacterStat[]` |
| `manualOverrides` | text (nullable) | JSON `{ fieldName: userSetValue }` — user edits that survive agent regeneration |
| `fieldLocks` | text (nullable) | JSON tracker-field lock map — which cells the agent may not overwrite |
| `committed` | int notNull default 0 | 0 = tentative (current swipe), 1 = locked in once the user sent a follow-up |
| `createdAt` | text notNull | |

So the scene tracker (where/when/who/HP/quests) is **structured and swipe-versioned**. This layer is
in decent shape and maps cleanly to an Orbweaver `persistence/` table.

### The storage repo (`game-state.storage.ts`, `createGameStateStorage(db)` — 16 methods)

Reads (the read surface is large because state resolution has to respect swipes + commit + message
visibility):

- `getLatest`, `getById`, `getLatestCommitted`
- `getForGeneration(chatId, options)` — the important one: resolves *which* snapshot feeds the next
  turn, honoring `preferLatestVisible` / `visibleAnchor.messageId`, falling back
  latest-committed → latest-any.
- `getLatestExcludingMessage`, `getLatestCommittedExcludingMessage` (for regen)
- `getByMessage(messageId, swipeIndex=0)`, `getByChatAndMessage`
- `getLatestForMessages`, `getLatestCommittedForMessages`, `getCommittedForMessages` (batch, for
  rendering a transcript with per-message state)

Writes:

- `create(state, manualOverrides?)` — inserts a new row; **dedupes on `(messageId, swipeIndex)`**.
- `updateLatest(...)` / `updateByMessage(...)` — see the two-path semantics below.
- `commit(id)` — flips `committed = 1`.
- `deleteForChat(chatId)` — cascade cleanup (app-level, since the FK cascade isn't in the DB).

### The two write paths (this is subtle — preserve it)

`updateByMessage` branches:

1. **Row exists for that `(messageId, swipeIndex)`** → `_applyUpdate` mutates it **in place**
   (`db.update(...).set(...)`).
2. **No row yet** → build a `baseState` by **cloning the latest snapshot** (carry forward
   `date/time/location/weather/temperature/presentCharacters/recentEvents/playerStats/personaStats/fieldLocks`),
   apply the incoming `fields` on top, and `create` a new row.

That "clone-forward then overlay" is how state persists across turns without the agent restating
everything — only changed fields are sent; everything else inherits from the prior snapshot.

### Manual overrides — one-shot vs accumulated (a real semantic difference)

`MANUAL_OVERRIDE_FIELDS` is a whitelisted subset of fields a user can hand-edit. The two paths treat
them differently:

- **Create path (new row):** overrides are **one-shot** — only the overrides from *this* edit are
  attached to the new snapshot; they are visible to the agent as the prev-snapshot values but are not
  carried into future rows automatically.
- **In-place path (`_applyUpdate`):** overrides **accumulate/merge** — stored overrides are read,
  then per field: a non-empty value **sets** the override, an empty/null value **deletes** it (so the
  agent is allowed to update that field again).

### Field locks migrate with state shape

`fieldLocks` isn't a static map — on every write, `normalizeTrackerFieldLocksForState(locks,
buildLockMigrationState(state))` re-keys the locks against the current tracker shape (so a lock on a
stat that got renamed/removed doesn't dangle). Any port must reproduce this or locks silently rot.

**Port note:** this layer is close to Orbweaver-shaped already. The work is (a) give the JSON-text
columns real contract schemas at the persistence boundary, (b) decide whether "clone-forward" belongs
in the repo or in a `domain/rpg` verb, (c) keep swipe-indexing + the commit flag + lock-migration
intact.

---

## Layer B — Campaign / config / journal: the `chats.metadata` UNTYPED BLOB

Everything that isn't per-turn scene state lives as ad-hoc keys on the `chats.metadata` JSON column,
read via `parseMeta(chat)` and mutated by hand-rolled helpers in `game.routes.ts`. **There is no
`GameMeta` interface** — the shape is emergent. This is the real "untyped state sprawl."

The ~30 game-layer keys actually written (grep-verified, `meta.game*`):

| Group | Keys |
| --- | --- |
| Session lifecycle | `gameSessionNumber`, `gameSessionStatus`, `gameSessionPreviousSummaries` (`gamePreviousSessionSummaries`), `gameActiveState` |
| Setup / blueprint | `gameSetupConfig`, `gameBlueprint`, `gameSystemPrompt`, `gameSpecialInstructions`, `gameWorldOverview` |
| Party / cast | `gamePartyCharacterIds`, `gameCharacterCards`, `gameNpcs`, `gamePartyArcs` |
| World / map | `gameMap` (array of `GameMap`, one active via id), `gameTime`, `gameWeather` |
| Narrative | `gameStoryArc`, `gamePlotTwists`, `gameJournal`, `gameMorale`, `gamePlayerNotes` |
| HUD | `gameWidgetState` (HUD widget defs + values) |
| Image config | `gameImageConnectionId`, `gameSceneConnectionId`, `gameImageAutoGenerationEnabled`, `gameImagePromptInstructions`, `gameImageUseAvatarReferences`, `gameImageIncludeCharacterAppearance`, `gameLastIllustrationTurn`, `gameLastIllustrationSessionNumber` |
| Lorebook-keeper | `gameLorebookKeeperEnabled`, `gameLorebookKeeperLorebookId` |

Mutation helpers (all in `game.routes.ts`, i.e. transport tier — a tier violation):
`parseMeta`, `buildHydratedGameMeta`, `withActiveGameMapMeta`, `getGameMapsFromMeta`, `getGameMapId`,
`ensureGameMapId`, `sanitizeGameHudWidgets`, `reconcileGamePartyCharacterIds`,
`syncSetupConfigPartyIds`, `mergeGameInventoryItems`, `mergeRecruitIntoGameMetadata`,
`removeMemberFromGameMetadata`.

**Port note:** this is where the rigor is needed. Layer B should be decomposed into typed
sub-contracts (a `Campaign`, a `Journal`, a `MapSet`, a `HudState`, an `ImageConfig`, a `PartyRoster`)
with their own persistence, not one opaque `metadata` bag mutated from the route handlers. The
per-key list above is the decomposition worklist.

---

## The split, at a glance

```
                 ┌─────────────────────────────────────────────┐
   per TURN  →   │ game_state_snapshots  (TABLE, swipe-indexed) │  scene tracker: where/when/who/HP/quests
   (structured)  │   typed cols + JSON-text sub-fields          │  + manualOverrides + fieldLocks + committed
                 └─────────────────────────────────────────────┘
                 ┌─────────────────────────────────────────────┐
   per GAME  →   │ chats.metadata.game*  (UNTYPED BLOB)         │  campaign/setup/party/maps/journal/HUD/
   (sprawl)      │   ~30 ad-hoc keys, no schema, route-mutated  │  morale/plot/image-config/lorebook-keeper
                 └─────────────────────────────────────────────┘
```

Two layers, two very different port strategies. Do not flatten them into one "state" story.
