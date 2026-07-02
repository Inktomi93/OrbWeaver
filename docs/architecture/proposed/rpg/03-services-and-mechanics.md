# 03 — `services/game/` Inventory & Deterministic Mechanics

> 26 files, 7,559 lines, **109 exported functions**. This is the reusable engine layer — the part
> worth porting most faithfully, because it's mostly pure server-side math with no LLM and no HTTP.
> Constants below are line-verified.

---

## File inventory (by size)

| File | Lines | Exports | Role |
| --- | --- | --- | --- |
| `gm-prompts.ts` | 1312 | 10 | GM prompt assembly (system-prompt world-state block + user-message "format reminder"). The concatenation GATHER/BUILD replaces. |
| `game-asset-generation.ts` | 1012 | 20 | RPG-owned image generation (NPC portraits, backgrounds, scene illustrations). See [`05`](05-generative-pipeline.md). |
| `combat.service.ts` | 749 | 10 | Deterministic combat: initiative, attack/defense, status effects, skills. |
| `element-reactions.service.ts` | 524 | 9 | Elemental "aura gauge" reaction system (Genshin/HSR-style presets). |
| `segment-edits.ts` | 499 | 3 | Apply user edits to transcript segments before prompt assembly. |
| `journal.service.ts` | 428 | 13 | Structured journal: locations/NPCs/combat/quests/inventory/events/notes. |
| `map-position.service.ts` | 386 | 11 | Grid/node position math + movement validation. |
| `asset-manifest.service.ts` | 288 | 7 | Scans `game-assets/` dir → manifest of background/music/ambient tags the model picks from. |
| `jsonish.ts` | 251 | 2 | Structured-output auto-repair (`parseGameJsonish`, `jsonishLooksTruncated`). See [`05`](05-generative-pipeline.md)/[`07`](07-port-map.md). |
| `loot.service.ts` | 241 | 6 | Difficulty-weighted loot tables. |
| `skill-check.service.ts` | 213 | 6 | d20 skill checks + attribute modifiers. |
| `weather.service.ts` | 208 | 7 | Biome+season weather progression. |
| `reputation.service.ts` | 199 | 6 | −100..100 reputation + milestone tiers. |
| `sprite.service.ts` | 189 | 6 | Character/party sprite listing + full-body sprite selection. |
| `encounter.service.ts` | 176 | 5 | Random-encounter rolls (`rollEncounter`, `rollEnemyCount`, `inferLocationDanger`). |
| `perception.service.ts` | 149 | 5 | Passive perception + clue injection. |
| `morale.service.ts` | 115 | 7 | Party morale events. |
| `party-prompts.ts` | 113 | 2 | Party-turn (NPC companion) prompt builder. |
| `session.service.ts` | 104 | 2 | Session number/status helpers. |
| `time.service.ts` | 92 | 8 | Action→clock advance. |
| `checkpoint.service.ts` | 92 | 4 | Save/load/list snapshots as checkpoints. |
| `session-summary-normalization.ts` | 46 | 2 | Normalize stored session summaries. |
| `dice.service.ts` | 43 | 3 | Dice-notation parser/roller. |
| `map.service.ts` | 42 | 1 | Map helpers. |
| `npc-avatar-utils.ts` | 41 | 3 | NPC avatar URL sanitize/fallback. |
| `state-machine.service.ts` | 21 | 2 | State-transition validation. |

---

## The deterministic mechanics (verified formulas — port these first)

These have **no LLM and no HTTP** — pure functions, unit-testable, highest-confidence port. The
design principle (server owns all math; the LLM only narrates the outcome) is the load-bearing idea to
keep.

### Dice (`dice.service.ts`)
- Notation regex: `/^(\d+)?d(\d+)([+-]\d+)?$/i` — standard `XdY+Z`.
- `rollDice(notation)`, `isDiceNotation(value)`.

### Attributes & skill checks (`skill-check.service.ts`)
- **Attribute modifier** (classic D&D): `attributeModifier(score) = Math.floor((score - 10) / 2)`.
- Skill check: `d20 + skillModifier + attributeModifier` vs a DC; `getGoverningAttribute` maps a
  skill → its attribute.

### Passive perception (`perception.service.ts`)
- `passivePerception = 10 + perceptionMod + floor((wisdomScore - 10) / 2)`.
- On beating a danger-table DC, injects up to **two** `<clue>` XML tags into GM context for organic
  narration. (Prior draft said "+ Perception Stat"; it's a perception *modifier*, not a raw stat.)

### Time (`time.service.ts`)
- Action → minutes advanced. Verified: `explore: 30`, `rest_long: 480` (8h). Deterministic clock, no tokens.

### Weather (`weather.service.ts`)
- `inferBiome(location)` → `generateWeather(biome, season)` → `shouldWeatherChange(...)`. Heuristic, deterministic.

### Combat (`combat.service.ts`)
- Initiative = `max(0, speed + speedModifier)`; effective-speed turn order.
- Turn-skip statuses: `frozen`, `stunned`, `imprisoned`.
- Status effects carry `{ stat: attack|defense|speed|hp, turnsLeft }`, `turnsLeft = max(1, duration||2)`, stack via `max`.
- Heal = `max(1, floor((attack + level*2) * max(skill.power, 0.5)))`; MP spent per skill.
- `resolveCombatRound` is the round loop; the LLM narrates the resolved numbers.

### Elemental reactions (`element-reactions.service.ts`)
- "Aura gauge" with swappable presets (Genshin/HSR-style). Elements incl. `fire`, `poison`, `holy`,
  `shadow`, `lightning`; map onto `attack`/`defense`/`hp` stat effects. `listElementPresets` /
  `getElementPreset`.

### Loot (`loot.service.ts`)
- Difficulty-weighted rarity tables (`common..legendary`). Verified brutal tier:
  `{ common:20, uncommon:25, rare:30, epic:18, legendary:7 }`. Difficulty bonus:
  `{ casual:0, normal:0, hard:1, brutal:2 }`. Rolled server-side.

### Reputation & morale (`reputation.service.ts`, `morale.service.ts`)
- Reputation tracked −100..100; `processReputationActions` applies deltas from LLM-emitted
  `[reputation: npc=… action=…]` tags, fires milestone tiers on crossings. Morale = party-level events.

### Encounters (`encounter.service.ts`)
- `inferLocationDanger(location)` → `rollEncounter(action, difficulty, location)` + `rollEnemyCount(partySize, difficulty)`.

### Maps (`map-position.service.ts`, `map.service.ts`)
- Grid `{x,y}` or node-graph position; movement validation; discovery flags.

---

## The non-deterministic / prompt layer (needs the GATHER/BUILD rewrite)

- **`gm-prompts.ts`** (1312 lines) — assembles the GM context: long-term world state
  (`<weather_update>`, `<party_morale>`, `<story_arc_secret>`) into the **system prompt**; strict format
  rules + current HUD state into the **final user message** ("format reminder", recency bias). This
  ad-hoc string assembly is exactly what GATHER (collect) + BUILD (slot deterministically) replace.
- **`party-prompts.ts`** — the `/party-turn` NPC-dialogue prompt.
- **`segment-edits.ts`** — applies user transcript edits before prompt assembly (a GATHER-phase concern).

**Port note:** split this layer sharply. The deterministic mechanics become `domain/rpg`
`substrate/` pure functions (drop-in, add contract schemas + golden tests). The prompt builders do
**not** port as-is — their output is produced by the chat pipeline's GATHER/BUILD, with RPG state
contributed as a GATHER source.
