// @orb/contracts/rpg/tools — the tool-name vocabulary + the D48 tool ARG schemas' contract homes.
// Args are PROJECTION-CLEAN: EVERY entity reference is a NAME/label the server
// alias-resolves, top-level `z.object` always, and customFields ride an ARRAY-of-pairs shape (the D79
// `additionalProperties:false` regime — a bare record projects an open `additionalProperties`).
//
// THE PROJECTION TOXIN IS `.transform()`, precisely (mechanism verified
// against installed zod 4.4.3): `z.toJSONSchema(z.string().transform(…))` THROWS ("Transforms
// cannot be represented in JSON Schema") — and this repo's id schemas are transform-based (`typeIdSchema`,
// kit/ids), so an id here would kill the projection. `z.string().brand<"X">()` does NOT throw (brand
// is type-level-only on 4.4.3) — but zod `.brand()` is unused repo-wide regardless (ids carry the
// house phantom `Branded<B>`), so the LAW is: keep transform-bearing schemas off this surface.
//
// The core names (`update_party`/`update_inventory`/`update_scene`/`roll_dice`) are D86 vocabulary;
// `upsert_quest`/`add_journal_entry` complete the lite set, and `set_tracker` names the tracker plane.

import { PROTO_KEY } from "@orb/kit/objects";
import { z } from "zod";
import { rpgWeatherLabelSchema, rpgWeatherTypeSchema, TIME_OF_DAY } from "./ambient.ts";
import type { RpgJournalType } from "./enums.ts";
import { rpgJournalTypeSchema, rpgRelationshipKindSchema } from "./enums.ts";
import { RPG_PLOT_ACTS_MAX } from "./snapshot.ts";

/** The tool-name tuple for the implemented lite extraction contract. */
export const RPG_LITE_TOOL_NAMES = [
  "update_party",
  "update_inventory",
  "update_scene",
  "set_tracker",
  "upsert_quest",
  "add_journal_entry",
  "roll_dice",
] as const;
export type RpgToolName = (typeof RPG_LITE_TOOL_NAMES)[number];

/** The `roll_dice` wire tool name — the ONE spelling the in-thread `tool-renderers` contribution claims
 *  (`match: "name"`). Named + `satisfies`-pinned to the validated tuple so the client renderer's claim can
 *  never drift from a typo (the plugin plane's `PLUGIN_TOOL_NAME_PREFIX` precedent for a claimed wire name). */
export const ROLL_DICE_TOOL_NAME = "roll_dice" satisfies RpgToolName;

// ── shared arg fragments ──────────────────────────────────────────────────────────────────────────────
// A model-facing actor reference: a NAME the server alias-resolves to a character/user/npc (never
// a branded id — projection-clean). The wallet/inventory-on-every-actor ruling means this reaches cast too.
const targetRefField = z.string().min(1);

// THE TRACKER WRITE ARMS. Two arms, split by the def's `write` axis —
// this is the axis being LOUD in the wire, exactly as designed: a `delta` tracker is a resource the beat
// spends/restores, a `set` tracker is a state the beat observes. The `key` of both is ENUM-CONSTRAINED at
// projection to the trackers the TARGET ACTOR actually carries and that are not locked (prevent-at-schema,
// `constrainExtractionSchema`), so a model can never be handed Mana on an actor with no Mana.
//
// One concept, one wire vocabulary: the actor's own tracker plane.

// A tracker key the MODEL wrote. The parse accepts any string a non-enforcing backend sends, so it refuses the
// one key a tracker record cannot store, so the turn records the loss instead of `applied` with nothing written.
const trackerKeyField = z
  .string()
  .min(1)
  .refine((key) => key !== PROTO_KEY, { message: `a tracker key cannot be ${PROTO_KEY}` });

// Strip mode: also reads model output.
/** A `write:"delta"` tracker write — spend/restore a resource by a signed amount. */
const trackerDeltaSchema = z.object({ key: trackerKeyField, delta: z.int() }).strip();

// Strip mode: also reads model output.
/** A `write:"set"` tracker write — record the new reading. `value` carries a `meter`'s number or a `text`
 *  tracker's string (the projection narrows it to the one type when this call's set-trackers are all one
 *  shape); `items` carries a `list` tracker's lines. Exactly one is meaningful per key; both omitted is a
 *  no-op the applier drops. */
const trackerSetSchema = z
  .object({
    key: trackerKeyField,
    value: z.union([z.number(), z.string()]).optional(),
    items: z.array(z.string()).optional(),
  })
  .strip();

// Strip mode: also reads model output.
// A present-cast RELATIONSHIP write — `kind` rides the closed vocab (ENUM-constrained at the
// token level); `label` is meaningful only for `kind:"custom"`. Authored strict-style within the object
// (kind required); `label` optional-omit keeps the derive-server-side arm (omission is plausible for a
// non-custom kind). The whole `relationship` field is optional on the patch (MA-4: omit = keep the current stance).
const relationshipUpsertSchema = z
  .object({
    kind: rpgRelationshipKindSchema,
    label: z.string().optional(),
  })
  .strip();

// Strip mode: also reads model output.
// The AMBIENT WEATHER write — the SAME closed-enum + free-label shape as `relationship` above. `type`
// is one of the eight states the panel's Waystone paints (an enum the token-level grammar binds under an
// enforcing backend), so the model cannot emit "a light drizzle turning to sleet" and have it
// degrade silently at the render; `label` carries exactly that phrasing as the DISPLAYED text. Authored
// strict-style within the object (type required, D109-6); `label` optional-omit — omission is plausible when
// the type already says it ("clear" needs no gloss). The whole `weather` field is optional on the patch
// (MA-4: omit = keep the current sky).
const weatherUpsertSchema = z
  .object({
    type: rpgWeatherTypeSchema,
    label: rpgWeatherLabelSchema.optional(),
  })
  .strip();

// Strip mode: also reads model output.
/** `update_party` — tracker writes, conditions, status on any party-side actor OR npc key.
 *
 *  Health is an ordinary `meter` tracker, so damage/healing rides `trackerDeltas` with `key:"hp"` under the
 *  SAME per-actor key enum every other tracker uses. That is a STRONGER gate than a dedicated property would
 *  be — an actor who does not carry hp is UNTYPEABLE rather than refused after the fact — and the projected
 *  grammar stays one property smaller. */
export const updatePartyArgsSchema = z
  .object({
    targetRef: targetRefField,
    trackerDeltas: z.array(trackerDeltaSchema).optional(),
    trackerSets: z.array(trackerSetSchema).optional(),
    addCondition: z
      .object({ name: z.string().min(1), modifier: z.int().optional() })
      .strip()
      .optional(),
    removeCondition: z.string().min(1).optional(),
    status: z.string().optional(),
  })
  .strip();
export type UpdatePartyArgs = z.infer<typeof updatePartyArgsSchema>;

// Strip mode: also reads model output.
/** `update_inventory` — add/update/remove items + `walletDeltas` (the STORED named-amount wallet).
 *  `update` addresses an existing item by its model-visible name and patches only the fields the beat moved.
 *  Without this arm a story could put a carried key on a necklace while the tracker was structurally unable
 *  to record anything except deleting and re-minting it. */
export const updateInventoryArgsSchema = z
  .object({
    targetRef: targetRefField,
    add: z
      .array(
        z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            quantity: z.int().min(1).optional(),
            location: z.string().optional(),
          })
          .strip(),
      )
      .optional(),
    update: z
      .array(
        z
          .object({
            name: z.string().min(1),
            description: z.string().optional(),
            quantity: z.int().min(1).optional(),
            location: z.string().optional(),
          })
          .strip(),
      )
      .optional(),
    remove: z.array(z.object({ name: z.string().min(1), quantity: z.int().min(1).optional() }).strip()).optional(),
    walletDeltas: z.array(z.object({ name: z.string().min(1), delta: z.int() }).strip()).optional(),
  })
  .strip();
export type UpdateInventoryArgs = z.infer<typeof updateInventoryArgsSchema>;

// Strip mode: also reads model output.
// The PLOT patch (the snapshot-resident plot plane's model-facing write). Deliberately
// FLAT (the small-model-robust arm): the model declares the CURRENT act number and/or the
// current act's title/summary + the story title; the APPLIER maintains the `acts` array (padding untitled
// acts up to `act`) so the model never manages a nested list. Omit = keep (MA-4).
const plotPatchSchema = z
  .object({
    act: z.int().min(1).max(RPG_PLOT_ACTS_MAX).optional(),
    title: z.string().optional(),
    actTitle: z.string().optional(),
    actSummary: z.string().optional(),
  })
  .strip();

// Strip mode: also reads model output.
/** `update_scene` — ambient fields + a present-cast PATCH (MA-4: omit = keep, null = clear). */
export const updateSceneArgsSchema = z
  .object({
    location: z.string().optional(),
    calendarDate: z.string().optional(),
    day: z.int().min(1).optional(),
    timeOfDay: z.enum(TIME_OF_DAY).optional(),
    weather: weatherUpsertSchema.optional(),
    presentUpsert: z
      .array(
        z
          .object({
            name: z.string().min(1),
            emoji: z.string().optional(),
            mood: z.string().optional(),
            appearance: z.string().optional(),
            outfit: z.string().optional(),
            thoughts: z.string().optional(),
            relationship: relationshipUpsertSchema.optional(),
          })
          .strip(),
      )
      .optional(),
    presentRemove: z.array(z.string().min(1)).optional(),
    recentEvent: z.string().optional(),
    // The plot-plane patch (advance the act / retitle the story or current act). Omit = keep.
    plot: plotPatchSchema.optional(),
  })
  .strip();
export type UpdateSceneArgs = z.infer<typeof updateSceneArgsSchema>;

// Strip mode: also reads model output.
/** `set_tracker` — write a GAME-subject tracker. Addressed by
 *  tracker `key` (never a label — a rename would orphan every stored value); the `delta` arm serves a
 *  `write:"delta"` game tracker, `value`/`items` the `write:"set"` ones. The projection constrains `key` to
 *  the game's UNLOCKED game-subject trackers and prunes the arms no live tracker needs, so a game with no
 *  game-subject trackers never sees the tool at all. */
export const setTrackerArgsSchema = z
  .object({
    key: trackerKeyField,
    delta: z.int().optional(),
    value: z.union([z.number(), z.string()]).optional(),
    items: z.array(z.string()).optional(),
  })
  .strip();
export type SetTrackerArgs = z.infer<typeof setTrackerArgsSchema>;

// `upsert_quest` — staged-volatile: quests live IN the snapshot. Create /
//  update / complete / fail all ride the one staged-state overlay; abort discards, commit clone-forwards.
const RPG_QUEST_ACTIONS = ["create", "update", "complete", "fail"] as const;
// Strip mode: also reads model output.
export const upsertQuestArgsSchema = z
  .object({
    name: z.string().min(1),
    action: z.enum(RPG_QUEST_ACTIONS),
    description: z.string().optional(),
    // The AUTHORING arm — the quest's objective LINES, as text. An `update` carrying this list is a MERGE BY
    // TEXT at apply (`applyUpsertQuest`), never a re-mint: an objective whose text matches an existing one keeps
    // its id AND its `completed` flag, so restating the list (which a model does constantly) can no longer wipe
    // the progress the host and the story already earned. A line the list omits is dropped — the list is the
    // quest's objectives, absolutely.
    objectives: z.array(z.string().min(1)).optional(),
    // The COMPLETION arm — mark objectives done by their TEXT, without restating the whole list. Kept as a bare
    // string array (never a per-objective `{text,completed}` object) because the nested-array required-field
    // blind spot bites exactly there: a flat enum-free string list is the xgrammar-cheapest shape that expresses
    // "these are done". A name matching no live objective is DROPPED at apply (errors-as-data — a completion of
    // a nonexistent objective is a ghost, never a mint).
    completeObjectives: z.array(z.string().min(1)).optional(),
  })
  .strip();
export type UpsertQuestArgs = z.infer<typeof upsertQuestArgsSchema>;

/** The key a quest or objective NAME matches by: letter case and surrounding whitespace folded, because a model
 *  writes "the dragon" and "The Dragon " for one quest. The `rpg.extract.tool.upsertQuest` description tells the
 *  model this rule. */
export function rpgNameMatchKey(name: string): string {
  return name.trim().toLowerCase();
}

// Strip mode: also reads model output.
/** `add_journal_entry` — STAGED → flushed at commit stamped `{variantId, sourceMessageId}`.
 *
 *  `title` is OPTIONAL + DERIVED-when-absent (the small-model-robust arm — graceful-degrade). WHY:
 *  the projected json_schema DOES mark `title` required, but xgrammar/some backends do NOT enforce `required`
 *  on NESTED ARRAY ITEMS (only at the top level), so an omitted `journal[].title` fails the whole `safeParse`
 *  and silently drops the ENTIRE turn's state. Making `title` optional means a title-less entry PARSES;
 *  `journalTitleFor` derives a title from the content head when the model omitted it.
 *
 *  `type` gets the SAME treatment (it sits in the identical nested-array blind spot): OPTIONAL here +
 *  HEALED to `note` (`journalTypeFor`), because a beat whose only defect is a missing KIND is fully salvageable
 *  — `note` is the neutral built-in the panel already renders. Prevention still runs where it works: the
 *  PROJECTION re-marks `type` required (`constrainExtractionSchema`), so a backend that does enforce nested
 *  `required` never omits it, and the heal is the fallback for the ones that don't (and is LOGGED —
 *  `rpg.extraction.healed` — so a silently-healing model is visible, never invisible).
 *
 *  `content` stays REQUIRED, deliberately: a content-less entry has nothing to log (the title derives FROM the
 *  content), so the honest degrade is to drop that one entry as malformed — which every delivery path does
 *  per-ENTRY, so the drop costs the entry and never the turn's other five planes. */
export const addJournalEntryArgsSchema = z
  .object({
    type: rpgJournalTypeSchema.optional(),
    // The free gloss for `type:"custom"`, the exact `relationship.label` shape: the enum keeps a model
    // from inventing an off-vocab token under an enforcing grammar, and `custom` + `label` reaches every beat
    // kind the closed set misses. Meaningless
    // on a non-custom type (the applier clears it there — the relationship precedent).
    label: z.string().optional(),
    title: z.string().min(1).optional(),
    content: z.string(),
  })
  .strip();
export type AddJournalEntryArgs = z.infer<typeof addJournalEntryArgsSchema>;

/** The type a type-less journal entry HEALS to — the neutral built-in kind, so a beat whose only
 *  defect is a missing `type` still lands and still renders. One home: the applier heals through
 *  {@link journalTypeFor}, the observability counts the same absence, and neither can drift from the other. */
const RPG_JOURNAL_TYPE_FALLBACK: RpgJournalType = "note";

/** Resolve a journal entry's type: the model's `type` if it emitted one, else the healed
 *  {@link RPG_JOURNAL_TYPE_FALLBACK} (the nested-required blind spot — the `journalTitleFor` precedent). */
export function journalTypeFor(args: { readonly type?: RpgJournalType | undefined }): RpgJournalType {
  return args.type ?? RPG_JOURNAL_TYPE_FALLBACK;
}

/** The journal title cap for a derived title (a short head of the content when the model omitted `title`). */
const DERIVED_TITLE_MAX = 60;
/** First-sentence boundary (a terminator followed by whitespace) — hoisted (top-level-regex lint). */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s/;

/** Resolve a journal entry's title: the model's `title` if present, else DERIVED from the content head (first
 *  line / first sentence, capped) — the small-model-robust arm. A content-less-AND-title-less
 *  entry yields `""` (the caller drops it — a genuinely empty beat). */
export function journalTitleFor(args: { readonly title?: string | undefined; readonly content: string }): string {
  const title = args.title?.trim();
  if (title !== undefined && title.length > 0) {
    return title;
  }
  // Derive from the content head: the first line, then the first sentence, capped — a legible beat label.
  const firstLine = args.content.split("\n", 1)[0]?.trim() ?? "";
  const head = firstLine.split(SENTENCE_BOUNDARY, 1)[0]?.trim() ?? firstLine;
  return head.length > DERIVED_TITLE_MAX ? `${head.slice(0, DERIVED_TITLE_MAX).trimEnd()}…` : head;
}

// Strip mode: also reads model output.
/** `roll_dice` — bake-once, zero state (the ToolCallRecord on the variant IS the canon stamp). */
export const rollDiceArgsSchema = z
  .object({
    notation: z.string().min(1),
    reason: z.string().optional(),
  })
  .strip();

// Strip mode: also reads stored rows.
/** `roll_dice`'s persisted TOOL RESULT (the JSON `ToolCallRecord.result` the model round's dice call writes —
 *  `domain/rpg/tools/index.ts` handler value). The in-thread `tool-renderers` contribution parses
 *  `record.result` through THIS rather than re-spelling the shape inline (same home as
 *  `rollDiceArgsSchema`). `faces` are the per-die rolls, `total` the summed value the server baked; `reason`
 *  echoes the model's optional `reason` arg. A malformed/absent blob is the renderer's own fall-back-to-generic
 *  decision (a tool call is CANON — the record is never dropped), never a parse throw here. */
export const rollDiceToolResultSchema = z
  .object({
    notation: z.string(),
    total: z.number(),
    faces: z.array(z.number()),
    reason: z.string().optional(),
  })
  .strip();
/** The typed roll_dice result surface the in-thread renderer reads. */
export type RollDiceToolResult = z.infer<typeof rollDiceToolResultSchema>;
