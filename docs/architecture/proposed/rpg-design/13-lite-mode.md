---
kind: spec
status: active
updated: 2026-07-17
---

# 13 — Lite Mode: the Stats-Steering Tier (the mode axis, the steering loop, the capability arms)

> **⚠ BUILD-STATE RIDER (truth-repaired 2026-08-23, #25 re-derivation): the banner below is a
> LEGACY-MAIN claim, NOT a tree claim.** All five graduation receipt commits (`43d5169f` `4f5073ec`
> `3f6a57b2` `db60bd82` `c469b9ca`) live ONLY on `legacy-main` — `git merge-base --is-ancestor <sha>
> main` fails for every one. The full R1–R11 build (158 files) was purged by the 2026-07-25 retro
> burn-down; today's `domain/rpg` (75 files) is the LITE+GUIDED rebuild against
> `docs/design/lite-plus-guided-substrate-spec.md` — the live authority. Full mode is refused at
> mint (`RpgModeUnbuiltError`, create-game.ts:24), and this set's R4 turn mechanism is repealed by
> D109 (tools:\[] every mode; state extraction is a separate post-commit round). Read this doc as a
> content mine for a future full-mode GRAFT spec, never as a build record.
>
> **GRADUATED 2026-07-19 (D101) — REALIZED; the code is the doc.** \[LEGACY-MAIN ONLY — see the rider above.] The whole rpg-design set is BUILT:
> server v1 (R1–R11 + R-OBS) `43d5169f` · the full client `4f5073ec` · lite mode L0 `3f6a57b2` / L1
> `db60bd82` · the six straggler tail rows + RPG-CONSOLE-COMMIT `c469b9ca`. Any mid-build STATUS voice
> in this file ("IN FLIGHT / NOT BUILT / uncommitted / not yet complete / stub runner / R5 has NOT
> started") is PRE-graduation and SUPERSEDED — the CODE (`packages/{contracts,server,client}/src/**/rpg**`)
> wins on every detail. Frozen historical record. §Status's "NOTHING in this doc is built" is superseded — L0/L1 landed the lite vertical (MODE_POLICY.lite, buildLiteReminder, the lite client).

> **Status: COMMITTED (D86, 2026-07-17 — amends D58) — prescriptive design; the ledger D-entry wins
> on any conflict.** NOTHING in this doc is built (2026-07-17): it lands as the L0–L3 chunks (10 §L).
> **\[SUPERSEDED — AS-BUILT D101: the lite tier IS built — L0 `3f6a57b2` + L1 `db60bd82` (server) +
> L2/L3 in the wave-6 client close `4f5073ec`/`c469b9ca`.]**
> The design record with every weighed alternative: `docs/history/design/rpg-lite-and-full-cohesion-game-plan.md`;
> the prior-art evidence: the Marinara ST extension research (the Marinara ST
> *extension* — schema-as-data trackers + the steering line; distinct from the marinara RPG corpus
> docs 01–12 mined). This doc is AUTHORITATIVE for the mode axis and lite semantics; the stat-profile
> SCHEMA is 03 §1.2/§4.1, its engine consumption is 04 §2/§10 — this doc consumes both, never
> re-declares them.

**The one-paragraph design.** Lite turns a NORMAL chat — the user's own preset, characters, personas,
arbitration, voice — into a stats-steered chat: flexible character sheets (any stat vocabulary, via
the 03 §1.2 profile), meters, inventory, a scene cast with per-NPC fields, and custom HUD widgets,
all injected each turn with ONE steering license line so the values visibly shape behavior and story,
and all written back by the model through the SAME D48 tool path full mode uses. No GM seat, no dice
requirement, no checks/DCs, no clocks, no encounters, no maps, no sessions. It is the higher-demand
sibling of the full table ("give my character spicy stats + inventory and let the chat reference and
update them"), built on the identical foundation: same `rpg_games` row, same snapshots/locks/staging,
same widgets, same tools, same bus. Mode-ness is DATA (one column + one policy record) — the P4
discipline extended to the tier axis.

---

## 1. The mode axis + `MODE_POLICY` (game-ness stays data; tier-ness becomes data too)

`rpg_games.mode` — `text CHECK in RPG_GAME_MODES` (`["lite","full"]`, an `@orb/contracts/rpg` tuple),
notNull, default `full`, born via the L0 baseline regen (03 §1). Every mode-varying behavior
dispatches through ONE record in `domain/rpg/contract/`:

```ts
export const MODE_POLICY: Record<RpgGameMode, {
  tools: readonly RpgToolName[];        // the attached subset — 05 §3's table stays the ONE count home
  prompt: "gm-preset" | "injection";    // full: presetOverride + the 8 macros + the GM reminder · lite: §6's one injection
  seat: boolean;                        // assignGmSeat legal? (doc 12 §1 — lite: false)
  sessions: boolean; clocks: boolean; encounters: boolean; maps: boolean;
  morale: boolean; perception: boolean; checks: boolean; npcs: boolean;
  journal: boolean; quests: boolean; loot: boolean; timeWeather: boolean;
  requireToolCapable: "hard" | "soft";  // §5 — full refuses; lite degrades VISIBLY
}>
```

A verb invoked outside its mode's policy throws a typed `RpgModeUnsupportedError` — the guard reads
the record, never a scattered `if (mode === …)` in verb bodies (the §5.5 string-union-dispatch
discipline; a new mode member fails `tsc` at the Record). Chat changes NOTHING: `mode` lives entirely
behind the already-built injected ops; `no-if(isGame)` stands.

*(Rejected: a separate lite subsystem/table — lite needs exactly the machinery that was hardest to
build and is already built (swipe-keyed snapshots + the resolution ladder, locks/auto-lock, the
staging accumulator, widget bindings + swipe-keyed values, the tool registry, the bus); a fork
re-implements all of it and turns graduation into a data migration. Rejected: per-apparatus boolean
config flags — combinatorial soup with no legible product identity; "lite" is the shape users pick,
house rules stay the within-mode dials.)*

## 2. What lite includes (every row is BUILT machinery unless marked)

| Piece | Mechanism |
| - | - |
| flexible sheet (identity stats) | `rpg_party.sheet.attributes` over the game's profile vocabulary (03 §1.2/§4.1); `className` as free flavor |
| meters on the player/party (Health, Sanity, Corruption, …) | **pools** — `sheet.poolDefs` (+ per-def `hint`, 03 §4.1) define; snapshot `partyState[].pools` carry swipe-keyed values; `update_party.poolDeltas` writes; the `pool` widget binding renders a HUD meter |
| inventory | snapshot `partyState[].inventory` + `update_inventory` |
| scene cast + per-NPC text trackers | snapshot `presentCharacters` (name-only entries — `characterId`/`npcId` both null is legal) + `customFields`; `update_scene` upserts *(L1 gap: the tool arg gains `customFields` — 05 §3 #3)* |
| free-standing / per-NPC meters | `rpg_hud_widgets` `source:"custom"` + swipe-keyed `widgetValues`; `set_widget_value`; the custom config gains optional `subjectName` (03 §8) so "Corruption — Sera" groups under Sera in editor/tracker (display grouping only — no FK; the scene cast is volatile, a dangling name is inert) |
| running beats | snapshot `recentEvents` (via `update_scene.recentEvent`) |
| optional dice flavor | the composer dice button (`rollDice` verb → `[dice: …]` text — the MODEL adjudicates) + the `roll_dice` tool (server dice when the model wants honest randomness; zero state) |
| swipe safety / commit / locks / edit-wins | snapshots + `applyLockedPatch` + edit-auto-lock — verbatim shared with full (03 §2) |
| steering | the §6 injection |
| save points | checkpoints, unmodified (mode-blind pointer rows — 03 §10) |

## 3. What lite excludes (and where each ask lands instead)

No GM seat (the model is a narrator-partner; `assignGmSeat` refuses — and because a lite game's
`gmUserId` is always NULL, the built `requireGmSeat` tool gate passes with zero new code). No skill
checks/DCs. No encounters. No clocks (a countdown want = a counter widget). No maps. No sessions
(chat memory + `recentEvents` are the continuity). No morale, no perception, no loot tables, no
time/weather engine. No `rpg_npcs` rows (the scene cast + customFields + widgets cover per-NPC
tracking; reputation is full-mode machinery). No journal/quests in v1 — the policy record makes
enabling either later a data flip, not a design change.

*(WHY the line sits here: the demand signal is "stats + inventory + trackers that color a normal
chat" — every included piece serves that loop; every excluded piece serves the GAME loop (stakes →
resolution → consequence) lite deliberately doesn't run.)*

**Reserved, explicitly not v1:** a structured `meters[]` array on `RpgPresentCharacter` (if
entity-grouped numeric trackers outgrow the `subjectName` widget mechanism — a pure JSON-shape ADD,
cheap at any time) · per-player-private trackers (lite has NO hidden ring — every tracker is
table-visible; the member view IS the view; the projection machinery is shared with full, lite's
ring-1 is simply empty) · lite journal/quests.

## 4. The update mechanism — the D48 tool subset; ZERO new tools

Lite's write surface is `MODE_POLICY.lite.tools = ["update_party", "update_inventory",
"update_scene", "set_widget_value", "roll_dice"]` — five of the R4 registry's built defs.
Structured args, schema-validated, errors-as-data, lock-merged, staged through the per-turn
accumulator, swipe-safe on flush, provenance-recorded as `ToolCallRecord`s (the client chips render
them like any tool).

*(Rejected: the Marinara model-rewrites-JSON round-trip — the tag/JSON-in-prose grammar was
DELIBERATELY killed (01 §5: tools, not tags) to stop the model owning syntax and delete the repair
gauntlet; lite has no server-authoritative math, so the ONLY thing the prose round-trip buys is
model-agnosticism — which the Tier-3b polyfill delivers at the RIGHT layer (09 §+), invisible to
rpg, when it ships. Rejected: a dual-arm design (tools + a lite-only prose parser as local
fallback) — two update grammars forever, and the parser IS the polyfill built in the wrong layer.)*

**The write-policy rule (BOTH modes — the cohesion invariant):** the model writes VOLATILE state
only (pools, widget values, cast fields, inventory, conditions — swipe-keyed, lock-mediated);
IDENTITY is human-owned (`sheet.attributes`, `poolDefs`, the profile, widget definitions —
wizard/editor/host verbs; in full, session-wrap evolution per 03 §4.1, unchanged). No `update_stats`
tool exists in EITHER mode. *(WHY: keeps full's evolution discipline with zero mode branches, gives
lite a legible mental model — "stats are who you are; meters are what moves" — and closes the "the
model set my STR to 3" failure class Marinara accepts. "Toggle health down" is a pool edit: exactly
the volatile plane.)*

## 5. The capability arms (the local-model story, explicit)

- **Full: `requireToolCapable: "hard"`** — unchanged (a game turn IS a tool loop; `createGame` keeps
  `RpgModelNotToolCapableError`; 05 §3 / 10 §RC-A).
- **Lite: `"soft"`** — `createGame` succeeds on a non-tool connection and the game runs **read-only
  trackers**: the steering half of the loop (state → story) needs zero tools — values + hints + the
  license inject every turn; write-back is the member's own tracker edits (`editSnapshot`,
  auto-lock — built). The degrade is VISIBLE everywhere it matters: the create dialog says it
  up front ("this model can't update trackers — they'll still steer the story; you edit them by
  hand"), gather flags it (`liteTrackersReadOnly` on the gather result + views), the client badges
  the tracker panel, and the §6 injection omits every update instruction (the model is never asked
  to write what it can't). The flag derives per-turn from the resolved capability — never stored —
  so a model switch (or the polyfill landing) silently restores write-back.

*(Rejected: hard refusal in lite — kills the highest-demand mode for exactly the local-model users
who want it most. Rejected: silent best-effort — the named owner sin. This is the honest-arms
doctrine: hosted/tool-capable gets the full loop; local gets a REAL, labeled subset — steering
genuinely works; it is Marinara's load-bearing half.)*

## 6. The steering injection (the whole point)

Lite injects ONE depth-0 `role:"system"` injection per turn — the SAME `RpgGatherResult.injections`
channel full's format reminder rides (05 §1) — assembled by a `buildLiteReminder` sibling in
`substrate/reminder.ts` from the same rows the tracker view reads. Blocks, in order:

1. **The state block**, compiled per ENTITY: each party member (name, `className`, attributes with
   hints, pools `value/max` with hints, inventory summary, status line); each present character
   (name, mood, customFields); each custom widget (`label — subjectName?: value/max`, hint).
   Label-as-mini-prompt throughout: `Corruption (0–100, how morally compromised): 70` — the field
   NAME + hint ride into the prompt as guidance, so non-technical users steer by naming fields well.
2. **The steering license** (the Marinara insight, adapted): *"Let each entity's trackers color
   their behavior, dialogue, and the scene — a high or low value should visibly shape how that
   character acts and what happens. Acknowledge changes when relevant; never recite the numbers."*
   Without this line the stats are inert display; with it they steer. Both directions: state→story
   (this license) and story→state (the §4 tools).
3. **Update guidance** (tool-capable turns only): which tool maintains which tracker; locked fields
   are the server's to enforce, not the prompt's.
4. **`config.lite.steeringNote`** (03 §1.1) — a per-game user-tunable sentence appended last (the
   always-wins slot, mirroring `additionalPreferences`) for "lean into it harder" / "keep it
   subtle" tuning without touching packaged prose.

**No preset override in lite** — `resolvePresetOverride` returns null for lite games; the user's own
preset/character/persona assembly runs untouched, and the 8 `rpg*` macros resolve empty (they are
full-mode surfaces). *(WHY: lite's contract is "color a NORMAL chat" — cloning a packaged narrator
preset over the user's tuned RP voice would replace the thing lite exists to augment; full keeps the
GM preset because its voice IS the product there. Rejected: a packaged lite preset — voice-destroying;
rejected: macro slots in the user's preset — requires hand preset surgery before trackers work; the
injection needs zero preset changes and is exactly the channel injections exist for.)*

## 7. Definition UX + data homes

| Definition | Home | Editor (client — 11) |
| - | - | - |
| attribute vocabulary + hints + range/modifier | `config.statProfile` (host; packaged `d20`/`special`/`freeform` template pick at create, then row-level edits per 03 §1.2 mutability) | the lite create dialog + a "Stats & Trackers" pane |
| per-member meters (poolDefs + hints) | `rpg_party.sheet.poolDefs` (member own row / host all — the 07 §3.1 axis) | sheet drawer "add meter" row: name + max + hint |
| free/per-NPC meters | `rpg_hud_widgets` + `subjectName` — host CRUD (existing verbs) | the widget editor (C7's form, reused) |
| per-NPC text fields | snapshot `presentCharacters[].customFields` — model + member edits | tracker cast rows (C4's editor, reused) |
| the steering note | `config.lite.steeringNote` | the lite settings pane |

Every "add" is one row append on a typed schema — keys minted from labels (snake-cased,
collision-validated on add). **Card seeding:** a `characters` card MAY carry `extensions.rpgStats`
(parsed via `rpgCardStatsSchema`, `@orb/contracts/rpg`) — stat VALUES name-matched onto the game's
profile vocabulary at seeding; unmatched keys surface to the host, never silently dropped; the
character domain stays rpg-blind (the residual `extensions` blob — no schema change). The game owns
the SCHEMA; cards contribute VALUES. **Portability:** the profile (+ poolDef/widget-def companions)
exports as a plain JSON file and imports at create — how one user's Vampire sheet becomes a
shareable artifact; a hub/library surface is out of scope.

## 8. Graduation — `rpg.setMode(chatId, mode)` (host-gated, both directions)

- **lite → full**: requires a tool-capable connection (the hard gate applies from here on); clones
  the packaged GM preset → `gmPresetId` (lite never had one); sets narrator group config; backfills
  the full-mode sheet invariant (`maxHp`/volatile `hp` seeded `10/10` where null — host edits
  after); the client then runs the full wizard's remaining session-zero steps (world-gen optional —
  a graduated chat may keep its organic world). Sheets, pools, widgets, cast, snapshots, locks all
  carry over BY CONSTRUCTION (same tables, same plane).
- **full → lite**: refused while an encounter is `active` or a session is `concluding`; the full
  apparatus (clocks/maps/npcs/sessions) stays in the db, dormant — nothing is deleted; flipping
  back restores it.

*(Rejected: graduation-by-recreate — throws away snapshots/history and breaks the `metadata.rpg`
pointer for nothing. The flip IS the payoff of §1's one-foundation shape.)*

## 9. Test plan

- **Mode-policy matrix**: every mode-varying verb × mode → allow / typed
  `RpgModeUnsupportedError` (table-driven, exhaustive over the verb list).
- **Lite gather suite**: injection content goldens (state block per entity, hints, license,
  steeringNote last); the read-only variant omits update guidance; the tool subset attaches
  exactly `MODE_POLICY.lite.tools`; `presetOverride`/macros null-or-empty; a lite game's turn on a
  chat with the rpg ops wired ≠ a non-game turn (the injection present) but a NON-game chat stays
  byte-identical (the existing 05 §8 pin, re-run).
- **Steering round-trip (mocked model)**: a scripted `update_party.poolDeltas` +
  `set_widget_value` + `update_scene.customFields` sequence through the REAL recurse loop mutates
  the staged snapshot; flush on commit; **swipe-rewind on a lite pool/widget write** (the Marinara
  lesson pin — every swipe carries its own stats).
- **Capability arms**: lite createGame succeeds on a no-tools connection with
  `liteTrackersReadOnly` derived true; flips false when capability resolves tools (no stored
  state); full createGame still refuses.
- **Graduation round-trip**: lite→full→lite leaves a playable game (preset cloned once, hp
  backfilled, guards fire mid-encounter).
- **Write-policy pin**: no registered tool writes `sheet.attributes`/`poolDefs`/profile (registry
  contract test over the tool tuple).

## 10. Cross-refs

01 (pillars; §6 non-goal as amended) · 03 §1/§1.1/§1.2/§2.2/§4.1/§8 (mode column, config, profile
schema, nullable combat slots, widget `subjectName`) · 04 §2/§10 (the profile-parameterized engine)
· 05 §1/§3 (gather dispatch, the tool subset, the `update_scene` arg) · 06 §1 (the GM preset is
full-mode voice) · 09 §c/§+ (the extensibility line; the polyfill + the read-only interim) ·
10 §L (the L0–L3 chunks; L0 = the window-closing regen) · 11 (lite client surfaces) · 12 §1 (the
seat is a full-mode plane) · `docs/history/design/rpg-lite-and-full-cohesion-game-plan.md` (the design record).
