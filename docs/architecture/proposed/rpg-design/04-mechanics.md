# 04 — The Deterministic Mechanics Rulebook (`domain/rpg/substrate/`)

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** The complete house rules. Every function here is PURE
> (zero I/O, zero LLM, injected `Rng` + clock), lives in `domain/rpg/substrate/`, and ships with
> golden tests. Where a marinara formula was sound it ports verbatim (cited); where the deep-dive
> flagged a balance landmine it is REDESIGNED here with the rejected original named. The model never
> executes any of this — it requests via tools (05); the server resolves; the model narrates.
>
> **RNG rule (house `test-determinism` gate):** every roll goes through an injected
> `Rng { int(minIncl, maxIncl): number; pick<T>(arr): T; chance(p): boolean }`. Marinara used raw
> `Math.random()` everywhere — that is the one cross-cutting fix applied to every port below.
> Production wires a CSPRNG-seeded Rng at compose; goldens wire a seeded PRNG.

File map (one engine per file): `dice.ts` · `check.ts` · `combat.ts` · `morale.ts` ·
`reputation.ts` · `clocks.ts` · `time.ts` · `weather.ts` · `perception.ts` · `encounter-roll.ts` ·
`loot.ts` · `map.ts` · `elements.ts` · `consequence.ts`. All constants exported from
`substrate/constants.ts` grouped per engine (no magic numbers inline).

---

## 1. Dice (`dice.ts`) — ONE implementation (kills the 3-way dupe)

Marinara had three `rollDice` with three range policies (server clamp / tool reject / client
uncapped — corpus 08 + deep-dive §DUPES). ONE home, the strict policy:

- Notation: `/^(\d+)?d(\d+)([+-]\d+)?$/i` — `NdM±K`. `N` default 1.
- **Validation, not silent clamping** (the tool-executor policy wins): `1 ≤ N ≤ 100`,
  `2 ≤ M ≤ 1000` (d1 is illegal — it's not a die), `|K| ≤ 1000`. Violations return a typed
  `InvalidNotationError`; a tool call gets it as an error result and the model self-corrects.
  *(Rejected: marinara's silent clamp — a "roll 9999d9999" quietly becoming 100d1000 lies to the
  narrator.)*
- `rollDice(rng, notation) → { notation, rolls: number[], modifier, total }`.
- No advantage/exploding/keep-highest at the dice layer — advantage is a CHECK-level concept (§2).
  The client has NO dice implementation; `/roll`-style surfaces call the verb (08).

## 2. Skill checks (`check.ts`) — degrees of success + fail-forward (the core upgrade)

### 2.1 Inputs

```ts
resolveCheck(rng, input: {
  sheet: RpgSheet;                         // the actor's persistent sheet (03 §4.1)
  skill: string;                           // normalized: strip _check|_ability_check|_saving_throw|_save suffixes (marinara rule)
  dc: number;                              // model-proposed, server-clamped 2..30
  advantage?: boolean; disadvantage?: boolean;
  preRolledD20?: number;                   // the player's queued roll (§2.5); ignores adv/dis when present (marinara rule)
  moraleTier: RpgMoraleTier;               // §7 — the dead hook, WIRED
  failForward: boolean;                    // houseRules
}) → RpgCheckResult
```

- `attributeModifier(score) = Math.floor((score - 10) / 2)` *(marinara/5e, verbatim)*.
- Governing attribute via `SKILL_ATTRIBUTE_MAP` *(marinara table, port verbatim)*: str→athletics;
  dex→acrobatics, sleight_of_hand, stealth; con→endurance; int→arcana, history, investigation,
  nature, religion; wis→animal_handling, insight, medicine, perception, survival; cha→deception,
  intimidation, performance, persuasion; each raw attribute name/abbreviation maps to itself;
  fallback `int`.
- `modifier = (sheet.skills[skill] ?? 0) + attributeModifier(governing) + MORALE_DICE_MODIFIER[moraleTier]`.
  Marinara defined `moraleDiceModifier` (inspired +2 / high +1 / steady 0 / low −1 / broken −2) and
  never called it — here it is a real term, which is what makes the morale HUD widget worth watching.

### 2.2 Roll + bands

d20 (twice for advantage→max / disadvantage→min; `preRolledD20` short-circuits both).
`total = usedRoll + modifier`. The band (**this replaces marinara's flat 4-outcome model** —
rejected because sub-DC = "nothing happens" is the dead-air failure mode):

| Band | Condition (evaluated top-down) |
|---|---|
| `critical_success` | natural ≥ `houseRules.criticalRange` (default 20), OR `total ≥ dc + 10` |
| `success` | `total ≥ dc` |
| `partial` | `failForward` AND `total ≥ dc − 3` — success **at a cost** |
| `failure` | `total < dc − 3` (or `< dc` when failForward off) |
| `fumble` | natural 1 (overrides all) — failure + a hard consequence |

### 2.3 Fail-forward consequences (`consequence.ts`)

`partial | failure | fumble` ALWAYS attach a server-selected consequence directive so the story
moves (PbtA rule, 01 §2). Deterministic priority pick over the game's live state:

```
pickConsequence(state, band):
  1. an ACTIVE HIDDEN front clock exists       → { kind:"tick-clock", clockId, ticks: band==="fumble" ? 2 : 1 }
  2. an ACTIVE VISIBLE front clock exists      → same, visible (the players SEE the cost)
  3. band !== "partial" and a countdown exists → tick the countdown
  4. actor has a pool with value > 0           → { kind:"cost", pool, amount: 1 } (resource strain)
  5. otherwise                                 → { kind:"complication" }  (directive-only: model invents a new pressure fact)
Plus always: { timeCost: minutes } — partial 15 / failure 15 / fumble 30 (rides advance_time, §8).
```

The tool result carries `{ band, rolls, usedRoll, modifier, total, dc, consequence }` and the model
is instructed (06 §format) to narrate the consequence concretely. Clock ticks are applied by the
verb (server-side) BEFORE the model narrates — the model describes a fact, never decides it.

### 2.4 DC discipline

The model proposes the DC using the prompt ladder *(marinara's instruction text — steal verbatim:
"choose the DC fairly: 5 trivial, 10 routine under pressure, 15 hard, 20 desperate; abandon
positivity bias; roll honestly; narrate the consequence in the same turn")*; the server clamps to
2..30. *(Rejected: server-assigned DCs from a danger table — it makes every locked door identical;
the GM model pricing difficulty IS its judgment call, bounded by the clamp + visible ladder.)*

### 2.5 Player-queued rolls (kept — marinara's best input UX)

A player may queue dice in the composer (08); the send verb rolls them server-side and appends
`[dice: 2d6 = 9 (4,5)]` to the message text; GATHER flags `playerRolledDice=true`, which switches
the format-reminder variant to "use the player's roll as the base" (06). The `skill_check` tool then
passes it as `preRolledD20`. Same-turn feed-forward, zero trust in the model's arithmetic.

## 3. Overworld combat (`combat.ts`) — kept structure, fixed math

Overworld combat = quick inline scuffles resolved in narration (a single `resolve_combat_round`
tool). The STRUCTURED encounter engine (initiative UI, boss mechanics) is 07 — it consumes these
same primitives.

- **Initiative** *(verbatim)*: `effSpeed = max(0, speed + Σ speed-condition modifiers)`;
  `init = 1d20 + floor(effSpeed / 5)`; skip turn when a `frozen|stunned|imprisoned` condition is
  active or `effSpeed ≤ 0`; skipped actors sort last; order descending.
- **Attack resolution** — REDESIGNED. Marinara: opposed d20s (attack vs defense) THEN a flat
  mitigation `floor(defense*0.4)` — defense double-dips (flagged landmine). Here:
  - to-hit: `1d20 + floor(attack/3)` vs static `defenseDC = 10 + floor(defense/3)`; tie hits.
  - crit: natural ≥ criticalRange OR margin ≥ 10 → damage ×1.5 (floored).
  - damage: `max(1, floor(attack/2)) + roll(max(1, ceil(level/2)) d6)`; soak
    `floor(defense/4)` subtracted, min 1 on a hit. *(One defense application, not two.)*
  - **Difficulty multiplier applies to party-INCOMING damage only**: `{casual:0.6, normal:1.0,
    hard:1.3, brutal:1.6}` *(marinara's constants, re-aimed — it applied the multiplier to all
    damage, which made "hard" also make YOU hit harder; difficulty should press on the party).*
- **Conditions modify STATS, not damage** — a `{stat, modifier, turnsLeft}` condition adjusts
  attack/defense/speed before derivation; `stat:"hp"` conditions are DoT ticked at round end
  (marinara applied attack/defense conditions as flat damage adders — flagged landmine, fixed).
  Stacking: same-name refreshes `turnsLeft = max(existing, incoming)` *(verbatim)*.
- **Skills**: MP-insufficient falls back to basic attack *(verbatim)*; heal
  `max(1, floor((attack + level*2) * max(power, 0.5)))` capped at maxHp *(verbatim)*; offensive
  skill: attack scaled `max(1, floor(attack * max(power,1)))`, element override, on-hit status
  `{modifier:-2, stat:"defense", turnsLeft:max(1, cooldown||2)}` *(verbatim)*.
- **Items**: structured effects ONLY — `damage` items scale off **attacker.attack × power**
  (power clamp `[0.05, 2.5]`, default 0.25); *(rejected: marinara's `max(attack, target.maxHp)`
  scaling — a bomb that scales off the BOSS's max HP is a self-balancing exploit; and the
  name-regex potion heuristics — items carry typed effects from loot/creation, no string sniffing).*
- **Defend** *(verbatim)*: defense ×1.5 vs attacks, incoming boss-mechanic damage ×0.45, same round.
- **Flee — a REAL rule (marinara's was a no-op turn, verified):** `attempt_flee` = a group check —
  the slowest living member's speed-based check (skill `athletics`, dc `10 + locationDangerMod`,
  §10) with party advantage if any member creates a distraction (model-declared). Success ends the
  encounter `fled` + one consequence pick (§2.3, always at least a front-clock tick or time cost);
  failure = the round proceeds with the party at disadvantage. *(No enemy morale/flee system in v1 —
  marinara's was aspirational doc text; enemies retreat narratively.)*
- **Down/death:** hp≤0 → `downed` (acts no more); all party downed → encounter `defeat`.
  `houseRules.deathRule === "character-death"` (default under brutal) lets defeat narration kill —
  the GM is TOLD it may; the server marks the party row `leftSession` ONLY when the host confirms via
  `rpg.confirmCharacterDeath` (a host verb, never a model tool — death is a table decision).
  **DECIDED (D58): no unconfirmed kills, ever — the per-death host confirm is not a dial.**

## 4. (reserved)

Section intentionally empty — attack/skill/item resolution all live in §3's `combat.ts`; the
encounter LIFECYCLE is 07. (Numbering stability for cross-refs.)

## 5. Loot (`loot.ts`) — verbatim weights, campaign-authored content

- Rarity roll weights per difficulty *(verbatim marinara)*:
  casual `{common:50, uncommon:30, rare:15, epic:4, legendary:1}` · normal `{40,30,20,8,2}` ·
  hard `{30,30,25,12,3}` · brutal `{common:20, uncommon:25, rare:30, epic:18, legendary:7}`.
- Value: `(5 + rng.int(0,19)) × VALUE_MULTIPLIER[rarity]` with multipliers
  `{common:1, uncommon:3, rare:10, epic:30, legendary:100}` *(verbatim)*; currency quantity
  `1 + rng.int(0,9)` *(verbatim)*.
- Combat drop count: `min(10, enemyCount + rng.int(0, enemyCount) + DIFFICULTY_LOOT_BONUS)` with
  bonus `{casual:0, normal:0, hard:1, brutal:2}` *(verbatim)*.
- **Item CONTENT is campaign data, not code** — REDESIGN. Marinara shipped 36 hardcoded items with
  rarity assigned by index position ("Flamebrand is THE legendary", flagged as placeholder). Here:
  `rpg_games.config` gains no field — instead world-gen (06 §setup) emits a `lootTable`
  (zod-validated: `{name, type: weapon|armor|potion|misc|currency, rarity, effect?: typed}[]`,
  20–40 items themed to the campaign), stored as an `rpg_games.lootTable` json column; the
  built-in default table (port marinara's 36 items with EXPLICIT rarity fields) is the fallback.
  Rolls pick uniformly among items OF the rolled rarity. *(Why: earned progression only lands when
  the sword has the campaign's fingerprints on it; determinism is preserved — the table is fixed at
  setup, the roll is server-side.)*

## 6. Reputation (`reputation.ts`) — verbatim, tag→tool

- Scale −100..100, clamp on apply. `ACTION_MODIFIERS` ports VERBATIM as a **closed tuple**
  (`RPG_REPUTATION_ACTIONS`, exhaustive-dispatch gated): helped +15, rescued +25, gifted +10,
  complimented +5, defended +20, traded_fair +8, healed +12, freed +20, allied +30, threatened −20,
  attacked −30, robbed −25, insulted −10, lied −15, betrayed −40, ignored −5, deceived −15,
  killed_ally −50, questioned 0, met +3, traded +5, intimidated −10, persuaded +2, bribed −3.
  The `update_reputation` tool schema enums these — an unknown action is a schema error the model
  corrects, **not marinara's silent 0**.
- Tiers *(verbatim)*: ≥80 devoted, ≥50 allied, ≥20 friendly, ≥−20 neutral, ≥−50 unfriendly,
  ≥−80 hostile, else enemy. Milestone fires on tier crossing (direction-aware), appends the
  milestone note to `rpg_npcs.notes` and emits `rpg.reputationMilestone` on the bus (automation
  trigger, 09b). Milestone description strings: port marinara's per-tier up/down table verbatim.

## 7. Morale (`morale.ts`) — verbatim model, hook WIRED

- 0..100, default 50. On event: drift toward 50 (`+1` if <45, `−1` if >55) then apply modifier,
  clamp. `EVENT_MODIFIERS` verbatim (closed tuple): combat_victory +8, combat_defeat −15,
  npc_allied +5, npc_betrayed −12, quest_completed +10, quest_failed −10, party_member_down −8,
  party_healed +4, treasure_found +6, trap_triggered −5, rest_completed +10, critical_success +5,
  critical_failure −3, boss_defeated +15, ally_rescued +8, ally_lost −20.
- Tiers verbatim: ≥85 inspired, ≥65 high, ≥35 steady, ≥15 low, else broken.
- `MORALE_DICE_MODIFIER` (inspired +2 … broken −2) is a REAL input to checks (§2.1) and to
  encounter initiative (party side). Morale events fire from the owning verbs (a check fumble, an
  encounter outcome, a quest flip) — never from a model tool directly (it's derived pressure, not a
  dial the narrator turns). The `<party_morale>` prose block for the prompt ports marinara's
  per-tier flavor lines.

## 8. Time (`time.ts`) — verbatim

`RpgClockTime = {day≥1, hour 0-23, minute 0-59}`, initial Day 1 08:00. `ACTION_DURATIONS` minutes
*(verbatim, closed tuple `RPG_TIME_ACTIONS`)*: dialogue 15, explore 30, combat_round 5,
combat_end 15, rest_short 60, rest_long 480, travel 120, craft 45, shop 20, investigate 25,
default 15. Day phases *(verbatim)*: 5–6 dawn, 7–11 morning, 12–16 afternoon, 17–19 evening,
≥20 night, 0–4 midnight; `setTimeOfDay(label)` jumps to anchor hours (dawn 6, morning 8,
afternoon 14, evening 18, night 21, midnight 0), +1 day when target ≤ current. The `advance_time`
tool takes `action | minutes | setTimeOfDay` and its verb ALSO runs the weather-change roll (§9)
and, for explore/travel/rest actions, the encounter roll (§10) — one tool, the world moves.

## 9. Weather (`weather.ts`) — verbatim tables

Port ALL tables verbatim (deep-dive §8 has them complete): the 8 biome weight tables
(temperate/tropical/arctic/desert/mountain/coastal/underground/urban), the 4 season modifier sets,
`BASE_TEMP` ranges, season temp mods (spring 0 / summer +5 / autumn −3 / winter −10), weather temp
mods (clear +2, heat_wave +8, storm −3, snow −5, blizzard −10, rain −2, fog −1), change
probabilities (explore 0.2, travel 0.35, rest_long 0.6, rest_short 0.15, default 0.08), and the
`inferBiome` regex priority chain (arctic→desert→mountain→coastal→tropical→underground→urban→
temperate). Weather is generated server-side on a triggered change and narrated by the model as
canonical truth. Memoryless regeneration is ACCEPTED (marinara's model; a Markov weather chain is
simulation noise). One marinara inconsistency fixed: a forced `set` regenerates the FULL state for
the target type (temperature/wind/visibility included), never a type-only overwrite.

## 10. Perception (`perception.ts`) — formula kept, content regenerated from REAL secrets

- `passivePerception = 10 + (sheet.skills.perception ?? 0) + attributeModifier(wis)` *(verbatim)*;
  computed per party member; the party's BEST passive perception is the gate (a party is as sharp as
  its sharpest scout). Max **2** hints/turn *(verbatim)*.
- **Hint sources — REDESIGNED.** Marinara had 15 canned strings and a dead `dangerLevel` input
  (verified never wired). Here hints are drawn from live hidden state, DC'd:
  1. an ACTIVE HIDDEN clock with `filled ≥ segments/2` → DC 12 hint ("something is building" flavored
     by the clock name, never naming it);
  2. an NPC in scene whose `rpg_quests.gmNotes`/twist bank references them → DC 14 social tell
     (dialogue state only);
  3. environmental: weather/time/location conditions → the marinara DC table verbatim (fog/overcast
     10, night 12, rain 14, cave/ruin 11, forest 10, town 13, storm 16);
  4. location danger (via §10's `inferLocationDanger`) → DC `{≥0.9: 8, ≥0.7: 10, ≥0.5: 14, ≥0.3: 12}`
     *(marinara's inverted-obviousness table, NOW WIRED)*.
  Hints render into the GM system half as `<passive_perception>` with "weave naturally" instruction
  *(verbatim)*. Players never see raw hints — they hear them in narration (info asymmetry, P3).

## 11. Encounter rolls + map math (`encounter-roll.ts`, `map.ts`) — verbatim

- `threshold = round(clamp(5, 90, BASE_CHANCE[action] × DIFF_MULT[difficulty] + DANGER_MOD[danger]))`;
  d100 ≤ threshold triggers. Constants verbatim: chances `{explore 25, travel 35, rest_long 20,
  rest_short 10, map_move 30, default 15}`; multipliers `{casual 0.5, normal 1.0, hard 1.3,
  brutal 1.6}`; danger `{safe −20, town −15, road −5, wilderness 0, ruins +10, dungeon +15,
  hostile +25}`; `inferLocationDanger` regex chain verbatim; type weights `{combat 35, social 20,
  trap 15, puzzle 10, merchant 10, event 10}`; enemy count `max(1, floor(partySize×0.75) +
  {casual −1, normal 0, hard +1, brutal +2} + (1d4 − 2))`. Encounter HINT strings: regenerate
  (5 canned strings per type get stale fast) — the tool result carries `{type, hint: null}` and the
  format reminder instructs the model to improvise the trigger scene for the rolled TYPE; the roll
  is mechanical, the dressing is narration. A rolled `combat` encounter does NOT auto-start the
  encounter engine — the model frames the scene and may call `start_encounter` (players might talk
  their way out; that's agency).
- Map: node-placement math verbatim (candidate ring of 16 offsets ±14/±18/±24 + 9 center positions,
  coords clamped [8,92], maximize min squared distance to existing nodes); alias-match scoring
  verbatim (NFKD normalize, strip articles; exact 100 / substring≥4 80 / shared tokens 50+n);
  moving reveals (fog of war, 03 §7).

## 12. Elemental reactions (`elements.ts`) — verbatim data, LAST build chunk

Aura-gauge rules *(all verbatim)*: no aura → set `{element, gauge 1, sourceId}`; same
element+source → refresh `gauge = min(2, gauge + 0.5)`; rule match (aura=trigger,
incoming=appliedWith) → reaction fires, `gauge − 1`, aura consumed at ≤0; no rule → overwrite with
incoming at gauge 1. `applyReactionDamage = floor(base × multiplier)`. HSR same-element reactions
require two different sources (same source = refresh) — a real subtlety, golden-test it.

Port the THREE preset tables verbatim as `RPG_ELEMENT_PRESET_DATA` (they are complete in the
deep-dive return — §4 tables for `default` 6-element/8-reaction, `genshin` 7-element/17-reaction
incl. the target-buffing Quicken +3 attack and Crystallize shields, `hsr` 7-element/11-reaction).
Elements participate ONLY in the encounter engine (07); `houseRules.elementPreset` null = off.
One marinara drift fixed by construction: there is no client-side aura path (its GM
`[element_attack:]` tag bypassed reaction resolution) — the only element application is inside
server round resolution.

## 13. Golden test plan (the substrate gate)

Every engine gets: (a) a seeded-RNG golden covering each branch (band boundaries, crit both routes,
adv/dis, clamps); (b) a table-integrity test asserting the ported constants byte-match this doc's
tables (the tables ARE the spec); (c) property tests where cheap (clamp ranges, morale drift never
exits 0..100, clock fill bounds, initiative ordering total). Marinara-differential fixtures where
the formula ported verbatim (same inputs → same outputs as marinara's function, computed by hand
into the fixture — NOT by importing marinara). The consequence picker gets a full
priority-ladder fixture set. Estimated ~180 golden cases; they are the cheapest insurance in the
whole build (pure functions, zero mocks).
