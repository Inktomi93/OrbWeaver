// @orb/contracts/rpg/extraction — the STRUCTURED-OUTPUT extraction schema (rpg-design/05 §4.6 + the
// delivery-model amendment §4.9 change-log). ONE `z.object` the structured extraction turn passes as
// `output_config.format`; the model fills the WHOLE state delta at once (no user-facing prose, so structured
// output is the natural fit — never the §4.6 prose-parser fork).
//
// THE SHARED-PLANE PROOF (the amendment's "the 7 plane shapes authored ONCE, exposed two ways"): this schema
// is DERIVED from the SAME per-tool arg schemas the cheap-mode D48 tools use (`./tools`) — it does NOT re-spell
// the plane shapes. Each field is an ARRAY of the corresponding tool's args (a structured extraction emits many
// actor/quest/journal writes in one object where cheap-mode fires one tool call each). It is therefore
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
  setTrackerArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "./tools";
import type { RpgTrackerWriteGroup } from "./tracker";

/** The extraction delta the model emits in ONE structured-output object (§4.6). Every field is
 *  OPTIONAL and defaults empty — a "nothing changed this turn" extraction is the empty object, which the
 *  W1c-b impl maps to an empty `RpgStateDelta` (no snapshot write — the byte-identical non-writing turn,
 *  `chat-ops/flush.ts`). Each field derives from the matching cheap-mode tool's args (the shared-plane proof):
 *    • `party`      ⟵ `update_party`      (per-actor tracker/condition/hp/status writes)
 *    • `inventory`  ⟵ `update_inventory`  (per-actor item add/remove + wallet deltas)
 *    • `scene`      ⟵ `update_scene`      (ambient + present-cast patch + a recent beat) — a SINGLE object,
 *                                          not an array (one scene per turn; the tool is a per-call patch too)
 *    • `trackers`   ⟵ `set_tracker`       (GAME-subject tracker writes — the retired widget plane)
 *    • `quests`     ⟵ `upsert_quest`      (create/update/complete/fail)
 *    • `journal`    ⟵ `add_journal_entry` (STAGED → flushed stamped with the committed variant, §2.5) */
export const rpgExtractionSchema = z.object({
  party: z.array(updatePartyArgsSchema).default([]),
  inventory: z.array(updateInventoryArgsSchema).default([]),
  scene: updateSceneArgsSchema.optional(),
  trackers: z.array(setTrackerArgsSchema).default([]),
  quests: z.array(upsertQuestArgsSchema).default([]),
  journal: z.array(addJournalEntryArgsSchema).default([]),
});
export type RpgExtraction = z.infer<typeof rpgExtractionSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The MIS-TARGET fix (R1) — per-call REF CONSTRAINT injected into the PROJECTED schema.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The extraction fields reference actors by NAME (`targetRef`) and trackers by KEY. A model producing
// SCHEMA-VALID but WRONG refs (targeting "player" when the roster actor is "You", or shoving a location into
// a nonexistent tracker) yields a silent empty panel — the phantom mint never renders. Constraining those
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
 *  per-actor TRACKER write surface (R6). Empty arrays leave their field unconstrained (a fresh game doesn't
 *  force an impossible empty enum). */
export interface ExtractionRefs {
  /** Roster actor names the model may target (`targetRef` on party/inventory; `presentRemove` on scene). */
  readonly actorRefs: readonly string[];
  /** R6 — the per-actor WRITE SURFACE, grouped by identical writable-tracker set. Each group binds its
   *  actors' `party[].trackerDeltas[].key` / `trackerSets[].key` enums, so the schema NEVER offers a tracker
   *  on an actor that doesn't carry it and a `locked` tracker is unrepresentable rather than stripped at
   *  apply. One group ⇒ a flat schema (the common case, byte-cheap); several ⇒ a `oneOf` branch each, keyed
   *  on `targetRef`. Empty ⇒ no tracker arms at all (the game tracks nothing per-actor). */
  readonly trackerWriteGroups: readonly RpgTrackerWriteGroup[];
  /** R6 — the GAME-subject write surface (the `trackers` plane / `set_tracker`): the unlocked game trackers'
   *  keys split by write axis. Both empty ⇒ the whole plane is REMOVED from the schema (a disabled feature's
   *  tool omitted entirely, never an empty-enum husk). */
  readonly gameTrackerKeys: { readonly deltaKeys: readonly string[]; readonly setKeys: readonly string[] };
  /** The CURRENTLY-ACTIVE condition names across the tracked actors — constrains `party[].removeCondition`
   *  (R5a). A retirement can only name a condition that is actually on someone, which makes the measured 8B
   *  failure (`removeCondition: "Bleeding, Poisoned, Exhausted, Lamed"` — a comma-joined LIST shoved into the
   *  `{type:"string"}` scalar, semantically right and structurally invalid) UNREPRESENTABLE under xgrammar, and
   *  is free defence on a hosted `strict` schema. Empty (nobody carries a condition) leaves the field
   *  unconstrained — never an impossible empty enum. */
  readonly conditionNames: readonly string[];
  /** ESTABLISH-WHEN-UNSET: force scene fields REQUIRED (in the enforced grammar) ONLY while the current scene
   *  hasn't set them yet. Derived per-call from the base snapshot: a FRESH game is forced to establish the
   *  scene from the first beat, but once a field is set it returns to the optional omit=keep patch — no
   *  re-emit churn/drift on ongoing turns. This is what makes a weak 8B populate the scene (live-proven on
   *  Qwen3-VL-8B: an all-optional scene is skipped; the forced one fills location/time/weather + a present-cast
   *  entry with mood/thoughts/relationship). `location`/`timeOfDay` ⟵ `location === ""` / `clock === null`;
   *  `presentCast` (forces `presentUpsert` non-empty) ⟵ `presentCharacters.length === 0`. */
  readonly establishScene: { readonly location: boolean; readonly timeOfDay: boolean; readonly presentCast: boolean };
}

// A projected JSON-schema node (the `projectJsonSchema` output shape — a plain object tree).
type JsonSchemaNode = Record<string, unknown>;

// Set `enum` on a leaf string property node IN PLACE (clone-safe: the caller passes a fresh clone). A
// non-empty enum both constrains the value AND documents the valid set to the model; an empty list is a
// no-op (never an impossible `enum:[]`).
function constrainStringProperty(node: unknown, values: readonly string[] | undefined): void {
  if (values === undefined || values.length === 0 || node === null || typeof node !== "object") {
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

// Delete an object schema node's property AND its `required` entry (the pruning half of R6's prevent-at-schema:
// an arm no live def needs is REMOVED, never left as an empty-enum husk the model burns attention on).
function removeField(node: unknown, field: string): void {
  const props = propsOf(node);
  if (props === undefined) {
    return;
  }
  delete props[field];
  const req = (node as JsonSchemaNode)["required"];
  if (Array.isArray(req)) {
    (node as JsonSchemaNode)["required"] = (req as string[]).filter((k) => k !== field);
  }
}

// A JSON deep clone of a projected schema node (pure JSON by construction — `z.toJSONSchema` output).
function cloneNode(node: JsonSchemaNode): JsonSchemaNode {
  return JSON.parse(JSON.stringify(node)) as JsonSchemaNode;
}

/**
 * R6 — constrain ONE `party[]` item schema to a write-surface group IN PLACE: the group's target names, the
 * tracker keys each write arm may name, and the arm pruning. An arm whose key list is empty is REMOVED (an
 * actor carrying no `delta` tracker is never offered `trackerDeltas`), so what the model is handed is exactly
 * what it may legally write on that target.
 */
function constrainPartyItem(item: JsonSchemaNode, group: RpgTrackerWriteGroup, conditionNames: readonly string[]): void {
  const props = propsOf(item);
  if (props === undefined) {
    return;
  }
  constrainStringProperty(props["targetRef"], group.targetRefs);
  // R5a — a retirement names ONE currently-active condition (the comma-joined list the 8B emitted into the
  // `{type:"string"}` scalar is then untypeable under an enforcing grammar).
  constrainStringProperty(props["removeCondition"], conditionNames);
  for (const [arm, keys] of [
    ["trackerDeltas", group.deltaKeys],
    ["trackerSets", group.setKeys],
  ] as const) {
    if (keys.length === 0) {
      removeField(item, arm);
      continue;
    }
    const armItem = itemsOf(props[arm]);
    constrainStringProperty(armItem !== undefined ? propsOf(armItem)?.["key"] : undefined, keys);
  }
}

/**
 * R6 — bind the whole `party` plane to the per-actor write surface. ONE group (or none) keeps the schema FLAT
 * (the overwhelmingly common shape: a game whose trackers all apply to everyone projects exactly the schema it
 * would have without this machinery). SEVERAL groups emit a `oneOf` branch per group, each pinned to its own
 * target names — the grammar only pays for divergence that actually exists, never for headcount.
 */
function constrainPartyPlane(clone: JsonSchemaNode, refs: ExtractionRefs): void {
  const partyNode = propsOf(clone)?.["party"];
  const item = itemsOf(partyNode);
  if (item === undefined || partyNode === null || typeof partyNode !== "object") {
    return;
  }
  const groups = refs.trackerWriteGroups;
  if (groups.length <= 1) {
    // No divergence to express: one carrier set (or none at all — then both key lists are empty and the arms
    // prune away, which is the honest "this game tracks nothing per-actor" schema).
    constrainPartyItem(item, groups[0] ?? { targetRefs: refs.actorRefs, deltaKeys: [], setKeys: [] }, refs.conditionNames);
    if (groups.length === 1) {
      constrainStringProperty(propsOf(item)?.["targetRef"], refs.actorRefs);
    }
    return;
  }
  const branches = groups.map((group) => {
    const branch = cloneNode(item);
    constrainPartyItem(branch, group, refs.conditionNames);
    return branch;
  });
  (partyNode as JsonSchemaNode)["items"] = { oneOf: branches };
}

/**
 * R6 — bind the GAME-subject `trackers` plane (`set_tracker`). Constrains `key` to the unlocked game trackers,
 * prunes the write arm no live game tracker needs, and REMOVES the whole plane when the game defines none (a
 * disabled feature's tool is omitted entirely, per the read-vs-write-surface principle).
 */
function constrainGameTrackerPlane(clone: JsonSchemaNode, refs: ExtractionRefs): void {
  const { deltaKeys, setKeys } = refs.gameTrackerKeys;
  if (deltaKeys.length === 0 && setKeys.length === 0) {
    removeField(clone, "trackers");
    return;
  }
  const item = itemsOf(propsOf(clone)?.["trackers"]);
  if (item === undefined) {
    return;
  }
  constrainStringProperty(propsOf(item)?.["key"], [...deltaKeys, ...setKeys]);
  if (deltaKeys.length === 0) {
    removeField(item, "delta");
  }
  if (setKeys.length === 0) {
    removeField(item, "value");
    removeField(item, "items");
  }
}

// Add `field` to an object schema node's `required` list IN PLACE (creating the list if absent). Idempotent.
// Under a schema-enforcing backend (xgrammar/`strict`) a required field is one the model MUST emit — the lever
// that makes an otherwise-skippable field populate. No-op on a missing/non-object node.
function requireField(node: unknown, field: string): void {
  if (node === null || typeof node !== "object" || propsOf(node)?.[field] === undefined) {
    return; // never require a field the schema doesn't define (a projection drift would make the grammar impossible)
  }
  const n = node as JsonSchemaNode;
  const req = n["required"];
  const list = Array.isArray(req) ? (req as string[]) : [];
  if (!list.includes(field)) {
    list.push(field);
  }
  n["required"] = list;
}

/**
 * Constrain the projected extraction schema's REF fields to the actual per-call refs (R1). Returns a fresh
 * schema (never mutates the cached `projectJsonSchema` output — the same object also feeds other wires).
 * Portable: plain JSON Schema out, enforced by each backend's own `response_format` mapping. A ref list left
 * empty leaves its field unconstrained (a fresh game targets no phantom, and an empty enum is never emitted).
 *
 *   • `party[]`                   ⟵ trackerWriteGroups (R6 — per-actor tracker keys, `targetRef`-pinned)
 *   • `party[].removeCondition`   ⟵ conditionNames (R5a — one ACTIVE condition, never a comma-joined list)
 *   • `inventory[].targetRef`     ⟵ actorRefs   (whose items/wallet move)
 *   • `scene.presentRemove[]`     ⟵ actorRefs   (removing a present actor — must name a real one)
 *   • `trackers[]`                ⟵ gameTrackerKeys (R6 — the game-subject write surface, pruned when empty)
 */
export function constrainExtractionSchema(schema: Record<string, unknown>, refs: ExtractionRefs): Record<string, unknown> {
  // Deep clone so the cached projected schema is never mutated (it also feeds other wires). A JSON round-trip
  // is the right clone here: `z.toJSONSchema` output is pure JSON (no functions/dates/cycles), and it avoids
  // `structuredClone` (not in the contracts package's isomorphic tsc lib — `@orb/contracts` is DOM/node-free).
  const clone = cloneNode(schema as JsonSchemaNode);
  constrainPartyPlane(clone, refs);
  constrainGameTrackerPlane(clone, refs);
  constrainArrayItemRef(clone, "inventory", "targetRef", refs.actorRefs);
  // scene.presentRemove is an ARRAY of ref strings (not an object array): constrain the array's item enum.
  const sceneProps = propsOf(propsOf(clone)?.["scene"]);
  constrainStringProperty(sceneProps?.["presentRemove"] !== undefined ? itemsOf(sceneProps["presentRemove"]) : undefined, refs.actorRefs);
  // ESTABLISH-WHEN-UNSET (2026-07-28, the sad-path fix): the projected schema leaves `scene` OPTIONAL with
  // every inner field optional, so under xgrammar/`strict` a weak 8B legally OMITS the scene — and it did, so a
  // fresh game never established its location/time and the panel stayed empty (`rpg.extraction.empty`). Force
  // the ambient anchor REQUIRED, but ONLY while the current scene hasn't set it (`establishAmbient`, derived
  // from the base snapshot): a fresh game is guaranteed to establish location/time from the first beat, while
  // ongoing turns keep the optional omit=keep patch — no re-emit churn or drift on a standing scene. Same
  // per-call, state-dependent shaping as the ref enums above (the zod stays the loose superset; the grammar
  // tightens per call). [[plan-for-small-hardware]] — the enforced schema, not the prompt, is the xgrammar lever.
  const sceneNode = propsOf(clone)?.["scene"];
  if (refs.establishScene.location) {
    requireField(clone, "scene");
    requireField(sceneNode, "location");
  }
  if (refs.establishScene.timeOfDay) {
    requireField(clone, "scene");
    requireField(sceneNode, "timeOfDay");
  }
  if (refs.establishScene.presentCast) {
    // Force a NON-EMPTY present cast on a fresh scene: an optional presentUpsert is skipped by a weak 8B (the
    // "No one on stage" gap), so require the array AND minItems:1 (xgrammar enforces both — live-proven). The
    // model then lists each present character with mood/thoughts/relationship. Once the cast is set, unforced.
    requireField(clone, "scene");
    requireField(sceneNode, "presentUpsert");
    const presentUpsert = propsOf(sceneNode)?.["presentUpsert"];
    if (presentUpsert !== null && typeof presentUpsert === "object") {
      (presentUpsert as JsonSchemaNode)["minItems"] = 1;
    }
  }
  // EXT-4b — PREVENTION WHERE ENFORCEMENT WORKS. `journal[].type` is `.optional()` in the zod (the heal arm,
  // for the backends that ignore `required` on nested array items), which would otherwise ALSO tell a strict
  // backend the field is skippable. Re-marking it required in the projected grammar keeps the strong arm
  // strong: an enforcing wire (OR `strict`) must emit the kind, a non-enforcing one omits it and the applier
  // heals to `note` + logs. `title` is deliberately NOT re-required — its absence is fully recoverable from the
  // content head, so forcing it would spend tokens on a field we derive for free (the 2026-07-27 ruling).
  requireField(itemsOf(propsOf(clone)?.["journal"]), "type");
  return clone;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The CHEAP-mode TOOL ROUND — the parallel-tool-call vehicle (owner ruling 2026-07-27).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Cheap mode is a DEDICATED, state-only request (NOT tools mounted on the character turn — that fight is
// retired). The model gets the six state-writing tools + a `no_changes` escape, `tool_choice:"required"`, and
// a state-focused prompt; it emits PARALLEL tool calls in ONE request (LIVE-VERIFIED 2026-07-27: vLLM
// hermes/Qwen3 + OpenRouter both emit 2-3 parallel calls on a change beat and a single `no_changes` on a
// quiet one under `required`). The parsed calls fold to an `RpgExtraction` — the shared-plane proof made
// literal: a tool round IS "the batch of tool calls the model would otherwise have made", so it reuses the
// SAME `extractionToStateDelta` fold the structured arm uses. Symmetric with it (tools vs schema; same
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
  "set_tracker",
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
// canon, mirroring the structured path's non-conforming-drop; never a throw into the flush).
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
  ["set_tracker", { schema: setTrackerArgsSchema, field: "trackers" }],
  ["upsert_quest", { schema: upsertQuestArgsSchema, field: "quests" }],
  ["add_journal_entry", { schema: addJournalEntryArgsSchema, field: "journal" }],
]);

/**
 * Fold a tool round's PARALLEL tool calls into ONE `RpgExtraction` — each call's args are re-validated against
 * its own arg schema (a malformed/unknown call is DROPPED, errors-as-data), and same-plane calls accumulate
 * (several `update_party` calls in one round → several `party` entries, exactly like the model firing them
 * sequentially). `no_changes` (and any unknown name) contributes nothing. `scene` is single (last `update_scene`
 * wins — one scene per turn). The result feeds the SAME `extractionToStateDelta` fold the structured arm uses.
 */
export function toolCallsToExtraction(calls: readonly RpgToolCall[]): RpgExtraction {
  const out: RpgExtraction = { party: [], inventory: [], trackers: [], quests: [], journal: [] };
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EQUAL DROP SEMANTICS (EXT-4a) — the STRUCTURED arm salvages PER PLANE / PER ENTRY, like the tool arms.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The defect this kills: the structured arm used to validate the WHOLE extraction object with one `safeParse`,
// so ONE malformed nested field (the measured case: a journal entry missing `type`, in the nested-array required
// blind spot) discarded ALL SIX planes for the turn — while cheap/folded, validating per CALL, lost only the
// bad call. It was the most fragile of the three vehicles. The invariant now: **an equivalent payload
// delivered on any of the three vehicles leaves IDENTICAL surviving state** — a bad journal entry drops that
// entry, never the party/inventory/scene/tracker/quest writes beside it.
//
// Errors-as-data, D112 (3): the drop list comes OUT of the same function that builds the extraction (one home,
// stronger than the `malformedToolCalls` mirror — a log here cannot disagree with what applied by construction).

/** The plane a salvage drop belongs to — an extraction plane, or `root` when the payload wasn't an object at
 *  all (non-JSON / an array / a scalar), in which case NOTHING was salvageable. */
export type RpgExtractionDropPlane = keyof RpgExtraction | "root";

/** ONE thing {@link salvageExtraction} threw away: which plane, which entry (`null` = the whole plane — a
 *  non-array field, a malformed `scene`, or the unusable root), and the zod issues that condemned it. */
export interface RpgExtractionDrop {
  readonly plane: RpgExtractionDropPlane;
  readonly index: number | null;
  readonly issues: readonly string[];
}

/** What a salvaging parse yields: the extraction assembled from everything that DID conform, plus the itemized
 *  losses (empty on the happy path). */
export interface RpgExtractionSalvage {
  readonly extraction: RpgExtraction;
  readonly dropped: readonly RpgExtractionDrop[];
}

// The ARRAY planes' field → arg-schema pairing, DERIVED from the tool-round arm map (never re-spelled: the
// shared-plane proof means the structured plane and its tool validate through the identical schema).
const EXTRACTION_ARRAY_PLANES: ReadonlyMap<keyof RpgExtraction, z.ZodType> = new Map(
  [...TOOL_ROUND_ARRAY_ARMS.values()].map((arm) => [arm.field, arm.schema] as const),
);

// A zod error's issues as `path: message` lines (the log-ready shape the structured arm already emitted).
function issueLines(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

// Salvage ONE array plane IN PLACE: push every conforming entry onto `out` and return the drops. An omitted
// plane is "nothing changed here" (never a drop); a non-array field is one whole-plane drop; a bad entry costs
// exactly itself. Hoisted out of {@link salvageExtraction} to keep it under the complexity ceiling.
function salvageArrayPlane(raw: unknown, plane: keyof RpgExtraction, schema: z.ZodType, out: unknown[]): RpgExtractionDrop[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [{ plane, index: null, issues: ["expected an array"] }];
  }
  const dropped: RpgExtractionDrop[] = [];
  for (const [index, entry] of raw.entries()) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      dropped.push({ plane, index, issues: issueLines(parsed.error) });
    }
  }
  return dropped;
}

/**
 * Parse a RELIABLE-mode extraction payload PER PLANE / PER ENTRY (EXT-4a). Never throws, never all-or-nothing:
 * each array plane's entries are validated one at a time (a bad entry is dropped, its siblings survive), the
 * single `scene` object stands or falls alone, an absent plane is simply empty, and a payload that isn't an
 * object at all yields the empty extraction with ONE `root` drop. The result feeds the SAME
 * `extractionToStateDelta` fold the tool vehicles feed — so the three delivery paths differ in transport only.
 */
export function salvageExtraction(value: unknown): RpgExtractionSalvage {
  const extraction: RpgExtraction = { party: [], inventory: [], trackers: [], quests: [], journal: [] };
  const dropped: RpgExtractionDrop[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { extraction, dropped: [{ plane: "root", index: null, issues: ["expected a JSON object"] }] };
  }
  const record = value as Record<string, unknown>;
  for (const [plane, schema] of EXTRACTION_ARRAY_PLANES) {
    // The plane key names an array field; each surviving entry parsed through that plane's own arg schema.
    dropped.push(...salvageArrayPlane(record[plane], plane, schema, extraction[plane] as unknown[]));
  }
  const scene = record["scene"];
  if (scene !== undefined && scene !== null) {
    const parsed = updateSceneArgsSchema.safeParse(scene);
    if (parsed.success) {
      extraction.scene = parsed.data;
    } else {
      dropped.push({ plane: "scene", index: null, issues: issueLines(parsed.error) });
    }
  }
  return { extraction, dropped };
}

/**
 * The HEAL predicate (EXT-4b), read off a folded extraction so ALL THREE vehicles report it identically: the
 * `journal` indexes whose `type` the model omitted and `journalTypeFor` therefore healed to `note`. One
 * home with nothing to drift from — the applier heals exactly the entries this names.
 */
export function healedJournalTypes(extraction: RpgExtraction): readonly number[] {
  const healed: number[] = [];
  for (const [index, entry] of extraction.journal.entries()) {
    if (entry.type === undefined) {
      healed.push(index);
    }
  }
  return healed;
}

/**
 * The DROP predicate that mirrors {@link toolCallsToExtraction}'s silent `continue`s — the names of the calls
 * the fold THREW AWAY because their args were non-JSON or failed their own arg schema. ONE home with the fold
 * itself (the `ghostTargetRefs` precedent), so an observability log can never disagree with what actually
 * applied. An UNKNOWN tool name (incl. the `no_changes` escape) is NOT malformed — it is a legitimate no-op and
 * is excluded here; a caller that wants "the model called nothing applicable" reads the empty extraction.
 *
 * D109-7 (observability is TOTAL): a state write may fail only VISIBLY. The structured arm already logs its
 * `unparseable` class off the zod issues; this is the tool-vehicle's equivalent, and it is what lets the R1
 * folded turn tell a MALFORMED beat apart from a legitimately QUIET one.
 */
export function malformedToolCalls(calls: readonly RpgToolCall[]): readonly string[] {
  const bad: string[] = [];
  for (const call of calls) {
    const schema = call.name === "update_scene" ? updateSceneArgsSchema : TOOL_ROUND_ARRAY_ARMS.get(call.name)?.schema;
    if (schema === undefined) {
      continue; // `no_changes` / an unknown name — a no-op, never a malformed call
    }
    const args = parseArgs(call.arguments);
    if (args === null || !schema.safeParse(args).success) {
      bad.push(call.name);
    }
  }
  return bad;
}
