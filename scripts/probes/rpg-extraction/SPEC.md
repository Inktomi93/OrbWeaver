# Spike: narrative+state extraction — method matrix over a fixed 6-turn game

## Goal & WHY
The rpg loop currently does the state-extraction as a SEPARATE post-commit model call
(`reliable`=structured-output round, `cheap`=tool round). the owner wants to know if we can fold
extraction into the main narrative turn (one call) and whether that's actually better. This spike
plays ONE fixed 6-turn game through EVERY candidate method and measures cost / latency / quality /
state-completeness per turn, so we can SEE turn-by-turn what each method extracts and pick a direction.
This is a THROWAWAY benchmark — no production wiring, no gates, lives only under this scratchpad dir.

## Model & creds
- Model: `anthropic/claude-sonnet-5` (verified on OR: tools+structured+reasoning+max_tokens, 1M ctx).
- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`.
- API key: read `OPENROUTER_API_KEY` from the repo `.env` at runtime (`node:util` `parseEnv`, or parse the line).
  NEVER print, log, or write the key value anywhere. Auth header `Authorization: Bearer <key>`.
- Every request: `stream:false`, `usage:{include:true}` (so the response `usage` carries `cost`,
  `prompt_tokens`, `completion_tokens`, `completion_tokens_details.reasoning_tokens`).
- Spend is authorized (~$2-4 total). Bound it: 7 methods × 6 turns × 1 rep. Do NOT loop-retry beyond
  2 attempts per call. If total calls would exceed ~70, STOP and report instead.

## Real templates (LOAD these — do NOT reconstruct)
Under this dir (`scratchpad/spike/`):
- `real-cheap-toolround.json`  — real body of a cheap tool round. `.tools` = the 7 production tools
  (update_party, update_inventory, update_scene, set_widget_value, upsert_quest, add_journal_entry,
  no_changes). `.tool_choice` = "required". USE `.tools` verbatim for cheap/tool methods.
- `real-reliable-structured.json` — real reliable body. `.response_format` = the `rpg_state_extraction`
  strict json_schema (top props: party, inventory, scene, widgets, quests, journal). `.messages[0]`
  (system) = the real extraction system prompt. USE these verbatim for reliable/structured methods.
- `real-narrative-turn.json` — real narrative body. `.messages[0]` (system, has cache_control) = the
  GM persona. The last user message = the `[Note from system: # Game state ...]` reminder that folds
  tracked state into the turn. Study its FORMAT (below) and regenerate it each turn from evolving state.

## The reminder / state-fold format (regenerate each turn from running state)
The narrative turn's final user message = the player action, followed by a fenced block:
```
[Note from system: # Game state
Scene: <location> · <date> · <time-of-day> · <weather> (<weather detail>)
Story: <title> — act <n>/<m>: <arc label> — <one-line situation>
Party:
- <PC name> — (<role>) — Lv <n> — HP <cur>/<max> — <pool a> <c>/<m>, ... — <gold> gold, <silver> silver — carrying: <item, item ...> — <status>
Present:
- <emoji> <NPC name> — <mood> — <relationship> — Trust <n>/100 — Role: <role>
Active quests:
- <title> [<status>]
  ○ <objective>
Recent beats:
- <beat>            (keep last ~3)
CHANGES SINCE LAST BEAT: <the delta rendered from prev→cur state, e.g. `quest "X" started`, `HP 31→24 (-7)`, `+ Sealed Letter`>
<KEEP the two trailing instruction paragraphs from the real template VERBATIM — the immersive-card
 grammar (`:::card title="…"` … `:::`) and the "let tracked values shape behaviour, never recite raw
 numbers" paragraph. Copy them out of real-narrative-turn.json so they're byte-identical.>]
```
The `CHANGES SINCE LAST BEAT` line is the DELTA — compute it by diffing the running state before vs after
the previous turn's extraction (numeric deltas `a→b (±d)`, added/removed items, quest transitions,
relationship/trust shifts, scene changes). Turn 1 has no prior state → use `SCENE OPENS` instead.

## Seed (all methods START identical)
Fresh game, minimal state so we watch it POPULATE from nothing:
- Scene: unset (turn 1 establishes it).
- Story: "The Ashfall Courier" — act 1/3.
- Party: one PC — `Kestrel` — role "sellsword" — Lv 2 — HP 22/22 — Stamina 10/10 — 0 gold, 5 silver —
  carrying: Worn Shortsword, Traveler's Cloak — status: dry.
- Present cast: none. Quests: none. Journal: empty.

## The 6 fixed player actions (identical for every method, every turn)
1. "I push through the tavern door, shake off the rain, and scan the room for anyone who looks like they're waiting for someone."
2. "I sit across from the hooded figure and slide my last three silver across the table. 'You're Ashe? I was told you had work.'"
3. "I take the job. Ashe hands me a sealed letter — I tuck it into my coat and ask where the courier went missing."
4. "On the road at dusk, I reach the overturned courier cart. I draw my blade and approach, watching the treeline."
5. "Two bandits rush from the brush. I roll to strike the nearer one before they close."
6. "Wounded but still standing, I search the wrecked cart for the courier's missing satchel."

## Methods (7) — how each turn is executed
Let `narrativeBody(state, action)` = persona system + running narrative history (prior turns'
assistant+user) + final user message (action + regenerated reminder). Let `extractSys` = the real
extraction system prompt; `stateSchema` = the real `rpg_state_extraction` json_schema; `tools` = the
real 7 tools.

- **M1 `2call-reliable`** (today): call A = `narrativeBody` (no tools, no format). call B = structured:
  messages `[extractSys, {user: RECENT STORY + CURRENT STATE + LATEST BEAT=A's narrative}]`,
  `response_format: stateSchema`. State ← B's object.
- **M2 `2call-cheap`** (today): call A = `narrativeBody`. call B = `[extractSys-ish, LATEST BEAT]` with
  `tools`, `tool_choice:"required"`. State ← apply B's tool_calls.
- **M3 `1call-tools`**: single call = `narrativeBody` + `tools`, `tool_choice:"auto"`, reasoning off.
  Narrative ← message.content; state ← apply message.tool_calls.
- **M4 `1call-tools+reasoning`**: M3 + `reasoning:{effort:"high"}`.
- **M5 `1call-structured-wrapper`**: single call, `response_format` = json_schema wrapping
  `{narrative: string, state: <stateSchema.schema>}`, reasoning off. Narrative ← parsed.narrative;
  state ← parsed.state.
- **M6 `1call-wrapper+reasoning`**: M5 + `reasoning:{effort:"high"}`.
- **M7 `1call-tools-required`**: M3 but `tool_choice:"required"` (does it still narrate? — record
  content length; this tests whether forcing tools kills the prose).

Notes:
- `max_tokens`: 3000 for narrative-bearing calls, 1500 for pure extraction (B calls). Raise to 4096 if
  any call truncates (`finish_reason:"length"`).
- Apply semantics (harness approximation — DOCUMENT it): maintain running state JSON with sections
  {scene, story, party[], present[], quests[], inventory{items[],gold,silver}, widgets{}, journal[]}.
  Structured object → deep-merge its sections. Tool calls → apply each by its documented effect
  (update_party merges HP/pools/status on the named actor; update_inventory merges items/wallet;
  update_scene sets scene fields + present cast; upsert_quest add/update/complete; add_journal_entry
  appends; set_widget_value sets a widget; no_changes = noop; roll_dice if present = record the roll).
  It need not be byte-perfect vs prod apply — it must be CONSISTENT across methods so the comparison is fair.

## Metrics (record per method per turn, and aggregate per method)
Per turn: latency_ms (sum of A+B for 2-call), prompt_tokens, completion_tokens, reasoning_tokens,
cost_usd (from usage), finish_reason, narrative_chars, state_present(bool),
state_completeness = count of populated planes this turn (scene set? ≥1 present cast? ≥1 quest?
inventory changed? party status/HP changed?), null_or_empty_fields count, and a 1-line human-readable
delta summary. Also capture whether an immersive `:::card` was emitted (regex on narrative).
Per method aggregate: total cost, total latency, mean state_completeness, turns-with-narrative,
turns-with-full-state, any failures.

## Outputs
- `scratchpad/spike/out/<method>/turn-<n>.json` — full raw {requestMeta(no key), response message, usage}.
- `scratchpad/spike/out/<method>/transcript.md` — human-readable: per turn = player action → narrative →
  extracted state (pretty) → delta line. THIS is what Alex reads to see behavior.
- `scratchpad/spike/out/summary.json` — the metrics matrix.
- `scratchpad/spike/out/SUMMARY.md` — a markdown comparison table (methods × [cost, latency,
  mean completeness, narrative kept?, notes]) + a short prose verdict on which method(s) look best on
  the cost/quality frontier and any that outright failed (e.g. M7 no narrative, a method truncating).

## Report back (compact — do NOT paste raw turns)
Return ONLY: the SUMMARY.md contents (the table + verdict), the total spend, and any method that
failed or surprised. I (orchestrator) will read the transcripts/artifacts myself for deep-dive.
Language: TypeScript run via `tsx`, or plain Node .mjs with fetch — your call; keep it ONE script +
the templates. No new deps beyond what the repo has (global fetch is built in; `node:util`'s `parseEnv`
reads `.env`).
