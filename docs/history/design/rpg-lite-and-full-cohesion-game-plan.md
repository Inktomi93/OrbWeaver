# GAME PLAN — The Stat-Profile Spine + the Lite/Full Mode Axis

> **Deliverable of the max-effort design pass briefed in `docs/history/design/rpg-lite-and-full-cohesion-brief.md`
> (2026-07-17).** Produced against the FULL reading set (constitution · the whole 13-doc
> `rpg-design/` set · `docs/reviews/misc/marinara-st-extension-lite-mode.md` · ledger
> D18/D20/D24/D46/D48/D58/D79/D80) and the tree as of the uncommitted R4 vertical (post-`acda8ffe`),
> every load-bearing claim below re-verified against the CODE with own eyes + `pnpm ast`. Status:
> **RATIFIED — D86 MINTED 2026-07-17** (`Core-Path-Registry.md` D86, owner-directed) and the §10.2
> doc deltas are APPLIED (new `rpg-design/13-lite-mode.md` + the README/01/02/03/04/05/06/09/10/11/12
> amendments + the `proposed/INDEX.md` row). This report is now the design RECORD — the rpg-design
> set + the ledger are the law. Every non-obvious call carries its WHY + the rejected alternative
> (house doc style).

---

## 0. The design on one screen

**One foundation, two modes, one new spine.**

1. **The stat spine generalizes to a data-defined STAT PROFILE** (`config.statProfile`): the
   attribute *vocabulary* (defs + hints), the skill→attribute governing map, a two-int modifier
   normalization `{center, step}`, and a perception-attribute key. `RpgSheet.attributes` becomes
   `Record<string, number>`. The D&D six stop being a type and become the packaged `d20` profile's
   seed data — exactly marinara's schema-as-data move, typed. The d20 house engine is untouched:
   profiles normalize INTO the fixed modifier space (~−4..+10), so DC ladder, bands, crit,
   fail-forward, and every golden stay valid for ANY profile. Fallout SPECIAL is a second packaged
   profile; "spicy stats" is a custom one.
2. **Lite is a MODE AXIS on the game row** (`rpg_games.mode: "lite" | "full"`), never a second
   subsystem. One `MODE_POLICY` record (exhaustive, tsc-enforced) trims the apparatus by DATA:
   lite = flexible sheet + pools-as-meters + inventory + scene cast with per-NPC fields + custom
   widgets + the steering injection, riding the SAME snapshots/locks/staging/widgets/tools
   machinery full mode uses. No dice requirement, no GM seat, no clocks/encounters/sessions/maps.
3. **Lite's update mechanism is the built D48 tool path — and it costs ZERO new tools.** The
   verified R4 registry already carries lite's entire write surface: `update_party` (pools),
   `update_inventory`, `update_scene` (cast), `set_widget_value` (meters), `roll_dice` (flavor).
   Her model-rewrites-JSON pattern stays dead (01 §5). The local-model story is a visible
   capability arm: on a non-tool model, lite runs **steering + manual edits, trackers read-only,
   badged** — never a silent degrade, never a prose-parser fork; the Tier-3b polyfill upgrades it
   later.
4. **The steering line — the single insight that makes trackers ACT — ships as lite's depth-0
   injection**, not a preset: lite AUGMENTS the user's existing chat (their preset, their
   character, their voice); full REPLACES the voice with the GM preset. Both ride the already-built
   `RpgGatherResult.injections` channel.
5. **The model dials VOLATILE state only, in both modes; identity is human-owned.** Stats
   (attributes) are persistent identity — wizard/host/member-edited, session-wrap-evolved in full,
   never model-written mid-scene. Meters (pools, widgets, fields) are swipe-keyed volatile state —
   the model's writable surface. One write-policy rule, zero mode branches in it.

The rest of this doc is the argued version, the exact schema delta (§8 — the pre-launch regen),
the build chunks (§9), and the doc/ledger deltas (§10).

---

## 1. The verified coupling surface (facts, from the tree — not from the docs)

Re-derived with own eyes + `pnpm ast` against the working tree (R1 substrate + R2 persistence +
R3 verbs + R4 tools all present; R5+ unbuilt):

- **The hardcoded six exist in exactly ONE schema field** —
  `rpgSheetSchema.attributes: z.object({str,dex,con,int,wis,cha})`
  (`packages/contracts/src/rpg/index.ts:398`) — **and are consumed at exactly TWO substrate call
  sites**: `check.ts:94` (`attributeModifier(sheet.attributes[governingAttribute(skill)])`) and
  `perception.ts:15` (`attributeModifier(sheet.attributes.wis)`). The supporting constants
  (`RPG_ATTRIBUTE_KEYS`, `SKILL_ATTRIBUTE_MAP` — 04 §2's "alias map" — and
  `SKILL_ATTRIBUTE_FALLBACK: "int"`) live in `substrate/constants.ts:39–78` with no other
  consumers. Everything else the sheet feeds — combat, initiative, loot, morale, reputation,
  time, weather, maps, encounter hydration — reads `attack/defense/speed/maxHp/pools/skills`,
  which are already attribute-set-agnostic.
- **The prompt does not render attributes today.** `gather-macros.ts` `buildCast` renders
  `className` + `shortDescription` + arc goal only. The six never reach the model as prose.
- **Card→sheet seeding does not exist.** `RPGStatsConfig`/`rpgStats` appear NOWHERE in code
  (`pnpm ast ident` empty); `joinParty` takes a caller-supplied full sheet; the tRPC router
  exposes `sheet: rpgSheetSchema` raw. The 03 §4.1/06 §4 card-seeding story is design-only — the
  spine change happens BEFORE any seeding code exists to migrate.
- **The lite write path is already built.** The 20-tool R4 vertical (`tools/index.ts`, registered
  at `entry/compose/services.ts:1626`) includes `update_party` (hp/pool/condition/status patches,
  lock-merged, staged), `update_inventory`, `update_scene` (present-cast upserts + recentEvent),
  `set_widget_value`, `roll_dice` — with the staging accumulator (`turn-staging.ts`,
  read-through + flush at `onTurnCompleted`/`onTurnAborted`) and the snapshot resolution ladder
  live. One gap: the built `presentUpsertArg` (`contract/tools.ts:104`) omits
  `customFields`/`stats` — the snapshot schema carries `customFields`, the tool can't write it
  yet (§4.3).
- **Mode-relevant seams already dispatch on data.** `gatherTurnContext` derives the attached tool
  list from one house rule (`overworldToolNames`, the `playerRollsOwnChecks` swap);
  `resolvePresetOverride` is its own injected op; `requireGmSeat(game, {kind:"gm-model"})` passes
  iff `gmUserId IS NULL` — a lite game (which never assigns a seat) passes it transparently, so
  the AI tool path needs no new gate.
- **`rpg_games` has no mode column**; `createGame` hard-refuses non-tool-capable models
  (`RpgModelNotToolCapableError`), clones the GM preset, and sets narrator group config —
  all three of which must become mode-conditional (§3/§4).
- **No client slice exists** (`features/rpg/` absent) — lite UI starts from zero alongside full's
  C-chunks; nothing client-side is being rewritten.

Consequence: **the "one hard rigidity" is two call sites, one schema field, and three constants.**
The window-closing schema work (§8) is small and almost entirely additive; the risk lives in the
design decisions, not the diff.

---

## 2. Decision 1 — the stat spine: profiles as data, mechanics on the modifier space

### 2.1 The shape

```ts
// @orb/contracts/rpg — cross-boundary (wizard renders it, db $types it, substrate consumes it)

export const rpgStatAttributeDefSchema = z.object({
  key: z.string().min(1).max(24).regex(/^[a-z][a-z0-9_]*$/),   // snake_case token; collision-validated on add
  label: z.string().min(1).max(40),                             // "Strength", "Perception", "Corruption"
  hint: z.string().max(200).default(""),                        // the label-as-mini-prompt (marinara §1) — rides the prompt
});

export const rpgStatProfileSchema = z.object({
  /** The attribute VOCABULARY — the single source of truth prompt/editor/validation derive from.
   *  Empty is legal (a lite chat with meters only). */
  attributes: z.array(rpgStatAttributeDefSchema).max(12).default([]),
  /** Score bounds for every attribute value (d20: 1..30; SPECIAL: 1..10; spicy: 0..100). */
  range: z.object({ min: z.number().int(), max: z.number().int() }).default({ min: 1, max: 30 }),
  /** Score → modifier normalization: `floor((score - center) / step)`. THE compatibility contract:
   *  every profile maps into the house modifier space; the d20 engine never sees a raw score. */
  modifier: z.object({ center: z.number().int(), step: z.number().int().min(1) }).default({ center: 10, step: 2 }),
  /** skill (normalized) → attribute key; the 04 §2 SKILL_ATTRIBUTE_MAP generalized into data. */
  skillGoverning: z.record(z.string(), z.string()).default({}),
  /** The fallback governing attribute for unmapped skills (d20: "int"). Null ⇒ no attribute term. */
  defaultAttribute: z.string().nullable().default(null),
  /** Which attribute gates passive perception (d20: "wis"; SPECIAL: "per"). Null ⇒ flat 10 + skill. */
  perceptionAttribute: z.string().nullable().default(null),
  /** RESERVED-ADDITIVE (owner-directed 2026-07-17; the `element` precedent): the resolution-engine
   *  discriminant, ONE arm today. A future alt-resolution lands as an additive union arm + its own
   *  engine module behind a one-case assertNever dispatch at the check entry — never a re-shape. */
  resolution: z.discriminatedUnion("kind", [z.object({ kind: z.literal("house-d20") })]).default({ kind: "house-d20" }),
});
export type RpgStatProfile = z.infer<typeof rpgStatProfileSchema>;
```

`rpgSheetSchema.attributes` becomes `z.record(z.string(), z.number().int())` — values keyed by
profile vocabulary. Three **packaged profiles** ship as contract data constants (the D33
precedent — defaults co-located with their contract, consumed by wizard AND server):

| Key | Contents | Note |
|---|---|---|
| `d20` | the six (labels + hints), range 1..30, modifier {10, 2}, the full `SKILL_ATTRIBUTE_MAP` as data, default `int`, perception `wis` | **byte-equivalent to today's constants** — the migration is a MOVE of `substrate/constants.ts:39–78` into data, provable by a golden asserting old-vs-new identical check results |
| `special` | S·P·E·C·I·A·L (7 defs, Fallout hints), range 1..10, modifier {5, 1}, a Fallout-flavored governing map (e.g. sneak→agility, speech→charisma, lockpick→perception), default `luck`, perception `per` | the proof the spine works — a 7-attribute system running the house engine unmodified |
| `freeform` | empty attributes, range 0..100, modifier {50, 10}, empty governing, nulls | lite's default — start empty, add spicy stats |

### 2.2 How the mechanics consume a variable stat set (the compatibility model)

The fixed contract between profiles and the house engine is the **modifier space**, not the score
space. `check.ts` and `perception.ts` re-parameterize (pure, signature-level):

- `attributeModifier(profile, score) = floor((score − profile.modifier.center) / profile.modifier.step)`
- `governingAttribute(profile, skill) = profile.skillGoverning[normalizeSkill(skill)] ?? profile.defaultAttribute`
- a missing attribute value (sheet lacks the key) or a `null` governing resolves to **modifier 0**
  (score = center) — never a throw mid-check (fail-forward ethos); sheet-write verbs backfill new
  vocabulary keys at `center` so the gap is transient.
- `passivePerception(profile, sheet) = 10 + (skills.perception ?? 0) + (perceptionAttribute ? attributeModifier(profile, attributes[perceptionAttribute]) : 0)`.

WIS 16 on d20 (+3) and PER 8 on SPECIAL (+3) land identically; a 0–100 spicy profile at {50,10}
spans ±5. DC ladder (2..30), bands, crit margins, morale terms, advantage — all live in modifier
space and hold for every profile. **This is why the encounter engine, the consequence picker, the
reminder's DC prose, the chip renderers, and all ~180 goldens survive the generalization
untouched.**

*WHY this shape:* it is the smallest data surface that covers the three real axes systems differ
on (vocabulary, score scale, skill governance) while keeping every number the server resolves
inside one golden-tested engine. *Rejected alternatives:*
- **Keep the six + alias-map-only** (the 04 §2 status quo) — fixes NAMES, not SHAPE; SPECIAL's 7
  attributes and freeform stats stay unrepresentable. The brief's core complaint.
- **Per-sheet free-form keys, no profile** — no single source of truth: party members drift
  vocabularies, the governing map has nothing stable to key on, the editor and prompt can't
  derive one schema. Marinara's own strength #1 (one `trackerConfig` drives prompt/parse/render)
  argues the profile.
- **A formula DSL/CEL for the modifier** — user-authored math is un-goldenable and unbounded;
  `{center, step}` covers d20, SPECIAL, percentile, and every linear system anyone has named.
  A nonlinear house system is an alt-RESOLUTION request → the plugin line (§7).
- **A separate `rpg_stat_profiles` table** — ceremony for v1: nothing references profiles across
  games; sharing = export/import JSON (§5.3) or the packaged constants. If a profile LIBRARY is
  ever wanted, the config blob lifts into a table additively; a table now is a join on every
  gather for zero gain.

### 2.3 Where it lives + mutability

`config.statProfile` (inside `rpgGameConfigSchema`, `.prefault(d20)` for full wizard flows /
`freeform` seeded by the lite wizard) — the profile is a session-zero product like the other
dials, rides the existing `updateConfig` write path and the config's fault-isolated JSON column,
and needs no new column or table. *Rejected:* a dedicated `rpg_games.statProfile` column — a
second config home with its own write path for data that changes through the same wizard/editor;
the config blob is already `$type`d and parse-on-read.

Mutability (one rule, both modes, no mode branch): **attribute ADDS are always legal** (sheets
backfill at center); **removes/renames require zero references** (not in `skillGoverning` values,
not `perceptionAttribute`, not locked sheet paths); the `modifier`/`range` dials are host-editable
(they are math dials, same tier as `criticalRange`). Enforced in `updateConfig` with typed errors
+ a matrix test. *Rejected:* full-profile immutability after `startGame` — it kills lite's core
gesture ("add a Corruption stat mid-chat") and over-protects full (an add is harmless by
construction).

---

## 3. Decision 2 — lite ↔ full: one mode axis, one policy record

### 3.1 The axis

`rpg_games.mode` — `text CHECK in RPG_GAME_MODES` (`["lite","full"]`), notNull, default `full`,
born into the baseline. It reaches every dispatch point through ONE data shape:

```ts
// domain/rpg/contract — consumed by gather, verbs, views; exhaustive-dispatch gated
export const MODE_POLICY: Record<RpgGameMode, {
  tools: readonly RpgToolName[];        // the attached set (05 §3's table stays the count home)
  prompt: "gm-preset" | "injection";    // full: presetOverride + 8 macros + GM reminder · lite: one steering injection
  seat: boolean;                        // assignGmSeat legal?
  sessions: boolean; clocks: boolean; encounters: boolean; maps: boolean;
  morale: boolean; perception: boolean; checks: boolean; npcs: boolean;
  journal: boolean; quests: boolean; loot: boolean; timeWeather: boolean;
  requireToolCapable: "hard" | "soft";  // §4.2 — full refuses; lite degrades visibly
}>
```

A verb outside its mode's policy throws a typed `RpgModeUnsupportedError` (the guard reads the
record, never an `if (mode === …)` scattered in verb bodies — the §5.5 string-union-dispatch
discipline; a new mode member fails `tsc` at the Record). The chat side changes NOTHING: `mode`
lives behind the same injected ops; `no-if(isGame)` stands untouched.

*WHY an axis and not a subsystem:* lite NEEDS precisely the machinery that was hardest to build
and is already built — swipe-keyed snapshots + the resolution ladder, locks/auto-lock, the
staging accumulator, widget bindings + swipe-keyed values, the tool registry, the bus. A separate
lite subsystem re-implements or forks every one of those (the brief's named cohesion risk), and
graduation becomes a data MIGRATION instead of a config flip. *Rejected:*
- **A chat-level sheet with no `rpg_games` row** — loses snapshots/widgets/staging (all FK
  through `gameId`), forks the state model, and puts a second "game-ish" gather in chat. P4 says
  game-ness is one data row; lite-ness is one field on it.
- **Per-apparatus boolean flags instead of a mode** (`enableClocks`, `enableDice`, …) —
  combinatorial config soup with no legible product identity; "lite" is the shape users pick,
  house rules stay the within-mode dials. The mode axis also gives views/UX one discriminant.

### 3.2 What lite IS (the included set)

A lite game = a NORMAL chat (its own preset, characters, personas, arbitration — untouched) plus:

| Piece | Mechanism (all built unless marked) |
|---|---|
| flexible sheet (identity stats) | `rpg_party.sheet.attributes` over the profile vocabulary; `className` as free flavor |
| meters on the player/party ("Health", "Sanity", "Corruption", "Arousal") | **pools** — `sheet.poolDefs` (+ per-def `hint`, §8) define; snapshot `partyState[].pools` carry swipe-keyed values; `update_party.poolDeltas` writes; the `pool` widget binding renders a HUD meter |
| inventory | snapshot `partyState[].inventory` + `update_inventory` |
| scene cast + per-NPC text trackers | snapshot `presentCharacters` (name-only entries — `characterId`/`npcId` both null is legal today) + `customFields`; `update_scene` upserts *(gap: the tool arg gains `customFields` — §4.3)* |
| free-standing / per-NPC meters | `rpg_hud_widgets` `source:"custom"` + swipe-keyed `widgetValues`; `set_widget_value`; a widget gains optional `subjectName` (§8) so "Corruption — Sera" groups under Sera in the editor/tracker (display grouping only, no FK — the scene cast is volatile; a dangling name is inert) |
| running beats | snapshot `recentEvents` (via `update_scene.recentEvent`) |
| optional dice flavor | the composer dice button (`rollDice` verb → `[dice: …]` text; the MODEL adjudicates — her §7.3 posture) + the `roll_dice` tool (server dice when the model wants honest randomness; zero state) |
| swipe safety / commit / locks / manual-edit-wins | snapshots + `applyLockedPatch` + edit-auto-lock — verbatim shared with full |
| steering | the lite injection (§4.4) |
| save points | checkpoints work unmodified (mode-blind pointer rows) — free, kept |

### 3.3 What lite EXCLUDES (and where each ask lands instead)

No GM seat (the model is a narrator-partner; `assignGmSeat` refuses — and because a lite game's
`gmUserId` is always NULL, the built `requireGmSeat` tool gate passes with zero new code). No
skill checks/DCs, no encounters, no clocks (a countdown want = a counter widget), no maps, no
sessions (chat memory + `recentEvents` are the continuity), no morale, no perception, no loot
tables, no time/weather engine, no `rpg_npcs` rows (the scene cast + customFields + widgets
cover per-NPC tracking; reputation is full-mode machinery), no journal/quests (v1 — the policy
record makes enabling either later a data flip, not a design change).

*WHY this line:* the brief's demand signal is "stats + inventory + trackers that color a normal
chat." Every included piece serves that loop; every excluded piece exists to serve the GAME loop
(stakes → resolution → consequence) that lite deliberately doesn't run. The policy record makes
the line cheap to move later with evidence.

### 3.4 Graduation (lite ⇄ full)

`rpg.setMode(chatId, mode)` — host-gated, both directions:

- **lite → full**: requires a tool-capable connection (the hard gate applies from here on);
  clones the packaged GM preset → `gmPresetId` (lite never had one); sets narrator group config;
  seeds the full-mode sheet invariant (`maxHp`/`hp` backfilled `10/10` where null — host edits
  after; §8's nullable-combat-block rule); the campaign then runs the full wizard's remaining
  session-zero steps client-side (world-gen optional — a graduated chat may keep its organic
  world). Everything already accumulated — sheets, pools, widgets, cast, snapshots, locks —
  carries over BY CONSTRUCTION (same tables, same plane).
- **full → lite**: guards `status != 'setup'`-safe transitions — refused while an encounter is
  active or a session is `concluding`; the full apparatus (clocks/maps/npcs/sessions) stays in
  the db, dormant (policy stops attaching/serving it; nothing is deleted — flipping back
  restores it).

*WHY a flip, not a migration:* this is the payoff of §3.1 — the brief's "whether/how a lite game
can graduate" costs one verb + guards. *Rejected:* graduation-by-recreate (new full game, copy
state) — throws away snapshots/history and breaks the chat's `metadata.rpg` pointer for nothing.

---

## 4. Decisions 3 + 4 — the lite loop: structured updates, honest arms, the steering line

### 4.1 The update mechanism: the D48 tool path, zero new tools

Lite's write surface is a MODE_POLICY subset of the built registry:
`["update_party", "update_inventory", "update_scene", "set_widget_value", "roll_dice"]`.
Structured args, schema-validated, errors-as-data, lock-merged, staged through the R4
accumulator, swipe-safe on flush, provenance-recorded as `ToolCallRecord`s (the client chips
render them like any tool). Server-persisted, consistent with full mode, and — decisive —
**already built and integration-tested**.

*WHY tools and not her prose-rewrite:* (1) the 01 §5 precedent — the tag/JSON-in-prose grammar
was DELIBERATELY killed to stop the model owning syntax and to delete the repair gauntlet;
re-introducing it for lite re-litigates a settled ruling with the machinery's owner asleep.
(2) The brief's own analysis holds: lite has no server-authoritative math, so the ONLY thing her
JSON round-trip buys is model-agnosticism — which the Tier-3b polyfill delivers at the RIGHT
layer (infra, invisible to rpg) when it ships. (3) The verified fact that lite needs zero new
tools removes the last cost argument. *Rejected:* a dual-arm design (tools + a lite-only prose
parser as the local fallback) — two update grammars to maintain forever, the parser IS the
polyfill built in the wrong layer, and every future tracker feature pays twice.

### 4.2 The local-model story (explicit, per the owner doctrine)

`MODE_POLICY.requireToolCapable`: **full = "hard"** (unchanged — a game turn IS a tool loop;
`createGame` keeps `RpgModelNotToolCapableError`). **Lite = "soft"**: `createGame` succeeds on a
non-tool connection and the game runs **read-only trackers** — the steering HALF of the loop
(state → story) needs zero tools: values + hints + the steering line inject every turn; the
write-back half is the member's own tracker edits (`editSnapshot`, auto-lock — built). The
degrade is VISIBLE everywhere it matters: the lite wizard says it at create ("this model can't
update trackers — they'll still steer the story; you edit them by hand"), the gather flags it
(`liteTrackersReadOnly` on the view), the client badges the tracker panel, and the reminder
variant omits every update instruction (the model is never asked to write what it can't). When
the connection later resolves tool-capable (model switch, or the polyfill ships), the same game
silently gains the write-back — the flag is derived per-turn from capability, never stored.

*WHY:* this is the honest-arms doctrine applied — hosted/tool-capable gets the full loop, local
gets a REAL, labeled subset (steering genuinely works — it is marinara's load-bearing half), and
the refusal surface names the capability line instead of degrading silently. *Rejected:* hard
refusal in lite (kills the highest-demand mode for exactly the local-model users who want it
most); silent best-effort (the named sin).

### 4.3 The one write-surface gap: per-NPC fields

`presentUpsertArg` (the `update_scene` tool arg) gains
`customFields: z.array(z.object({ name: z.string().min(1), value: z.string() })).optional()` —
an array-of-pairs, NOT a `z.record`, so the arg stays safely inside the D79 projector's
`additionalProperties:false` regime ([tool-schema-no-branded-transform] discipline; the verb
folds pairs into the snapshot's `Record<string,string>`). This closes "Sera's Corruption note
lives ON Sera" for text trackers; numeric per-NPC meters ride `subjectName`d widgets (§3.2).
*Reserved, explicitly not v1:* a structured `meters[]` array on `RpgPresentCharacter` — if
entity-grouped numeric trackers outgrow the widget mechanism, it lands additively (the schema
window argument does NOT force it now: it is a pure ADD to a JSON column shape, cheap at any
time).

### 4.4 The steering line (the whole point)

Lite injects ONE depth-0 system injection per turn (the built `RpgGatherResult.injections`
channel — the same seam full's format reminder rides), assembled by a `buildLiteReminder` sibling
in `substrate/reminder.ts` from the same rows the tracker view reads:

1. **The state block** — compiled per ENTITY: each party member (name, `className`, attributes
   with hints, pools `value/max` with hints, inventory summary, status), each present character
   (name, mood, customFields), each custom widget (`label — subjectName?: value/max`, hint).
   Label-as-mini-prompt throughout: `Corruption (0–100, how morally compromised): 70`.
2. **The steering license** (the marinara §5a line, adapted): *"Let each entity's trackers color
   their behavior, dialogue, and the scene — a high or low value should visibly shape how that
   character acts and what happens. Acknowledge changes when relevant; never recite the numbers."*
3. **Update guidance** (tool-capable turns only): which tool maintains which tracker; locked
   fields are the server's to enforce, not the prompt's.
4. **`config.lite.steeringNote`** — a per-game user-tunable sentence appended last (the
   "always wins" slot, mirroring `additionalPreferences`), for "lean into it harder" / "keep it
   subtle" table tuning without touching packaged prose.

**No preset override in lite** — `resolvePresetOverride` returns null for lite games; the user's
own preset/character/persona assembly runs untouched. *WHY:* lite's contract is "color a NORMAL
chat" — cloning a packaged narrator preset over the user's carefully-tuned RP voice would replace
the thing lite exists to augment. Full keeps the GM preset (its voice IS the product there).
*Rejected:* a packaged lite preset (voice-destroying, above); macro slots (`{{rpgSceneState}}`
in the user's preset) — requires every user to hand-edit their preset before trackers work; the
injection needs zero preset surgery and is exactly the channel injections exist for.

### 4.5 The write-policy split (the cohesion rule the two modes share)

**The model writes VOLATILE state; humans write IDENTITY.** Pools, widget values, cast fields,
inventory, conditions — model-writable (swipe-keyed, lock-mediated). `sheet.attributes`,
`poolDefs`, the profile, widget DEFINITIONS — human-owned (wizard/editor/host verbs; in full,
session-wrap evolution proposals host-accepted per 03 §4.1 — unchanged). No `update_stats` tool
exists in EITHER mode. *WHY:* it keeps full's evolution discipline intact with zero mode-branch,
gives lite a legible mental model ("stats are who you are — meters are what moves"), and closes
the "the model set my STR to 3" failure class marinara accepts. The steering ask is fully served:
"toggle health down" = a pool edit (member tracker edit or model `poolDeltas`), which is exactly
the volatile plane. *Rejected:* model-writable attributes in lite (two write-policy regimes for
one field = the drift full's session-wrap rule exists to prevent; and per-swipe attribute
mutation would force attributes into the snapshot plane, re-copying identity every turn for a
gesture pools already perform).

---

## 5. Decision 5 — definition UX + data homes

### 5.1 Who defines, where it lives

| Definition | Home | Editor (client) |
|---|---|---|
| attribute vocabulary + hints + range/modifier | `config.statProfile` (host; template pick at create — packaged `d20`/`special`/`freeform` — then row-level add/remove per §2.3 mutability) | the lite create dialog + a "Stats & Trackers" editor pane (lite) / wizard step 2 (full, profile pick added) |
| per-member meters (poolDefs + hints) | `rpg_party.sheet.poolDefs` (member for own row, host for all — the 07 §3.1 axis) | sheet drawer "add meter" row: name + max + hint |
| free/per-NPC meters | `rpg_hud_widgets` (+`subjectName`) — host CRUD (existing verbs) | widget editor (C7's form, reused in lite) |
| per-NPC text fields | snapshot `presentCharacters[].customFields` — model + member edits | tracker cast rows (C4's editor, reused) |
| the steering note | `config.lite.steeringNote` | the lite settings pane |

Marinara's click-to-add/type-a-name bar is the UX target: every "add" above is one row append on
a typed schema; keys are minted from labels (snake-cased, collision-validated on add — her §6
jank list, avoided).

### 5.2 Card binding (seeding, respecced)

A `characters` card MAY carry `extensions.rpgStats` — parsed by RPG at seeding through
`rpgCardStatsSchema` (`@orb/contracts/rpg`): `{ attributes?: Record<string, number>, profileHint?:
string }`. Seeding (joinParty/world-gen, R6-adjacent) maps card keys onto the game's profile
vocabulary by normalized label/key match (the 04 §2 "alias map onto the six" generalizes to
"name-match onto the profile"); unmatched keys are surfaced to the host at review, never silently
dropped. The character domain stays rpg-blind (the card's `extensions` blob is already the
residual-vendor-keys home — no character schema change, no new column). *Rejected:* the card as
the schema OWNER — a chat's trackers span entities no card owns (NPCs, the scene, free widgets),
and two sources of truth for the vocabulary is the drift marinara's per-preset binding exists to
avoid; the card contributes VALUES, the game owns the SCHEMA.

### 5.3 Portability

The profile (and its poolDef/widget-def companions) exports as a plain JSON file and imports at
create — marinara's "presets export as portable schema files, personal bindings dropped"
(§4 of the report), which is how one user's Vampire sheet becomes a shareable artifact. v1 =
export/import on the lite create dialog + profile editor; a hub/library surface is out of scope.

---

## 6. Decision 6 — cohesion with the built state model (the shared-machinery map)

| Machinery | Full | Lite | Delta |
|---|---|---|---|
| `rpg_games` root + `chats.metadata.rpg` pointer | ✓ | ✓ | +`mode` column |
| snapshots: clone-forward, resolution ladder, commit, swipe-rewind | ✓ | ✓ verbatim | none |
| staging accumulator (`ChatTurnId`-keyed, read-through, abort-safe) | ✓ | ✓ verbatim | none |
| `applyLockedPatch` + edit-auto-lock ("my edit survives the model") | ✓ | ✓ verbatim | none |
| `rpg_party` + sheet | ✓ | ✓ | attributes→record; combat block nullable (§8) |
| pools (defs + volatile + `pool` widget binding + `update_party`) | ✓ | ✓ = the meters | +`hint` on poolDefs |
| widgets + swipe-keyed `widgetValues` + `set_widget_value` | ✓ | ✓ | +`subjectName` on custom config |
| present cast + customFields | ✓ | ✓ = per-NPC trackers | tool arg gains customFields (§4.3) |
| tool registry + recurse loop + `ToolCallRecord` chips | ✓ 20+ tools | ✓ 5-tool subset | MODE_POLICY selects |
| gather → macros + GM preset + reminder | ✓ | — | lite: ONE injection instead (§4.4) |
| `resolvePresetOverride` | gmPresetId | null | mode dispatch in the op |
| bus (`snapshotPatched`/`gameChanged`) + client invalidation | ✓ | ✓ same events | none |
| views | member/GM split | lite projection | `RpgHudView`/`RpgGameView` gain a mode discriminant (§8) — lite arms OMIT clocks/morale/time/weather at the TYPE level (the 03 §1 type-level-projection discipline applied to mode) |
| checks/clocks/encounters/maps/sessions/crew/seat | ✓ | policy-refused | typed `RpgModeUnsupportedError` |

P3 in lite: there is no hidden ring — no secrets, no hidden clocks, no GM-eyes; every tracker is
table-visible (the member view IS the view). Per-player-private trackers are reserved (the same
reserved line 06 §6 already holds for full). The projection machinery is shared; lite simply has
an empty ring-1.

---

## 7. Decision 7 — the extensibility line (drawn explicitly)

**Foundation, NOW (this plan):** stat VOCABULARIES are data. Any linear-modifier stat system —
D&D-shaped, SPECIAL, spicy-custom, none-at-all — is a profile: attributes, range, {center, step},
governing map, perception key. Both modes, one engine, zero plugin machinery.

**Plugins, LATER (D46 Tier-2, per 09 §c — unchanged):** alt-RESOLUTION systems. Anything that
changes the check die (d100 percentile, 2d6 PbtA), the band ladder, DC semantics, the consequence
engine, or encounter legality is a different ENGINE, and the engine is the golden-tested product
the substrate seals (a plugin never replaces `resolveCheck` — 09 §c's standing line). The seams
that keep the door open are already priced: plugin-sourced GAME TOOLS through the D48 registry
under a future `rpg.tools.extend` capability, and (owner-directed addendum, 2026-07-17) the
profile's RESERVED single-arm `resolution` discriminant (§2.1) + a one-case `assertNever` dispatch
at the check entry — a future engine is an additive union arm + one module + its goldens, never a
schema re-shape. Opening either seam is a ledger decision.

*WHY the line sits here:* the resolution engine's fixed points (bands, DC 2..30, modifier space,
consequence priority) are load-bearing across the reminder prose, the tool result schemas, the
chip renderers, the encounter engine, and ~180 goldens — swapping them is a product fork, not a
parameter. Stat vocabulary, by the §1 audit, was never load-bearing anywhere but two call sites.
The 01 §6 non-goal REWORDS (§10.2): from "no rules-system plugins; the mechanic set is THE house
system" to "**stat profiles are data (this plan); RESOLUTION stays the house system; alt-resolution
is the D46 Tier-2 seam**."

---

## 8. The schema/contract delta (the pre-launch baseline regen — spend the window)

All changes ride ONE `0000_baseline` regen + fixture updates (D50 precedent; `pnpm seed:demo`
re-verifies per D82). Coupled sites called out per [new-domain-coupled-sites]/[gate-probe] habits.

**`@orb/contracts/rpg`:**
1. `RPG_GAME_MODES = ["lite","full"]` + schema + type (new axis tuple).
2. `rpgStatProfileSchema` + `rpgStatAttributeDefSchema` (§2.1) + the THREE packaged profile
   constants (`RPG_PACKAGED_STAT_PROFILES` — d20 data lifted VERBATIM from
   `substrate/constants.ts:39–78`, which dies in the same commit; the one-home move).
3. `rpgSheetSchema`: `attributes` → `z.record(z.string(), z.number().int())`;
   `maxHp` → `.nullable().default(null)`; `poolDefs[]` gains `hint: z.string().max(200).default("")`.
4. `rpgPartyVolatileSchema.hp` → `.nullable()` (lite members without combat stats carry no
   phantom HP; full's seeding invariant makes it non-null there — verb-enforced, typed
   `RpgSheetIncompleteError` at combat/encounter entry, the party⊆roster verb-invariant pattern).
5. `rpgGameConfigSchema` gains `statProfile: rpgStatProfileSchema.prefault(<d20>)` and
   `lite: z.object({ steeringNote: z.string().max(500).default("") }).prefault({})`.
6. `rpgCustomWidgetConfigSchema` gains `subjectName: z.string().max(60).nullable().default(null)`.
7. `rpgCardStatsSchema` (§5.2) — new export.
8. Views: `RpgGameView`/`RpgGmView` gain `mode`; `RpgHudView` becomes a mode-discriminated union
   (lite arm: widgets only); `RpgTrackerView` unchanged in shape (lite serves it verbatim).

**`@orb/db/schema/rpg.ts`:** `rpg_games.mode` text CHECK in `RPG_GAME_MODES` notNull default
`'full'`. (Everything else above is `$type<>` churn — no DDL.)

**`domain/rpg`:** `check.ts`/`perception.ts` take the profile (§2.2); `constants.ts` sheds the
three attribute constants; `MODE_POLICY` + `RpgModeUnsupportedError` + guards in the policy-named
verbs; `gatherTurnContext` mode dispatch (lite block + steering injection + tool subset + null
override + read-only flag); `buildLiteReminder`; `createGame` mode param + soft/hard capability
arms (+ lite skips preset-clone/GroupConfig); `setMode`; `updateConfig` profile mutability
guards; `presentUpsertArg` + `updateSceneTool` customFields (§4.3); sheet-write verbs validate
attribute keys ∈ profile + range, backfill at center.

**Tests (the regression pins that make the regen safe):** a d20-profile differential golden
(old constants vs packaged-profile data → identical check/perception results across the band
matrix); a SPECIAL-profile golden set; profile-mutability matrix; mode-policy matrix (every verb
× mode); the lite gather suite (injection content, steering line, read-only variant, tool subset,
null preset override); full-turn byte-identity pre/post-regen (a full game's assembled turn is
unchanged); swipe-rewind on a lite pool/widget write (the marinara-lesson pin); graduation
round-trip (lite→full→lite leaves a playable game).

*WHY hp/maxHp go nullable rather than defaulted:* a fabricated `10/10` on a stats-steering
vampire chat is a phantom fact one prompt-render away from steering the story wrong; nullable +
a full-mode seeding invariant is the honest shape, and the cost is one typed assert at the
combat/encounter boundary that full-mode seeding makes unreachable. *(Rejected: keep required +
fabricate — the silent-degrade smell; lite health lives in pools by §4.5, so the slot is
genuinely absent, not defaulted.)*

---

## 9. The build-chunk sequence (fits doc 10's R-chunks + the cross-set BUILD-QUEUE wave model)

| Chunk | Contents | Size | When |
|---|---|---|---|
| **L0 — the spine regen** | ALL of §8's schema/contract/db + the substrate re-parameterization + packaged profiles + the regression-pin tests. **Pure regen + refit; no new features.** | **M** | **FIRST — before any further R-chunk builds on the old shape** (R6 world-gen and R8 encounters both consume sheets; every week of delay grows the refit). This is the window-closing chunk. |
| **L1 — the lite turn vertical** | `mode` on createGame + MODE_POLICY + mode guards; lite gather (state block, steering injection, tool subset, null override); `buildLiteReminder`; soft capability arm + `liteTrackersReadOnly`; `setMode` + graduation guards; the §4.3 tool-arg widening; bus/view mode plumbing. First playable lite chat (server-side; tRPC-driven). | **M** | after L0; independent of R5–R10 |
| **L2 — the lite client** | the lite create dialog (template pick, tracker quick-add, capability notice, import/export); the Stats & Trackers editor (profile rows, pool rows w/ hints, widget `subjectName`); tracker/HUD reuse over the lite views; read-only badge; the graduated-wizard flow. Folds into the C-chunk wave (reuses C1 gate/stream, C2 widgets, C4 tracker, C7 widget editor). | **M** | with/after C1–C4 |
| **L3 — seeding + polish** | `rpgCardStatsSchema` seeding at joinParty (+ the world-gen mapping when R6 lands — world-gen's sheet prompt gains the profile vocabulary + hints as input); unmatched-key review surface; steeringNote UX. | **S** | trailing; the R6 half rides R6 |

Deferred (named, not scheduled): per-NPC structured `meters[]` (§4.3 reserved) · a profile
library table (§2.2 rejected-for-now) · lite hidden ring (§6) · alt-resolution plugins (§7) ·
the Tier-3b polyfill (unchanged 10 §Later; L1's read-only arm is the interim).

Sequencing notes: the R4 tools vertical is the ACTIVE in-flight wave (not a finished batch) — it
FINISHES against the pre-D86 letter; L0 conflicts textually with it (same contracts/substrate
files), so **L0 lands as its own wave immediately after the R4 vertical lands**, never interleaved,
and D86 is never retro-fitted into the R4 lanes mid-flight.
R6/R7 crew chunks build AGAINST the profile from birth (world-gen emits profile-keyed sheets —
cheaper than retrofitting). AP4a (agent GM) is orthogonal (full-mode seat machinery; lite has no
seat). The 05 §3 tool table stays the count home; MODE_POLICY cites it.

---

## 10. Decision 8 — doc + ledger deltas

### 10.1 The D-entry (draft text, next free number — D86)

> **D86 — The stat-profile spine + the lite/full mode axis (AMENDS D58).** RPG stat vocabularies
> are DATA, not types: `config.statProfile` (attribute defs + hints, range, `{center,step}`
> modifier normalization, skill-governing map, perception key) drives sheet shape, validation,
> prompt, and the d20 engine's two attribute reads; `RpgSheet.attributes` is a record over the
> profile vocabulary; the D&D six, Fallout SPECIAL, and `freeform` ship as packaged contract-data
> profiles (D33 pattern). The compatibility contract is the MODIFIER SPACE — profiles normalize
> into it; the house resolution engine (d20/bands/DC/fail-forward/consequences/encounters) stays
> THE system; alt-RESOLUTION remains the D46 Tier-2 seam (01 §6 reworded accordingly). LITE is a
> mode axis, never a subsystem: `rpg_games.mode ∈ {lite, full}` dispatched through ONE exhaustive
> `MODE_POLICY` record — lite = flexible sheet + pools-as-meters + inventory + scene cast/custom
> fields + `subjectName`d custom widgets + a depth-0 steering injection (state block +
> label-as-mini-prompt hints + the steering license + `config.lite.steeringNote`), riding the SAME
> snapshots/locks/staging/tools; lite runs the user's OWN preset (`presetOverride` null — the GM
> preset is full-mode voice); no seat/checks/clocks/encounters/maps/sessions in lite (typed
> `RpgModeUnsupportedError`). Update mechanism = the D48 tool subset (`update_party` /
> `update_inventory` / `update_scene` / `set_widget_value` / `roll_dice`) — the prose-rewrite
> pattern stays dead (01 §5). Write policy both modes: the model writes VOLATILE state only;
> identity (attributes/defs/profile) is human-owned. Capability arms: full = hard tool-capable
> refusal (unchanged); lite = soft — non-tool models run visible READ-ONLY trackers
> (steering + manual edits, badged; derived per-turn, never stored) until the Tier-3b polyfill.
> Combat slots (`sheet.maxHp`, volatile `hp`) are nullable; full-mode seeding makes them
> invariant-present (verb-enforced). Graduation = `rpg.setMode`, both directions, guarded — a
> config flip, never a migration. Cards contribute stat VALUES (`extensions.rpgStats`, name-matched
> onto the profile at seeding); the game owns the schema. All schema deltas ride the pre-launch
> `0000_baseline` regen.

### 10.2 rpg-design doc amendments (rider notes at the cited sections; the set stays the spec)

| Doc | Change |
|---|---|
| README | truth-table row for the L-chunks + the mode axis; reading order gains `13-lite-mode.md`; the one-paragraph design gains the mode sentence |
| 01 | §6 non-goal REWORDED per §7 above; §5 ADD list notes the profile spine |
| 02 | §2 layout: `MODE_POLICY` home in `contract/`; service surface + `setMode`; the lite gather arm |
| 03 | §1 `rpg_games.mode` column; §1.1 config gains `statProfile`/`lite`; §2.2 volatile `hp` nullable; **§4.1 REWRITTEN** (record attributes, nullable maxHp, poolDef hints, the profile as vocabulary owner, seeding respec §5.2); §8 widget `subjectName` |
| 04 | **§2 REWRITTEN at the attribute seam**: `SKILL_ATTRIBUTE_MAP`→profile data, `attributeModifier(profile, score)`, governing/default from profile, missing-key=center; §10 perception key from profile; the alias-map paragraph replaced by the §5.2 name-match rule |
| 05 | §1 gather: mode dispatch + the lite injection + `liteTrackersReadOnly`; §3: MODE_POLICY cites the tool table as count home; `update_scene` arg gains customFields |
| 06 | §1 note: the GM preset is FULL-mode; lite prompt = the injection (pointer to 13) |
| 09 | §c cross-ref updated to the §7 line; §(+) polyfill note gains the lite read-only interim |
| 10 | the L0–L3 chunks inserted (L0 pinned FIRST); R6 world-gen input gains the profile |
| 11 | lite client surfaces (create dialog, editor, badge) + view-union note; C-chunk reuse map |
| 12 | §1 note: `assignGmSeat` refuses lite (policy); the seat is a full-mode plane |
| **NEW `13-lite-mode.md`** | the lite tier spec proper: §3.2/§3.3 scope tables, the steering injection (§4.4), capability arms (§4.2), definition UX (§5), graduation (§3.4), test plan — self-contained for a cold lite-chunk builder |

`../proposed/INDEX.md`: the rpg-design row notes "D86 amendment: lite/profile spine — L0 regen
precedes further R-chunks."

---

## 11. Resolution ledger (the brief's §6, one line each)

1. **Stat spine** → profile-as-data (`config.statProfile`), modifier-space compatibility, two
   call sites re-parameterized, six→packaged-d20 data. (§2)
2. **Lite ↔ full** → `mode` axis + exhaustive `MODE_POLICY`; lite scope tables §3.2/§3.3;
   graduation = guarded `setMode` flip. (§3)
3. **Lite updates** → the built D48 tool subset, zero new tools; prose-rewrite stays dead;
   read-only honest arm for non-tool models. (§4.1–4.3)
4. **Steering line** → lite's depth-0 injection (state block + license + hints +
   `steeringNote`); never a preset; per-entity by construction. (§4.4)
5. **Definition UX + homes** → host/member editors over profile/poolDefs/widgets (§5.1); cards
   contribute values not schema (§5.2); portable JSON export (§5.3).
6. **Cohesion** → the §6 shared-machinery map; one volatile plane, one write-policy rule (§4.5);
   type-level mode projections.
7. **Extensibility line** → vocabulary = foundation NOW; resolution = D46 plugins LATER; 01 §6
   reworded. (§7)
8. **Doc/ledger deltas** → D86 draft + per-doc amendment table + new doc 13. (§10)

The two facts that make this plan cheap enough to do RIGHT NOW: the rigidity is two call sites
and one schema field (§1), and lite's write path already exists (§1, §4.1). The window-closing
work is L0 alone — one regen wave. Everything after it is additive.
