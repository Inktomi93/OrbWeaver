# Spike 2: field-coverage audit of the 1call-tools path (A/B: terse vs enriched descriptions)

## Goal & WHY
Spike 1 picked `1call-tools` (persona prompt + 7 tools + tool_choice:auto, one completion). Owner
observation: MANY tracked fields never get populated in practice — the model fills the obvious ones
(location, hpDelta, quest name) and skips the rich ones (NPC appearance/outfit/thoughts, customFields
trust/role, relationship, plot.actSummary, addCondition, poolDeltas, item description/location,
calendarDate/day, widgets). Hypothesis: the TERSE tool descriptions don't tell the model WHEN to fill
each field, so it doesn't. This spike measures per-field coverage over a rich multi-turn game, A/B:
current terse descriptions vs enriched "when-to-use + example" descriptions. Deliverable = a coverage
matrix + verdict on whether enrichment fixes the gaps, and which fields STILL get skipped.
Throwaway — lives under scratchpad/spike/, reuses the Spike-1 OR plumbing in run.mjs.

## Reuse from Spike 1
- OR call plumbing from `scratchpad/spike/run.mjs` (env OPENROUTER_API_KEY from repo .env — NEVER print;
  model `anthropic/claude-sonnet-5`; stream:false; usage:{include:true}; the reminder/state-fold format).
- The 7 tools live in `real-cheap-toolround.json` (`.tools`). Arm A uses their `.function.description`
  VERBATIM. Arm B REPLACES each description with the enriched version below (same names + parameter
  schemas — ONLY the description string changes; tool_choice stays "auto"; max_tokens 8192).

## Model / mechanics
- 1call-tools shape: NARRATIVE persona/GM system prompt + all 7 tools + tool_choice:"auto", keep BOTH
  message.content (narrative) and tool_calls (state). One call per turn. No reasoning. max_tokens 8192.
- 8 turns per arm × 2 arms = 16 calls. Budget ~$1-2, authorized. 2-attempt cap per call.

## Seed (identical for both arms) — includes a CUSTOM WIDGET so set_widget_value is testable
- Story: "The Sanctified Map" — act 1/3.
- Party PC: `Kestrel` — role "relic-hunter" — Lv 3 — HP 26/26 — Mana 12/12, Stamina 14/14 — 40 gold,
  5 silver — carrying: Worn Shortsword, Traveler's Cloak — status: alert.
- Present cast: none yet. Quests: none. Journal: empty.
- Custom widget defined on the game: `Suspicion` (a 0–100 meter, starts 10) — so set_widget_value has a
  real target. (Fold it into the reminder state block as a widget line the model can see + move.)

## The 8 fixed player actions (identical both arms) — written to INVITE every field
1. "I step into the lantern-lit chapel out of the evening drizzle. A robed woman tends the altar — tall, silver-haired, in a patched grey habit, her eyes sharp. I approach quietly."
2. "I introduce myself and share news from the outer roads. Sister Vesna, she calls herself — she softens a little as we talk, warming to me."
3. "She offers a blessing. She anoints my blade — I feel it thrum with warded light — and presses a small Vial of Sanctified Oil into my hand, tucked into my belt pouch."
4. "I ask about the relic. She wants 20 gold for the old vault map. I pay it. She watches my hands a beat too long as I take it — something in her gaze sharpens."
5. "The chapel door bangs open — Corvin Ashe, my rival, blade already drawn. He lunges; I take a shallow cut across the ribs and it costs me wind, but I stay up."
6. "I press a cloth to the wound to stop the bleeding and swig a stamina draught from my pack to steady myself."
7. "Vesna calls the guard on Corvin; with him hauled off, she declares my errand proven — I've earned her trust. She names my next task: reach the Vault of Ash before the new moon."
8. "Dawn light comes grey through the chapel windows. I gather the map and the oil and step out onto the road north, the chapel bell fading behind me."

## System prompts
### GM base (BOTH arms share this opening)
"You are the game master of an immersive tabletop role-play. Narrate the world in vivid second person,
staying in character and in the fiction. You ALSO keep the game's tracked state in sync using the
provided tools — call the tools each turn to record what changed in the story you just told. Narrate
first, then make the tool calls that reflect your narration."

### Arm A tracking clause (generic — no field guidance)
"Use whichever tools fit what happened this turn."

### Arm B tracking clause (guided — the hypothesis under test)
"STATE-TRACKING GUIDE — be thorough; the panel should reflect the FULL richness of your narration, not
just the headline change. Each turn, ask which of these changed and record ALL of them:
- Any character on screen → update_scene.presentUpsert: set `mood` EVERY time their demeanor shifts;
  set `appearance` + `outfit` the first time (or whenever) you describe how they look; set `thoughts`
  when you imply their inner state; set `relationship` when it forms or changes; set customFields
  `trust`/`role` as they establish. Don't leave a described character as just a name.
- Scene → set location/timeOfDay/weather whenever they change; set calendarDate/day when time passes;
  advance `plot.actSummary` (and act/title) as the story moves.
- The PC or an NPC's body → update_party: hpDelta for wounds/healing, poolDeltas for mana/stamina/focus
  spent or restored, addCondition for a new effect (with a numeric modifier if it has one),
  removeCondition when it ends, status for a short current-state line.
- Items → update_inventory: add with a `description` AND `location` (where it's carried), remove when
  used/lost, walletDeltas for coin. Quantities matter.
- Meters the game defines (e.g. Suspicion) → set_widget_value when they move.
- Quests → upsert_quest with objectives; complete/fail as they resolve.
- add_journal_entry for a notable beat, with the right `type`.
Fill every field the fiction supports. Sparse tracking makes the panel feel dead."

## Enriched tool descriptions (Arm B — replace each tool's `.function.description` with these)
- update_party: "Record changes to any actor's body/condition. hpDelta: damage (negative) or healing (positive). poolDeltas: spend/restore named pools like Mana/Stamina/Focus (negative=spent). addCondition: a new status effect (e.g. Blessed, Bleeding, Poisoned) with an optional numeric modifier. removeCondition: when an effect ends. status: a short current-state line ('bleeding, on edge'). EXAMPLE — took a cut and spent wind fighting: {targetRef:'player', hpDelta:-5, poolDeltas:[{name:'Stamina',delta:-3}], addCondition:{name:'Bleeding',modifier:-1}, status:'bleeding, breathing hard'}."
- update_inventory: "Items and coin on an actor. add: new items — ALWAYS give a `description` and a `location` (where it's carried: 'belt pouch', 'sheathed'), plus quantity. remove: items used/lost/given away. walletDeltas: coin gained/spent (negative=spent). EXAMPLE — gifted an oil vial, paid 20 gold: {targetRef:'player', add:[{name:'Vial of Sanctified Oil', description:'warded holy oil, faintly glowing', quantity:1, location:'belt pouch'}], walletDeltas:[{name:'gold', delta:-20}]}."
- update_scene: "The scene + who is present. Set location/timeOfDay/weather when they change; calendarDate/day as days pass; advance plot.act/title/actSummary as the story moves. presentUpsert: for EACH character on screen set mood (every demeanor shift), appearance + outfit (when described), thoughts (their implied inner state), relationship {kind,label}, and customFields trust/role. recentEvent: a one-line beat. EXAMPLE — a priest warms to you: {timeOfDay:'evening', presentUpsert:[{name:'Sister Vesna', emoji:'🕯️', mood:'warming', appearance:'tall, silver-haired, sharp-eyed', outfit:'patched grey habit', thoughts:'weighing whether to trust you', relationship:{kind:'ally',label:'wary priest'}, customFields:[{name:'trust',value:'40'},{name:'role',value:'chapel keeper'}]}], recentEvent:'Vesna softened as you shared road news'}."
- set_widget_value: "Set a custom meter the game defines (e.g. Suspicion). value: the new reading; max: if the ceiling changes; items: for list-type widgets. EXAMPLE — suspicion rises as she watches you: {widgetRef:'Suspicion', value:35}."
- upsert_quest: "Create/update/complete/fail a quest. Give a description and objectives[] on create; use action 'complete'/'fail' when it resolves. EXAMPLE — a new task opens: {name:'Reach the Vault of Ash', action:'create', description:'Get to the vault before the new moon', objectives:['Find the road north','Enter the vault']}."
- add_journal_entry: "Log a notable beat with the right type (location/npc/combat/quest/item/event/note) + a short title + content. EXAMPLE: {type:'combat', title:'Ambush at the Chapel', content:'Corvin drew on you at the altar; you took a cut but stayed up.'}."
- no_changes: "Call ONLY when nothing trackable changed. Do NOT use this to avoid filling fields — if anything in the fiction moved, record it."

## Coverage measurement (the core deliverable)
For each arm, per turn, parse tool_calls and mark which LEAF fields were populated (present + non-empty).
The leaf-field set (measure ALL of these):
- update_party: targetRef, hpDelta, poolDeltas, addCondition, removeCondition, status
- update_inventory: targetRef, add.name, add.description, add.location, add.quantity, remove, walletDeltas
- update_scene: location, calendarDate, day, timeOfDay, weather, presentUpsert.name, presentUpsert.emoji,
  presentUpsert.mood, presentUpsert.appearance, presentUpsert.outfit, presentUpsert.thoughts,
  presentUpsert.customFields, presentUpsert.relationship, presentRemove, recentEvent, plot.act,
  plot.title, plot.actTitle, plot.actSummary
- set_widget_value: widgetRef, value, max, items
- upsert_quest: name, action, description, objectives
- add_journal_entry: type, title, content
Produce:
- `out2/<arm>/COVERAGE.md` — a field × turn matrix (✓/·) + a per-field "turns populated / 8" tally.
- `out2/<arm>/transcript.md` — per turn: narrative + the tool_calls made (pretty).
- `out2/coverage.json` — machine matrix.
- `out2/COVERAGE-SUMMARY.md` — A-vs-B side-by-side per field, a NEVER-TOUCHED list for each arm, the
  count of fields that went from skipped→covered under enrichment, total tool_calls + cost per arm, and a
  verdict: did enrichment materially improve field coverage? Which fields are STILL neglected even with
  examples (→ those need a different fix — schema default, required, or a dedicated nudge)?

## Report back (compact)
Return COVERAGE-SUMMARY.md contents (the A-vs-B field verdict + still-neglected list) + total spend.
Do NOT paste raw turns. Make reasonable calls on ambiguities, document them, keep going — never block.
