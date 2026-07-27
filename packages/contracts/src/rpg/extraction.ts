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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The MIS-TARGET fix (R1) — per-call REF CONSTRAINT injected into the PROJECTED schema.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The extraction fields reference actors + widgets by NAME (`targetRef`/`widgetRef`). A model producing
// SCHEMA-VALID but WRONG refs (targeting "player" when the roster actor is "You", or shoving a location into
// a nonexistent widget) yields a silent empty panel — the phantom mint never renders. Constraining those
// string fields to an `enum` of the ACTUAL per-call refs makes an invalid ref UNREPRESENTABLE at the token
// level under a schema-enforcing backend (LIVE-VERIFIED 2026-07-27: vLLM xgrammar forced a "player" ask onto
// a valid roster ref; OpenRouter strict json_schema binds the same enum; agent-sdk at least sharpens the
// post-parse belt). PORTABLE by construction — it returns plain JSON Schema, so each backend's existing
// response_format mapping enforces it with ZERO provider-specific code. The extraction PROMPT still
// enumerates the valid refs as the fallback arm for a non-enforcing model.
//
// COMPILE-COST NOTE (from the vLLM v0.22.1 source + a live probe): xgrammar caches compiled grammars by
// schema, so a fresh per-call enum set is a cache MISS that recompiles (~0.7s measured on the gen engine for
// the full extraction schema — acceptable for a post-turn extraction, and the schema stays minimal). The
// enum lists are kept SMALL (only the live roster + widget refs), so the grammar stays cheap to compile.

/** The per-call refs the constraint binds: the roster actor names (party/inventory/scene targets) + the
 *  existing custom-widget labels (set_widget_value targets). Empty arrays leave the field unconstrained
 *  (a fresh game with no widgets doesn't force an impossible empty enum). */
export interface ExtractionRefs {
  /** Roster actor names the model may target (`targetRef` on party/inventory; `presentRemove` on scene). */
  readonly actorRefs: readonly string[];
  /** Existing custom-widget labels the model may write (`widgetRef` on set_widget_value). */
  readonly widgetRefs: readonly string[];
}

// A projected JSON-schema node (the `projectJsonSchema` output shape — a plain object tree).
type JsonSchemaNode = Record<string, unknown>;

// Set `enum` on a leaf string property node IN PLACE (clone-safe: the caller passes a fresh clone). A
// non-empty enum both constrains the value AND documents the valid set to the model; an empty list is a
// no-op (never an impossible `enum:[]`).
function constrainStringProperty(node: unknown, values: readonly string[]): void {
  if (values.length === 0 || node === null || typeof node !== "object") {
    return;
  }
  (node as JsonSchemaNode)["enum"] = [...values];
}

// The `properties` map of an object schema node, or undefined.
function propsOf(node: unknown): JsonSchemaNode | undefined {
  if (node === null || typeof node !== "object") {
    return;
  }
  const props = (node as JsonSchemaNode)["properties"];
  return props !== null && typeof props === "object" ? (props as JsonSchemaNode) : undefined;
}

// The `items` schema of an array node (the element schema an array field constrains).
function itemsOf(node: unknown): JsonSchemaNode | undefined {
  if (node === null || typeof node !== "object") {
    return;
  }
  const items = (node as JsonSchemaNode)["items"];
  return items !== null && typeof items === "object" ? (items as JsonSchemaNode) : undefined;
}

// Constrain `<arrayField>.items.<refProp>` to the given enum, when both the array + its item property exist.
function constrainArrayItemRef(root: JsonSchemaNode, arrayField: string, refProp: string, values: readonly string[]): void {
  const item = itemsOf(propsOf(root)?.[arrayField]);
  const refNode = item !== undefined ? propsOf(item)?.[refProp] : undefined;
  constrainStringProperty(refNode, values);
}

/**
 * Constrain the projected extraction schema's REF fields to the actual per-call refs (R1). Returns a fresh
 * schema (never mutates the cached `projectJsonSchema` output — the same object also feeds other wires).
 * Portable: plain JSON Schema out, enforced by each backend's own `response_format` mapping. A ref list left
 * empty leaves its field unconstrained (a fresh game targets no phantom, and an empty enum is never emitted).
 *
 *   • `party[].targetRef`         ⟵ actorRefs   (who takes pool/condition/hp/status deltas)
 *   • `inventory[].targetRef`     ⟵ actorRefs   (whose items/wallet move)
 *   • `scene.presentRemove[]`     ⟵ actorRefs   (removing a present actor — must name a real one)
 *   • `widgets[].widgetRef`       ⟵ widgetRefs  (which existing custom widget — NOT an invented one)
 */
export function constrainExtractionSchema(schema: Record<string, unknown>, refs: ExtractionRefs): Record<string, unknown> {
  // Deep clone so the cached projected schema is never mutated (it also feeds other wires). A JSON round-trip
  // is the right clone here: `z.toJSONSchema` output is pure JSON (no functions/dates/cycles), and it avoids
  // `structuredClone` (not in the contracts package's isomorphic tsc lib — `@orb/contracts` is DOM/node-free).
  const clone = JSON.parse(JSON.stringify(schema)) as JsonSchemaNode;
  constrainArrayItemRef(clone, "party", "targetRef", refs.actorRefs);
  constrainArrayItemRef(clone, "inventory", "targetRef", refs.actorRefs);
  constrainArrayItemRef(clone, "widgets", "widgetRef", refs.widgetRefs);
  // scene.presentRemove is an ARRAY of ref strings (not an object array): constrain the array's item enum.
  const sceneProps = propsOf(propsOf(clone)?.["scene"]);
  constrainStringProperty(sceneProps?.["presentRemove"] !== undefined ? itemsOf(sceneProps["presentRemove"]) : undefined, refs.actorRefs);
  return clone;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The CHEAP-mode TOOL ROUND — the parallel-tool-call vehicle (owner ruling 2026-07-27).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Cheap mode is a DEDICATED, state-only request (NOT tools mounted on the narration turn — that fight is
// retired). The model gets the six state-writing tools + a `no_changes` escape, `tool_choice:"required"`, and
// a state-focused prompt; it emits PARALLEL tool calls in ONE request (LIVE-VERIFIED 2026-07-27: vLLM
// hermes/Qwen3 + OpenRouter both emit 2-3 parallel calls on a change beat and a single `no_changes` on a
// quiet one under `required`). The parsed calls fold to an `RpgExtraction` — the shared-plane proof made
// literal: a tool round IS "the batch of tool calls the model would otherwise have made", so it reuses the
// SAME `extractionToStateDelta` fold cheap+reliable share. Symmetric with reliable (schema vs tools; same
// delta). `roll_dice` is EXCLUDED (zero-state — the ToolCallRecord is the canon stamp, never a snapshot).

/** The escape tool a tool round always offers: the model calls it (and NOTHING else) when the latest beat
 *  changed nothing trackable — so `tool_choice:"required"` never fabricates a fake write on a quiet exchange.
 *  The fold treats it as a no-op (contributes no plane to the extraction). */
export const RPG_NO_CHANGES_TOOL = "no_changes";

/** The tools a cheap tool round exposes: the six STATE-WRITING lite tools (roll_dice excluded — zero state)
 *  plus the `no_changes` escape. One home, so the round's tool set can't drift from the fold's arm coverage. */
export const RPG_TOOL_ROUND_TOOL_NAMES = [
  "update_party",
  "update_inventory",
  "update_scene",
  "set_widget_value",
  "upsert_quest",
  "add_journal_entry",
  RPG_NO_CHANGES_TOOL,
] as const;
export type RpgToolRoundToolName = (typeof RPG_TOOL_ROUND_TOOL_NAMES)[number];

/** One parsed tool call off the round's `ChatResult.toolCalls`: the tool name + its raw JSON args string. */
export interface RpgToolCall {
  readonly name: string;
  readonly arguments: string;
}

// Parse a tool call's raw JSON args, or null on non-JSON (a malformed call is DROPPED — errors-as-data for
// canon, mirroring the reliable path's non-conforming-drop; never a throw into the flush).
function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// The ARRAY-plane tool name → { schema, extraction field } — a MAP (keys are VALUES, the snake_case wire tool
// names, not JS property identifiers, so useNamingConvention doesn't apply and no suppression is needed). The
// `scene` plane is handled separately (single, last-wins, not an array). `no_changes`/unknown names are absent
// from this map ⇒ they contribute nothing (the quiet-turn no-op).
const TOOL_ROUND_ARRAY_ARMS: ReadonlyMap<string, { readonly schema: z.ZodType; readonly field: keyof RpgExtraction }> = new Map([
  ["update_party", { schema: updatePartyArgsSchema, field: "party" }],
  ["update_inventory", { schema: updateInventoryArgsSchema, field: "inventory" }],
  ["set_widget_value", { schema: setWidgetValueArgsSchema, field: "widgets" }],
  ["upsert_quest", { schema: upsertQuestArgsSchema, field: "quests" }],
  ["add_journal_entry", { schema: addJournalEntryArgsSchema, field: "journal" }],
]);

/**
 * Fold a tool round's PARALLEL tool calls into ONE `RpgExtraction` — each call's args are re-validated against
 * its own arg schema (a malformed/unknown call is DROPPED, errors-as-data), and same-plane calls accumulate
 * (several `update_party` calls in one round → several `party` entries, exactly like the model firing them
 * sequentially). `no_changes` (and any unknown name) contributes nothing. `scene` is single (last `update_scene`
 * wins — one scene per turn). The result feeds the SAME `extractionToStateDelta` fold reliable uses.
 */
export function toolCallsToExtraction(calls: readonly RpgToolCall[]): RpgExtraction {
  const out: RpgExtraction = { party: [], inventory: [], widgets: [], quests: [], journal: [] };
  for (const call of calls) {
    const args = parseArgs(call.arguments);
    if (args === null) {
      continue;
    }
    if (call.name === "update_scene") {
      const r = updateSceneArgsSchema.safeParse(args);
      if (r.success) {
        out.scene = r.data; // last-wins: one scene per turn
      }
      continue;
    }
    // `no_changes`/unknown names aren't in the arm map → skipped (the quiet-turn no-op). No cast: `.get`
    // returns the typed arm-or-undefined honestly.
    const arm = TOOL_ROUND_ARRAY_ARMS.get(call.name);
    if (arm === undefined) {
      continue;
    }
    const r = arm.schema.safeParse(args);
    if (r.success) {
      // The field names a specific plane array; the parsed data matches by the map's schema↔field pairing.
      (out[arm.field] as unknown[]).push(r.data);
    }
  }
  return out;
}
