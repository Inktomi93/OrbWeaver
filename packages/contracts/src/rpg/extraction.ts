// @orb/contracts/rpg/extraction — the RELIABLE-mode structured-output schema (rpg-design/05 §4.6 + the
// delivery-model amendment §4.9 change-log). ONE `z.object` the reliable extraction turn passes as
// `output_config.format`; the model fills the WHOLE state delta at once (no user-facing prose, so structured
// output is the natural fit — never the §4.6 prose-parser fork).
//
// THE SHARED-PLANE PROOF (the amendment's "the 7 plane shapes authored ONCE, exposed two ways"): this schema
// is DERIVED from the SAME per-tool arg schemas the cheap-mode D48 tools use (`./tools`) — it does NOT re-spell
// the plane shapes. Each field is an ARRAY of the corresponding tool's args (reliable emits many actor/quest/
// journal writes in one object where cheap-mode fires one tool call each). A reliable extraction is therefore
// exactly "a batch of the tool calls the model would otherwise have made", and the W1c-b `runExtraction` impl
// converts a parsed `RpgExtraction` into the `RpgStateDelta` (statePatch + journal) the accumulator flushes —
// the SAME two planes cheap-mode tools stage during the turn. `roll_dice` is absent: it is zero-state (the
// ToolCallRecord is the canon stamp), so it has no delta to extract.
//
// PROJECTION-CLEAN (inherited from `./tools`): every arg schema is a top-level `z.object` with no
// `.transform()`/branded ids (a branded id throws in `z.toJSONSchema`; [tool-schema-no-branded-transform]) —
// so this composed object projects to a structured-output JSON Schema without throwing (the contract test
// pins it, mirroring the tools projection pin).

import { z } from "zod";
import {
  addJournalEntryArgsSchema,
  setWidgetValueArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "./tools";

/** The reliable-mode extraction delta the model emits in ONE structured-output object (§4.6). Every field is
 *  OPTIONAL and defaults empty — a "nothing changed this turn" extraction is the empty object, which the
 *  W1c-b impl maps to an empty `RpgStateDelta` (no snapshot write — the byte-identical non-writing turn,
 *  `chat-ops/flush.ts`). Each field derives from the matching cheap-mode tool's args (the shared-plane proof):
 *    • `party`      ⟵ `update_party`      (per-actor pool/condition/hp/status deltas)
 *    • `inventory`  ⟵ `update_inventory`  (per-actor item add/remove + wallet deltas)
 *    • `scene`      ⟵ `update_scene`      (ambient + present-cast patch + a recent beat) — a SINGLE object,
 *                                          not an array (one scene per turn; the tool is a per-call patch too)
 *    • `widgets`    ⟵ `set_widget_value`  (custom-widget value writes)
 *    • `quests`     ⟵ `upsert_quest`      (create/update/complete/fail)
 *    • `journal`    ⟵ `add_journal_entry` (STAGED → flushed stamped with the committed variant, §2.5) */
export const rpgExtractionSchema = z.object({
  party: z.array(updatePartyArgsSchema).default([]),
  inventory: z.array(updateInventoryArgsSchema).default([]),
  scene: updateSceneArgsSchema.optional(),
  widgets: z.array(setWidgetValueArgsSchema).default([]),
  quests: z.array(upsertQuestArgsSchema).default([]),
  journal: z.array(addJournalEntryArgsSchema).default([]),
});
export type RpgExtraction = z.infer<typeof rpgExtractionSchema>;
