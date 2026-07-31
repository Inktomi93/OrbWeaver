// @orb/contracts/rpg/extraction-prompt — the PER-PLANE PROMPT-FRAGMENT REGISTRY (the crunchy-cluster
// redesign §1.6). Pure data + pure fragment builders (no I/O, no domain) — homed WITH the extraction shapes
// they teach, beside the schema they enforce (`./extraction`, `./config`, `./tools`).
//
// WHY A REGISTRY, NOT TWO TEMPLATE LITERALS: the plane-under-service class (§1.6 audit) — `plot`, `widgets`,
// per-cast `customFields`/`emoji`, the structured `day` counter were renderable + schema-writable planes the
// model was NEVER PROMPTED for, because the plane prose was hand-composed in two monolithic system-prompt
// strings (reliable extraction + cheap tool round) that drifted from the schema. Home the teaching fragment
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

import { RPG_WEATHER_TYPES, TIME_OF_DAY } from "./ambient";
import type { RpgGameConfig } from "./config";
import { isDeceptionActive } from "./config";
import type { ExtractionRefs, RpgExtraction } from "./extraction";

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

/** The cast-field fragment (§1.6 gap — host-defined `customFields`). Enumerates the DEFINED fields with their
 *  host hints so the model writes the tracked fields (never an invented key — the enum-constraint pairs with
 *  this fallback prose). `null` when no cast-fields are configured (the feature-off arm). */
function castFieldsFragment(ctx: ExtractionPromptContext): string | null {
  const fields = ctx.config.features.castFields;
  if (fields.length === 0) {
    return null;
  }
  const lines = fields.map((f) => {
    const range = f.max !== undefined ? ` (0-${f.max})` : "";
    const hint = f.hint !== undefined && f.hint.length > 0 ? ` — ${f.hint}` : "";
    return `  • ${f.label}${range}${hint}`;
  });
  return `Track these host-defined fields for each present character (scene.presentUpsert[].customFields):\n${lines.join("\n")}`;
}

/** The plane-prompt registry (§1.6). One row per top-level `rpgExtractionSchema` key — the ratchet asserts
 *  full coverage. `scene` folds the ambient/cast/day/emoji/plot gaps the audit named; `widgets` is now
 *  prompted on the reliable arm (the audit's "never mentioned" gap). */
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
        "WEATHER — set scene.weather when the sky turns, when the story steps outdoors, or when the season/place " +
          "makes it obvious; restate the current weather while it holds, and change it as the storm breaks or clears. " +
          `scene.weather.type is one of ${[...RPG_WEATHER_TYPES].join("/")} — pick the CLOSEST one; put the vivid ` +
          `phrasing in scene.weather.label ("torrential sleet", "a thin grey drizzle"), which is what the reader sees.`,
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
      // §1.6 gap — the portrait-fallback emoji, one clause.
      lines.push("Give a NEW character a fitting single emoji (presentUpsert[].emoji) — the portrait fallback.");
      // §1.6 gap — host-defined cast fields (customFields), enumerated with hints.
      const castFields = castFieldsFragment(ctx);
      if (castFields !== null) {
        lines.push(castFields);
      }
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
    fragment: () =>
      "PARTY — party: ONLY mechanical changes. pool changes (poolDeltas), conditions gained/lost " +
      '(addCondition/removeCondition, e.g. "bleeding", "on edge"), hp (hpDelta), and a short status line ' +
      "(status). A character's personality, mood, or relationship goes in scene.presentUpsert, NOT here.",
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
    plane: "widgets",
    toolName: "set_widget_value",
    // §1.6 gap (reliable) — the widgets plane was NEVER mentioned on the reliable arm. Enumerate the live
    // widget labels (the refs already exist). `null` when the game defines no custom widgets.
    fragment: (ctx) =>
      ctx.refs.widgetRefs.length === 0
        ? null
        : `CUSTOM TRACKERS — widgets: write a value for a custom tracker the beat moved (widgetRef ∈ ${ctx.refs.widgetRefs.join(", ")}). Never invent a tracker.`,
  },
  {
    plane: "quests",
    toolName: "upsert_quest",
    fragment: () =>
      "QUESTS — quests: a new or advancing quest (name + action create/update/complete/fail, with objectives). " +
      "Reconcile a quest the story resolved (mark it complete/fail) even if a later beat stopped mentioning it.",
  },
  {
    plane: "journal",
    toolName: "add_journal_entry",
    fragment: () => "JOURNAL — journal: one short entry (type + content) for a notable beat worth logging.",
  },
];

/** Compose the plane fragments into a teaching block for a system prompt — the SHARED body both the reliable
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
