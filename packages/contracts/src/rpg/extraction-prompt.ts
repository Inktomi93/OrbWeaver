// @orb/contracts/rpg/extraction-prompt — the PER-PLANE PROMPT-FRAGMENT REGISTRY (the crunchy-cluster
// redesign §1.6). Pure data + pure fragment builders (no I/O, no domain) — homed WITH the extraction shapes
// they teach, beside the schema they enforce (`./extraction`, `./config`, `./tools`).
//
// WHY A REGISTRY, NOT TWO TEMPLATE LITERALS: the plane-under-service class (§1.6 audit) — `plot`, `widgets`,
// per-cast `customFields`/`emoji`, the structured `day` counter were renderable + schema-writable planes the
// model was NEVER PROMPTED for, because the plane prose was hand-composed in two monolithic system-prompt
// strings (the structured extraction + the cheap tool round) that drifted from the schema. Home the teaching fragment
// WITH its plane: BOTH system prompts COMPOSE from this ONE table, so a plane can't be schema-writable but
// prompt-silent — and a NEW plane is a ROW (the D110 "~7 coupled sites" shrinks its prompt sites to one).
//
// THE ENFORCER (the D50 bus-coverage ratchet discipline): a contract test asserts every top-level
// `rpgExtractionSchema` key has a registry row — a new writable plane without a fragment is RED. The registry
// is the standing anti-drift mechanism the audit's "prompt-drift, not model failure" diagnosis demanded.
//
// THE #7 DECEPTION CLAUSE (recommendation A, §1.6): on a DECEPTION-ACTIVE game every fragment is prefixed with
// the surface-only standing clause — the tracker records the players' SURFACE reality, never a hidden truth,
// so the hidden layer lives only in the reasoning channel + the host's reveal-eye (member-safe by
// construction; the fork-strip §3.2 leak vector evaporates). Deception-gated — a non-deception game composes
// byte-identically to the pre-registry per-plane prose.

import { RPG_WEATHER_TYPES, TIME_OF_DAY } from "./ambient.ts";
import type { RpgGameConfig } from "./config.ts";
import { isDeceptionActive, rpgGameConfigSchema } from "./config.ts";
import type { ExtractionRefs, RpgExtraction } from "./extraction.ts";
import type { RpgTrackerDef } from "./tracker.ts";
import { gameTrackers, sortTrackers } from "./tracker.ts";

/** The context a fragment builder reads: the game config (feature gates, cast-field defs + hints, dateMode)
 *  and the per-call refs (widget labels, cast-field keys). A fragment returns `null` when its plane is OFF
 *  for this game (the feature-gated arm) — the composer drops a null row. */
export interface ExtractionPromptContext {
  readonly config: RpgGameConfig;
  readonly refs: ExtractionRefs;
}

/** One row per model-writable extraction plane: the schema field (the ratchet key), its teaching-fragment
 *  builder (config/refs aware), and the cheap-mode tool name it maps to (for the tool-round framing). A
 *  fragment builder returns the plane's teaching prose, or `null` when the plane is disabled this game. */
export interface ExtractionPlanePrompt {
  readonly plane: keyof RpgExtraction;
  readonly toolName: string;
  readonly fragment: (ctx: ExtractionPromptContext) => string | null;
}

/** The DECEPTION-ACTIVE standing prefix (§1.6 #7 recommendation A). Composed onto EVERY plane fragment (and the
 *  shared header) when either hidden channel is on — the tracker tracks the players' SURFACE reality only. */
const DECEPTION_SURFACE_CLAUSE =
  "This game has hidden layers. Record only the players' SURFACE reality — what the scene openly shows: a " +
  "character's outward words, visible actions, and apparent state. Do NOT write a character's secret truth, " +
  "hidden motive, or a lie's real answer into any tracked plane (journal, beats, cast thoughts/mood/" +
  "relationship, quests). The hidden layer lives in your reasoning channel and the host's reveal-eye — never " +
  "the panel.";

/** ONE tracker's model-facing catalogue line — a bulleted label, its key + range, then an em-dash gloss.
 *  THE R2/R6 interpolation unit: a host-defined tracker reaches the write surface BY NAME AND GLOSS,
 *  which is the difference between a tracked value steering the story and decorating the panel (R4b measured
 *  the gap: Δ −0.12 bare vs −1.00 glossed). The `key` is spelled because the wire arg is key-addressed. */
function trackerCatalogueLine(def: RpgTrackerDef): string {
  const range = def.shape === "meter" && def.max !== null ? `, 0-${def.max}` : "";
  const hint = def.hint !== "" ? ` — ${def.hint}` : "";
  return `  • ${def.label} (key: ${def.key}${range})${hint}`;
}

/** The ACTOR-subject trackers this game defines, unlocked only (the write surface — a locked tracker is
 *  absent from the schema, so teaching it would ask for what the grammar forbids). Sorted like every other
 *  tracker read, so the prompt prefix is stable across turns (prompt-cache hygiene). */
function writableActorTrackers(config: RpgGameConfig): readonly RpgTrackerDef[] {
  return sortTrackers(config.trackers.filter((def) => def.subject === "actor" && !def.locked));
}

/** The per-actor tracker teaching (`update_party` / `party[]`). Enumerates the defined trackers with their
 *  host hints, split by the WRITE axis so the model learns the two different mental models: a `delta` tracker
 *  is a resource the beat spends/restores, a `set` tracker is a state the beat observes. `null` when the game
 *  defines no writable actor trackers (the feature-off arm — the schema has no arms either). */
function actorTrackerFragment(ctx: ExtractionPromptContext): string | null {
  const defs = writableActorTrackers(ctx.config);
  if (defs.length === 0) {
    return null;
  }
  const blocks: string[] = [];
  const deltas = defs.filter((d) => d.write === "delta");
  const sets = defs.filter((d) => d.write === "set");
  if (deltas.length > 0) {
    blocks.push(
      `TRACKED RESOURCES — party[].trackerDeltas: spend or restore these by a signed amount when the beat moves them (negative = spent):\n${deltas
        .map(trackerCatalogueLine)
        .join("\n")}`,
    );
  }
  if (sets.length > 0) {
    blocks.push(
      `TRACKED STATES — party[].trackerSets: record the NEW reading whenever the beat changes one of these:\n${sets.map(trackerCatalogueLine).join("\n")}`,
    );
  }
  blocks.push("Only write a tracker on an actor the schema offers it for — not every character carries every tracker.");
  return blocks.join("\n");
}

/** The plane-prompt registry (§1.6). One row per top-level `rpgExtractionSchema` key — the ratchet asserts
 *  full coverage. `scene` folds the ambient/cast/day/emoji/plot gaps the audit named; `widgets` is now
 *  prompted on the structured arm (the audit's "never mentioned" gap). */
export const EXTRACTION_PLANE_PROMPTS: readonly ExtractionPlanePrompt[] = [
  {
    plane: "scene",
    toolName: "update_scene",
    fragment: (ctx) => {
      const lines: string[] = [];
      lines.push(
        `SCENE — set scene.location (WHERE) and scene.timeOfDay (${[...TIME_OF_DAY].join("/")}); when the beat ` +
          "doesn't change them, restate the current values, never blank them. Set scene.recentEvent = a one-line " +
          "summary of what just happened.",
      );
      // RV-9 — WHEN to move the clock/weather. The panel's Waystone reads these two fields as a live clock, so a
      // story that runs for pages at one timeOfDay reads as a stopped clock. Terse, one clause per field: the
      // R4b lesson is that a gloss saying WHEN measurably changes whether a small model writes the field at all.
      lines.push(
        "KEEP TIME MOVING — advance scene.timeOfDay whenever the beat spends real time: a rest or a meal, travel, " +
          "a long conversation, a fight's aftermath, or a cut to later. Move it forward through the day's order " +
          "and let night follow evening; never jump backwards, and never leave it parked while hours of story pass.",
      );
      lines.push(
        "WEATHER — scene.weather is the WORLD'S weather: the sky, never the room. Set it whenever the story tells " +
          "you what the sky is doing, indoors or out — a blizzard closing in past the cabin window counts as much as " +
          "stepping outdoors into it. When the story says nothing about the sky, leave it alone: omitting keeps what " +
          "is already there. A room's own atmosphere (torchlight, damp, a stifling hall) is NOT weather — that belongs " +
          `in scene.location. scene.weather.type is one of ${[...RPG_WEATHER_TYPES].join("/")}; use "indoors" when the ` +
          "scene is enclosed and no sky is visible from it at all, and if none of them is what the sky is actually " +
          "doing, OMIT weather rather than forcing the nearest. Put the vivid phrasing in " +
          `scene.weather.label ("torrential sleet", "a thin grey drizzle"), which is what the reader sees.`,
      );
      // §1.6 gap — the structured day counter, prompted ONLY when dateMode is structured (mode-aware fragment).
      if (ctx.config.dateMode === "structured") {
        lines.push(
          "Set scene.day (the integer day counter) and advance it by one whenever the party sleeps through the " +
            "night or the story crosses into the next morning; set scene.calendarDate for a narrated in-world date.",
        );
      } else {
        lines.push('Set scene.calendarDate for a narrated in-world date the story gives (e.g. "3rd of Frostmoon"), and move it on as days pass.');
      }
      lines.push(
        "WHO IS PRESENT — scene.presentUpsert: one entry per character who speaks or acts (name required). Fill " +
          "what the beat reveals: mood, appearance, outfit, thoughts (inner state), and relationship toward the " +
          "player (kind = lover/friend/ally/neutral/enemy/custom) as it shifts. scene.presentRemove a character " +
          "who leaves.",
      );
      // The mood-prose steer (owner report): models write a whole sentence into `mood`, which the cast row
      // renders as a wall of text. Taught in PROSE, never a schema max/pattern — a hard constraint would make
      // the whole call unemittable on a non-enforcing wire and cost the beat, the exact class EXT-4 is fixing.
      lines.push(
        'MOOD IS A SHORT READ — scene.presentUpsert[].mood is 1-3 words, evocative ("wary", "quietly furious", ' +
          '"giddy"), never a sentence. The reasoning behind it belongs in thoughts; what just happened belongs in ' +
          "scene.recentEvent.",
      );
      // §1.6 gap — the portrait-fallback emoji, one clause.
      lines.push("Give a NEW character a fitting single emoji (presentUpsert[].emoji) — the portrait fallback.");
      // §1.6 gap — the plot act rail, gated on plotProgression.
      if (ctx.config.features.plotProgression) {
        lines.push("When the story crosses into a NEW act, set scene.plot (act number + a short act title); set the story title once it's clear.");
      }
      return lines.join("\n");
    },
  },
  {
    plane: "party",
    toolName: "update_party",
    fragment: (ctx) => {
      const base =
        "PARTY — party: ONLY mechanical changes. Tracked-value writes (trackerDeltas/trackerSets), conditions " +
        'gained/lost (addCondition/removeCondition, e.g. "bleeding", "on edge"), and a short ' +
        "status line (status). A character's personality, mood, or relationship goes in scene.presentUpsert, NOT here.";
      // R2/R6 — the game's OWN trackers, by name + host gloss. Static prose here would teach a vocabulary
      // this game may not have and omit the one it does.
      const trackers = actorTrackerFragment(ctx);
      return trackers === null ? base : `${base}\n${trackers}`;
    },
  },
  {
    plane: "inventory",
    toolName: "update_inventory",
    fragment: () =>
      "INVENTORY — inventory: items gained or lost (add/remove) and currency (walletDeltas — named currencies, " +
      "e.g. gold). INFER what a character has on them from what the story showed — recording an item the story " +
      "established (a key pocketed three turns ago) is NOT inventing.",
  },
  {
    plane: "trackers",
    toolName: "set_tracker",
    // The GAME-subject trackers (the retired widget plane) — enumerated by name + host gloss, never as bare
    // keys. `null` when the game defines none, in which case the schema drops the plane entirely.
    fragment: (ctx) => {
      const defs = gameTrackers(ctx.config.trackers).filter((def) => !def.locked);
      if (defs.length === 0) {
        return null;
      }
      return (
        "GAME TRACKERS — trackers: the whole-game readings (not tied to one character). Write one when the " +
        "beat moves it — a delta tracker takes a signed `delta`, a state tracker takes the new `value`. " +
        `Never invent a key.\n${defs.map(trackerCatalogueLine).join("\n")}`
      );
    },
  },
  {
    plane: "quests",
    toolName: "upsert_quest",
    fragment: () =>
      "QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). " +
      // EXT-4c — the two objective gestures, in prose (never extra schema): the model has to learn that ticking
      // one objective off is `completeObjectives`, not a re-listing, or it restates the list on every beat.
      "To mark an objective DONE, name its text in completeObjectives — do NOT restate the objective list to " +
      "report progress. Send objectives only to CHANGE the list itself (adding a newly-revealed step); the " +
      "lines you repeat keep the progress already recorded against them. " +
      "Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.",
  },
  {
    plane: "journal",
    toolName: "add_journal_entry",
    // R4c — teach the `custom` escape + the host's own type glosses. The seven built-ins are combat-flavoured
    // on a plane that fires on 79% of turns; a host who defines "ritual" or "gossip" gets it taught by name.
    fragment: (ctx) => {
      const base = "JOURNAL — journal: one short entry (type + content) for a notable beat worth logging.";
      const hints = Object.entries(ctx.config.features.journalTypeHints);
      if (hints.length === 0) {
        return `${base} When none of the built-in types fits, use type "custom" with a short \`label\` naming the kind of beat.`;
      }
      const lines = hints.map(([label, hint]) => (hint === "" ? `  • ${label}` : `  • ${label} — ${hint}`));
      return `${base} When none of the built-in types fits, use type "custom" with one of this game's own labels:\n${lines.join("\n")}`;
    },
  },
];

/** Compose the plane fragments into a teaching block for a system prompt — the SHARED body both the structured
 *  extraction and the cheap tool round walk (§1.6). Drops disabled planes (null fragments), and on a
 *  DECEPTION-ACTIVE game prefixes the surface-only standing clause (#7 recommendation A). The RECONCILE
 *  doctrine (fix a contradicted plane) rides here so both arms teach it identically. */
export function composePlaneTeaching(ctx: ExtractionPromptContext): string {
  const blocks: string[] = [];
  if (isDeceptionActive(ctx.config.features)) {
    blocks.push(DECEPTION_SURFACE_CLAUSE);
  }
  for (const row of EXTRACTION_PLANE_PROMPTS) {
    const fragment = row.fragment(ctx);
    if (fragment !== null) {
      blocks.push(fragment);
    }
  }
  blocks.push(
    "RECONCILE: when the CURRENT TRACKED STATE contradicts the story (a character shown leaving is still listed " +
      "present, an outfit the story replaced), fix it in this delta. Recording facts the story states is not " +
      "inventing — but never fabricate numbers, items, or events the story does not show.",
  );
  return blocks.join("\n");
}

/** The plane rows POPULATE-FROM-CHARACTER teaches — the two born-state planes a background implies. The
 *  live-play planes are not merely untaught here: they are absent from `rpgPopulateSchema` entirely and
 *  rebuilt empty by `salvagePopulate`, so this filter and the schema agree by construction. */
const POPULATE_PLANES: ReadonlySet<keyof RpgExtraction> = new Set<keyof RpgExtraction>(["inventory", "quests"]);

/** The populate round's INVENT-NOTHING doctrine — the counterpart to the extraction's RECONCILE line. A card
 *  read has no story to check itself against, so the only guardrail is "what the card and the opening actually
 *  establish"; the round runs ONCE per character, at the host's click, and everything it writes is immediately
 *  hand-editable, so a thin answer is strictly better than a confabulated one. */
const POPULATE_DOCTRINE =
  "Record ONLY what the character card and the opening scene actually establish or plainly imply — the gear " +
  "they are described carrying, the coin their station implies, the goals their background already gives them. " +
  "If the card says nothing about a plane, leave it empty. Do NOT invent adventuring loot, quest chains, or a " +
  "purse the character has no reason to carry.";

/** Compose the POPULATE teaching block (the host's born-state round): the deception clause when the game runs
 *  hidden layers (an opening message may itself carry a `<lie>` span — the tracker stays surface-only there
 *  exactly as it does in play), the SAME per-plane fragments the turn vehicles teach for the two born-state
 *  planes, and the invent-nothing doctrine. One home with the extraction teaching, so a plane taught two ways
 *  stays impossible. */
export function composePopulateTeaching(ctx: ExtractionPromptContext): string {
  const blocks: string[] = [];
  if (isDeceptionActive(ctx.config.features)) {
    blocks.push(DECEPTION_SURFACE_CLAUSE);
  }
  blocks.push(
    "IDENTITY — sheet.title is this character's TITLE or class as the card presents them (\"Warden of House " +
      'Vane", "hedge-witch"), short and in the card\'s own voice; sheet.level is their starting level as a ' +
      "whole number — 1 unless the card explicitly establishes a veteran standing.",
  );
  for (const row of EXTRACTION_PLANE_PROMPTS) {
    if (!POPULATE_PLANES.has(row.plane)) {
      continue;
    }
    const fragment = row.fragment(ctx);
    if (fragment !== null) {
      blocks.push(fragment);
    }
  }
  blocks.push(POPULATE_DOCTRINE);
  return blocks.join("\n");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// R2 — the enriched TOOL DESCRIPTIONS, as TEMPLATES (the spike's Appendix A, un-frozen).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// The spike measured the enrichment lifting coverage 33→37/43 distinct fields (+27 field-writes, +$0.008/game),
// and R6 then ruled the strings must be TEMPLATES: a static "poolDeltas: spend/restore named pools like
// Mana/Stamina" teaches a vocabulary this game may not have and stays silent about the one it does. So each
// description is BUILT per game, interpolating that game's own tracker defs BY NAME AND HOST GLOSS.
//
// ONE HOME, two consumers: the per-call WIRE tools (the tool round + the R1 folded turn, which build against a
// resolved game) and the tool-use REGISTRY defs (which have no game in scope and take the empty-config
// baseline). A drift between "what the tool says" and "what the plane teaching says" is the §1.6 class this
// registry exists to make impossible.

/** A worked EXAMPLE for `update_party`, written in THIS game's tracker vocabulary (the spike's examples were
 *  its strongest lever — a model copies the shape it is shown). Falls back to the tracker-free shape when the
 *  game defines no writable actor trackers. */
function partyExample(ctx: ExtractionPromptContext): string {
  const defs = writableActorTrackers(ctx.config);
  const delta = defs.find((d) => d.write === "delta");
  const set = defs.find((d) => d.write === "set");
  const parts = ["targetRef:'player'"];
  if (delta !== undefined) {
    parts.push(`trackerDeltas:[{key:'${delta.key}',delta:-3}]`);
  }
  if (set !== undefined) {
    parts.push(`trackerSets:[{key:'${set.key}',value:${set.shape === "text" ? "'guarded'" : "40"}}]`);
  }
  parts.push("addCondition:{name:'Bleeding',modifier:-1}", "status:'bleeding, breathing hard'");
  return `{${parts.join(", ")}}`;
}

/** Build the per-game model-facing tool DESCRIPTIONS (R2 templates), keyed by WIRE TOOL NAME. A `Map` (not an
 *  object) because the keys are snake_case wire VALUES, not JS property identifiers — the same reason
 *  `TOOL_ROUND_ARRAY_ARMS` is a Map in `./extraction`. The assembly layer pairs each with that tool's
 *  per-call constrained parameter schema. */
export function buildRpgToolDescriptions(ctx: ExtractionPromptContext): ReadonlyMap<string, string> {
  const actorTrackers = actorTrackerFragment(ctx);
  const gameTrackerDefs = gameTrackers(ctx.config.trackers).filter((def) => !def.locked);
  return new Map([
    [
      "update_party",
      "Record changes to any actor's body, condition, or tracked values. " +
        "trackerDeltas: spend/restore a tracked RESOURCE (negative = spent, e.g. damage on an HP meter). trackerSets: record the " +
        "new reading of a tracked STATE. addCondition: a new status effect (e.g. Blessed, Bleeding, Poisoned) with " +
        "an optional numeric modifier. removeCondition: when an effect ends. status: a short current-state line " +
        `('bleeding, on edge').${actorTrackers === null ? "" : `\n${actorTrackers}`}\nEXAMPLE — took a cut and spent ` +
        `themselves fighting: \`${partyExample(ctx)}\`.`,
    ],
    [
      "update_inventory",
      "Items and coin on an actor. add: new items — ALWAYS give a `description` and a `location` (where it's " +
        "carried: 'belt pouch', 'sheathed'), plus quantity. remove: items used/lost/given away. walletDeltas: coin " +
        "gained/spent (negative=spent). EXAMPLE — gifted an oil vial, paid 20 gold: `{targetRef:'player', " +
        "add:[{name:'Vial of Sanctified Oil', description:'warded holy oil, faintly glowing', quantity:1, " +
        "location:'belt pouch'}], walletDeltas:[{name:'gold', delta:-20}]}`.",
    ],
    // RV-9: time and weather are a LIVE CLOCK on the panel, so the description says WHEN to move them — a field
    // the model never advances renders as a stopped clock (the R4b gloss lesson).
    [
      "update_scene",
      "The scene + who is present. Set location/timeOfDay/weather when they change — specifically whenever " +
        "the beat spends time (rest, travel, a cut to later), so the day actually moves, and whenever the " +
        "sky turns; calendarDate/day as days " +
        "pass; advance plot.act/title/actSummary as the story moves. weather is the WORLD'S weather — the sky, " +
        "never the room: set it whenever the story says what the sky is doing, indoors or out (a blizzard past the " +
        "cabin window counts); when the story says nothing about the sky, omit it and it keeps, and a room's own " +
        "atmosphere goes in location instead. weather.type is one of " +
        `${[...RPG_WEATHER_TYPES].join("/")} — use "indoors" when the scene is enclosed with no sky visible from ` +
        "it at all, and if none fits what the sky is doing, OMIT weather rather than " +
        'forcing the nearest; the vivid phrasing goes in weather.label ("torrential sleet"). ' +
        "presentUpsert: for EACH character on screen set mood (every demeanor shift — 1-3 " +
        'words, "wary", "quietly furious", NEVER a sentence), appearance + outfit (when described), thoughts ' +
        "(their implied inner state), and relationship {kind,label}. " +
        "recentEvent: a one-line beat. EXAMPLE — a priest warms to you: `{timeOfDay:'evening', " +
        "presentUpsert:[{name:'Sister Vesna', emoji:'🕯️', mood:'warming', appearance:'tall, silver-haired', " +
        "outfit:'patched grey habit', thoughts:'weighing whether to trust you', " +
        "relationship:{kind:'ally',label:''}}], recentEvent:'Vesna softened as you shared road news'}`.",
    ],
    [
      "set_tracker",
      "Write a GAME-WIDE tracked reading (not tied to one character). A resource tracker takes a signed `delta`; " +
        `a state tracker takes the new \`value\` (or \`items\` for a list).${
          gameTrackerDefs.length === 0 ? "" : `\n${gameTrackerDefs.map(trackerCatalogueLine).join("\n")}`
        }\nEXAMPLE — the town's alarm rises: \`{key:'${gameTrackerDefs.at(0)?.key ?? "alarm"}', value:35}\`.`,
    ],
    [
      "upsert_quest",
      "Create/update/complete/fail a quest. Give a description and objectives[] on create; use action " +
        "'complete'/'fail' when the WHOLE quest resolves. To tick ONE objective off, pass its exact text in " +
        "completeObjectives — never re-send objectives[] to report progress (send objectives[] only to change " +
        "the list itself; repeated lines keep the progress already on them). EXAMPLE — a new task opens: " +
        "`{name:'Reach the Vault of Ash', action:'create', description:'Get to the vault before the new moon', " +
        "objectives:['Find the road north','Enter the vault']}`. EXAMPLE — the road is found: " +
        "`{name:'Reach the Vault of Ash', action:'update', completeObjectives:['Find the road north']}`.",
    ],
    [
      "add_journal_entry",
      "Log a notable beat with the right type (location/npc/combat/quest/item/event/note, or 'custom' with a " +
        "short `label` when none of those fits) + a short title + content. EXAMPLE: `{type:'combat', title:'Ambush " +
        "at the Chapel', content:'Corvin drew on you at the altar; you took a cut but stayed up.'}`.",
    ],
  ]);
}

/** The GAME-FREE baseline descriptions — the templates rendered against a default config with no trackers.
 *  The tool-use REGISTRY defs (which are registered once at compose, with no game in scope) read these, so
 *  the static registry and the per-call wire tools can never say two different things about the same tool.
 *  A per-call assembly ALWAYS re-renders through {@link buildRpgToolDescriptions} with the real game. */
export const RPG_BASELINE_TOOL_DESCRIPTIONS: ReadonlyMap<string, string> = buildRpgToolDescriptions({
  config: rpgGameConfigSchema.parse({}),
  refs: {
    actorRefs: [],
    trackerWriteGroups: [],
    gameTrackerKeys: { deltaKeys: [], setKeys: [] },
    conditionNames: [],
    establishScene: { location: false, timeOfDay: false, presentCast: false },
  },
});

/** The state-tracking GUIDE (Appendix A's system-prompt addendum) — the "be thorough, the panel should reflect
 *  the FULL richness of the narration" instruction that lifted per-turn field coverage. Composed onto the
 *  write-surface prompts (the tool round + the structured extraction), never onto the character turn's own
 *  narration prompt (which must never be asked to carry bookkeeping it might narrate back). */
export const RPG_STATE_TRACKING_GUIDE =
  "BE THOROUGH — the panel should reflect the FULL richness of what you narrated. Each turn record ALL that " +
  "changed: any on-screen character (mood on every demeanor shift, appearance + outfit when described, thoughts " +
  "for implied inner state, relationship when it forms or turns, their tracked values as they move); the scene " +
  "(location/timeOfDay/weather on change, the plot act summary); bodies (hp, tracked resources, conditions " +
  "gained AND ended, a status line); items (add with description + location, remove when used, wallet for coin); " +
  "quests (with objectives); and a journal entry for the beat. Sparse tracking makes the panel feel dead.";
