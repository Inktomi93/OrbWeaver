# 06 — The GM: Preset-Owned Voice, the Format Reminder, and the Async Crew

> **Status: PROPOSED design (prescriptive).** How the GM is COMPOSED: (in-turn) the preset-owned
> system prompt + rpg macros + the depth-0 format reminder + the tool set; (async) the Workload
> crew that does the offscreen GM work. There is NO agent pipeline (buddy.md invariant #3) and NO
> out-of-band blocking LLM call anywhere in the turn path. Marinara evidence cited `(marinara: …)`;
> the verbatim instruction passages marked STEAL come from the verified `gm-prompts.ts` dissection
> and are the strongest prompt-craft in the source — port their CONTENT (with the listed edits),
> not their string-concatenation mechanism.

---

## 1. The GM voice lives in a PRESET (seam 09a, decided here)

**DECISION: game-mode GM prompting = a normal `PromptConfig` preset + rpg-supplied macros.** At
`rpg.createGame` the server clones the packaged **"RPG Game Master"** preset into the host's
library (the preset COW pattern) and sets it as the chat's active preset. Users tune the GM —
reorder sections, edit instruction text, adjust params — in the normal preset editor; `rpg` never
builds a prompt string. *(Rejected: a hardcoded GM prompt builder à la marinara's 1,312-line
`gm-prompts.ts` — untunable without a fork, and it duplicates the assembly pipeline the preset
system already owns. Rejected: a new "preset kind" enum — `presets.kind` is a free-text label;
the packaged preset is data, not a type.)*

The packaged preset's SECTION LIST (order matters — this encodes marinara's verified recency
design: stable identity/rules/secrets early; volatile state arrives via the reminder injection):

| # | Section (marker) | Content (template referencing rpg macros from 05 §1) |
|---|---|---|
| 1 | `gm_role` | the GM persona. Standalone default: STEAL *"You bring the world to life with vivid imagination, memorable NPCs… you crack (snarky) jokes, build tension, celebrate epic moments, and mourn losses."* Character-GM (config.gm.kind="character"): the card renders here via the normal card section + a *"you are this character, acting as a Game Master"* wrapper line |
| 2 | `game_frame` | genre/setting/tone/difficulty bullets — `{{rpgWorld}}` |
| 3 | `gm_instructions` | the core GM law (below §1.1) — plain editable text |
| 4 | `rating_guidelines` | SFW/NSFW block keyed off config.rating |
| 5 | `server_context` | header STEAL: *"Server-Computed Context (narrate these, don't recalculate)"* — `{{rpgSceneState}}` `{{rpgMorale}}` `{{rpgPerception}}` `{{rpgMap}}` |
| 6 | `gm_secrets` | `{{rpgSecrets}}` — story arc + twist bank + hidden clocks + campaign plan, with STEAL framing: *"Optional pacing scaffolding. Use it when it fits; ignore clocks or seeds when the current game is meant to stay chill, domestic, or low-pressure."* |
| 7 | `continuity` | `{{rpgContinuity}}` — all session summaries compact + latest detailed (§5) |
| 8 | `cast` | `{{rpgCast}}` — party sheets/arcs + persona + top-12 NPCs |
| 9 | `chat_history` | the pivot (standard) |
| 10 | `post_history` | empty by default (user's jailbreak slot, standard) |

Macro registration: the 8 `rpg*` macros land in `kit/macro`'s registry as data-fed macros (like the
group macros, chat.md Part III §8), values supplied per-turn from `RpgGatherResult.macros`;
`volatile:true` for all except `rpgWorld` (cache discipline). In a NON-game chat they resolve
empty — a user putting `{{rpgSceneState}}` in a random preset gets `""`, not an error.

### 1.1 The `gm_instructions` default text (the law of the table)

Port these verified marinara passages VERBATIM into the packaged preset (they are earned,
model-tested design):

- canonical-truth: *"System blocks, weather updates, and tool results are canonical truth. Do not
  recalculate or contradict them."* (edited: "tags/[bracketed] blocks" → "tool results")
- intent-not-success: *"Narrate in second person from the player character's limited POV… Treat
  player input as committed intent, not guaranteed success…"* (incl. the gagged-player example —
  it's the clearest teaching example in the whole corpus)
- fairness: *"Keep the game fair but challenging. Reward creativity, punish recklessness, and never
  treat the player as a Mary Sue… Failure is part of play."*
- epistemics: *"No one is omniscient. Characters should know only what they personally witnessed,
  inferred from available evidence, learned from public reputation, or were told by someone
  in-scene… When unsure, let them be wrong, suspicious, confused, or curious instead."*
- party jurisdiction: *"You also play the party members who have their autonomy and emotions, but
  the outcomes of their actions and lines are also under the GM's jurisdiction."*

ADD (net-new, from 01's design pillars): a fail-forward clause — *"A failed or partial check always
changes the situation: narrate the consequence the tool result names. Never narrate 'nothing
happens.'"* — and an agency-exit clause — *"End every turn at a point where the players can act."*

## 2. The format reminder (the depth-0 injection — 05 §1)

Built by `substrate/reminder.ts` per turn; injected as ONE `role:"system"`, depth-0,
`ignoreBudget` injection (chat's single `Injection[]` list — the recency half of marinara's split,
kept because a 2k-token contract block sitting adjacent to generation measurably beats the same
text buried mid-system-prompt). Blocks, in order:

1. **`<current_state>`** — one line: `State: exploration | Session #2 | Day 3, 14:30 | <location>`.
2. **`<output_format>`** — narration/dialogue rules. STEAL the thinking scaffold (*"Think step by
   step to decide the next turn: current location and time, the story up to this point… and the
   next point at which player agency returns."*), the no-parroting block (*"NEVER echo dialogue…
   Player agency is not player immunity: the player controls intent, not the world's response."*),
   the turn-length rule (*"If player agency is low (exploration, travel/rest), go longer; if high
   (combat, dialogue, intense danger), stay concise."*), and a TONED-DOWN anti-slop line (the
   ALL-CAPS tirades are model-fashion — keep the "state what happens instead of what doesn't"
   instruction, drop the shouting). **No dialogue-line tag grammar** — orbweaver renders prose +
   markdown; the sprite-expression line format dies with the VN layer (expressions integration is
   the committed classify hook, 09e).
3. **`<tools>`** — the tool contract: when to `skill_check` (STEAL the DC ladder + honesty text:
   *"only when uncertainty should be resolved mechanically. Abandon positivity bias: choose the DC
   fairly (5 trivial, 10 routine under pressure, 15 hard, 20 desperate); narrate the consequence in
   the same turn"*), when to `advance_time`/`move_party`/`update_scene` (every scene frame),
   `tick_clock` guidance (visible clocks tick ON-SCREEN — say so in narration), `start_encounter`
   ("a rolled combat encounter is an invitation, not a command — players may talk, sneak, or flee"),
   `update_reputation` (the action enum is closed — pick the nearest listed action).
4. **Variant blocks** (from `flags`, 05 §1): `playerRolledDice` → *"the player rolled — use it as
   the base via skill_check.usePlayerRoll"*; `addressMode:"party"` → party-conference (scene frozen);
   `addressMode:"gm"` → OOC answer, no narration, no state tools; `encounterActive` → the encounter
   adjudication block (07 §2; STEAL: *"rounds are resolved by the encounter engine; do not
   recalculate combat mechanics"*).
5. **`<party_boundary>`** (when companions exist) — STEAL: *"There is a hard GM/PARTY information
   boundary: party dialogue must never reveal or hint at hidden arcs, plot twists, unrevealed
   motives… No spoilers, overguiding, or meta leakage."* (The firewall is prompt-tier for companion
   VOICE — acceptable because the mechanical secrets are server-projected anyway, P3; marinara's
   party voice folded into the GM the same way after its party-turn agent went vestigial.)
6. **`<widgets>`** — custom widgets only: current values + `set_widget_value` mapping. Bound
   widgets are absent (nothing for the model to maintain — the binding IS the truth).
7. **`<special_instructions>`** — `config.additionalPreferences` (the user's table rules — always
   last, always wins).

## 3. The async crew — WorkloadKinds (the GM's offscreen hands)

Every crew member = a `WorkloadKind` (workloads.md gold standard: kind + params/result schemas +
runner + `RUNNERS` entry) whose runner reaches rpg through `WorkloadRpgEnv` ops on the runner-env
(the ONE composition hub) and thinks via the **injected sealed `agentTurn`** (buddy Option B — no
second agent system) with D48 `responseFormat` structured output validated by the contract schema
(one bounded retry; then workload `failed`, retryable from the workloads UI — the JSON-repair modal
is DEAD).

| Kind | Trigger | Input → Output (schemas in `contract/crew.ts`) | Writes |
|---|---|---|---|
| `rpg-world-gen` | `rpg.createGame` wizard finish | config + roster cards + attached CONSTANT world-info entries (marinara's rule: only constant entries exist pre-play) → `RpgWorldGenPayload` (§4) | applies via `applyWorldGen` verb → status `ready` |
| `rpg-session-distill` | host `rpg.concludeSession` | full-session transcript (middle-trimmed head/tail — marinara's 65/35 rule) + journal recap + latest snapshot + current secrets → `{summary: RpgSessionSummary, progression: {storyArcSecret?, plotTwists?, retiredTwists?}, sheetProposals: {partyMemberId, changes}[], moraleAdjust?}` | summary → `rpg_sessions`; progression applied (empty = carry forward — marinara's merge rule); sheet proposals + downtime STAGED for host accept (`rpg.applySessionOutcome`) |
| `rpg-recap` | `rpg.startSession` | latest summary + the literal final narrated beat (STEAL: *"Use that ending beat to anchor the opening situation precisely"*) → `{recap: string}` (2–3 paragraphs, ends on a hook) | posts the narrator recap message; seeds the session's born-committed snapshot (03 §2.4) |
| `rpg-director` | cadence: every N assistant turns (default 8, config) — `onTurnCompleted` bumps a counter and enqueues when due; also on `clockCompleted` | secrets + clocks + last-K transcript digest → `{arcStatus: "active"\|"completed", updatedArc?, successorArc?, twistOps: {add?\|retire?}[], clockTicks: {clockId, ticks}[] (hidden clocks only, ≤1), newHiddenClock?}` | applies to `rpg_games` secrets + `rpg_clocks`. Marinara's director double-loop (evaluate → if completed, immediately author successor) becomes ONE workload run with both steps inside the runner — async, never blocking a turn (the Agent-Port-Map rule) |
| `rpg-lorebook-upkeep` | after `rpg-session-distill` succeeds, when `config.lorebook.keeperEnabled` | session summary + transcript + existing entry index (cap 80) → `{entries: {entryName, keys[], content, tag}[]}` — STEAL the brief: *"durable continuity only… When exact dialogue matters, copy the exact lines"*; session-stamped entry names; ≤1 world-lore + ≤1-per-member + ≤1 revelations | via injected `worldInfo.upsertEntries` op (domain-of-affect: world-info owns the write; rpg owns the WHEN) — constant entries, replace-same-session-on-rerun |
| `rpg-illustration` | `request_illustration` tool (cadence-gated) or host button | prompt + subjects + art style + avatar refs → image | via injected `imagery.generatePicture` (08) — posts a `MessageMedia` narrator message on completion |
| `rpg-npc-portrait` | new NPC upsert (when imagery enabled) | npc identity fields + art style → image | `rpg_npcs.avatarAssetId` (08 §2) |

NOT crew (dissolved): marinara's tracker agents (world-state / character-tracker / persona-stats /
custom-tracker / quest) — their entire job was extracting state from prose; tools made extraction
obsolete (the model WRITES state as it narrates, lock-merged). prose-guardian/continuity rewriters —
out of rpg scope entirely (if ever wanted they're a generic chat post-turn Workload per the
Agent-Port-Map, not a game concern). knowledge-retrieval/router — that's databank + world-info
(09d). The scene-analyzer sidecar — its HUD/tracker half is tools; its visual half is
`rpg-illustration`; its music half is dropped (media out of scope).

## 4. Setup: session zero (the wizard → world-gen → review → start)

1. **`rpg.createGame(chatId, config)`** (host-only; chat must have ≥1 character or be solo-ready):
   validates the connection resolves a tool-capable model (05 §3), clones the GM preset, writes
   `rpg_games` (status `setup`) + the `metadata.rpg` pointer.
2. **`rpg-world-gen` workload** — ONE structured completion (marinara: the "one big call" that
   demands a top-tier model; the wizard says so up front). Output `RpgWorldGenPayload`:

```ts
export const rpgWorldGenPayloadSchema = z.object({
  worldOverview: z.string().min(200),                      // player-visible
  storyArcSecret: z.string().min(50),                      // STEAL brief: "SECRET. Compact campaign arc in 2-4
                                                           // sentences… If the game is chill or sandbox, define
                                                           // soft ongoing tensions instead of a rushing plotline."
  plotTwists: z.array(z.string()).min(1).max(6),           // "revelation | clue | false explanation | reveal trigger | fallout"
  startingMap: z.object({ name: z.string(), regions: z.array(z.object({
    name: z.string().max(24), type: z.enum(["town","wilderness","dungeon","building","camp","other"]),
    description: z.string(), revealed: z.boolean().default(false), connectedTo: z.array(z.string()) })).min(3).max(6) }),
  startingNpcs: z.array(rpgWorldGenNpcSchema).min(2).max(5), // "first impression, voice/cadence, desire, and one
                                                             //  secret or complication" — the STEAL brief
  partyArcs: z.array(z.object({ memberName: z.string(), name: z.string(), arc: z.string(), goal: z.string() })),
  sheets: z.array(z.object({ memberName: z.string(), sheet: rpgSheetSchema })),  // only for members lacking card rpgStats
  artStylePrompt: z.string().max(300),
  hudWidgets: z.array(rpgWorldGenWidgetSchema).max(4),
  campaignClocks: z.array(z.object({ name: z.string(), segments: z.enum([4,6,8]), kind: z.enum(["front","countdown"]),
    consequence: z.string() })).max(2),                     // marinara's blueprint clock cap — kept
  questSeeds: z.array(z.string()).max(3),
  lootTable: rpgLootTableSchema,                            // 04 §5 — 20-40 campaign-themed items
});
```

   Constant lorebook canon injects as *"Selected constant lorebook canon that MUST be treated as
   true for this world"* (marinara's exact framing — kept).
3. **`applyWorldGen`** — regions → node map (circular layout, first region revealed), NPCs rows,
   party rows + sheets (card `rpgStats` wins over generated sheets — the user's authored numbers
   are canon), clocks (born `visibility:'hidden'` for fronts — the GM reveals pressure through
   play), widgets (bindings inferred: an HP widget binds `party-hp`; unrecognized → `custom`),
   loot table, secrets. Status `ready`.
4. **Host review** — the wizard's last screen renders the payload (worldOverview/map/NPCs/sheets
   editable via normal verbs); regenerate = re-enqueue the workload (single-active-per-kind makes
   double-clicks safe).
5. **`rpg.startGame`** — status `active`; `rpg_sessions` row #1; seeds the born-committed initial
   snapshot (clock Day 1 08:00, location = first region, party volatiles at full); triggers the
   first GM turn (a normal chat `generate` — the opening scene comes from the same one pipeline;
   marinara did the same via an invisible startup generation).

## 5. Session lifecycle + the coherence interlock

Verbs: `startSession` (host) → recap workload; `concludeSession` (host, or PROPOSED by the model
via `end_session` + host confirm) → distill workload → `applySessionOutcome` (host accepts sheet
evolution/downtime proposals; edits allowed). The three-layer coherence interlock (marinara's
verified design, kept wholesale): (1) **summaries with detail-decay** — ALL summaries ride
`{{rpgContinuity}}` compactly, only the LATEST contributes the granular carryover block (STEAL the
framing: *"Use only this block for the immediate carryover state from the most recently completed
session"*); (2) **secret progression** — the distill pass conservatively rewrites the arc/twists
(*"Treat the completed session as seed material for FUTURE secret GM planning"*) so the hidden
spine evolves with play; `nextSessionRequest` (captured at wrap from the players) steers it;
(3) **lorebook upkeep** — verbatim-capable, key-triggered recall beyond summaries. Underneath,
snapshots/locks/checkpoints keep the numbers authoritative so the model never has to remember them.

## 6. Hidden-information rings (P3, made structural)

| Ring | Contents | Who sees |
|---|---|---|
| GM-model-only | `{{rpgSecrets}}` (arc, twists, hidden clocks, campaign plan, quest gmNotes) | the system prompt + host read verbs. NEVER in member views (type-level, 03 §1) |
| Table-visible | worldOverview, HUD, visible clocks, revealed map, NPC reputation tiers, journal, quests (sans gmNotes) | all members |
| Player-private | (none in v1 — party knowledge is shared; reserved: per-player secret notes) | — |

The crew sees ring-appropriate slices: `rpg-lorebook-upkeep` gets summaries + transcript (no
secrets — its entries are table-visible); `rpg-director` gets everything (it IS the hidden hand);
`rpg-world-gen` writes the secrets. NPC recruit-card generation (07 §4) deliberately reads secrets
in → one card out (marinara's trick: companions arrive pre-wired to the hidden plot — kept).

## 7. Test plan

- Packaged-preset snapshot test (sections + order + macro references pinned).
- Reminder builder goldens: each variant flag flips exactly its block; widget block lists custom
  widgets only.
- Crew: per-kind runner tests with a mocked `agentTurn` returning (a) valid payload (b) invalid
  JSON → one retry → failed; schema round-trips for all crew payloads; director single-run
  evaluate+successor path; lorebook-upkeep replace-same-session idempotency.
- Interlock: distill with empty progression carries secrets forward unchanged (the merge rule).
- Secret-ring test: member view + lorebook-upkeep inputs contain no ring-1 strings (fixture canary
  values greped in outputs).
