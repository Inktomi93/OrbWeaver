---
kind: review
status: active
updated: 2026-08-14
---

# Marinara's SillyTavern Extension — Custom-Stat Flexibility Model & "Lite Mode" Mapping

**Research question:** How does Marinara's *SillyTavern extension* (not her RPG engine/backend) let users
define custom stats/trackers/fields without a heavy engine, and what should we steal for our own RPG
"lite mode" — a chat that carries a character sheet (stats + inventory + custom trackers the model reads
and updates) *without* the GM-seat / dice / encounter / clock apparatus?

---

## 0. What repo this is + confidence

- **Repo studied:** `github.com/SpicyMarinara/rpg-companion-sillytavern` — display name **"RPG Companion"**,
  author field literally **"Marinara"**, version **3.7.4** (`manifest.json`).
- **Confidence it's the right thing: very high.** It is unambiguously a *SillyTavern extension*, not a
  standalone engine/backend:
  - `manifest.json` is a ST extension manifest (`js: index.js`, `css: style.css`, `loading_order`,
    `display_name`). Installs via ST's "Install Extension" URL box.
  - It imports ST's internal APIs directly: `setExtensionPrompt`, `extension_prompt_types`,
    `eventSource`, `event_types`, `getContext`, `chat_metadata`, `saveSettingsDebounced`,
    `saveChatDebounced` from ST's `script.js` / `extensions.js` (relative `../../../../../../` paths — the
    signature of a third-party ST extension living in `extensions/third-party/`).
  - No server. Everything runs in the ST browser client. The one "external" path is an optional
    OpenAI-compatible API call for *separate* tracker generation — still client-side fetch, not a backend.
- **Disambiguation note:** "Marinara" also ships heavier RPG content; within THIS repo there is a combat
  `encounterState`/`encounterPrompts` subsystem and a dice roller, but those are optional features of the
  extension, not the separate engine. I focused on the flexible tracker core, which is the relevant part.
- There are near-identical **forks** (`nrahis/rpg-companion-sillytavern`, `ZionLangan/v20-companion`,
  `Phinnakone/openai-nim-proxy`) — same description string, downstream copies. The **SpicyMarinara** origin
  is the canonical one. Adjacent-but-different extensions in the same ecosystem (not studied here):
  `prolix-oc/SillyTavern-SimTracker` (archived; JSON→template cards), `kaldigo/SillyTavern-Tracker`,
  `leandrojofre/SillyTavern-Stat-us-Maximus`, `ghostd93/BetterSimTracker`. SimTracker is the closest
  philosophical cousin (user-defined JSON schema → visual card) if we want a second data point later.

---

## 1. The custom-stat / tracker model (how a user defines things)

The whole flexibility story lives in **one config object**, `extensionSettings.trackerConfig`
(`src/core/state.js`). It is a *declarative schema the user edits*, and every downstream behavior
(prompt, parse, render) is derived from it. There is no per-stat code anywhere — the six D\&D attributes are
just seed data in an array, not a hardcoded type.

`trackerConfig` has four sibling groups:

```
trackerConfig = {
  userStats: {
    statsDisplayMode: 'percentage' | 'number',        // global, applies to all meters
    customStats: [ {id, name, enabled, persistInHistory, maxValue}, ... ],   // the meters (HP/Sanity/…)
    rpgAttributes: [ {id, name, enabled, persistInHistory}, ... ],           // the +/- integer stats (STR/…)
    showRPGAttributes, showLevel, alwaysSendAttributes,
    statusSection:  { enabled, showMoodEmoji, customFields: [ "Conditions", … ], persistInHistory },
    skillsSection:  { enabled, label, customFields: [ "Stealth", … ], persistInHistory },
    inventoryPersistInHistory, questsPersistInHistory
  },
  infoBox: { widgets: { date, weather, temperature, time, location, recentEvents }  // each {enabled, …} },
  presentCharacters: {
    showEmoji, showName,
    relationships: { enabled, relationshipEmojis: {Lover:'❤️', …} },
    customFields: [ {id, name, enabled, description, persistInHistory}, … ],  // free per-NPC fields
    thoughts:    { enabled, name, description, persistInHistory },
    characterStats: { enabled, customStats: [ {id,name,enabled}, … ] }       // per-NPC meters
  }
}
```

Key properties of the model:

- **Two numeric flavors, both user-defined lists:**
  - `customStats` = **bounded meters** rendered as bars (`{id, name, maxValue}`), 0→100 (percentage) or
    0→maxValue (number). Add/remove/rename arbitrary entries. This is the "HP / Sanity / Arousal / MP" slot.
  - `rpgAttributes` = **unbounded integer stats** rendered as `+`/`−` steppers, clamped 1–999. Add / remove /
    rename arbitrary entries. STR/DEX/CON/INT/WIS/CHA are merely the default seed array — the code
    (`classicStats.js`) is fully generic, reading `data-stat` off the button and mutating
    `classicStats[id]`. **There is no hardcoded attribute set at the code level.**
- **Text fields are cheap CSV:** status fields and skills are just a comma-separated text box
  ("`Conditions, Appearance`") — no schema ceremony to add a tracked free-text field.
- **`id` is auto-derived, never typed:** new stat gets `id = 'custom_' + Date.now()` (or a snake\_case of the
  name via `set_ids_names`, which also *migrates the stored value* from old id → new id on rename). Users
  only ever touch human names.
- **Parenthetical descriptions are hints, not keys:** a field named `"Conditions (up to 5 traits)"` snake-cases
  to key `conditions`, but the full string (parenthetical included) is what gets shown to the model as the
  instruction/placeholder. This is a neat trick: **the field label doubles as a mini-prompt.**
- **Scope = per-preset, bindable per-character/chat** (see §4). Not global-only, not baked into the card.

**How much is customizable:** names (yes, free text), enable/disable (yes), numeric range (per-meter
`maxValue`; attributes are just 1–999), add/remove arbitrary entries (yes for meters, attributes, status
fields, skills, per-NPC fields, per-NPC meters, relationship→emoji pairs), display order (array order;
present-character fields get up/down reorder buttons, meters/attributes do not), grouping (fixed into the
four sections — you cannot invent a new *section*, only new *fields within* the sections). Per-field
"persist in history" flag (yes, from a dedicated tab).

---

## 2. Configuration UX (how a non-technical user sets it up)

- A dedicated **modal editor** (`src/systems/ui/trackerEditor.js`, \~1.7k LOC), opened by a gear button,
  tabbed: **User Stats / Info Box / Present Characters / History Persistence**. Save / Cancel / Reset /
  Export / Import buttons.
- Each custom stat is a plain row: `[✓ enabled] [text: name] [number: max (only in number mode)] [🗑 delete]`.
  "+ Add Custom Stat" appends `{id: custom_<ts>, name:'New Stat', enabled:true, maxValue:100}` and seeds a
  live value. Same pattern for attributes ("+ Add Attribute" → `{id: attr_<ts>, name:'NEW'}` seeded to 10).
  Status/skills fields are single CSV text inputs. Info-box widgets are fixed toggles (+ date-format select,
  temp C/F radio). This is **click-to-add, type-a-name** — no JSON authoring required for the common path.
- **Raw prompt editor** (`src/systems/ui/promptsEditor.js`): a *second* modal exposing **14 overridable
  prompt templates** as freehand `<textarea>`s (trackerInstructions, trackerContinuation, contextInstructions,
  narrator, html, cyoa, deception, omniscience, dialogueColoring, spotify, plotRandom, plotNatural, avatar,
  combatNarrative). Each has "restore default"; there's a global "restore all". Power users can rewrite the
  exact instruction text; everyone else never opens it (empty override → built-in default is used).
- **Live editing:** rendered values are `contenteditable` spans / stepper buttons in the side panel — the
  user can hand-correct any value the model set, and the edit is written back to the message's swipe data.

---

## 3. Prompt injection + model update loop (the actual mechanism)

This is the cleverest part and the most copyable. **The schema the user built is compiled into a JSON
skeleton that is injected as fake chat turns, and the model is told to emit the same shape back.**

### 3a. Build the format contract dynamically

`jsonPromptHelpers.js` walks `trackerConfig` and *emits a JSON template string with `X` / placeholder
holes and inline `//` comments*:

```
buildUserStatsJSONInstruction()  → iterates trackerConfig.userStats.customStats (enabled), emits:
  "stats": [
    {"id": "health", "name": "Health", "value": X},   // 0 to 100 (percentage)
    {"id": "sanity", "name": "Sanity", "value": X}     // 0 to 100 (percentage)
  ],
  "status": { "mood": "Mood Emoji", "conditions": "[conditions]" },
  "skills": [...], "inventory": {...}, "quests": {...}
buildInfoBoxJSONInstruction()    → only widgets whose .enabled is true
buildCharactersJSONInstruction() → per-NPC {name, emoji, details:{<your fields>}, relationship, stats, thoughts}
```

`promptBuilder.generateTrackerInstructions()` wraps these into one unified skeleton with a header:

> *"At the start of every reply, you must attach an update to the trackers in EXACTLY the JSON format shown
> below as a single unified JSON object… Replace X with actual numbers… Consider the last trackers in the
> conversation… raise, lower, change, or keep the values based on the user's actions, the passage of time,
> and logical consequences."* — then `FORMAT:` + the compiled `{ "userStats":…, "infoBox":…, "characters":… }`.

### 3b. Inject via ST's extension-prompt API (no author's note hijack)

`injector.js onGenerationStarted()` uses `setExtensionPrompt(id, text, IN_CHAT, depth, …, role)`:

- **`rpg-companion-example`** — the *previous committed tracker state* as a fenced ` ```json{…}``` `
  block, injected as a fake **ASSISTANT** message at the depth of the last real assistant turn. (So the
  model literally sees "last turn I output this state".)
- **`rpg-companion-inject`** — the instruction+FORMAT block, injected as a **USER** message at **depth 0**
  (immediately before generation).
- Optional feature prompts (HTML, CYOA, deception, etc.) each get their own depth-0 injection id.

### 3c. Two generation modes — the "light" lever

- **`together` (default):** *no extra API call.* The instructions ride the normal roleplay generation; the
  model emits **narrative + one JSON tracker block in the same reply.** Then `parser.js` strips the JSON out.
  This is the minimal loop — one model call per turn does both story and state.
- **`separate` / `external`:** a **second background call** (`generateSeparateUpdatePrompt` → generateRaw /
  OpenAI-compatible) replays recent history and asks for **JSON only**; the main roleplay turn only receives
  a plain-text `<context>…</context>` summary (no format burden). Costs 2× calls but keeps trackers out of
  the visible reply. Good honest-degrade option for weaker models.

### 3d. Parse the reply back into state (very tolerant)

`parser.parseResponse()` is deliberately forgiving, cascading:

1. Strip `<think>`/`<thinking>` and stray `FORMAT:` markers.
2. **Brace-matching scan** for raw `{…}` anywhere (string/escape-aware) — no fence required.
3. Try each as the unified `{userStats, infoBox, characters}` shape; `unwrapTrackerEnvelope()` also peels
   wrapper keys `trackers`/`tracker`/`context`/`state`.
4. Classify loose objects by heuristic keys (`stats|status|skills|inventory|quests`→userStats,
   `date|location|weather|…`→infoBox, `characters`/array→characters).
5. Fenced ` ```json ` blocks → same classification.
6. XML `<trackers>…</trackers>` wrapper → JSON-inside-then-legacy-text.
7. Generic code fences + legacy `Section\n---` plaintext regex.
8. Final catch-all via `extractJSONFromText()` + `repairJSON()` (a hand-rolled JSON repair util).
9. Nothing matched → `parsingFailed = true`.

`parseUserStats()` then maps the extracted JSON back onto `extensionSettings.userStats` /`classicStats`
/`quests`, again JSON-first with a regex text fallback (`/STR:\s*(\d+)/i`, `/Health:\s*(\d+)%/i`, keyed off
the *user's own stat names*).

**Takeaway:** the contract is "emit the same JSON skeleton I showed you," but the reader accepts almost
anything JSON-ish. No tool-calling, no function API — just structured text in / structured text out, with a
repair pass. Portable to any model/provider.

---

## 4. Data model / persistence (+ swipe safety)

- **Config** (`trackerConfig`, presets) → ST **extension settings** (`saveSettingsDebounced`), global to the
  install, versioned with a migration ladder (`settingsVersion` 1→5, plus `migrateToTrackerConfig`,
  `migrateToPresetManager`, `migrateToV3JSON`).
- **Live values** (current stats/inventory/quests + committed/last-generated) → **chat metadata**
  (`chat_metadata.rpg_companion`, `saveChatDebounced`) — i.e. per-chat, not per-card.
- **Per-turn / swipe-safe state:** the real trick. Each assistant message stores its tracker snapshot under
  `message.extra.rpg_companion_swipes[swipeId]`, **mirrored into `message.swipe_info[swipeId].extra`** because
  ST only serializes `swipe_info` to disk (`.extra` is in-memory). So **every swipe carries its own stats**,
  and re-selecting a swipe restores that swipe's numbers. On a new user turn it "commits" the prior assistant
  message's active-swipe state as the base for the next generation (the "N−1 rule",
  `commitTrackerDataFromPriorMessage`), and inherits forward when auto-update is off.
- **Presets** (`presetManager`): named snapshots of a whole `trackerConfig` (+ history settings). Create /
  save / load / rename / delete / set-default / **export & import as JSON files** / **bind to the current
  character or group** (`characterAssociations`, `char_<id>` / `group_<id>`), with auto-switch on character
  change. Associations are intentionally *not* exported (so shared presets are portable schemas, not personal
  bindings). This is how one user's "Vampire the Masquerade sheet" becomes a shareable file.
- **Locks:** any stat/item/quest/field can be `locked:true`; the prompt tells the model "do not change locked
  fields," and locks are applied to the injected previous-state too.

---

## 5. What makes it "LIGHT"

The minimal loop is exactly four moves, and it needs *none* of the RPG apparatus:

> **define (schema) → inject (skeleton + last state) → model rewrites the JSON in its normal reply → parse & display.**

- **One model call.** In `together` mode there is no engine turn, no dice server, no state machine — the
  narrative model *is* the state machine. It reads the last JSON and writes the next JSON, "raising/lowering
  values based on the user's actions and logical consequences."
- **No authored rules.** There's no combat resolver, no skill-check math, no encounter clock in the core
  loop. Dice (`dice.js`) is a 40-line `Math.random` d-notation roller whose only job is to drop
  "`{user} rolled 14 on 1d20, decide success/failure`" into the prompt — the *model* adjudicates. The whole
  combat `encounter*` subsystem is **opt-in and separable** — lite mode is what's left when you delete it.
- **Schema is data, not code.** Adding "Sanity" or "Corruption" or "Bullets" is appending an array element;
  the prompt/parse/render all re-derive. Zero new code per stat.
- **Tolerant parsing** absorbs model sloppiness so the "engine" never hard-fails — worst case a turn's
  update is skipped and the prior state persists.

That's the entire pitch for our lite mode: *"your character has stats + inventory the chat references and
updates,"* delivered by a declarative sheet + a JSON round-trip, with the GM/dice/clock left out.

### 5a. The load-bearing bit: stats **steer the narrative** (this is the whole point)

The reason a "corruption" or "horny" or "health" value changes the story is a single instruction line
that ships every turn (`promptBuilder.generateTrackerInstructions`, the continuation clause):

> *"After updating the trackers, continue directly from where the last message left off. **Ensure the
> trackers you provide naturally reflect and influence the narrative. Character behavior, dialogue, and
> story events should acknowledge these conditions when relevant — such as fatigue affecting performance,
> low hygiene influencing social interactions, environmental factors shaping the scene, a character's
> emotional state coloring their responses**, and so on."*

Because the current values are injected as prior state **and** the model is told to let them "color
responses," the loop is bidirectional:

- **State → story:** a high `corruption` / low `health` / high `arousal` value sits in context every turn
  and the instruction explicitly tells the model to act on it. Slap a "Horny" meter at 90 on an NPC and the
  injected line *"a character's emotional state coloring their responses"* is what makes them act horny.
  Drop an NPC's `health` and the scene reflects it. **No code adjudicates this — the value + the "let it
  steer you" instruction do.**
- **Story → state:** after acting, the model rewrites the JSON ("raise, lower, change, or keep the values
  based on the user's actions, the passage of time, and logical consequences"), so the meter drifts with the
  fiction.

This is exactly Nate's ask ("if I give them a horny meter they act horny; toggle health down and that steers
the story"). The mechanism is: **(a)** the field exists in the schema, **(b)** its current value is injected
each turn, **(c)** one instruction line licenses the model to let it drive behavior, **(d)** the model writes
the value back. Field *name/hint* matters — `"Corruption (how morally compromised, 0–100)"` steers better
than a bare `corruption`, because the label rides into the prompt as guidance (§1's "label = mini-prompt").

Crucially this works **per-NPC**, not just on the player: `presentCharacters.characterStats` (per-character
meters) and `presentCharacters.customFields` (per-character free fields, each with a `description` that
steers) are compiled by `buildCharactersJSONInstruction()` and injected the same way. So a corruption meter
*attached to a specific NPC* is a first-class thing her model already supports.

---

## 6. Notable strengths (steal) and jank (avoid)

**Strengths worth copying**

1. **Schema-as-data, single source of truth.** One `trackerConfig` drives prompt, parse, and render.
   Renders are derivations, never parallel definitions.
2. **Compile the user's schema into a JSON skeleton with holes + inline `//` comments and `X` placeholders.**
   Cheap, model-agnostic, and the field label doubles as the instruction (parenthetical-as-hint).
3. **Field label = mini-prompt.** `"Conditions (up to 5 traits)"` → key `conditions`, but the model sees the
   whole guidance string. Lets non-technical users steer the model by *naming* fields well.
4. **Fake-turn injection of prior state** (previous JSON as a fake assistant message; instructions as a
   depth-0 user message) instead of dumping into system/author's note — keeps state adjacent to the
   conversation and out of the persona.
5. **Swipe-scoped state mirrored into `swipe_info`.** Every swipe remembers its own numbers; this is the
   thing most naive trackers get wrong.
6. **Presets that export as portable schema files, bind per-character, and drop personal bindings on export.**
   That's the sharing/distribution model.
7. **Extremely tolerant parser** with a JSON-repair fallback and a legacy text path — never hard-fails a turn.
8. **`together` vs `separate` mode** = an honest cost/quality lever (1 call vs 2; trackers visible-in-reply
   vs hidden).

**Jank worth avoiding**

- **Stringly-typed everywhere.** JSON round-trips through `JSON.stringify` strings held in state; inventory
  is converted array↔string repeatedly; `getValue()` has \~8 shape-guessing branches. We have real types — use
  them; keep a typed sheet and only stringify at the prompt boundary.
- **Cascading parser is a maintenance sink** (9 fallback layers, XML + text legacy formats). We can commit to
  **one** wire format (fenced `json`) + one repair pass and delete the rest.
- **Global display mode** (percentage-vs-number is per-*install*, not per-stat) and **no per-meter min / no
  color / no grouping / no reorder for meters** — thin where it should be richer. Our HUD widgets already
  beat this; keep per-widget config.
- **Migration-ladder sprawl** (5 settings versions, several ad-hoc `migrateToX`). Versioned config is good; the
  ad-hoc accumulation is not — we have a schema-versioning discipline already, use it.
- **\~1.7k-LOC hand-rolled jQuery editor** building HTML strings. Our editor stack is far better; the *shape*
  of the config is the lesson, not the UI code.
- **No validation of user field names → key collisions.** Two fields snake-casing to the same key silently
  clobber. Validate on add.

---

## 7. Concrete recommendations for our lite mode

Framing for the actual question ("*how do we make something where users add custom stats?*"): **adopt
Marinara's schema-as-data + JSON-skeleton round-trip, and map each of her four config groups onto a piece we
already have.** We are in a *better* position than she is because our flexible primitives (skills, pools,
custom HUD widgets, injection macros) already exist — lite mode is mostly *wiring an editable schema to the
existing round-trip*, plus decoupling the sheet from the hardcoded D\&D six.

### 7.1 Map her model onto our existing primitives

| Marinara concept | Our existing piece | Action |
| - | - | - |
| `customStats` (bounded meters, `{id,name,maxValue}`, bar) | **custom pools** (MP/Sanity/etc.) + **custom HUD meter widgets** | Make the lite sheet a list of pools; render each as an existing meter widget. Nothing new to build for display. |
| `rpgAttributes` (unbounded integer stats, stepper) | **free-form `skills` (name→number record)** | Our `skills` record *is* her generic attribute list. Reuse it verbatim — a lite "attribute" is just a skill entry surfaced with a stepper. Kills the need for the hardcoded `{str,dex,con,int,wis,cha}`. |
| `statusSection.customFields` / `skillsSection` (CSV free-text) | free-form text fields on the sheet | A `Record<string,string>` of named text trackers ("Conditions", "Bloodline"). |
| `presentCharacters.characterStats` + `customFields` (per-NPC meters + free fields that steer behavior) | custom HUD widgets + skills/pools, scoped to an NPC entry | **First-class, not deferred** — this is Nate's "corruption/horny/health meter on an NPC steers the story" case. A lite sheet is a list of *entities* (player + NPCs), each carrying its own pools/attributes/fields. |
| inventory | our inventory model | Reuse; inject as a summary line like she does. Inventory + quest tracking ride the same round-trip. |
| `trackerConfig` presets + per-character binding | our config/preset infra | A lite-mode "sheet template" = exportable JSON, bindable to a chat/character. |
| injected JSON skeleton + "let trackers steer you" instruction | **prompt-injection macros** | The macro emits the compiled skeleton + last state **+ the continuation line that licenses the model to act on the values** (see §5a — without that line the stats are inert display). |

### 7.2 The minimal lite-mode shape (define → inject → update → display)

1. **Define** — a `LiteSheet` schema attached to the chat (not the card), a list of **entities** (the player
   and any NPCs), each carrying its own trackers, editable in a small panel:
   ```
   LiteSheet = { entities: [ Entity, … ] }
   Entity = {
     id, name, kind: 'player' | 'npc',
     pools:      [ {id, name, max, value} ],        // bounded meters  → custom pool / meter widget (Health, Sanity)
     attributes: [ {id, name, value} ],             // unbounded ints  → skills record + stepper
     meters:     [ {id, name, hint, value, max} ],  // steering meters → Corruption, Arousal ("horny"), Trust
     fields:     [ {id, name, hint, value} ],       // free text       → Conditions, Bloodline (name+hint=mini-prompt)
     inventory:  Inventory,                         // reuse ours
   }
   // quests live at the sheet level (or player entity); same round-trip.
   ```
   Users **add a row, type a name** (optionally a `(hint)`), pick pool vs attribute vs steering-meter vs text,
   and **attach it to an entity** (player or a named NPC). `id` auto-derived from name; validate for
   collisions. This is the answer to "add custom stats": array-append on a typed schema. The six D\&D
   attributes become just *default seed rows* on the player entity, not a fixed type — drop the hardcoded
   `{str,dex,con,int,wis,cha}` and the mandatory d20 engine from lite mode. **Slapping a "Corruption" meter on
   an NPC is: append one `meters` row to that NPC's entity.**

2. **Inject** — a prompt macro compiles the schema into a fenced `json` skeleton with `X`/placeholder holes
   and `// range` comments (her `jsonPromptHelpers` pattern), **grouped per entity**, plus the **last committed
   sheet JSON** as prior state, plus **two** instructions: (a) *"emit this exact JSON with updated values based
   on what happened; keep locked fields,"* and — critically — (b) **the steering line from §5a**: *"let each
   entity's trackers color their behavior and the scene; a high Corruption/Arousal or low Health should visibly
   shape how that character acts and what happens."* Field `hint` strings ride along as guidance. Without (b)
   the stats are inert display; with it they steer. Default to her **`together`** mode (one call) for lite;
   offer a **`separate`** background-call mode as the honest degrade for weak/local models (fits our
   "hosted+local honest arms" rule).

3. **Update** — parse the reply: pull the fenced `json`, `JSON.parse` with **one** repair pass, map values
   back onto the typed `LiteSheet`. Commit **one wire format** — do *not* port her 9-layer cascade. Store the
   snapshot **per assistant message/swipe** so swiping preserves stats (this is the one piece of her plumbing
   we must replicate faithfully; our turn surface is bus-driven, so snapshot on the turn record).

4. **Display** — render `pools` as meter widgets, `attributes` as stepper widgets, `fields`/inventory as
   text/existing inventory UI. All are existing HUD widgets pointed at the sheet — no bespoke rendering.

### 7.3 What to explicitly leave out of lite mode (the "light" boundary)

- No dice/d20 resolution requirement (keep an *optional* `Math.random` roll-into-prompt if wanted; the model
  adjudicates — never a resolver).
- No combat/encounter state machine, no clock, no GM seat.
- No fixed attribute set. No per-turn mandatory mechanics. A lite chat is a **normal chat + an editable sheet
  the model reads and rewrites.** That's the entire feature.

### 7.4 Two things to do *better* than she does

- **Keep the sheet typed end-to-end**; stringify only at the injection boundary. Avoids her
  stringly-typed `getValue()` swamp.
- **Per-stat config** (per-meter min/max, per-field persist-in-history, reorder) via our existing widget
  config — she's globally-toggled and thin here; we already have richer per-widget config, so expose it.

---

### Source files read (in `SpicyMarinara/rpg-companion-sillytavern`)

`manifest.json`; `src/core/{state,config,persistence}.js`; `src/systems/generation/{promptBuilder,
jsonPromptHelpers,injector,parser}.js`; `src/systems/features/{classicStats,dice,encounterState}.js`;
`src/systems/ui/trackerEditor.js` (config-UX sections); with `promptsEditor.js` + `rendering/userStats.js`
cross-checked. The four `trackerConfig` groups + the compile→inject→parse round-trip are the load-bearing
mechanism.
