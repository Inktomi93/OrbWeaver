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
//
// THE BYTES ARE DATA (PROSE-1 S4, census 11-26). Every model-facing string this module used to hold as a const
// is now a slot row in `./prose.ts`, resolved against `ExtractionPromptContext.prose` — the GM PRESET's
// `promptConfig.prose`, authored in the preset Templates tab. What stays here is the ASSEMBLY: which clause
// fires for which config, what the per-game tokens expand to, and the composition order. An ABSENT override
// resolves to the shipped default, so a game whose host has edited nothing composes byte-identically to the
// pre-PROSE-1 prompt (asserted per-slot in `tests/contracts/rpg/extraction-prompt.contract.test.ts`).
//
// ONE CONSTANT IS DELIBERATELY NOT A SLOT: `RPG_STATE_TRACKING_GUIDE` (census 27) is composed onto NOTHING
// today — `pnpm ast refs` finds only its declaration. Spec §11 decision 6 (wire it and measure, or delete) is
// owner-DEFERRED, and slotting a dead constant would hand a host an edit surface over bytes no model ever
// reads. It stays dead-but-present until that ruling lands, and it is the reason ARM B of the
// `no-hardcoded-model-prose` gate exists.

import type { ProseOverrides } from "#prose-slot";
import { resolveProseFrom, spliceProseTokens } from "#prose-slot";
import { RPG_WEATHER_TYPES, TIME_OF_DAY } from "./ambient.ts";
import type { RpgGameConfig } from "./config.ts";
import { isDeceptionActive, rpgGameConfigSchema } from "./config.ts";
import type { ExtractionRefs, RpgExtraction } from "./extraction.ts";
import { RPG_PROSE_SLOTS } from "./prose.ts";
import type { RpgTrackerDef } from "./tracker.ts";
import { gameTrackers, sortTrackers } from "./tracker.ts";

/** The context a fragment builder reads: the game config (feature gates, cast-field defs + hints, dateMode),
 *  the per-call refs (widget labels, cast-field keys), and the turn's resolved PROSE overrides. A fragment
 *  returns `null` when its plane is OFF for this game (the feature-gated arm) — the composer drops a null row. */
export interface ExtractionPromptContext {
  readonly config: RpgGameConfig;
  readonly refs: ExtractionRefs;
  /** PROSE-1 §4.5 (census 11-26) — the GM PRESET's model-facing overrides for the extraction seam, threaded
   *  whole exactly as `LiteReminderInput.prose` is. Every string below resolves through it, so a host edit in
   *  the preset Templates tab lands on the write surface. ABSENT ⇒ `{}` ⇒ every fragment is byte-identical to
   *  the pre-PROSE-1 constant, which is what keeps `RPG_BASELINE_TOOL_DESCRIPTIONS` (built at module load,
   *  with no game and therefore no preset in scope) and every hand-built test context honest. */
  readonly prose?: ProseOverrides | undefined;
}

/** Resolve ONE rpg prose slot against this context's overrides, splicing the slot's declared PRE-SUBSTITUTION
 *  tokens (PROSE-1 §4.5 arm (a): the per-game TEMPLATE is a slot whose text is the template source and whose
 *  token VALUES this module computes off the ctx).
 *
 *  It goes through `#prose-slot`'s primitives rather than `#prose`'s `resolveProseText` for ONE structural
 *  reason: `#prose` imports `#rpg` to compose `PROSE_SLOTS`, so an import the other way would close a
 *  `no-circular` cycle. The precedence rule + the splice are the SAME code either way — they live on the shape
 *  half precisely so a domain table can call them (see `#prose-slot`'s resolution-primitives header). */
function rpgProse(ctx: ExtractionPromptContext, id: keyof typeof RPG_PROSE_SLOTS, tokens?: Readonly<Record<string, string>>): string {
  return spliceProseTokens(resolveProseFrom(RPG_PROSE_SLOTS[id], (ctx.prose ?? {})[id]).text, tokens);
}

/** One row per model-writable extraction plane: the schema field (the ratchet key), its teaching-fragment
 *  builder (config/refs aware), and the cheap-mode tool name it maps to (for the tool-round framing). A
 *  fragment builder returns the plane's teaching prose, or `null` when the plane is disabled this game. */
export interface ExtractionPlanePrompt {
  readonly plane: keyof RpgExtraction;
  readonly toolName: string;
  readonly fragment: (ctx: ExtractionPromptContext) => string | null;
}

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
    blocks.push(rpgProse(ctx, "rpg.extract.party.resources", { trackerCatalogue: deltas.map(trackerCatalogueLine).join("\n") }));
  }
  if (sets.length > 0) {
    blocks.push(rpgProse(ctx, "rpg.extract.party.states", { trackerCatalogue: sets.map(trackerCatalogueLine).join("\n") }));
  }
  blocks.push(rpgProse(ctx, "rpg.extract.party.trackerScope"));
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
      lines.push(rpgProse(ctx, "rpg.extract.scene.core", { timeOfDayValues: [...TIME_OF_DAY].join("/") }));
      // RV-9 — WHEN to move the clock/weather. The panel's Waystone reads these two fields as a live clock, so a
      // story that runs for pages at one timeOfDay reads as a stopped clock. Terse, one clause per field: the
      // R4b lesson is that a gloss saying WHEN measurably changes whether a small model writes the field at all.
      lines.push(rpgProse(ctx, "rpg.extract.scene.clock"));
      lines.push(rpgProse(ctx, "rpg.extract.scene.weather", { weatherTypes: [...RPG_WEATHER_TYPES].join("/") }));
      // §1.6 gap — the structured day counter, prompted ONLY when dateMode is structured (mode-aware fragment).
      // TWO SLOTS, not one slot with a mode token: the two clauses say different things, so burying either in a
      // token VALUE would put un-editable model prose back in the code — the disease this program exists to kill.
      lines.push(rpgProse(ctx, ctx.config.dateMode === "structured" ? "rpg.extract.scene.dayStructured" : "rpg.extract.scene.dayNarrated"));
      lines.push(rpgProse(ctx, "rpg.extract.scene.present"));
      // The mood-prose steer (owner report): models write a whole sentence into `mood`, which the cast row
      // renders as a wall of text. Taught in PROSE, never a schema max/pattern — a hard constraint would make
      // the whole call unemittable on a non-enforcing wire and cost the beat, the exact class EXT-4 is fixing.
      lines.push(rpgProse(ctx, "rpg.extract.scene.mood"));
      // §1.6 gap — the portrait-fallback emoji, one clause.
      lines.push(rpgProse(ctx, "rpg.extract.scene.emoji"));
      // §1.6 gap — the plot act rail, gated on plotProgression.
      if (ctx.config.features.plotProgression) {
        lines.push(rpgProse(ctx, "rpg.extract.scene.plot"));
      }
      return lines.join("\n");
    },
  },
  {
    plane: "party",
    toolName: "update_party",
    fragment: (ctx) => {
      const base = rpgProse(ctx, "rpg.extract.plane.party");
      // R2/R6 — the game's OWN trackers, by name + host gloss. Static prose here would teach a vocabulary
      // this game may not have and omit the one it does.
      const trackers = actorTrackerFragment(ctx);
      return trackers === null ? base : `${base}\n${trackers}`;
    },
  },
  {
    plane: "inventory",
    toolName: "update_inventory",
    fragment: (ctx) => rpgProse(ctx, "rpg.extract.plane.inventory"),
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
      return rpgProse(ctx, "rpg.extract.plane.trackers", { trackerCatalogue: defs.map(trackerCatalogueLine).join("\n") });
    },
  },
  {
    plane: "quests",
    toolName: "upsert_quest",
    // EXT-4c — the slot carries the two objective gestures in prose (never extra schema): the model has to
    // learn that ticking one objective off is `completeObjectives`, not a re-listing, or it restates the list
    // on every beat.
    fragment: (ctx) => rpgProse(ctx, "rpg.extract.plane.quests"),
  },
  {
    plane: "journal",
    toolName: "add_journal_entry",
    // R4c — teach the `custom` escape + the host's own type glosses. The seven built-ins are combat-flavoured
    // on a plane that fires on 79% of turns; a host who defines "ritual" or "gossip" gets it taught by name.
    fragment: (ctx) => {
      const base = rpgProse(ctx, "rpg.extract.plane.journal");
      const hints = Object.entries(ctx.config.features.journalTypeHints);
      if (hints.length === 0) {
        return `${base} ${rpgProse(ctx, "rpg.extract.journal.customType")}`;
      }
      const lines = hints.map(([label, hint]) => (hint === "" ? `  • ${label}` : `  • ${label} — ${hint}`));
      return `${base} ${rpgProse(ctx, "rpg.extract.journal.customLabels", { journalTypeLabels: lines.join("\n") })}`;
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
    blocks.push(rpgProse(ctx, "rpg.extract.deceptionSurface"));
  }
  for (const row of EXTRACTION_PLANE_PROMPTS) {
    const fragment = row.fragment(ctx);
    if (fragment !== null) {
      blocks.push(fragment);
    }
  }
  blocks.push(rpgProse(ctx, "rpg.extract.reconcileDoctrine"));
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
    blocks.push(rpgProse(ctx, "rpg.extract.deceptionSurface"));
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
  // The two tracker args carry their OWN `, ` separator, so an absent tracker contributes nothing and the
  // tracker-free game renders the same bytes the pre-slot `parts.join(", ")` produced.
  return rpgProse(ctx, "rpg.extract.tool.partyExample", {
    trackerDeltaArg: delta === undefined ? "" : `, trackerDeltas:[{key:'${delta.key}',delta:-3}]`,
    trackerSetArg: set === undefined ? "" : `, trackerSets:[{key:'${set.key}',value:${set.shape === "text" ? "'guarded'" : "40"}}]`,
  });
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
      rpgProse(ctx, "rpg.extract.tool.updateParty", {
        // The per-actor tracker block carries its own leading newline, so a tracker-free game renders the
        // description with nothing between the status clause and the EXAMPLE — the pre-slot ternary's bytes.
        actorTrackers: actorTrackers === null ? "" : `\n${actorTrackers}`,
        partyExample: partyExample(ctx),
      }),
    ],
    ["update_inventory", rpgProse(ctx, "rpg.extract.tool.updateInventory")],
    // RV-9: time and weather are a LIVE CLOCK on the panel, so the description says WHEN to move them — a field
    // the model never advances renders as a stopped clock (the R4b gloss lesson).
    ["update_scene", rpgProse(ctx, "rpg.extract.tool.updateScene", { weatherTypes: [...RPG_WEATHER_TYPES].join("/") })],
    [
      "set_tracker",
      rpgProse(ctx, "rpg.extract.tool.setTracker", {
        gameTrackerCatalogue: gameTrackerDefs.length === 0 ? "" : `\n${gameTrackerDefs.map(trackerCatalogueLine).join("\n")}`,
        exampleTrackerKey: gameTrackerDefs.at(0)?.key ?? "alarm",
      }),
    ],
    ["upsert_quest", rpgProse(ctx, "rpg.extract.tool.upsertQuest")],
    ["add_journal_entry", rpgProse(ctx, "rpg.extract.tool.addJournalEntry")],
  ]);
}

/** The GAME-FREE baseline descriptions — the templates rendered against a default config with no trackers.
 *  The tool-use REGISTRY defs (which are registered once at compose, with no game in scope) read these, so
 *  the static registry and the per-call wire tools can never say two different things about the same tool.
 *  A per-call assembly ALWAYS re-renders through {@link buildRpgToolDescriptions} with the real game.
 *
 *  NO PROSE, and that is the invariant rather than an omission (PROSE-1): this is built at MODULE LOAD, where
 *  there is no game and therefore no GM preset in scope, so a host override has nothing to be an override OF.
 *  The baseline consumer reads shipped DEFAULTS, always — an extraction override is a per-call fact. */
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
/** @public owner-deferred decision 6 (wire-or-delete) — left dead-but-present by ruling 2026-08-08; see
 *  docs/design/prose-1-rpg-extraction-followon.md. */
export const RPG_STATE_TRACKING_GUIDE =
  "BE THOROUGH — the panel should reflect the FULL richness of what you narrated. Each turn record ALL that " +
  "changed: any on-screen character (mood on every demeanor shift, appearance + outfit when described, thoughts " +
  "for implied inner state, relationship when it forms or turns, their tracked values as they move); the scene " +
  "(location/timeOfDay/weather on change, the plot act summary); bodies (hp, tracked resources, conditions " +
  "gained AND ended, a status line); items (add with description + location, remove when used, wallet for coin); " +
  "quests (with objectives); and a journal entry for the beat. Sparse tracking makes the panel feel dead.";
