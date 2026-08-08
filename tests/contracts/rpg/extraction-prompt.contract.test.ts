// PROSE-1 S4 — the EXTRACTION seam's default-identity + override reach (spec §4.5, §10). Census rows 11-26
// and 29-36 stopped being source constants and became slot rows in `contracts/rpg/prose.ts`, resolved per
// game against the GM PRESET's `promptConfig.prose`. Two things have to be true forever, and this file is
// where they are true. The POPULATE round's own prose (populate census rows 1-7) joined the same discipline
// as `rpg.populate.*`; its byte-identity is proven at the COMPOSED-REAL tier instead (the round's system + user
// prompts, `tests/server/entry/compose/rpg.int.test.ts`), because four of its seven slots live at the server
// seam and only the driven round renders them together.
//
//
//   1. AN ABSENT OVERRIDE IS BYTE-IDENTICAL to the pre-migration prompt. The fixtures below are the RENDERED
//      bytes at `e495855de` (the commit before the migration), frozen for a game that lights up every gated
//      clause at once — deception, both actor-tracker axes, a game tracker, structured dates, plot
//      progression, journal-type hints. A drift in ANY of the ~30 slots those blocks compose REDs here and
//      names the block, which is the whole safety story for a migration this wide.
//      THE ONE SANCTIONED DEPARTURE from those frozen bytes (owner ruling 2026-08-08, spec §11 decision 6 —
//      WIRE row 27): both plane-teaching fixtures now carry the BE THOROUGH guide between the last plane and
//      the RECONCILE rule. That is the intended prompt-bytes change — the guide was authored as a write-surface
//      addendum and composed onto nothing for its entire life; the ruling wired it so its effect can be
//      measured. Every other byte is still `e495855de`'s.
//   2. AN OVERRIDE ACTUALLY REACHES THE WIRE — including through the per-game TOKEN vocabulary, which is what
//      makes these template slots (§4.5 arm (a)) rather than static text.
//
// The frozen blocks are deliberately RENDERED output, not per-slot text: these slots are only meaningful in
// composition (the clause ORDER, the `\n` joins, the token splices with their own separators are exactly
// where a 1:1 migration can drift), and a per-slot `.text` comparison would have passed while a lost newline
// silently changed every prompt.

import type { ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { PROSE_SLOT_IDS, PROSE_SLOTS } from "@orb/contracts/prose";
import type { ExtractionPromptContext, RpgGameConfig, RpgTrackerDef } from "@orb/contracts/rpg";
import {
  buildRpgToolDescriptions,
  composePlaneTeaching,
  composePopulateTeaching,
  RPG_BASELINE_TOOL_DESCRIPTIONS,
  rpgGameConfigSchema,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures.ts";

const EVERYTHING_PLANE_TEACHING = `This game has hidden layers. Record only the players' SURFACE reality — what the scene openly shows: a character's outward words, visible actions, and apparent state. Do NOT write a character's secret truth, hidden motive, or a lie's real answer into any tracked plane (journal, beats, cast thoughts/mood/relationship, quests). The hidden layer lives in your reasoning channel and the host's reveal-eye — never the panel.
SCENE — set scene.location (WHERE) and scene.timeOfDay (dawn/morning/afternoon/evening/night/midnight); when the beat doesn't change them, restate the current values, never blank them. Set scene.recentEvent = a one-line summary of what just happened.
KEEP TIME MOVING — advance scene.timeOfDay whenever the beat spends real time: a rest or a meal, travel, a long conversation, a fight's aftermath, or a cut to later. Move it forward through the day's order and let night follow evening; never jump backwards, and never leave it parked while hours of story pass.
WEATHER — scene.weather is the WORLD'S weather: the sky, never the room. Set it whenever the story tells you what the sky is doing, indoors or out — a blizzard closing in past the cabin window counts as much as stepping outdoors into it. When the story says nothing about the sky, leave it alone: omitting keeps what is already there. A room's own atmosphere (torchlight, damp, a stifling hall) is NOT weather — that belongs in scene.location. scene.weather.type is one of clear/cloudy/rain/storm/snow/fog/wind/ash/indoors; use "indoors" when the scene is enclosed and no sky is visible from it at all, and if none of them is what the sky is actually doing, OMIT weather rather than forcing the nearest. Put the vivid phrasing in scene.weather.label ("torrential sleet", "a thin grey drizzle"), which is what the reader sees.
Set scene.day (the integer day counter) and advance it by one whenever the party sleeps through the night or the story crosses into the next morning; set scene.calendarDate for a narrated in-world date.
WHO IS PRESENT — scene.presentUpsert: one entry per character who speaks or acts (name required). Fill what the beat reveals: mood, appearance, outfit, thoughts (inner state), and relationship toward the player (kind = lover/friend/ally/neutral/enemy/custom) as it shifts. scene.presentRemove a character who leaves.
MOOD IS A SHORT READ — scene.presentUpsert[].mood is 1-3 words, evocative ("wary", "quietly furious", "giddy"), never a sentence. The reasoning behind it belongs in thoughts; what just happened belongs in scene.recentEvent.
Give a NEW character a fitting single emoji (presentUpsert[].emoji) — the portrait fallback.
When the story crosses into a NEW act, set scene.plot (act number + a short act title); set the story title once it's clear.
PARTY — party: ONLY mechanical changes. Tracked-value writes (trackerDeltas/trackerSets), conditions gained/lost (addCondition/removeCondition, e.g. "bleeding", "on edge"), and a short status line (status). A character's personality, mood, or relationship goes in scene.presentUpsert, NOT here.
TRACKED RESOURCES — party[].trackerDeltas: spend or restore these by a signed amount when the beat moves them (negative = spent):
  • HP (key: hp, 0-20) — how much fight is left in them
TRACKED STATES — party[].trackerSets: record the NEW reading whenever the beat changes one of these:
  • Poise (key: poise)
Only write a tracker on an actor the schema offers it for — not every character carries every tracker.
INVENTORY — inventory: items gained or lost (add/remove) and currency (walletDeltas — named currencies, e.g. gold). INFER what a character has on them from what the story showed — recording an item the story established (a key pocketed three turns ago) is NOT inventing.
GAME TRACKERS — trackers: the whole-game readings (not tied to one character). Write one when the beat moves it — a delta tracker takes a signed \`delta\`, a state tracker takes the new \`value\`. Never invent a key.
  • Town alarm (key: alarm, 0-100) — how hunted the party is
QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). To mark an objective DONE, name its text in completeObjectives — do NOT restate the objective list to report progress. Send objectives only to CHANGE the list itself (adding a newly-revealed step); the lines you repeat keep the progress already recorded against them. Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.
JOURNAL — journal: one short entry (type + content) for a notable beat worth logging. When none of the built-in types fits, use type "custom" with one of this game's own labels:
  • ritual — a rite performed
  • gossip
BE THOROUGH — the panel should reflect the FULL richness of what you narrated. Each turn record ALL that changed: any on-screen character (mood on every demeanor shift, appearance + outfit when described, thoughts for implied inner state, relationship when it forms or turns, their tracked values as they move); the scene (location/timeOfDay/weather on change, the plot act summary); bodies (hp, tracked resources, conditions gained AND ended, a status line); items (add with description + location, remove when used, wallet for coin); quests (with objectives); and a journal entry for the beat. Sparse tracking makes the panel feel dead.
RECONCILE: when the CURRENT TRACKED STATE contradicts the story (a character shown leaving is still listed present, an outfit the story replaced), fix it in this delta. Recording facts the story states is not inventing — but never fabricate numbers, items, or events the story does not show.`;

const EVERYTHING_POPULATE_TEACHING = `This game has hidden layers. Record only the players' SURFACE reality — what the scene openly shows: a character's outward words, visible actions, and apparent state. Do NOT write a character's secret truth, hidden motive, or a lie's real answer into any tracked plane (journal, beats, cast thoughts/mood/relationship, quests). The hidden layer lives in your reasoning channel and the host's reveal-eye — never the panel.
IDENTITY — sheet.title is this character's TITLE or class as the card presents them ("Warden of House Vane", "hedge-witch"), short and in the card's own voice; sheet.level is their starting level as a whole number — 1 unless the card explicitly establishes a veteran standing.
INVENTORY — inventory: items gained or lost (add/remove) and currency (walletDeltas — named currencies, e.g. gold). INFER what a character has on them from what the story showed — recording an item the story established (a key pocketed three turns ago) is NOT inventing.
QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). To mark an objective DONE, name its text in completeObjectives — do NOT restate the objective list to report progress. Send objectives only to CHANGE the list itself (adding a newly-revealed step); the lines you repeat keep the progress already recorded against them. Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.
Record ONLY what the character card and the opening scene actually establish or plainly imply — the gear they are described carrying, the coin their station implies, the goals their background already gives them. If the card says nothing about a plane, leave it empty. Do NOT invent adventuring loot, quest chains, or a purse the character has no reason to carry.`;

const TOOL_UPDATE_PARTY = `Record changes to any actor's body, condition, or tracked values. trackerDeltas: spend/restore a tracked RESOURCE (negative = spent, e.g. damage on an HP meter). trackerSets: record the new reading of a tracked STATE. addCondition: a new status effect (e.g. Blessed, Bleeding, Poisoned) with an optional numeric modifier. removeCondition: when an effect ends. status: a short current-state line ('bleeding, on edge').
TRACKED RESOURCES — party[].trackerDeltas: spend or restore these by a signed amount when the beat moves them (negative = spent):
  • HP (key: hp, 0-20) — how much fight is left in them
TRACKED STATES — party[].trackerSets: record the NEW reading whenever the beat changes one of these:
  • Poise (key: poise)
Only write a tracker on an actor the schema offers it for — not every character carries every tracker.
EXAMPLE — took a cut and spent themselves fighting: \`{targetRef:'player', trackerDeltas:[{key:'hp',delta:-3}], trackerSets:[{key:'poise',value:'guarded'}], addCondition:{name:'Bleeding',modifier:-1}, status:'bleeding, breathing hard'}\`.`;

const TOOL_UPDATE_INVENTORY = `Items and coin on an actor. add: new items — ALWAYS give a \`description\` and a \`location\` (where it's carried: 'belt pouch', 'sheathed'), plus quantity. remove: items used/lost/given away. walletDeltas: coin gained/spent (negative=spent). EXAMPLE — gifted an oil vial, paid 20 gold: \`{targetRef:'player', add:[{name:'Vial of Sanctified Oil', description:'warded holy oil, faintly glowing', quantity:1, location:'belt pouch'}], walletDeltas:[{name:'gold', delta:-20}]}\`.`;

const TOOL_UPDATE_SCENE = `The scene + who is present. Set location/timeOfDay/weather when they change — specifically whenever the beat spends time (rest, travel, a cut to later), so the day actually moves, and whenever the sky turns; calendarDate/day as days pass; advance plot.act/title/actSummary as the story moves. weather is the WORLD'S weather — the sky, never the room: set it whenever the story says what the sky is doing, indoors or out (a blizzard past the cabin window counts); when the story says nothing about the sky, omit it and it keeps, and a room's own atmosphere goes in location instead. weather.type is one of clear/cloudy/rain/storm/snow/fog/wind/ash/indoors — use "indoors" when the scene is enclosed with no sky visible from it at all, and if none fits what the sky is doing, OMIT weather rather than forcing the nearest; the vivid phrasing goes in weather.label ("torrential sleet"). presentUpsert: for EACH character on screen set mood (every demeanor shift — 1-3 words, "wary", "quietly furious", NEVER a sentence), appearance + outfit (when described), thoughts (their implied inner state), and relationship {kind,label}. recentEvent: a one-line beat. EXAMPLE — a priest warms to you: \`{timeOfDay:'evening', presentUpsert:[{name:'Sister Vesna', emoji:'🕯️', mood:'warming', appearance:'tall, silver-haired', outfit:'patched grey habit', thoughts:'weighing whether to trust you', relationship:{kind:'ally',label:''}}], recentEvent:'Vesna softened as you shared road news'}\`.`;

const TOOL_SET_TRACKER = `Write a GAME-WIDE tracked reading (not tied to one character). A resource tracker takes a signed \`delta\`; a state tracker takes the new \`value\` (or \`items\` for a list).
  • Town alarm (key: alarm, 0-100) — how hunted the party is
EXAMPLE — the town's alarm rises: \`{key:'alarm', value:35}\`.`;

const TOOL_UPSERT_QUEST = `Create/update/complete/fail a quest. Give a description and objectives[] on create; use action 'complete'/'fail' when the WHOLE quest resolves. To tick ONE objective off, pass its exact text in completeObjectives — never re-send objectives[] to report progress (send objectives[] only to change the list itself; repeated lines keep the progress already on them). EXAMPLE — a new task opens: \`{name:'Reach the Vault of Ash', action:'create', description:'Get to the vault before the new moon', objectives:['Find the road north','Enter the vault']}\`. EXAMPLE — the road is found: \`{name:'Reach the Vault of Ash', action:'update', completeObjectives:['Find the road north']}\`.`;

const TOOL_ADD_JOURNAL = `Log a notable beat with the right type (location/npc/combat/quest/item/event/note, or 'custom' with a short \`label\` when none of those fits) + a short title + content. EXAMPLE: \`{type:'combat', title:'Ambush at the Chapel', content:'Corvin drew on you at the altar; you took a cut but stayed up.'}\`.`;

const BARE_PLANE_TEACHING = `SCENE — set scene.location (WHERE) and scene.timeOfDay (dawn/morning/afternoon/evening/night/midnight); when the beat doesn't change them, restate the current values, never blank them. Set scene.recentEvent = a one-line summary of what just happened.
KEEP TIME MOVING — advance scene.timeOfDay whenever the beat spends real time: a rest or a meal, travel, a long conversation, a fight's aftermath, or a cut to later. Move it forward through the day's order and let night follow evening; never jump backwards, and never leave it parked while hours of story pass.
WEATHER — scene.weather is the WORLD'S weather: the sky, never the room. Set it whenever the story tells you what the sky is doing, indoors or out — a blizzard closing in past the cabin window counts as much as stepping outdoors into it. When the story says nothing about the sky, leave it alone: omitting keeps what is already there. A room's own atmosphere (torchlight, damp, a stifling hall) is NOT weather — that belongs in scene.location. scene.weather.type is one of clear/cloudy/rain/storm/snow/fog/wind/ash/indoors; use "indoors" when the scene is enclosed and no sky is visible from it at all, and if none of them is what the sky is actually doing, OMIT weather rather than forcing the nearest. Put the vivid phrasing in scene.weather.label ("torrential sleet", "a thin grey drizzle"), which is what the reader sees.
Set scene.calendarDate for a narrated in-world date the story gives (e.g. "3rd of Frostmoon"), and move it on as days pass.
WHO IS PRESENT — scene.presentUpsert: one entry per character who speaks or acts (name required). Fill what the beat reveals: mood, appearance, outfit, thoughts (inner state), and relationship toward the player (kind = lover/friend/ally/neutral/enemy/custom) as it shifts. scene.presentRemove a character who leaves.
MOOD IS A SHORT READ — scene.presentUpsert[].mood is 1-3 words, evocative ("wary", "quietly furious", "giddy"), never a sentence. The reasoning behind it belongs in thoughts; what just happened belongs in scene.recentEvent.
Give a NEW character a fitting single emoji (presentUpsert[].emoji) — the portrait fallback.
When the story crosses into a NEW act, set scene.plot (act number + a short act title); set the story title once it's clear.
PARTY — party: ONLY mechanical changes. Tracked-value writes (trackerDeltas/trackerSets), conditions gained/lost (addCondition/removeCondition, e.g. "bleeding", "on edge"), and a short status line (status). A character's personality, mood, or relationship goes in scene.presentUpsert, NOT here.
INVENTORY — inventory: items gained or lost (add/remove) and currency (walletDeltas — named currencies, e.g. gold). INFER what a character has on them from what the story showed — recording an item the story established (a key pocketed three turns ago) is NOT inventing.
QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). To mark an objective DONE, name its text in completeObjectives — do NOT restate the objective list to report progress. Send objectives only to CHANGE the list itself (adding a newly-revealed step); the lines you repeat keep the progress already recorded against them. Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.
JOURNAL — journal: one short entry (type + content) for a notable beat worth logging. When none of the built-in types fits, use type "custom" with a short \`label\` naming the kind of beat.
BE THOROUGH — the panel should reflect the FULL richness of what you narrated. Each turn record ALL that changed: any on-screen character (mood on every demeanor shift, appearance + outfit when described, thoughts for implied inner state, relationship when it forms or turns, their tracked values as they move); the scene (location/timeOfDay/weather on change, the plot act summary); bodies (hp, tracked resources, conditions gained AND ended, a status line); items (add with description + location, remove when used, wallet for coin); quests (with objectives); and a journal entry for the beat. Sparse tracking makes the panel feel dead.
RECONCILE: when the CURRENT TRACKED STATE contradicts the story (a character shown leaving is still listed present, an outfit the story replaced), fix it in this delta. Recording facts the story states is not inventing — but never fabricate numbers, items, or events the story does not show.`;

const BASELINE_UPDATE_PARTY = `Record changes to any actor's body, condition, or tracked values. trackerDeltas: spend/restore a tracked RESOURCE (negative = spent, e.g. damage on an HP meter). trackerSets: record the new reading of a tracked STATE. addCondition: a new status effect (e.g. Blessed, Bleeding, Poisoned) with an optional numeric modifier. removeCondition: when an effect ends. status: a short current-state line ('bleeding, on edge').
EXAMPLE — took a cut and spent themselves fighting: \`{targetRef:'player', addCondition:{name:'Bleeding',modifier:-1}, status:'bleeding, breathing hard'}\`.`;

const BASELINE_SET_TRACKER = `Write a GAME-WIDE tracked reading (not tied to one character). A resource tracker takes a signed \`delta\`; a state tracker takes the new \`value\` (or \`items\` for a list).
EXAMPLE — the town's alarm rises: \`{key:'alarm', value:35}\`.`;

const REFS: ExtractionPromptContext["refs"] = {
  actorRefs: ["player", "Mara"],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};

const tracker = (over: Partial<RpgTrackerDef>): RpgTrackerDef =>
  ({
    key: "hp",
    label: "HP",
    shape: "meter",
    max: 20,
    hint: "how much fight is left in them",
    subject: "actor",
    write: "delta",
    locked: false,
    appliesTo: "everyone",
    ...over,
  }) as RpgTrackerDef;

/** The game that lights EVERY gated clause at once — the fixtures' own config, spelled once. */
function everythingConfig(): RpgGameConfig {
  return rpgGameConfigSchema.parse({
    dateMode: "structured",
    trackers: [
      tracker({}),
      tracker({ key: "poise", label: "Poise", write: "set", shape: "text", max: null, hint: "" }),
      tracker({ key: "alarm", label: "Town alarm", subject: "game", write: "set", shape: "meter", max: 100, hint: "how hunted the party is" }),
    ],
    features: { plotProgression: true, deception: true, journalTypeHints: { ritual: "a rite performed", gossip: "" } },
  });
}

function ctx(config: RpgGameConfig, prose?: ProseOverrides): ExtractionPromptContext {
  return prose === undefined ? { config, refs: REFS } : { config, refs: REFS, prose };
}

/** One override record for a slot, stamped at that slot's current version (never stale). */
function override(id: ProseSlotId, text: string): ProseOverrides {
  return { [id]: { text, baseVersion: PROSE_SLOTS[id].version } };
}

// ── 1. Default identity: the migration changed no bytes ──────────────────────────────────────────────
test("the plane teaching, unset, is byte-identical to the pre-PROSE-1 composition (every gated clause on)", () => {
  expect(composePlaneTeaching(ctx(everythingConfig()))).toBe(EVERYTHING_PLANE_TEACHING);
});

test("the POPULATE teaching, unset, is byte-identical too — it composes the same plane slots", () => {
  expect(composePopulateTeaching(ctx(everythingConfig()))).toBe(EVERYTHING_POPULATE_TEACHING);
});

test("a bare game's plane teaching is byte-identical — the null-fragment arms drop exactly what they did", () => {
  // The complement of the fixture above: no deception clause, no tracker blocks, no plot, the NARRATED date
  // arm, and the no-hints journal tail. Half these slots are absent here, which is the arm a rendered-output
  // fixture for the maximal game cannot cover.
  expect(composePlaneTeaching(ctx(rpgGameConfigSchema.parse({})))).toBe(BARE_PLANE_TEACHING);
});

test("the six tool descriptions, unset, are byte-identical — including the per-game catalogue + worked example", () => {
  const built = buildRpgToolDescriptions(ctx(everythingConfig()));
  expect(built.get("update_party")).toBe(TOOL_UPDATE_PARTY);
  expect(built.get("update_inventory")).toBe(TOOL_UPDATE_INVENTORY);
  expect(built.get("update_scene")).toBe(TOOL_UPDATE_SCENE);
  expect(built.get("set_tracker")).toBe(TOOL_SET_TRACKER);
  expect(built.get("upsert_quest")).toBe(TOOL_UPSERT_QUEST);
  expect(built.get("add_journal_entry")).toBe(TOOL_ADD_JOURNAL);
});

test("the GAME-FREE baseline descriptions are byte-identical, and the tracker-free shapes have no stray comma", () => {
  // `RPG_BASELINE_TOOL_DESCRIPTIONS` is built at MODULE LOAD against the empty config, where there is no game
  // and therefore no preset — it reads shipped DEFAULTS by construction, and that invariant is what keeps the
  // tool-use REGISTRY and the per-call wire tools from ever saying two different things.
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_party")).toBe(BASELINE_UPDATE_PARTY);
  expect(RPG_BASELINE_TOOL_DESCRIPTIONS.get("set_tracker")).toBe(BASELINE_SET_TRACKER);
  // The two tracker args splice in WITH their own `, ` separator, so an absent tracker leaves the worked
  // example well-formed — the exact byte the pre-slot `parts.join(", ")` produced.
  expect(BASELINE_UPDATE_PARTY).toContain("`{targetRef:'player', addCondition:");
});

// ── 2. The cohort's declared posture ─────────────────────────────────────────────────────────────────
test("every extraction slot is PRESET-homed with macros:none — the tokens are data, never the macro engine", () => {
  const cohort = PROSE_SLOT_IDS.filter((id) => id.startsWith("rpg.extract."));
  // 40 at S4 + census row 27 (`stateTrackingGuide`), wired by the 2026-08-08 ruling.
  expect(cohort.length).toBe(41);
  for (const id of cohort) {
    expect(PROSE_SLOTS[id].home, id).toBe("preset");
    // An extraction prompt is not a character context: there is no `{{user}}`/`{{char}}` binding to resolve,
    // so anything else in braces must ship as literal braces rather than silently rendering empty.
    expect(PROSE_SLOTS[id].macros, id).toBe("none");
  }
});

test("the POPULATE cohort is its own group, PRESET-homed with macros:none — the born-state round's seven", () => {
  // Its own `rpg.populate.*` group rather than more `rpg.extract.*` rows (populate census rows 1-7): the two
  // cohorts fire on different CALLS, so the count above stays a statement about the turn loop.
  const cohort = PROSE_SLOT_IDS.filter((id) => id.startsWith("rpg.populate."));
  expect(cohort.length).toBe(7);
  for (const id of cohort) {
    expect(PROSE_SLOTS[id].home, id).toBe("preset");
    expect(PROSE_SLOTS[id].macros, id).toBe("none");
  }
});

test("the populate teaching's identity clause and doctrine are OVERRIDABLE — the last two source constants", () => {
  // Census rows 2-3. Before this migration they were string literals inside `composePopulateTeaching`, in a
  // function that composed everything ELSE from slots — the half-editable prompt this program exists to kill.
  const composed = composePopulateTeaching(
    ctx(rpgGameConfigSchema.parse({}), {
      ...override("rpg.populate.identity", "TITLES: short, in the card's voice."),
      ...override("rpg.populate.doctrine", "Leave blank rather than guess."),
    }),
  );
  expect(composed).toContain("TITLES: short, in the card's voice.");
  expect(composed).toContain("Leave blank rather than guess.");
  expect(composed).not.toContain("sheet.title is this character's TITLE");
  expect(composed).not.toContain("Do NOT invent adventuring loot");
  // The two born-state plane fragments are untouched — an edit resolves one slot, never the block around it.
  expect(composed).toContain("QUESTS — quests: a new or advancing quest");
});

// ── 2b. Census row 27 is WIRED (owner ruling 2026-08-08, spec §11 decision 6) ────────────────────────
// The defect this pins: `RPG_STATE_TRACKING_GUIDE` documented itself as "composed onto the write-surface
// prompts (the tool round + the structured extraction)" and was composed onto NOTHING — an exported const with
// no reference anywhere. These assert the two halves of the ruling: it now rides the SHARED teaching body both
// write surfaces walk, and it still stays OFF the surfaces its own doc-comment excluded.

test("the BE THOROUGH guide rides the shared plane teaching — on a maximal game and on a bare one", () => {
  // The shared body is what `extractionSystem` and `toolRoundSystem` both compose, so landing it here is what
  // makes "both write surfaces" structural rather than two call sites that can drift.
  expect(composePlaneTeaching(ctx(everythingConfig()))).toContain("BE THOROUGH — the panel should reflect");
  expect(composePlaneTeaching(ctx(rpgGameConfigSchema.parse({})))).toContain("Sparse tracking makes the panel feel dead.");
});

test("the guide sits BETWEEN the last plane and the reconcile rule — the never-fabricate clause closes it", () => {
  const teaching = composePlaneTeaching(ctx(everythingConfig()));
  const journal = teaching.indexOf("JOURNAL — journal:");
  const guide = teaching.indexOf("BE THOROUGH");
  const reconcile = teaching.indexOf("RECONCILE:");
  expect(journal).toBeGreaterThan(-1);
  expect(guide).toBeGreaterThan(journal);
  expect(reconcile).toBeGreaterThan(guide);
});

test("the POPULATE round does NOT get the guide — a born-state read has no turn whose changes to record", () => {
  // Its counterpart doctrine there is INVENT-NOTHING, and "each turn record ALL that changed" is turn-loop
  // language a card read cannot honor. The guide's own doc-comment named the write surfaces it belongs to.
  expect(composePopulateTeaching(ctx(everythingConfig()))).not.toContain("BE THOROUGH");
});

// ── 3. Override reach — the half a byte-identity fixture cannot prove ────────────────────────────────
test("a host override replaces a plane fragment in place, leaving its neighbours untouched", () => {
  const composed = composePlaneTeaching(ctx(everythingConfig(), override("rpg.extract.plane.inventory", "INVENTORY — only what the table can carry.")));
  expect(composed).toContain("INVENTORY — only what the table can carry.");
  expect(composed).not.toContain("recording an item the story established");
  // Its neighbours are still the shipped defaults, in the same order.
  expect(composed).toContain("PARTY — party: ONLY mechanical changes.");
  expect(composed).toContain("QUESTS — quests: a new or advancing quest");
});

test("an override KEEPS its per-game token vocabulary — this is what makes it a template slot, not static text", () => {
  const composed = composePlaneTeaching(ctx(everythingConfig(), override("rpg.extract.plane.trackers", "OUR TRACKERS:\n{{trackerCatalogue}}")));
  expect(composed).toContain("OUR TRACKERS:\n  • Town alarm (key: alarm, 0-100) — how hunted the party is");
});

test("an override that DROPS the token loses the value it carried — the documented cost of the warn-not-block lint", () => {
  // PROSE-1 §6.3: `requiredMacros` is an editor WARN, never a server rejection. Pinned so the Templates-tab
  // footer knows exactly what it is warning about — the game's own tracker names simply stop being taught.
  const composed = composePlaneTeaching(ctx(everythingConfig(), override("rpg.extract.plane.trackers", "Write the game trackers when they move.")));
  expect(composed).toContain("Write the game trackers when they move.");
  expect(composed).not.toContain("Town alarm (key: alarm");
});

test("an override reaches a TOOL DESCRIPTION, tokens and all — the write surface the model actually reads", () => {
  const built = buildRpgToolDescriptions(
    ctx(everythingConfig(), override("rpg.extract.tool.updateParty", "Record bodies.{{actorTrackers}} Like so: `{{partyExample}}`.")),
  );
  const text = built.get("update_party") ?? "";
  expect(text).toContain("Record bodies.\nTRACKED RESOURCES");
  expect(text).toContain("Like so: `{targetRef:'player', trackerDeltas:[{key:'hp',delta:-3}]");
});

test("a BLANK override resolves to the shipped default — empty bytes never reach an extraction prompt", () => {
  // The read-side heal (`resolveProseFrom`): `{text:""}` parses, so it can arrive from an imported preset or a
  // direct API write, and resolving it literally would delete a whole plane's teaching from the prompt.
  const composed = composePlaneTeaching(ctx(everythingConfig(), override("rpg.extract.plane.inventory", "   ")));
  expect(composed).toContain("INVENTORY — inventory: items gained or lost");
});

test("an override for a DIFFERENT domain's slot changes nothing here (no cross-slot leak)", () => {
  expect(composePlaneTeaching(ctx(everythingConfig(), override("rpg.reminder.steeringLicense", "not this surface")))).toBe(EVERYTHING_PLANE_TEACHING);
});
