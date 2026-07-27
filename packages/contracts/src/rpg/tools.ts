// @orb/contracts/rpg/tools — the tool-name vocabulary + the D48 tool ARG schemas' contract homes
// (rpg-design/05 §4.5). Args are PROJECTION-CLEAN (no `.transform()`/branded ids — a branded id throws in
// `z.toJSONSchema`, [tool-schema-no-branded-transform]): EVERY entity reference is a NAME/label the server
// alias-resolves, top-level `z.object` always, and customFields ride an ARRAY-of-pairs shape (the D79
// `additionalProperties:false` regime — a bare record projects an open `additionalProperties`).
//
// COUNT: 7 lite tools (`RPG_LITE_TOOL_NAMES`). Full SIBLINGS its tools (`skill_check`, `request_check`,
// `advance_time`, `tick_clock`, `upsert_npc`, encounter/loot/map…) — same registry, additive
// registrations, zero renames (§C). Widening `update_party.targetRef` to reach cast actors is documented
// in the def's model-facing description; the name stays (renaming re-litigates for zero capability).
//
// The five core names (`update_party`/`update_inventory`/`update_scene`/`set_widget_value`/`roll_dice`)
// are D86/CP vocabulary the owner ratified. `upsert_quest`/`add_journal_entry` complete the lite set.

import { z } from "zod";
import { TIME_OF_DAY } from "./ambient";
import { RPG_JOURNAL_TYPES } from "./enums";

/** The lite tool names — the 7-tuple `MODE_POLICY.lite.tools` withholds on a read-only turn. Full ADDS
 *  its names to its own tuple; these 7 are byte-stable at graft (the ambient/wallet args are already
 *  full-compatible — the engines WRITE the same planes). */
export const RPG_LITE_TOOL_NAMES = [
  "update_party",
  "update_inventory",
  "update_scene",
  "set_widget_value",
  "upsert_quest",
  "add_journal_entry",
  "roll_dice",
] as const;
export type RpgToolName = (typeof RPG_LITE_TOOL_NAMES)[number];

// ── shared arg fragments ──────────────────────────────────────────────────────────────────────────────
// A model-facing actor reference: a NAME the server alias-resolves to a character/user/cast actor (never
// a branded id — projection-clean). The wallet/inventory-on-every-actor ruling means this reaches cast too.
const targetRefField = z.string().min(1);
// customFields as array-of-pairs (D79 regime) — a bare record projects an open additionalProperties.
const customFieldPairSchema = z.object({ name: z.string().min(1), value: z.string() });

/** `update_party` — pool deltas, conditions, hp delta, status on any party-side actor OR cast key.
 *  An `hpDelta` on a null-hp actor → an `ok:false` legality result (the errors-as-data lane, handler-side). */
export const updatePartyArgsSchema = z.object({
  targetRef: targetRefField,
  poolDeltas: z.array(z.object({ name: z.string().min(1), delta: z.number().int() })).optional(),
  addCondition: z.object({ name: z.string().min(1), modifier: z.number().int().optional() }).optional(),
  removeCondition: z.string().min(1).optional(),
  hpDelta: z.number().int().optional(),
  status: z.string().optional(),
});
export type UpdatePartyArgs = z.infer<typeof updatePartyArgsSchema>;

/** `update_inventory` — add/remove items + `walletDeltas` (the STORED named-amount wallet, §2.6). */
export const updateInventoryArgsSchema = z.object({
  targetRef: targetRefField,
  add: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        quantity: z.number().int().min(1).optional(),
        location: z.string().optional(),
      }),
    )
    .optional(),
  remove: z.array(z.object({ name: z.string().min(1), quantity: z.number().int().min(1).optional() })).optional(),
  walletDeltas: z.array(z.object({ name: z.string().min(1), delta: z.number().int() })).optional(),
});
export type UpdateInventoryArgs = z.infer<typeof updateInventoryArgsSchema>;

/** `update_scene` — ambient fields (§2.7) + a present-cast PATCH (MA-4: omit = keep, null = clear). */
export const updateSceneArgsSchema = z.object({
  location: z.string().optional(),
  calendarDate: z.string().optional(),
  day: z.number().int().min(1).optional(),
  timeOfDay: z.enum(TIME_OF_DAY).optional(),
  weather: z.string().optional(),
  presentUpsert: z
    .array(
      z.object({
        name: z.string().min(1),
        emoji: z.string().optional(),
        mood: z.string().optional(),
        appearance: z.string().optional(),
        outfit: z.string().optional(),
        thoughts: z.string().optional(),
        customFields: z.array(customFieldPairSchema).optional(),
      }),
    )
    .optional(),
  presentRemove: z.array(z.string().min(1)).optional(),
  recentEvent: z.string().optional(),
});
export type UpdateSceneArgs = z.infer<typeof updateSceneArgsSchema>;

/** `set_widget_value` — write a custom widget's value/max/items by widget label. */
export const setWidgetValueArgsSchema = z.object({
  widgetRef: z.string().min(1),
  value: z.number().optional(),
  max: z.number().optional(),
  items: z.array(z.string()).optional(),
});
export type SetWidgetValueArgs = z.infer<typeof setWidgetValueArgsSchema>;

/** `upsert_quest` — staged-volatile (post-ratification: quests live IN the snapshot, §2.5). Create /
 *  update / complete / fail all ride the one staged-state overlay; abort discards, commit clone-forwards. */
export const RPG_QUEST_ACTIONS = ["create", "update", "complete", "fail"] as const;
export type RpgQuestAction = (typeof RPG_QUEST_ACTIONS)[number];
export const upsertQuestArgsSchema = z.object({
  name: z.string().min(1),
  action: z.enum(RPG_QUEST_ACTIONS),
  description: z.string().optional(),
  objectives: z.array(z.string().min(1)).optional(),
});
export type UpsertQuestArgs = z.infer<typeof upsertQuestArgsSchema>;

/** `add_journal_entry` — STAGED → flushed at commit stamped `{variantId, sourceMessageId}` (§2.5).
 *
 *  `title` is OPTIONAL + DERIVED-when-absent (the small-model-robust arm — ruling #10 graceful-degrade). WHY:
 *  the projected json_schema DOES mark `title` required, but xgrammar/some backends do NOT enforce `required`
 *  on NESTED ARRAY ITEMS (only at the top level) — LIVE-MEASURED 2026-07-27: an 8B dropped `journal[].title`
 *  in 5/8 reliable extractions, failing the whole `safeParse` (`path:["journal",0,"title"]`) and silently
 *  dropping the ENTIRE turn's state. Making `title` optional means a title-less entry PARSES; `journalTitleFor`
 *  derives a title from the content head when the model omitted it. `content` stays required (an entry with no
 *  content is genuinely empty); a required `content` an backend also may not enforce, but a content-less entry
 *  is dropped harmlessly at the fold, where a title-less-but-content-full entry is the valuable beat we must keep. */
export const addJournalEntryArgsSchema = z.object({
  type: z.enum(RPG_JOURNAL_TYPES),
  title: z.string().min(1).optional(),
  content: z.string(),
});
export type AddJournalEntryArgs = z.infer<typeof addJournalEntryArgsSchema>;

/** The journal title cap for a derived title (a short head of the content when the model omitted `title`). */
const DERIVED_TITLE_MAX = 60;
/** First-sentence boundary (a terminator followed by whitespace) — hoisted (top-level-regex lint). */
const SENTENCE_BOUNDARY = /(?<=[.!?])\s/;

/** Resolve a journal entry's title: the model's `title` if present, else DERIVED from the content head (first
 *  line / first sentence, capped) — the small-model-robust arm (ruling #10). A content-less-AND-title-less
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

/** `roll_dice` — bake-once, zero state (the ToolCallRecord on the variant IS the canon stamp). */
export const rollDiceArgsSchema = z.object({
  notation: z.string().min(1),
  reason: z.string().optional(),
});
export type RollDiceArgs = z.infer<typeof rollDiceArgsSchema>;
