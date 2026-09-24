// @orb/contracts/rpg/prose — the rpg prose slot table (PROSE-1 §4.1). TWO cohorts, one table:
//   • census 1-10   — the steering REMINDER seam (what the NARRATOR is taught the tracked values mean).
//     `domain/rpg/substrate/reminder.ts` + `delta.ts` DERIVE their exported constants from these rows
//     (`RPG_STEERING_LICENSE = PROSE_SLOTS["rpg.reminder.steeringLicense"].text`), so a default is authored
//     exactly once and the reminder can never disagree with what the registry ships.
//   • census 11-27 + 29-36 — the EXTRACTION seam (what the EXTRACTOR is taught to write back): the per-plane
//     teaching fragments, the six tool descriptions + the `no_changes` escape, and the two system-prompt
//     framings. These are per-game TEMPLATES — see the cohort's own header block below for why that is a
//     token vocabulary on an ordinary `text` slot and not a `render(ctx)` arm on `ProseSlotDef`.
//   • the POPULATE census (rows 1-7) — the BORN-STATE round's own prose (`rpg.populate.*`): its system header,
//     identity clause, invent-nothing doctrine, and the four user-turn blocks. Same shape as the extraction
//     cohort, its own group because it fires on the host's one card-read click, not on turns.
//
// The slot SHAPE comes from `#prose-slot`, never `#prose`: `#prose` imports this table at runtime to compose
// `PROSE_SLOTS`, so importing it here — even for a type — would close a `no-circular` cycle (the split's whole
// reason; see `#prose-slot`'s header).
//
// STORAGE: the PRESET's `promptConfig.prose` (owner ruling 2026-08-08, "we are putting everything in presets" —
// the standing per-PRESET home already recorded at `domain/chat/assembly/injections.ts`). These slots homed on
// `rpg_games.config.prose` for exactly one merge (`fa8f944a0`); that spine — the config field, the
// `updateConfig.patch.prose` write arm, the fork strip arm — is DELETED, and `home:"preset"` is what routes each
// row into `PRESET_PROSE_SLOT_IDS`, its Templates-tab row, and `composeProse`'s preset source. The host edits
// them in the preset Templates tab; a GAME turn assembles the game's `gmPresetId` (the preset REDIRECT in
// `chat/verbs/turn.ts`), so "this table's own teach copy" is authored on that table's GM preset.
//
// The reminder still resolves each slot against `LiteReminderInput.prose` and the delta against
// `DeltaContext.prose` — the builders' signatures never knew where the overrides came from; only chat's gather
// args changed. An ABSENT override is byte-identical to the pre-PROSE-1 constant, which is the whole safety
// story for this migration (asserted per-slot in `tests/contracts/prose/`).
//
// MACRO MODE (§6.1): the TEACHES are `names-only` — the reminder resolves a host override's `{{user}}`/`{{char}}`
// through the same identity-only registry `renderSteeringNote` uses (a default carries no macro, so it resolves
// byte-identically). The two DELTA HEADINGS are `none`: a diff heading has no character context to substitute,
// so its bytes ship verbatim (owner decision 5 ruled them prose/voice, in scope — the STRUCTURAL labels of
// §2.11 stay out and below the gate's word threshold).

import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

/** The game-turn steering-reminder prose (census 1-10) + the extraction seam (11-27, 29-36). Keys ARE the
 *  slot ids; `satisfies Partial<Record<…>>`
 *  so an unlisted id fails `tsc`, and `#prose` annotates the composed `PROSE_SLOTS` so a missing row fails too. */
export const RPG_PROSE_SLOTS = {
  "rpg.reminder.steeringLicense": {
    id: "rpg.reminder.steeringLicense",
    home: "preset",
    version: 1,
    text: "These tracked values are live state for THIS story — let them visibly shape behaviour, dialogue, and the scene as you narrate. When a value changes, let the change land in the fiction. Never recite the raw numbers back at the player; weave them into the prose.",
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [],
    title: "Steering license",
    fires: "Every game turn — the reminder tail that licenses the tracked values to shape the fiction.",
  },
  "rpg.reminder.deceptionTeach": {
    id: "rpg.reminder.deceptionTeach",
    home: "preset",
    version: 1,
    text: 'DECEPTION: a character may deceive the player. When a character states something they know to be false, emit — on its own, right after the spoken lie — a self-closing tag recording the truth: <lie character="who is lying" type="the kind of lie" truth="what is actually true" reason="why they lie" />. This tag is INVISIBLE to the player but you REMEMBER it, so keep the deception consistent and let it have consequences later. Never reveal the truth in your prose or narration — only in the tag.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: ["<lie"],
    title: "Deception teach",
    fires: "Every game turn, only when `features.deception` is on — teaches the hidden `<lie …/>` tag grammar.",
  },
  "rpg.reminder.omniscienceTeach": {
    id: "rpg.reminder.omniscienceTeach",
    home: "preset",
    version: 1,
    text: 'PERCEPTION: the player perceives only what their character can. When something happens beyond their perception (offscreen, hidden, a secret another character keeps), emit a self-closing tag recording it: <ofilter event="what happened out of their perception" reason="why they cannot perceive it" />. This tag is INVISIBLE to the player but you REMEMBER it — narrate only what the player CAN perceive, and let the unperceived event shape the world consistently.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: ["<ofilter"],
    title: "Perception-filter teach",
    fires: "Every game turn, only when `features.omniscience` is on — teaches the hidden `<ofilter …/>` tag.",
  },
  "rpg.card.askInteractive": {
    id: "rpg.card.askInteractive",
    home: "preset",
    version: 1,
    text: 'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS/JS, then `:::` on its own line. Make whatever fits the moment — animations, layouts, interactive bits are all welcome. Everything must be self-contained markup and CSS — no images at all (external URLs and inline data: URIs are BOTH blocked by the platform security policy; a card with an <img> renders with a hole in it). Paint textures, shapes and iconography with CSS instead. Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::card"],
    title: "Card teach — interactive ask",
    fires: "Every game turn, when `features.immersiveHtml` + `immersiveHtmlInteractive` are on (the interactive variant).",
  },
  "rpg.card.askStatic": {
    id: "rpg.card.askStatic",
    home: "preset",
    version: 1,
    text: 'When it fits the scene — an in-world screen, letter, poster, sign, book page, map, UI panel, or any visual the characters would encounter — you may render an immersive card. Open with `:::card title="a short label"` on its own line, then your HTML/CSS, then `:::` on its own line. Keep it a still visual — no scripts or animations, just an in-world page for the reader. Everything must be self-contained markup and CSS — no images at all (external URLs and inline data: URIs are BOTH blocked by the platform security policy; a card with an <img> renders with a hole in it). Paint textures, shapes and iconography with CSS instead. Do not wrap it in a code fence. Close the card with its own `:::` line BEFORE you open any other directive (a `:::choices` block never goes inside a card). Cards are for things the CHARACTERS see in the world — never a status readout, stat block, or tracker display; the tracked values stay woven into your prose, never recited.',
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::card"],
    title: "Card teach — static ask",
    fires: "Every game turn, when `features.immersiveHtml` is on and `immersiveHtmlInteractive` is off.",
  },
  "rpg.card.example": {
    id: "rpg.card.example",
    home: "preset",
    version: 1,
    text: `

For example, a three-line sign is enough:
:::card title="Crossing sign"
<div style="font-family:monospace;text-align:center;padding:14px;border:2px solid #6b5c3e;background:#e9e1cb;color:#3a2f1c;letter-spacing:2px">
  <div>EAST CROSSING</div><div>CLINIC — 2 KM</div><div>NO ENTRY AFTER DARK</div>
</div>
:::`,
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::card"],
    title: "Card teach — worked example",
    fires: "Appended to BOTH card teaches (the opener-bytes example the tokenizer-leniency fix rides on).",
  },
  "rpg.reminder.cyoaTeach": {
    id: "rpg.reminder.cyoaTeach",
    home: "preset",
    version: 1,
    text: "CHOICES: end every response with a set of choices for the player. After your narration, add a line containing exactly :::choices then 3-5 numbered options (1. ...), each a distinct action the player could take next, then a line containing exactly ::: on its own. Keep each option one sentence, concrete, and meaningfully different from the others.",
    macros: "names-only",
    requiredMacros: [],
    requiredTokens: [":::choices"],
    title: "CYOA teach",
    fires: "Every game turn, only when `features.cyoa` is on — teaches the standing `:::choices` fence.",
  },
  "rpg.reminder.frame": {
    id: "rpg.reminder.frame",
    home: "preset",
    version: 1,
    // The one delimiter around the whole reminder. On a model that folds it into user text it lands in the
    // player's message, so it must never read as the player's words (owner ruling).
    text: "[Game notes for the narrator — not the player's words:\n\n{{reminder}}\n]",
    macros: "none",
    requiredMacros: ["{{reminder}}"],
    requiredTokens: [],
    title: "Game-notes frame",
    fires: "Every game turn — wraps the whole steering reminder, the steering note and any reconcile note included.",
  },
  "rpg.reminder.castHeader": {
    id: "rpg.reminder.castHeader",
    home: "preset",
    version: 1,
    text: "Present (appearance/outfit are standing — describe them consistently, not re-invented; thoughts are UNSPOKEN inner state, never said aloud):",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Present-characters header",
    fires: "The `Present:` header, only when a present character carries a standing guide.",
  },
  "rpg.reminder.offstageHeader": {
    id: "rpg.reminder.offstageHeader",
    home: "preset",
    version: 1,
    text: "Known, offstage (established characters not in this scene — bring them back consistently, never re-introduce them):",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Offstage-characters header",
    fires: "The `Known, offstage:` header, only when an established character is off stage.",
  },
  "rpg.delta.changesHeading": {
    id: "rpg.delta.changesHeading",
    home: "preset",
    version: 1,
    text: "CHANGES SINCE LAST BEAT",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Delta heading",
    fires: "The prev→current diff block heading, every game turn a change landed.",
  },
  "rpg.delta.sceneOpensHeading": {
    id: "rpg.delta.sceneOpensHeading",
    home: "preset",
    version: 1,
    text: "SCENE OPENS",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Scene-opens heading",
    fires: "The first-snapshot heading (turn 1 born state — labelled as an opening, not a delta).",
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // THE EXTRACTION SEAM (census 11-27 + 29-36) — the WRITE-surface prose (PROSE-1 §4.5, S4).
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // The reminder cohort above teaches the NARRATOR what the tracked values mean. This cohort teaches the
  // EXTRACTOR what to write back — the per-plane teaching fragments, the six tool descriptions, and the two
  // system-prompt framings the structured extraction / cheap tool round / folded turn / resync all compose.
  //
  // WHY THEY ARE PLAIN `text` SLOTS AND NOT A `render(ctx)` ARM ON `ProseSlotDef` (§4.5 arm (a), as the spec
  // spells it out): "the override being a template string resolved against the SAME ctx ... with a
  // slot-declared token vocabulary ... The shipped default is expressed in that same vocabulary, so reset-to-
  // default is byte-exact." That mechanism already shipped — `resolveProseText(id, overrides, tokens)` splices
  // caller-supplied PRE-SUBSTITUTION tokens (the `{{note}}` injection-frame precedent), and `requiredMacros`
  // is the declared vocabulary. So a per-game TEMPLATE is a slot whose TEXT is the template source and whose
  // TOKEN VALUES the domain computes off `ExtractionPromptContext` (`extraction-prompt.ts` resolves them
  // through `resolveProseFrom`/`spliceProseTokens` in `#prose-slot`, because importing `#prose` from a domain
  // table would close the `#prose → #rpg → #prose` cycle). Consequences, all of them the point: the baseline
  // manifest still hashes `text`, registry totality is unchanged, the no-duplicate-default invariant still
  // applies, and each row is an ordinary Templates-tab field — no core-shape widening anywhere.
  //
  // ONE SLOT PER PUSH/RETURN SITE, deliberately. The seam builds its prompts by pushing clause-sized strings
  // into a `lines`/`blocks` array and joining them; mapping 1:1 onto those sites is what makes ABSENT-override
  // byte-identity checkable by inspection instead of by hand-joining newlines (which is exactly where a
  // migration of this size would otherwise drift). It also means a host can retune ONE clause — the weather
  // steer, the mood-is-a-short-read rule — without re-authoring the whole plane.
  //
  // MACRO MODE is `none` for the whole cohort (§6.1): the tokens ARE this game's own tracker vocabulary, and
  // an extraction prompt is not a character context — there is no `{{user}}`/`{{char}}` binding to resolve, so
  // any other `{{…}}` in an override ships as literal braces rather than silently rendering empty.
  //
  // ROW 27 IS NOW `rpg.extract.stateTrackingGuide` (owner ruling 2026-08-08 on spec §11 decision 6: WIRE it and
  // measure). It was the one row S4 deferred — a constant composed onto nothing, which is why slotting it then
  // would have handed a host an edit surface over bytes no model read. It is wired now, so it is a slot like its
  // siblings; see its own comment block below. Census rows 28 and 32 (the transcript role fallback, the three
  // user-prompt block labels) are STRUCTURAL labels and stay out by §2.11.

  // ── The deception-gated standing prefix (census 11) ──
  "rpg.extract.deceptionSurface": {
    id: "rpg.extract.deceptionSurface",
    home: "preset",
    version: 1,
    text:
      "This game has hidden layers. Record only the players' SURFACE reality — what the scene openly shows: a " +
      "character's outward words, visible actions, and apparent state. Do NOT write a character's secret truth, " +
      "hidden motive, or a lie's real answer into any tracked plane (journal, beats, cast thoughts/mood/" +
      "relationship, quests). The hidden layer lives in your reasoning channel and the host's reveal-eye — never " +
      "the panel.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Surface-only clause",
    fires: "Heads every extraction prompt on a game running Deception or Perception filter.",
  },

  // ── The per-actor tracker teaching (census 12 — three sites) ──
  "rpg.extract.party.resources": {
    id: "rpg.extract.party.resources",
    home: "preset",
    version: 1,
    text: "TRACKED RESOURCES — party[].trackerDeltas: spend or restore these by a signed amount when the beat moves them (negative = spent):\n{{trackerCatalogue}}",
    macros: "none",
    requiredMacros: ["{{trackerCatalogue}}"],
    requiredTokens: [],
    title: "Resource trackers",
    fires: "The write surface, when this game defines a writable delta tracker on an actor.",
  },
  "rpg.extract.party.states": {
    id: "rpg.extract.party.states",
    home: "preset",
    version: 1,
    text: "TRACKED STATES — party[].trackerSets: record the NEW reading whenever the beat changes one of these:\n{{trackerCatalogue}}",
    macros: "none",
    requiredMacros: ["{{trackerCatalogue}}"],
    requiredTokens: [],
    title: "State trackers",
    fires: "The write surface, when this game defines a writable set tracker on an actor.",
  },
  "rpg.extract.party.trackerScope": {
    id: "rpg.extract.party.trackerScope",
    home: "preset",
    version: 1,
    text: "Only write a tracker on an actor the schema offers it for — not every character carries every tracker.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Not-every-actor",
    fires: "Closes the per-actor tracker teaching, whenever this game defines actor trackers.",
  },

  // ── The `scene` plane fragment (census 13 — the mode-aware clause set) ──
  "rpg.extract.scene.core": {
    id: "rpg.extract.scene.core",
    home: "preset",
    version: 1,
    text:
      "SCENE — set scene.location (WHERE) and scene.timeOfDay ({{timeOfDayValues}}); when the beat " +
      "doesn't change them, restate the current values, never blank them. Set scene.recentEvent = a one-line " +
      "summary of what just happened.",
    macros: "none",
    requiredMacros: ["{{timeOfDayValues}}"],
    requiredTokens: [],
    title: "Scene basics",
    fires: "Opens the scene plane's teaching on every extraction prompt.",
  },
  "rpg.extract.scene.clock": {
    id: "rpg.extract.scene.clock",
    home: "preset",
    version: 1,
    text:
      "KEEP TIME MOVING — advance scene.timeOfDay whenever the beat spends real time: a rest or a meal, travel, " +
      "a long conversation, a fight's aftermath, or a cut to later. Move it forward through the day's order " +
      "and let night follow evening; never jump backwards, and never leave it parked while hours of story pass.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Keep time moving",
    fires: "The scene plane — the WHEN-to-move-the-clock steer (the panel reads it as a live clock).",
  },
  "rpg.extract.scene.weather": {
    id: "rpg.extract.scene.weather",
    home: "preset",
    version: 1,
    text:
      "WEATHER — scene.weather is the WORLD'S weather: the sky, never the room. Set it whenever the story tells " +
      "you what the sky is doing, indoors or out — a blizzard closing in past the cabin window counts as much as " +
      "stepping outdoors into it. When the story says nothing about the sky, leave it alone: omitting keeps what " +
      "is already there. A room's own atmosphere (torchlight, damp, a stifling hall) is NOT weather — that belongs " +
      'in scene.location. scene.weather.type is one of {{weatherTypes}}; use "indoors" when the ' +
      "scene is enclosed and no sky is visible from it at all, and if none of them is what the sky is actually " +
      "doing, OMIT weather rather than forcing the nearest. Put the vivid phrasing in " +
      'scene.weather.label ("torrential sleet", "a thin grey drizzle"), which is what the reader sees.',
    macros: "none",
    requiredMacros: ["{{weatherTypes}}"],
    requiredTokens: [],
    title: "Weather steer",
    fires: "The scene plane — when and how to write the sky (never the room).",
  },
  "rpg.extract.scene.dayStructured": {
    id: "rpg.extract.scene.dayStructured",
    home: "preset",
    version: 1,
    text:
      "Set scene.day (the integer day counter) and advance it by one whenever the party sleeps through the " +
      "night or the story crosses into the next morning; set scene.calendarDate for a narrated in-world date.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Day counter",
    fires: 'The scene plane, only on a game whose date mode is "structured" (the integer day counter).',
  },
  "rpg.extract.scene.dayNarrated": {
    id: "rpg.extract.scene.dayNarrated",
    home: "preset",
    version: 1,
    text: 'Set scene.calendarDate for a narrated in-world date the story gives (e.g. "3rd of Frostmoon"), and move it on as days pass.',
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Narrated date",
    fires: 'The scene plane, on a game whose date mode is "narrated" (no day counter).',
  },
  "rpg.extract.scene.present": {
    id: "rpg.extract.scene.present",
    home: "preset",
    version: 1,
    text:
      "WHO IS PRESENT — scene.presentUpsert: one entry per character who speaks or acts (name required). Fill " +
      "what the beat reveals: mood, appearance, outfit, thoughts (inner state), and relationship toward the " +
      "player (kind = lover/friend/ally/neutral/enemy/custom) as it shifts. scene.presentRemove a character " +
      "who leaves.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Who is present",
    fires: "The scene plane — the present-characters upsert/remove teaching, every extraction prompt.",
  },
  "rpg.extract.scene.mood": {
    id: "rpg.extract.scene.mood",
    home: "preset",
    version: 1,
    text:
      'MOOD IS A SHORT READ — scene.presentUpsert[].mood is 1-3 words, evocative ("wary", "quietly furious", ' +
      '"giddy"), never a sentence. The reasoning behind it belongs in thoughts; what just happened belongs in ' +
      "scene.recentEvent.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Mood is short",
    fires: "The scene plane — the length contract on the present-character row's mood (taught, never schema-enforced).",
  },
  "rpg.extract.scene.emoji": {
    id: "rpg.extract.scene.emoji",
    home: "preset",
    version: 1,
    text: "Give a NEW character a fitting single emoji (presentUpsert[].emoji) — the portrait fallback.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Portrait emoji",
    fires: "The scene plane — the portrait-fallback emoji for a newly-seen character.",
  },
  "rpg.extract.scene.plot": {
    id: "rpg.extract.scene.plot",
    home: "preset",
    version: 1,
    text: "When the story crosses into a NEW act, set scene.plot (act number + a short act title); set the story title once it's clear.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Plot act rail",
    fires: "The scene plane, only when `features.plotProgression` is on.",
  },

  // ── The remaining plane fragments (census 14-18) ──
  "rpg.extract.plane.party": {
    id: "rpg.extract.plane.party",
    home: "preset",
    version: 1,
    text:
      "PARTY — party: ONLY mechanical changes. Tracked-value writes (trackerDeltas/trackerSets), conditions " +
      'gained/lost (addCondition/removeCondition, e.g. "bleeding", "on edge"), and a short ' +
      "status line (status). A character's personality, mood, or relationship goes in scene.presentUpsert, NOT here.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Party plane",
    fires: "The party plane's teaching (the mechanical/expressive split), every extraction prompt.",
  },
  "rpg.extract.plane.inventory": {
    id: "rpg.extract.plane.inventory",
    home: "preset",
    version: 4,
    text:
      "INVENTORY — inventory: items gained, changed, or lost (add/update/remove) and currency (walletDeltas — named currencies, " +
      "e.g. gold). Compare every existing item in CURRENT TRACKED STATE with the latest beat: if its description, " +
      "quantity, or carrying location changed, update it even when Scene or Journal also mentions the change. " +
      "A beat where anyone buys, takes, pockets, receives, or stows something ALWAYS calls update_inventory with " +
      "an add — an EMPTY pack is never a reason to skip; first acquisitions are exactly what add exists for. " +
      "INFER what a character has on them from what the story showed — recording an item the story established " +
      "(a key pocketed three turns ago) is NOT inventing.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Inventory plane",
    fires: "The inventory plane's teaching, every extraction prompt (and the populate round).",
  },
  "rpg.extract.plane.trackers": {
    id: "rpg.extract.plane.trackers",
    home: "preset",
    version: 1,
    text:
      "GAME TRACKERS — trackers: the whole-game readings (not tied to one character). Write one when the " +
      "beat moves it — a delta tracker takes a signed `delta`, a state tracker takes the new `value`. " +
      "Never invent a key.\n{{trackerCatalogue}}",
    macros: "none",
    requiredMacros: ["{{trackerCatalogue}}"],
    requiredTokens: [],
    title: "Game trackers",
    fires: "The game-subject tracker plane, only when this game defines an unlocked one.",
  },
  "rpg.extract.plane.quests": {
    id: "rpg.extract.plane.quests",
    home: "preset",
    version: 1,
    text:
      "QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). " +
      "To mark an objective DONE, name its text in completeObjectives — do NOT restate the objective list to " +
      "report progress. Send objectives only to CHANGE the list itself (adding a newly-revealed step); the " +
      "lines you repeat keep the progress already recorded against them. " +
      "Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Quests plane",
    fires: "The quest plane's teaching, every extraction prompt (and the populate round).",
  },
  "rpg.extract.plane.journal": {
    id: "rpg.extract.plane.journal",
    home: "preset",
    version: 1,
    text: "JOURNAL — journal: one short entry (type + content) for a notable beat worth logging.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Journal plane",
    fires: "Opens the journal plane's teaching on every extraction prompt.",
  },
  "rpg.extract.journal.customType": {
    id: "rpg.extract.journal.customType",
    home: "preset",
    version: 1,
    text: 'When none of the built-in types fits, use type "custom" with a short `label` naming the kind of beat.',
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Custom log type",
    fires: "Closes the journal teaching on a game that defines NO journal-type hints of its own.",
  },
  "rpg.extract.journal.customLabels": {
    id: "rpg.extract.journal.customLabels",
    home: "preset",
    version: 1,
    text: 'When none of the built-in types fits, use type "custom" with one of this game\'s own labels:\n{{journalTypeLabels}}',
    macros: "none",
    requiredMacros: ["{{journalTypeLabels}}"],
    requiredTokens: [],
    title: "This game's logs",
    fires: "Closes the journal teaching on a game that defines its own journal-type hints.",
  },

  // ── The BE-THOROUGH state-tracking guide (census 27) ──
  // Appendix A's system-prompt addendum, the measured per-turn coverage lifter. It was authored long before the
  // registry and composed onto NOTHING for the whole of its life (`pnpm ast refs` found only its declaration);
  // owner decision 6 (wire-or-delete) was ruled WIRE on 2026-08-08, so the constant became this row and
  // `composePlaneTeaching` pushes it. Bytes VERBATIM from the retired `RPG_STATE_TRACKING_GUIDE` — a wire-and-
  // measure ruling is only measurable if what lands is the text the measurement was taken on.
  "rpg.extract.stateTrackingGuide": {
    id: "rpg.extract.stateTrackingGuide",
    home: "preset",
    version: 2,
    text:
      "BE THOROUGH — the panel should reflect the FULL richness of what you narrated. Each turn record ALL that " +
      "changed: any on-screen character (mood on every demeanor shift, appearance + outfit when described, thoughts " +
      "for implied inner state, relationship when it forms or turns, their tracked values as they move); the scene " +
      "(location/timeOfDay/weather on change, the plot act summary); bodies (hp, tracked resources, conditions " +
      "gained AND ended, a status line); items (add new items or update existing ones with description + location, remove when used, wallet for coin); " +
      "quests (with objectives); and a journal entry for the beat. Sparse tracking makes the panel feel dead.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Be thorough",
    fires: "Tails the plane teaching on every extraction prompt — the coverage push, ahead of the reconcile rule.",
  },

  // ── The shared RECONCILE doctrine (census 19) ──
  "rpg.extract.reconcileDoctrine": {
    id: "rpg.extract.reconcileDoctrine",
    home: "preset",
    version: 1,
    text:
      "RECONCILE: when the CURRENT TRACKED STATE contradicts the story (a character shown leaving is still listed " +
      "present, an outfit the story replaced), fix it in this delta. Recording facts the story states is not " +
      "inventing — but never fabricate numbers, items, or events the story does not show.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Reconcile rule",
    fires: "Tails the plane teaching on every extraction prompt — fix what the story contradicts.",
  },

  // ── The six model-facing TOOL DESCRIPTIONS (census 20-25) + the worked party example (26) ──
  // ONE HOME, two consumers (`extraction-prompt.ts`'s own header): the per-call wire tools AND the tool-use
  // registry defs, which render the SAME templates against the empty-config baseline. The baseline consumer
  // has no game and therefore no preset in scope, so it reads these DEFAULTS only — an override is a per-call
  // fact by construction.
  "rpg.extract.tool.updateParty": {
    id: "rpg.extract.tool.updateParty",
    home: "preset",
    version: 1,
    text:
      "Record changes to any actor's body, condition, or tracked values. " +
      "trackerDeltas: spend/restore a tracked RESOURCE (negative = spent, e.g. damage on an HP meter). trackerSets: record the " +
      "new reading of a tracked STATE. addCondition: a new status effect (e.g. Blessed, Bleeding, Poisoned) with " +
      "an optional numeric modifier. removeCondition: when an effect ends. status: a short current-state line " +
      "('bleeding, on edge').{{actorTrackers}}\nEXAMPLE — took a cut and spent " +
      "themselves fighting: `{{partyExample}}`.",
    macros: "none",
    requiredMacros: ["{{actorTrackers}}", "{{partyExample}}"],
    requiredTokens: [],
    title: "update_party",
    fires: "The `update_party` tool's model-facing description, on every tool-carrying vehicle.",
  },
  "rpg.extract.tool.partyExample": {
    id: "rpg.extract.tool.partyExample",
    home: "preset",
    version: 1,
    // The worked example `update_party` interpolates — the spike's strongest measured lever (a model copies
    // the shape it is shown), written in THIS game's tracker vocabulary. The two tracker clauses arrive as
    // tokens INCLUDING their leading `, ` separator, so a game with no writable actor tracker renders the
    // tracker-free shape with no stray comma (the pre-slot `parts.join(", ")` behavior, byte for byte).
    text: "{targetRef:'player'{{trackerDeltaArg}}{{trackerSetArg}}, addCondition:{name:'Bleeding',modifier:-1}, status:'bleeding, breathing hard'}",
    macros: "none",
    requiredMacros: ["{{trackerDeltaArg}}", "{{trackerSetArg}}"],
    requiredTokens: [],
    title: "Party example",
    fires: "The worked call `update_party`'s description ends on — spliced with this game's tracker keys.",
  },
  "rpg.extract.tool.updateInventory": {
    id: "rpg.extract.tool.updateInventory",
    home: "preset",
    // v4 — the FIRST-ACQUISITION rule, ported from `rpg.extract.plane.inventory` v4 (#118). The plane fragment
    // reaches only the vehicles that compose an extraction SYSTEM PROMPT; the DEFAULT `folded` mode composes
    // none, so this description is the fold's ONLY write-surface teaching. Compressed (a description budget is
    // tighter than a system prompt's): the plane clause's "calls update_inventory with an add" collapses to
    // "calls add" inside the tool's own description, and "exactly what add exists for" loses the adverb.
    version: 4,
    text:
      "Items and coin on an actor. add: new items — ALWAYS give a `description` and a `location` (where it's " +
      "carried: 'belt pouch', 'sheathed'), plus quantity. A beat where anyone buys, takes, pockets, receives, or " +
      "stows something ALWAYS calls add — an EMPTY pack is never a reason to skip; first acquisitions are what " +
      "add exists for. update: existing items whose description, quantity, or " +
      "carrying location changed. remove: items used/lost/given away. walletDeltas: coin " +
      "gained/spent (negative=spent). EXAMPLE — an existing key moves from a pocket onto a necklace: " +
      "`{targetRef:'Hikari', update:[{name:'Small brass key', description:'key hanging on a silver chain', " +
      "location:'silver chain around her neck'}]}`. EXAMPLE — gifted an oil vial, paid 20 gold: `{targetRef:'player', " +
      "add:[{name:'Vial of Sanctified Oil', description:'warded holy oil, faintly glowing', quantity:1, " +
      "location:'belt pouch'}], walletDeltas:[{name:'gold', delta:-20}]}`.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "update_inventory",
    fires: "The `update_inventory` tool's model-facing description, on every tool-carrying vehicle.",
  },
  "rpg.extract.tool.updateScene": {
    id: "rpg.extract.tool.updateScene",
    home: "preset",
    version: 1,
    text:
      "The scene + who is present. Set location/timeOfDay/weather when they change — specifically whenever " +
      "the beat spends time (rest, travel, a cut to later), so the day actually moves, and whenever the " +
      "sky turns; calendarDate/day as days " +
      "pass; advance plot.act/title/actSummary as the story moves. weather is the WORLD'S weather — the sky, " +
      "never the room: set it whenever the story says what the sky is doing, indoors or out (a blizzard past the " +
      "cabin window counts); when the story says nothing about the sky, omit it and it keeps, and a room's own " +
      "atmosphere goes in location instead. weather.type is one of " +
      '{{weatherTypes}} — use "indoors" when the scene is enclosed with no sky visible from ' +
      "it at all, and if none fits what the sky is doing, OMIT weather rather than " +
      'forcing the nearest; the vivid phrasing goes in weather.label ("torrential sleet"). ' +
      "presentUpsert: for EACH character on screen set mood (every demeanor shift — 1-3 " +
      'words, "wary", "quietly furious", NEVER a sentence), appearance + outfit (when described), thoughts ' +
      "(their implied inner state), and relationship {kind,label}. " +
      "recentEvent: a one-line beat. EXAMPLE — a priest warms to you: `{timeOfDay:'evening', " +
      "presentUpsert:[{name:'Sister Vesna', emoji:'🕯️', mood:'warming', appearance:'tall, silver-haired', " +
      "outfit:'patched grey habit', thoughts:'weighing whether to trust you', " +
      "relationship:{kind:'ally',label:''}}], recentEvent:'Vesna softened as you shared road news'}`.",
    macros: "none",
    requiredMacros: ["{{weatherTypes}}"],
    requiredTokens: [],
    title: "update_scene",
    fires: "The `update_scene` tool's model-facing description, on every tool-carrying vehicle.",
  },
  "rpg.extract.tool.setTracker": {
    id: "rpg.extract.tool.setTracker",
    home: "preset",
    version: 1,
    text:
      "Write a GAME-WIDE tracked reading (not tied to one character). A resource tracker takes a signed `delta`; " +
      "a state tracker takes the new `value` (or `items` for a list).{{gameTrackerCatalogue}}\nEXAMPLE — the town's alarm rises: " +
      "`{key:'{{exampleTrackerKey}}', value:35}`.",
    macros: "none",
    requiredMacros: ["{{gameTrackerCatalogue}}", "{{exampleTrackerKey}}"],
    requiredTokens: [],
    title: "set_tracker",
    fires: "The `set_tracker` tool's description — present only when this game defines a game tracker.",
  },
  "rpg.extract.tool.upsertQuest": {
    id: "rpg.extract.tool.upsertQuest",
    home: "preset",
    version: 1,
    text:
      "Create/update/complete/fail a quest. Give a description and objectives[] on create; use action " +
      "'complete'/'fail' when the WHOLE quest resolves. To tick ONE objective off, pass its exact text in " +
      "completeObjectives — never re-send objectives[] to report progress (send objectives[] only to change " +
      "the list itself; repeated lines keep the progress already on them). EXAMPLE — a new task opens: " +
      "`{name:'Reach the Vault of Ash', action:'create', description:'Get to the vault before the new moon', " +
      "objectives:['Find the road north','Enter the vault']}`. EXAMPLE — the road is found: " +
      "`{name:'Reach the Vault of Ash', action:'update', completeObjectives:['Find the road north']}`.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "upsert_quest",
    fires: "The `upsert_quest` tool's model-facing description, on every tool-carrying vehicle.",
  },
  "rpg.extract.tool.addJournalEntry": {
    id: "rpg.extract.tool.addJournalEntry",
    home: "preset",
    version: 1,
    text:
      "Log a notable beat with the right type (location/npc/combat/quest/item/event/note, or 'custom' with a " +
      "short `label` when none of those fits) + a short title + content. EXAMPLE: `{type:'combat', title:'Ambush " +
      "at the Chapel', content:'Corvin drew on you at the altar; you took a cut but stayed up.'}`.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "add_journal_entry",
    fires: "The `add_journal_entry` tool's model-facing description, on every tool-carrying vehicle.",
  },
  "rpg.extract.tool.noChanges": {
    id: "rpg.extract.tool.noChanges",
    home: "preset",
    version: 2,
    text: "Every turn MUST emit at least one state-bookkeeping tool call. Call this ONLY when the latest beat changed NOTHING trackable. Do NOT use this to avoid filling fields — if anything in the fiction moved, record it.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "no_changes",
    fires: "The `no_changes` escape tool's description, on every tool-carrying vehicle.",
  },

  // ── The two system-prompt FRAMINGS + the three per-call lines (census 29-31, 34, 36) ──
  "rpg.extract.systemHeader": {
    id: "rpg.extract.systemHeader",
    home: "preset",
    version: 1,
    text:
      "You keep a role-play game's tracked state in sync with the story. You are given the RECENT STORY (the turns " +
      "leading up to now), the CURRENT TRACKED STATE (the panel as it stands), and the LATEST BEAT (the newest turn " +
      "— your delta covers exactly this). Output ONE JSON object that updates the tracked state to match the story. " +
      "The RECENT STORY is your evidence: use the whole arc to understand the latest beat — a relationship that has " +
      "warmed over several turns, an item a character picked up earlier and still carries, a quest implied across " +
      "turns. The player sees this as a live character panel, so keep every plane current and rich.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Extraction header",
    fires: "Opens the STRUCTURED extraction's system prompt (the one-JSON-object vehicle).",
  },
  "rpg.extract.toolRoundHeader": {
    id: "rpg.extract.toolRoundHeader",
    home: "preset",
    version: 2,
    text:
      "You maintain the tracked game state. Read the RECENT STORY + current state + the latest story beat, then " +
      "call a SEPARATE tool for EACH plane the beat changed. Check every plane independently:\n" +
      "• Did anyone's HP, pools, conditions, or status change? → update_party (one call PER affected actor)\n" +
      "• Did any existing item's description, quantity, owner, or carrying location change—or did items or currency move? " +
      "Compare CURRENT TRACKED STATE item-by-item, then call update_inventory. A Scene or Journal mention does NOT update Inventory.\n" +
      "• Did the location, time, weather, or present cast change? → update_scene\n" +
      "• Did a game-wide tracker change? → set_tracker\n" +
      "• Did a quest start, advance, complete, or fail? → upsert_quest\n" +
      "• Is there a notable beat worth logging? → add_journal_entry\n" +
      'Most beats change MORE THAN ONE plane — e.g. "she\'s wounded and bleeding as you flee into the cave" ' +
      "needs update_party (a Bleeding condition on her) AND update_scene (location → cave), so call BOTH in this " +
      "one turn. Emit every applicable call together. If — and only if — the beat changed NOTHING trackable, call " +
      "no_changes and nothing else. Do not narrate.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Tool-round header",
    fires: "Opens the cheap TOOL ROUND's system prompt — the plane-by-plane decomposition checklist.",
  },
  "rpg.extract.reconcilePass": {
    id: "rpg.extract.reconcilePass",
    home: "preset",
    version: 1,
    text:
      "This is a RECONCILE pass: re-state the FULL scene and everyone currently present as the story now stands — " +
      "refresh any plane the recent beats stopped mentioning (location, time, weather, who is here, what they carry " +
      "and wear, active quests, the plot act). Correct anything the CURRENT TRACKED STATE gets wrong against the story.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Reconcile pass",
    fires: "Tails BOTH post-commit system prompts on a reconcile beat and on a host resync.",
  },
  "rpg.extract.foldedReconcile": {
    id: "rpg.extract.foldedReconcile",
    home: "preset",
    version: 1,
    // Deliberately NOT the same bytes as `reconcilePass`: that one addresses a state-only round, and on a
    // FOLDED turn (which is also writing prose) it reads as an instruction to the NARRATOR — the character
    // would narrate a stocktake. This one addresses the write surface explicitly.
    text:
      "STATE BOOKKEEPING (not part of your reply): when you record this turn's state, re-state the FULL scene and " +
      "everyone currently present as the story now stands — refresh any plane the recent beats stopped mentioning " +
      "(location, time, weather, who is here, what they carry and wear, active quests, the plot act), and correct " +
      "anything the tracked state gets wrong against the story. Never mention this in your reply.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Folded reconcile",
    fires: "A reconcile beat on a FOLDED game — rides the character turn's own reminder, not a round.",
  },
  "rpg.extract.lockedPaths": {
    id: "rpg.extract.lockedPaths",
    home: "preset",
    version: 1,
    text: "Locked by the players — do not rewrite: {{lockedPaths}}.",
    macros: "none",
    requiredMacros: ["{{lockedPaths}}"],
    requiredTokens: [],
    title: "Locked paths",
    fires: "The user block's lock line, whenever a player has pinned a field this turn.",
  },

  // ── The valid-ref enumeration block (census 33 — six line templates) ──
  // The FALLBACK arm for a wire that cannot enforce the schema's enums: the schema binds these structurally
  // where the backend supports it, and the prompt names them everywhere.
  "rpg.extract.refs.targets": {
    id: "rpg.extract.refs.targets",
    home: "preset",
    version: 1,
    text: "Valid targetRef values (use EXACTLY one of these for any party/inventory/scene target): {{targetRefs}}.",
    macros: "none",
    requiredMacros: ["{{targetRefs}}"],
    requiredTokens: [],
    title: "Valid targets",
    fires: "The ref block, whenever this call resolved at least one targetable actor.",
  },
  "rpg.extract.refs.playerToken": {
    id: "rpg.extract.refs.playerToken",
    home: "preset",
    version: 1,
    // `{{playerRef}}` is the SEMANTIC self-ref token (`player`) spliced from its one code home, not host text —
    // an override that hardcodes the word would silently desync from the resolver if that token ever moves.
    text: '"{{playerRef}}" = the human\'s own character (currently shown as "{{playerName}}"); prefer "{{playerRef}}" for the human.',
    macros: "none",
    requiredMacros: ["{{playerRef}}", "{{playerName}}"],
    requiredTokens: [],
    title: "Player token",
    fires: "The ref block, when the semantic `player` token is actually in this call's enum.",
  },
  "rpg.extract.refs.trackerGroup": {
    id: "rpg.extract.refs.trackerGroup",
    home: "preset",
    version: 1,
    text: "For {{targetRefs}} — {{trackerKeys}}.",
    macros: "none",
    requiredMacros: ["{{targetRefs}}", "{{trackerKeys}}"],
    requiredTokens: [],
    title: "Per-actor keys",
    fires: "The ref block, once per distinct writable-tracker set this game's actors carry.",
  },
  "rpg.extract.refs.gameTrackerKeys": {
    id: "rpg.extract.refs.gameTrackerKeys",
    home: "preset",
    version: 1,
    text: "Valid set_tracker keys (game-wide trackers — never invent one): {{trackerKeys}}.",
    macros: "none",
    requiredMacros: ["{{trackerKeys}}"],
    requiredTokens: [],
    title: "Game-wide keys",
    fires: "The ref block, whenever this game defines a writable game-subject tracker.",
  },
  "rpg.extract.refs.conditions": {
    id: "rpg.extract.refs.conditions",
    home: "preset",
    version: 1,
    text: "Currently-active conditions (removeCondition must name EXACTLY one of these): {{conditions}}.",
    macros: "none",
    requiredMacros: ["{{conditions}}"],
    requiredTokens: [],
    title: "Live conditions",
    fires: "The ref block, whenever somebody is currently carrying a condition.",
  },
  "rpg.extract.refs.closing": {
    id: "rpg.extract.refs.closing",
    home: "preset",
    version: 1,
    text: "Location goes in scene.location — NEVER in a tracker. Never target a name not in the lists above.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Never-invent rule",
    fires: "Closes the ref block on every extraction prompt.",
  },

  // ── The LATEST BEAT user-prompt block label (#578 — debt-prose burn) ──
  "rpg.extract.userPrompt.latestBeatLabel": {
    id: "rpg.extract.userPrompt.latestBeatLabel",
    home: "preset",
    version: 1,
    text: "LATEST BEAT (the newest story turn above — your delta covers exactly this):",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Latest-beat label",
    fires: "Closes the extraction user-turn body, on every `window`/`full` extraction call.",
  },

  // ── The `roll_dice` tool description (#578 — debt-prose burn). Not an extraction-schema plane (roll_dice
  // is zero-state, bake-once — see `domain/rpg/tools/index.ts` header), so it carries no per-game token; it
  // rides the SAME `buildRpgToolDescriptions`/`RPG_BASELINE_TOOL_DESCRIPTIONS` seam as its six siblings so the
  // registry's static registration and a future per-call render never disagree. ──
  "rpg.extract.tool.rollDice": {
    id: "rpg.extract.tool.rollDice",
    home: "preset",
    version: 1,
    text: "Roll dice (e.g. `2d6+1`). Bake-once: the roll is server-authoritative and returned for you to narrate. Zero state — the roll is recorded on this message.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "roll_dice",
    fires: "The `roll_dice` tool's model-facing description, on every tool-carrying vehicle.",
  },

  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // THE POPULATE ROUND (the populate census rows 1-7) — the BORN-STATE surface's own prose.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // The host's ONE click over a character CARD, not a turn: the round reads the card + the room's opening
  // line and writes what the character walked in with. Everything it says to the model used to be a source
  // constant — the system header and the four user-turn labels in `entry/compose/rpg.ts`, the IDENTITY clause
  // and the invent-nothing doctrine inline in `extraction-prompt.ts` — while its two PLANE fragments
  // (inventory/quests) were already slots. That split is the disease: one prompt, half of it host-editable.
  //
  // ITS OWN `rpg.populate.*` GROUP, not more `rpg.extract.*` rows: the two cohorts fire on different calls
  // (every state round of every turn vs one born-state click), so the `rpg.extract.` cohort assertions stay a
  // statement about the turn loop and a host tuning the card read is not handed the turn-loop vocabulary.
  // `macros:"none"` for the whole group, for the extraction cohort's reason verbatim — a card read is not a
  // character context, so any other `{{…}}` in an override ships as literal braces.
  //
  // THE USER-TURN ROWS CARRY THE BLOCK, not just its label. The seam pushes whole `label + "\n" + body`
  // strings into one `blocks` array, so the slot is that push site and the body arrives as a TOKEN — which is
  // what lets a host re-order or re-frame a block rather than only rename it. An override that drops the body
  // token loses the body: the documented warn-never-block cost (§6.3), identical to the plane-teaching slots.
  "rpg.populate.systemHeader": {
    id: "rpg.populate.systemHeader",
    home: "preset",
    version: 1,
    text:
      "You are reading a role-play character's CARD and the story's OPENING scene to fill in what that character " +
      "starts the game with. This runs ONCE, before the character has played: you are establishing their sheet and " +
      "the gear, coin, and goals they walked in with — not reacting to any beat. Output ONE JSON object.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Populate header",
    fires: "Opens the born-state round's system prompt (the host's populate-from-card click).",
  },
  "rpg.populate.identity": {
    id: "rpg.populate.identity",
    home: "preset",
    version: 1,
    // The one plane the POPULATE schema adds and no turn round has: the hand-only identity sheet. Taught here
    // rather than as an `EXTRACTION_PLANE_PROMPTS` row because no turn vehicle may write it.
    text:
      "IDENTITY — sheet.title is this character's TITLE or class as the card presents them (\"Warden of House " +
      'Vane", "hedge-witch"), short and in the card\'s own voice; sheet.level is their starting level as a ' +
      "whole number — 1 unless the card explicitly establishes a veteran standing.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Identity sheet",
    fires: "Heads the born-state teaching — the sheet plane only the populate round writes.",
  },
  "rpg.populate.doctrine": {
    id: "rpg.populate.doctrine",
    home: "preset",
    version: 1,
    // The populate counterpart to `rpg.extract.reconcileDoctrine`: a card read has no story to check itself
    // against, so "what the card and the opening establish" is the only guardrail there is.
    text:
      "Record ONLY what the character card and the opening scene actually establish or plainly imply — the gear " +
      "they are described carrying, the coin their station implies, the goals their background already gives them. " +
      "If the card says nothing about a plane, leave it empty. Do NOT invent adventuring loot, quest chains, or a " +
      "purse the character has no reason to carry.",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Invent nothing",
    fires: "Closes the born-state teaching — the card-read counterpart to the reconcile rule.",
  },
  "rpg.populate.cardBlock": {
    id: "rpg.populate.cardBlock",
    home: "preset",
    version: 1,
    text: "CHARACTER CARD — {{cardName}}:\n{{cardBody}}",
    macros: "none",
    requiredMacros: ["{{cardName}}", "{{cardBody}}"],
    requiredTokens: [],
    title: "Card block",
    fires: "The born-state user turn — the character card, always present.",
  },
  "rpg.populate.emptyCard": {
    id: "rpg.populate.emptyCard",
    home: "preset",
    version: 1,
    // Spliced in as `{{cardBody}}` when the card renders to nothing. It is prose, not a structural stub: it is
    // the sentence the model reads INSTEAD of a description, and it is what stops a blank card reading as a
    // truncated prompt the model should fill in for itself.
    text: "(the card carries no written description)",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Empty card",
    fires: "Stands in for the card body when the character carries no written description.",
  },
  "rpg.populate.openingBlock": {
    id: "rpg.populate.openingBlock",
    home: "preset",
    version: 1,
    text: "OPENING SCENE (how the story begins):\n{{opening}}",
    macros: "none",
    requiredMacros: ["{{opening}}"],
    requiredTokens: [],
    title: "Opening block",
    fires: "The born-state user turn, only when the room has posted an opening line.",
  },
  "rpg.populate.targetLine": {
    id: "rpg.populate.targetLine",
    home: "preset",
    version: 1,
    text: 'Write everything for targetRef "{{targetRef}}" — this round fills exactly this one character.',
    macros: "none",
    requiredMacros: ["{{targetRef}}"],
    requiredTokens: [],
    title: "Target line",
    fires: "Closes the born-state user turn — names the one actor this round fills.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;
