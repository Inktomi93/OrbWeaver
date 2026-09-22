// @orb/contracts/rpg/extraction — the STRUCTURED-OUTPUT extraction schema. ONE `z.object` the structured
// extraction turn carries; the model
// fills the WHOLE state delta at once (no user-facing prose, so structured output is the natural fit — never
// a prose-parser fork).
//
// HOW IT REACHES THE WIRE, per backend (corrected 2026-08-03 — the header said `output_config.format`
// unconditionally, which has been false on the OpenRouter path since 2026-08-02):
//   • agent-sdk (api.anthropic.com) — `output_config.format`, bound-stripped by the D93 module.
//   • OpenRouter — the `parameters` of ONE FORCED TOOL CALL. `response_format: json_schema` is not servable
//     across its hosted families with this schema; see the live probe matrix in `backends/openrouter/index.ts`.
//   • vLLM — `response_format: json_schema` with guided decoding (the one ENFORCING wire we drive).
//
// RECOMMENDATION — REQUIRED + NULLABLE-UNION (owner call, NOT built; docs read 2026-08-03). This schema is
// optional-by-construction (omit = keep), which is what both hosted walls are made of: Anthropic's grammar
// compiler refuses it outright ("too many optional parameters (46)" — an UNDOCUMENTED runtime ceiling, absent
// from `https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md`), and OpenAI's strict
// mode requires "All fields or function parameters must be specified as `required`"
// (`https://developers.openai.com/api/docs/guides/structured-outputs`). OpenAI documents the escape on the same
// page — "Emulate optional parameters using union with null" — and that ONE reshape clears BOTH walls at once:
// every property in `required`, every optional property widened with `null`, and `null` ≡ absent at parse, so
// omit-means-keep survives with the model emitting `null` instead of omitting the key. Spell the union as
// `anyOf:[{…},{"type":"null"}]`, not `"type":["string","null"]` — the type-array form is documented only by
// OpenAI, while `anyOf` + the `null` type are inside BOTH subsets. The cost is real and is why this is an
// owner call, not a build: ~46 explicit `null`s per extraction (more output tokens), and it is a materially
// worse prompt for a small local model — against which the vLLM populate lever wants exactly the opposite
// (`xgrammar` skipping optionals is the thing the enforced grammar is there to prevent). It wants a live A/B
// (hosted Claude/GPT vs the local 8B) before anyone reshapes the contract.
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
// PROJECTION-CLEAN (inherited from `./tools`): every arg schema is a top-level `z.object` carrying no
// `.transform()` — the precise toxin ([tool-schema-no-branded-transform]): `z.toJSONSchema` THROWS on a
// transform, and this repo's ids are transform-based (`typeIdSchema`). (zod `.brand()` no longer throws on
// 4.4.3 and is unused here anyway — see the mechanism note in `./tools`.) So this composed object projects to
// a structured-output JSON Schema without throwing (the contract test pins it, mirroring the tools pin).

import { dropNullValues } from "@orb/kit/json-schema";
import { z } from "zod";
import {
  addJournalEntryArgsSchema,
  setTrackerArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "./tools.ts";
import type { RpgTrackerDef, RpgTrackerWriteGroup } from "./tracker.ts";
import { actorTrackerWriteKeys } from "./tracker.ts";

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
// SCHEMA-VALID but WRONG refs (targeting "player" when the participant actor is "You", or shoving a location into
// a nonexistent tracker) yields a silent empty panel — the phantom mint never renders. Constraining those
// string fields to an `enum` of the ACTUAL per-call refs makes an invalid ref UNREPRESENTABLE at the token
// level under a schema-enforcing backend (LIVE-VERIFIED 2026-07-27: vLLM xgrammar forced a "player" ask onto
// a valid participant ref; OpenRouter strict json_schema binds the same enum; agent-sdk at least sharpens the
// post-parse belt). PORTABLE by construction — it returns plain JSON Schema, so each backend's existing
// response_format mapping enforces it with ZERO provider-specific code. The extraction PROMPT still
// enumerates the valid refs as the fallback arm for a non-enforcing model.
//
// COMPILE-COST NOTE (from the vLLM v0.22.1 source + a live probe): xgrammar caches compiled grammars by
// schema, so a fresh per-call enum set is a cache MISS that recompiles (~0.7s measured on the gen engine for
// the full extraction schema — acceptable for a post-turn extraction, and the schema stays minimal). The
// enum lists are kept SMALL (only the live participants + widget refs), so the grammar stays cheap to compile.

/** The per-call refs the constraint binds: the participant actor names (party/inventory/scene targets) + the
 *  per-actor TRACKER write surface (R6). Empty arrays leave their field unconstrained (a fresh game doesn't
 *  force an impossible empty enum). */
export interface ExtractionRefs {
  /** Participant actor names the model may target (`targetRef` on party/inventory; `presentRemove` on scene). */
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
export function constrainExtractionSchema<S extends Record<string, unknown>>(schema: S, refs: ExtractionRefs): S {
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
    // Force a NON-EMPTY present-character set on a fresh scene: an optional presentUpsert is skipped by a weak 8B (the
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
  // Brand-transparent: the clone of a projected schema is still projected (enums/required/pruning never
  // re-open an object node), so echo the caller's own type — a `WireReady` in stays `WireReady` out, without
  // this function ever MINTING the brand (`projectJsonSchema` is the one producer).
  return clone as S;
}

/**
 * F4 — the CACHE-STABLE projection of a per-call ref bundle: the same bundle with every field that derives from
 * LIVE SCENE STATE neutralized, so two calls one turn apart produce a BYTE-IDENTICAL tool payload.
 *
 * WHY (measured, `scripts/probes/openrouter/RESULTS.md` F4): the OpenAI-compat `tools` field sits UPSTREAM of the
 * Anthropic cached prefix — changing 360 bytes of one tool dropped `cached_tokens` 2841 → 0 and re-billed the
 * WHOLE prefix at the 1.25× write rate (~10× that turn on a 10k prefix). The FOLDED turn (D112 R1) mounts these
 * tools on the CHARACTER turn, whose prefix is otherwise stable (the rpg state block rides an `in_chat` depth-0
 * injection, BELOW the rolling breakpoint), so a new NPC or a gained/retired condition was re-billing the whole
 * story every few beats.
 *
 * WHAT SURVIVES (enforcement is not traded away):
 *   • `gameTrackerKeys` + the actor tracker KEY enums (config-derived) — "never invent a key" and the LOCKED-
 *     tracker prevention both hold, from the game's own defs instead of the live carrier split.
 *   • `establishScene` — state-dependent but not per-turn churn (a fresh game establishes once; a reconcile beat
 *     forces deliberately), and it is the lever that makes the scene populate at all.
 * WHAT IS DROPPED, and its backstop: the `actorRefs` enums (`targetRef`/`presentRemove`) — the R5 GHOST GUARD
 * drops a write naming nobody reachable, and the state block already enumerates the cast by name; the per-actor
 * `oneOf` split — a key on an actor who doesn't carry it lands as inert data the panel never projects; the
 * `conditionNames` enum — a `removeCondition` naming nothing active is a filter no-op. NOTE the swap is honest
 * only where the schema is ADVISORY: wire tools are sent without `strict`, so no folded wire grammar-enforces
 * these enums today. The DEDICATED tool round (the enforcing vLLM/xgrammar vehicle, whose own prefix is per-turn
 * volatile anyway) keeps the full live bundle — de-volatilizing it would buy nothing and cost real enforcement.
 */
export function cacheStableExtractionRefs(refs: ExtractionRefs, defs: readonly RpgTrackerDef[]): ExtractionRefs {
  return {
    ...refs,
    actorRefs: [],
    conditionNames: [],
    // ONE group, targetRef unconstrained: keeps both write arms present (an empty group list would PRUNE
    // trackerDeltas/trackerSets entirely — losing the write surface, not just the pinning).
    trackerWriteGroups: [{ targetRefs: [], ...actorTrackerWriteKeys(defs) }],
  };
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

/** One parsed tool call off the round's `ChatResult.toolCalls`: the tool name + its raw JSON args string. */
export interface RpgToolCall {
  readonly name: string;
  readonly arguments: string;
}

/** Parse a tool call's raw JSON args, or null on non-JSON (a malformed call is DROPPED — errors-as-data for
 *  canon, mirroring the structured path's non-conforming-drop; never a throw into the flush).
 *
 *  EXPORTED because it is the ONE place the model's args string is decoded (#1690). rpg's member-facing
 *  projection has to decode before it can belt the hidden spans out of the leaf values — running the strip
 *  over the ENCODED string is a silent false clean — and a second `JSON.parse` + catch there would be a
 *  second, differently-owned answer to "is this payload readable at all". A literal `null` payload decodes to
 *  `null` and is therefore indistinguishable from unparseable: both are "nothing a reader can act on", which
 *  is the same verdict both consumers want. */
export function parseToolCallArgs(raw: string): unknown {
  // @orb-waive caught-failure-ownership(catch): errors-as-data — a malformed tool call is
  // DROPPED, mirroring the structured path's non-conforming-drop; the null return is consumed by the
  // canon flush's non-JSON-args skip and by rpg's member projection (which WITHHOLDS the args). Ends if
  // either consumer stops treating null as "this payload is not readable".
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** One salvaged call: the args that DID parse once the invalid top-level fields were removed. */
interface SalvagedArgs<T> {
  readonly data: T;
  /** Top-level field names dropped to make the rest parse — the observability payload. */
  readonly dropped: readonly string[];
}

/**
 * EXT-4a's drop-as-little-as-possible, applied to invalid VALUES (it previously covered only undeclared
 * KEYS, via zod's strip mode). A whole-call drop for one bad optional field is the failure this closes:
 * `update_scene` carries `location`, `timeOfDay`, `weather`, the present-cast patch, `plot` AND
 * `recentEvent`, so a `weather.type` the closed enum cannot express used to discard the scene, the cast and
 * the recent beat together — measured 12/12 on a live game, whose scene plane never established at all.
 *
 * Retry once with the offending TOP-LEVEL fields removed. Coarse on purpose: a nested issue
 * (`presentUpsert.0.mood`) drops the whole `presentUpsert` array rather than surgically repairing an
 * element — still saving every sibling field, with no schema introspection to drift out of date.
 *
 * REQUIRED fields need no special case: removing one cannot parse, so the retry fails and the call drops
 * exactly as before. Salvage never invents a value and never widens what the schema accepts.
 */
function salvageArgs<T>(schema: z.ZodType<T>, args: unknown): SalvagedArgs<T> | null {
  const first = schema.safeParse(args);
  if (first.success) {
    return { data: first.data, dropped: [] };
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return null; // not an object — nothing to drop a field from
  }
  const offending = new Set<string>();
  for (const issue of first.error.issues) {
    const head = issue.path[0];
    if (typeof head === "string") {
      offending.add(head);
    }
  }
  if (offending.size === 0) {
    return null; // a root-level failure — the whole shape is wrong, not one field
  }
  const remainder: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!offending.has(key)) {
      remainder[key] = value;
    }
  }
  if (Object.keys(remainder).length === 0) {
    return null; // nothing survived — that is a DROP, not a salvage (every field an all-optional schema
    // would otherwise "rescue" into an empty no-op patch, reporting a write that never happened)
  }
  const second = schema.safeParse(remainder);
  return second.success ? { data: second.data, dropped: [...offending].sort() } : null;
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
    const args = parseToolCallArgs(call.arguments);
    if (args === null) {
      continue;
    }
    if (call.name === "update_scene") {
      const salvaged = salvageArgs(updateSceneArgsSchema, args);
      if (salvaged !== null) {
        out.scene = salvaged.data; // last-wins: one scene per turn
      }
      continue;
    }
    // `no_changes`/unknown names aren't in the arm map → skipped (the quiet-turn no-op). No cast: `.get`
    // returns the typed arm-or-undefined honestly.
    const arm = TOOL_ROUND_ARRAY_ARMS.get(call.name);
    if (arm === undefined) {
      continue;
    }
    const salvaged = salvageArgs(arm.schema, args);
    if (salvaged !== null) {
      // The field names a specific plane array; the parsed data matches by the map's schema↔field pairing.
      (out[arm.field] as unknown[]).push(salvaged.data);
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

/** What a salvaging parse yields: the extraction assembled from everything that DID conform, the itemized
 *  losses, and the SILENT losses (both empty on the happy path).
 *
 *  `dropped` and `stripped` are the two distinct failure classes and are deliberately NOT merged: a drop threw
 *  away a whole plane/entry (nothing of it applied), while a strip applied the entry MINUS a key the schema
 *  never declared. Conflating them would make the drop list lie about what landed. See the strip-observability
 *  block below {@link malformedToolCalls} for why detection, not `z.strictObject`, is the closing arm. */
export interface RpgExtractionSalvage {
  readonly extraction: RpgExtraction;
  readonly dropped: readonly RpgExtractionDrop[];
  /** Dotted paths of keys the model sent that the schema silently stripped (`party.0.mana`). */
  readonly stripped: readonly string[];
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
function salvageArrayPlane(args: {
  readonly raw: unknown;
  readonly plane: keyof RpgExtraction;
  readonly schema: z.ZodType;
  /** The plane's array on the extraction being assembled — conforming entries are pushed here. */
  readonly out: unknown[];
  /** The run's strip accumulator — undeclared keys on a CONFORMING entry are appended here. */
  readonly stripped: string[];
}): RpgExtractionDrop[] {
  const { raw, plane, schema } = args;
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
      args.out.push(parsed.data);
      // The structured arm's half of the strip observability — same detection, same vocabulary as the tool
      // vehicles' `strippedToolCallKeys`, so an invented key reads identically whichever way it arrived.
      vanishedKeyPaths(entry, parsed.data, `${plane}.${String(index)}.`, args.stripped);
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
export function salvageExtraction(raw: unknown): RpgExtractionSalvage {
  const extraction: RpgExtraction = { party: [], inventory: [], trackers: [], quests: [], journal: [] };
  const dropped: RpgExtractionDrop[] = [];
  const stripped: string[] = [];
  // `null ≡ absent`, at the boundary and for EVERY vehicle. This is the parse half of the strict-compatible
  // projection (`dropNullValues` — under it the model emits an explicit `null` where it would otherwise omit
  // the key, and omit means KEEP here), and it is correct for the other projections too: no field in this
  // contract is `.nullable()`, so an explicit `null` has never meant anything but "no change" — it just used
  // to cost the whole ENTRY at the per-entry parse below.
  const value = dropNullValues(raw);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { extraction, dropped: [{ plane: "root", index: null, issues: ["expected a JSON object"] }], stripped };
  }
  const record = value as Record<string, unknown>;
  // ROOT-level strip: a payload whose top-level key names no plane at all (`{"trackerDeltas":[…]}` — the tool
  // ARG vocabulary emitted where a plane belongs) was the most invisible shape of all, since the per-plane
  // walk below simply never looks at it. Named here so the whole-payload loss can't read as a quiet beat.
  for (const key of Object.keys(record)) {
    if (!(EXTRACTION_ARRAY_PLANES.has(key as keyof RpgExtraction) || key === "scene")) {
      stripped.push(key);
    }
  }
  for (const [plane, schema] of EXTRACTION_ARRAY_PLANES) {
    // The plane key names an array field; each surviving entry parsed through that plane's own arg schema.
    dropped.push(...salvageArrayPlane({ raw: record[plane], plane, schema, out: extraction[plane] as unknown[], stripped }));
  }
  const scene = record["scene"];
  if (scene !== undefined && scene !== null) {
    const parsed = updateSceneArgsSchema.safeParse(scene);
    if (parsed.success) {
      extraction.scene = parsed.data;
      vanishedKeyPaths(scene, parsed.data, "scene.", stripped);
    } else {
      dropped.push({ plane: "scene", index: null, issues: issueLines(parsed.error) });
    }
  }
  return { extraction, dropped, stripped };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// POPULATE-FROM-CHARACTER (owner ruling 2026-08-01) — the BORN-STATE schema, the ONE hand-only doorway.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A host-invoked, per-character, ONE-SHOT round over the character CARD + the room's OPENING message. It is a
// DIFFERENT schema from `rpgExtractionSchema`, deliberately, and the difference cuts BOTH ways:
//   • it ADDS the identity `sheet` plane (`title`/`level`) — the hand-only fields `patchSheet` otherwise owns
//     alone (`./sheet`: "ABSENT from the extraction schema + every tool arg"). That law stands for PLAY: no
//     turn vehicle (folded/cheap) can reach these, because they are in neither the extraction schema nor any
//     tool arg, and this schema rides NO turn. The owner sanctioned exactly one doorway, and this is it — a
//     host clicking a button on one character, once, before the numbers mean anything.
//   • it REMOVES every LIVE-PLAY plane (`scene`/`party`/`trackers`/`journal`): a card read is not a beat, so
//     mood/ambient/hp/beat-log are not its business. The removal is STRUCTURAL, not prompt-side — the planes
//     are absent from the schema AND {@link salvagePopulate} rebuilds them EMPTY, so even a non-enforcing wire
//     that emits `scene` writes nothing (unreachable, not merely untaught).
// What survives is the shared-plane proof: `inventory`/`quests` are the SAME tool arg schemas the extraction
// planes derive from, so the populate delta folds through the SAME `extractionToStateDelta` → locks → write
// tail (no bespoke write path).

/** The identity-sheet half of a populate round — the hand-only fields a card implies but no beat ever writes.
 *  `title` is the model-facing name for `RpgSheet.className` (what the takeover renders beside the name — the
 *  client has called it "title" since the tracked-field unification; the storage name is not the wire's).
 *  Both are OPTIONAL in the zod (a card that implies neither must still PARSE) and both are re-marked REQUIRED
 *  in the projected grammar ({@link constrainPopulateSchema}) — the LOOSE-ZOD + STRICT-PROJECTION pattern
 *  D112 (3) documents: an enforcing wire must answer, a non-enforcing one degrades to "the card said nothing". */
export const rpgPopulateSheetSchema = z.object({
  title: z.string().min(1).optional(),
  level: z.number().int().min(0).optional(),
});
export type RpgPopulateSheet = z.infer<typeof rpgPopulateSheetSchema>;

/** The populate round's whole payload: the identity sheet + the two BORN-STATE planes a background implies —
 *  what this character CARRIES (`inventory`, incl. `walletDeltas` = the starting purse) and what they are
 *  already chasing (`quests`, the background-implied hooks). Array planes `.default([])` so an empty round is
 *  the empty object, exactly like the extraction schema. */
export const rpgPopulateSchema = z.object({
  sheet: rpgPopulateSheetSchema.optional(),
  inventory: z.array(updateInventoryArgsSchema).default([]),
  quests: z.array(upsertQuestArgsSchema).default([]),
});
/** @public twin: rpgPopulateSchema — the whole-payload populate surface inferred from the schema, which is
 *  cross-package PUBLIC; beyond `RpgPopulateSalvage`'s per-field access (rpg/index.ts KISS/YAGNI SUSPENDED). */
export type RpgPopulate = z.infer<typeof rpgPopulateSchema>;

/** What a salvaging populate parse yields: the sheet half (`null` = the model wrote none), the state half as
 *  an `RpgExtraction` whose LIVE-PLAY planes are empty BY CONSTRUCTION (so the one `extractionToStateDelta`
 *  fold applies it unchanged), and the itemized losses (EXT-4a equal-drop semantics). */
export interface RpgPopulateSalvage {
  readonly sheet: RpgPopulateSheet | null;
  readonly extraction: RpgExtraction;
  readonly dropped: readonly RpgExtractionDrop[];
}

/** The planes a populate drop can belong to — the two state planes plus the unusable root. Every other plane
 *  is not offered, so a drop can never be reported against one. */
const POPULATE_DROP_PLANES: ReadonlySet<RpgExtractionDropPlane> = new Set<RpgExtractionDropPlane>(["inventory", "quests", "root"]);

/**
 * Parse a populate payload PER PLANE / PER ENTRY (the EXT-4a contract, reused whole): the two state planes ride
 * {@link salvageExtraction} — the SAME per-entry validation the three turn vehicles use, so a bad item costs
 * that item and never the quests beside it — and the sheet stands or falls alone. The result's `extraction`
 * carries ONLY `inventory`/`quests`: the live-play planes are rebuilt EMPTY here rather than filtered at the
 * caller, which is what makes "populate cannot touch scene/party/trackers/journal" a property of the parse
 * instead of a promise about the prompt.
 */
export function salvagePopulate(raw: unknown): RpgPopulateSalvage {
  // Same `null ≡ absent` normalization the plane salvage runs, applied BEFORE the sheet read too (the sheet is
  // read off the raw payload, so a `{"sheet":{"title":null}}` would otherwise fail the whole sheet parse).
  const value = dropNullValues(raw);
  const salvaged = salvageExtraction(value);
  // The live-play planes are DISCARDED here (never merely unread): a non-enforcing wire that volunteered a
  // `scene`/`party`/`trackers`/`journal` write gets nothing, by construction.
  const extraction: RpgExtraction = { party: [], inventory: salvaged.extraction.inventory, trackers: [], quests: salvaged.extraction.quests, journal: [] };
  const dropped = salvaged.dropped.filter((drop) => POPULATE_DROP_PLANES.has(drop.plane));
  const rawSheet = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)["sheet"] : undefined;
  if (rawSheet === undefined || rawSheet === null) {
    return { sheet: null, extraction, dropped };
  }
  const parsed = rpgPopulateSheetSchema.safeParse(rawSheet);
  if (!parsed.success) {
    return { sheet: null, extraction, dropped: [...dropped, { plane: "root", index: null, issues: issueLines(parsed.error) }] };
  }
  return { sheet: parsed.data, extraction, dropped };
}

/**
 * Constrain the PROJECTED populate schema for ONE target actor: `inventory[].targetRef` is pinned to that
 * actor's name (a populate round writes exactly one character — any other ref is untypeable), and the sheet
 * plane + both its fields are re-marked REQUIRED.
 *
 * The REQUIRED marking is the xgrammar lever, not decoration: a small local model SKIPS optional fields
 * outright (measured — the establish-when-unset scene fix exists for the same reason), and a populate round
 * whose entire point is "fill the born fields nobody else can write" has nothing to fall back on if it skips
 * them. Returns a fresh schema (never mutates the cached projection).
 */
export function constrainPopulateSchema<S extends Record<string, unknown>>(schema: S, targetRef: string): S {
  const clone = cloneNode(schema as JsonSchemaNode);
  constrainArrayItemRef(clone, "inventory", "targetRef", [targetRef]);
  const sheetNode = propsOf(clone)?.["sheet"];
  requireField(clone, "sheet");
  requireField(sheetNode, "title");
  requireField(sheetNode, "level");
  // Brand-transparent (see {@link constrainExtractionSchema}): echo the caller's type, never mint the brand.
  return clone as S;
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
  return malformedToolCallDetails(calls).map((detail) => detail.name);
}

/** One dropped call, with WHY. The tool NAME alone cannot be acted on: a `weather.type` that rejected
 *  `"indoors"` and one that rejected `""` are the same log line but different bugs, and a whole class of
 *  vocabulary defect (a closed enum the fiction cannot land inside) is invisible without the sent value.
 *  `issues` is never empty — a non-JSON `arguments` payload carries its own single entry. */
export interface RpgMalformedToolCall {
  readonly name: string;
  readonly issues: readonly string[];
}

/** Cap on a rendered offending value — a log line, not a payload dump. */
const MALFORMED_VALUE_MAX = 80;

/** THE SEPARATOR BEFORE THE MODEL-SENT VALUE, and the ONE home for it (#1690). An issue line is
 *  `<path>: <message> — sent <json>`, and everything after this marker is bytes the MODEL wrote — which on a
 *  deception-active game can be a `<lie …/>` an extractor quoted into a state field. A member-facing reader
 *  therefore has to be able to find the seam, so the builder below and {@link projectIssueSentValue} read the
 *  same constant instead of two agreeing literals. */
const SENT_VALUE_MARKER = " — sent ";

/**
 * Re-render ONE issue line's model-sent value through `project`, keeping the `<path>: <message>` half intact
 * (#1690). `project` returns the replacement rendering, or `null` to DROP the value half entirely — the
 * fail-closed arm for a value that cannot be safely re-rendered (a truncated JSON literal, a non-JSON
 * `(absent)` marker). A line with no sent value is returned unchanged.
 *
 * WHY THE CALLER PROJECTS RATHER THAN THIS FUNCTION STRIPPING: the value is JSON-ENCODED here, and the
 * hidden-span recognizer walks `"…"` attr values with `\` escapes — so running a strip over the ENCODED form
 * matches nothing and reports `hadHidden: false`, a silent false clean (measured 2026-09-05). Only a caller
 * that decodes first can strip it, and only rpg knows the belt.
 */
export function projectIssueSentValue(issue: string, project: (sent: string) => string | null): string {
  const at = issue.indexOf(SENT_VALUE_MARKER);
  if (at === -1) {
    return issue;
  }
  const head = issue.slice(0, at);
  const projected = project(issue.slice(at + SENT_VALUE_MARKER.length));
  return projected === null ? head : `${head}${SENT_VALUE_MARKER}${projected}`;
}

/** The value the model actually SENT at an issue's path, rendered and truncated. Walks `args` rather than
 *  reading zod's own `received` because that field is absent on several issue codes (and carries the parsed
 *  form, not the wire form) — the wire form is the one that names a vocabulary gap. */
function sentValueAtPath(root: unknown, path: readonly PropertyKey[]): string {
  let node: unknown = root;
  for (const segment of path) {
    if (typeof node !== "object" || node === null) {
      return "(absent)";
    }
    node = (node as Record<PropertyKey, unknown>)[segment];
  }
  if (node === undefined) {
    return "(absent)"; // a required field the model omitted — distinct from one it sent wrong
  }
  const rendered = JSON.stringify(node);
  return rendered.length > MALFORMED_VALUE_MAX ? `${rendered.slice(0, MALFORMED_VALUE_MAX)}…` : rendered;
}

/** {@link malformedToolCalls}' detail arm and its ONE loop — the names version is `.map`ped off this, so a
 *  log and the drop set can never disagree (the same single-home rule the predicate itself documents). */
export function malformedToolCallDetails(calls: readonly RpgToolCall[]): readonly RpgMalformedToolCall[] {
  const bad: RpgMalformedToolCall[] = [];
  for (const call of calls) {
    const schema = call.name === "update_scene" ? updateSceneArgsSchema : TOOL_ROUND_ARRAY_ARMS.get(call.name)?.schema;
    if (schema === undefined) {
      continue; // `no_changes` / an unknown name — a no-op, never a malformed call
    }
    const args = parseToolCallArgs(call.arguments);
    if (args === null) {
      bad.push({ name: call.name, issues: ["arguments: not valid JSON"] });
      continue;
    }
    const parsed = schema.safeParse(args);
    if (parsed.success) {
      continue;
    }
    // MIRRORS THE FOLD: a call the salvage rescued is NOT a drop — it applied, minus the offending fields
    // (those are the `salvagedToolCallFields` class). Reporting it here would claim a loss that did not
    // happen, which is the exact disagreement this predicate exists to prevent.
    if (salvageArgs(schema, args) !== null) {
      continue;
    }
    bad.push({
      name: call.name,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}${SENT_VALUE_MARKER}${sentValueAtPath(args, issue.path)}`,
      ),
    });
  }
  return bad;
}

/** The SALVAGE predicate — the dotted `tool.field` paths a call kept applying WITHOUT, because their values
 *  failed the schema. The third loss class beside DROPPED (whole call) and STRIPPED (undeclared key), and
 *  the one that says "the model tried to write this and the vocabulary could not hold it" — the signal that
 *  a closed enum has a hole in it. Mirrors {@link toolCallsToExtraction}'s salvage exactly. */
export function salvagedToolCallFields(calls: readonly RpgToolCall[]): readonly string[] {
  const out: string[] = [];
  for (const call of calls) {
    const schema = call.name === "update_scene" ? updateSceneArgsSchema : TOOL_ROUND_ARRAY_ARMS.get(call.name)?.schema;
    if (schema === undefined) {
      continue;
    }
    const args = parseToolCallArgs(call.arguments);
    if (args === null) {
      continue;
    }
    const salvaged = salvageArgs(schema, args);
    if (salvaged === null) {
      continue;
    }
    for (const field of salvaged.dropped) {
      out.push(`${call.name}.${field}`);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE RECORDED CALL — the ONE projection of "what the model called and what survived the schema"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THREE consumers read this and they may never disagree: the compose WARN (`logToolCallLosses`), the rpg
// flight-recorder RING (R-OBS, `/api/_debug/rpg/traces`), and the DURABLE per-variant row the user-facing
// disclosure reads (`rpg_turn_tool_calls`). Each previously would have had to re-derive the verdict from the
// two loss lenses below, and three re-derivations of one rule is three chances for the surface to say
// "applied" about a call the fold dropped. So the rule lives HERE, once, beside the lenses it composes.
//
// TOOLCALLS-INVISIBLE / D112: the folded turn's tool traffic is server-internal by design — chat never
// resolves, executes or persists it — so a RECORD made by the CONTRIBUTOR is the only honest way the user
// ever sees what a turn did. That is what this shape is for.

/** What the fold DID with one call. Declared ONCE as a tuple and DERIVED (§5.5) — a new loss class fails
 *  `tsc` at every reader instead of silently rendering as its neighbour.
 *
 *  THE FOURTH MEMBER IS A DIFFERENT LAYER OF LOSS. `salvaged`/`dropped` are SCHEMA verdicts: the vocabulary
 *  could not hold what the model sent. `overridden` is a MERGE verdict: the call was well-formed and applied,
 *  and then a hand LOCK dropped part of the write it produced (`domain/rpg/substrate/merge.ts` — manual-edit-
 *  wins). Both are real losses the reader is owed, and the record used to report the second one as `applied`.
 *  Precedence when a call earns more than one, worst first: `dropped`, then `salvaged`, then `overridden`,
 *  then `applied` — the badge names the loss the reader must act on first, and `issues` carries EVERY reason
 *  regardless of which verdict won. */
export const RPG_TOOL_CALL_VERDICTS = ["applied", "salvaged", "dropped", "overridden"] as const;
export type RpgToolCallVerdict = (typeof RPG_TOOL_CALL_VERDICTS)[number];

/** ONE model-emitted tool call as the record keeps it: the name, the args VERBATIM, and the fold's verdict.
 *
 *  `args` is the RAW JSON string the model sent, deliberately unparsed — the calls most worth showing are
 *  exactly the ones that did not parse, so a parsed-only capture erases its own reason for existing
 *  (`TOOLDROP-BLIND` is that failure, already paid for once). */
export interface RpgRecordedToolCall {
  readonly name: string;
  readonly args: string;
  readonly verdict: RpgToolCallVerdict;
  /** WHY, for the two non-clean verdicts: the salvaged field paths (`update_scene.weather`) or the parse
   *  issues with the value the model actually sent. EMPTY on `applied`. */
  readonly issues: readonly string[];
}

/** Project a turn's tool calls onto their per-call verdicts, by composing the two loss lenses above — so the
 *  record, the warn and the ring are the same derivation rather than three agreeing ones.
 *
 *  THE JOIN IS THE CALL, NOT THE NAME (#1370). This used to fold the lenses' whole-turn output into a
 *  name-keyed `Map` and look each call up by `call.name` — but a turn may hold SEVERAL calls to one tool, and
 *  a `Map` built from duplicate keys keeps only the last. One malformed `update_party` therefore marked EVERY
 *  `update_party` in the turn `dropped`, with the malformed call's issues attached to the valid one, and that
 *  verdict is written to `rpg_turn_tool_calls` — the row the user-facing disclosure reads. The fold itself was
 *  right (the valid call's changes applied), so the turn permanently CLAIMED a loss that never happened, in
 *  the direction that sends a reader hunting for a change that is already in their state.
 *
 *  Running each lens over a ONE-CALL slice is what makes the occurrence the key while keeping the single-home
 *  rule this section exists for: the verdicts still come from those two functions, never from a third copy of
 *  their logic. Cost is one extra `parseArgs` per call over a turn's handful of calls. */
export function recordToolCalls(calls: readonly RpgToolCall[]): readonly RpgRecordedToolCall[] {
  return calls.map((call): RpgRecordedToolCall => {
    const [dropped] = malformedToolCallDetails([call]);
    if (dropped !== undefined) {
      return { name: call.name, args: call.arguments, verdict: "dropped", issues: dropped.issues };
    }
    const fields = salvagedToolCallFields([call]);
    return fields.length > 0
      ? { name: call.name, args: call.arguments, verdict: "salvaged", issues: fields }
      : { name: call.name, args: call.arguments, verdict: "applied", issues: [] };
  });
}

/** One suppressed path as the disclosure says it. The PATH is the load-bearing half — it is what lets a
 *  reader of a multi-call turn tell which of their pins ate which write. */
function lockIssue(path: string): string {
  return `locked ${path} — your manual edit holds this value`;
}

/** Mark a turn's recorded calls with the writes a hand LOCK suppressed at the merge (#77).
 *
 *  WHY IT IS A SEPARATE PASS over {@link recordToolCalls}: the schema verdicts are knowable the instant the
 *  calls parse, while a lock drop is only knowable after the state is composed and merged — two different
 *  moments, one row. The flush composes them at record time so the row is written truthful ONCE, never
 *  written `applied` and corrected later.
 *
 *  ATTRIBUTION IS PER-TURN, NOT PER-CALL, AND THAT LIMIT IS DELIBERATE. A round composes every call of the
 *  turn into ONE state patch (`extractionToStateDelta`), so a suppressed path belongs to that JOINT patch and
 *  cannot be pinned on one call without a tool→state-plane map that would drift silently from the appliers.
 *  Every call that CONTRIBUTED to the patch therefore carries the trail, and the path in the issue text is
 *  what disambiguates. Calls that contributed NOTHING are left alone: a `dropped` call never reached the
 *  merge, and `no_changes` authors no state by definition — marking either would be a plain lie. */
export function markLockSuppressions(calls: readonly RpgRecordedToolCall[], suppressedPaths: readonly string[]): readonly RpgRecordedToolCall[] {
  if (suppressedPaths.length === 0) {
    return calls; // the ordinary turn — byte-identical to the schema projection
  }
  const issues = suppressedPaths.map(lockIssue);
  return calls.map((call): RpgRecordedToolCall => {
    if (call.verdict === "dropped" || call.name === RPG_NO_CHANGES_TOOL) {
      return call;
    }
    return { ...call, verdict: call.verdict === "salvaged" ? "salvaged" : "overridden", issues: [...call.issues, ...issues] };
  });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// STRIP OBSERVABILITY — the SILENT-write hole at the arg boundary, closed (D112 (3))
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT: every arg schema is a plain `z.object`, and zod v4 `z.object` is STRIP mode — a key the schema
// does not declare is silently REMOVED and the parse SUCCEEDS. So a model emitting `{"targetRef":"Kael",
// "mana":-3}` instead of a `trackerDeltas` entry produced a SUCCESSFUL ToolCallRecord whose write simply never
// existed: invisible to `malformedToolCalls` (the call parsed), invisible to `salvageExtraction`'s drops (the
// entry conformed), invisible to `rpg.extraction.empty` (the other five planes wrote fine). A delivery fork
// that resolves silently is exactly what D112 (3) bans.
//
// WHY NOT `z.strictObject`: strictness FAILS the whole call/entry over one junk key, discarding the writes
// beside it — the precise opposite of EXT-4a's equal-drop philosophy (drop as little as possible), and it
// would also make an enforcing-wire model's over-eager key cost a real beat. The D79 projection pin
// (`additionalProperties:false` on every object node) stays the PREVENTION arm where the wire enforces it;
// this is the DETECTION arm for the wires that don't (the folded D112 wire sends tools without `strict`).
//
// MECHANISM: a structural diff of the RAW payload against the PARSED result rather than a strict-schema twin.
// It observes the ACTUAL outcome, so — like the drop list — it cannot disagree with what applied; it needs no
// parallel schema that could drift; and it is uniform across all three vehicles. Sound here specifically
// because the arg schemas carry no `.default()`, no `.catch()` and no `.transform()`: on a successful parse the
// ONLY reason a key present in the input is absent from the output is that the schema did not declare it.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Collect every path in `raw` that did not survive into `parsed`, at any depth. Descends only where both sides
// are the same container shape (an equal-length array, or two plain objects) — anywhere else the payload was
// re-shaped by the parse and a key-level comparison would be meaningless.
function vanishedKeyPaths(raw: unknown, parsed: unknown, prefix: string, out: string[]): void {
  if (Array.isArray(raw) && Array.isArray(parsed) && raw.length === parsed.length) {
    for (const [index, item] of raw.entries()) {
      vanishedKeyPaths(item, parsed[index], `${prefix}${String(index)}.`, out);
    }
    return;
  }
  if (!(isPlainObject(raw) && isPlainObject(parsed))) {
    return;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key in parsed) {
      vanishedKeyPaths(value, parsed[key], `${prefix}${key}.`, out);
    } else {
      out.push(`${prefix}${key}`);
    }
  }
}

/**
 * The STRIP predicate that mirrors {@link toolCallsToExtraction}'s successful parses — the dotted paths of keys
 * the model sent on a call that PARSED, and which the schema silently dropped (`update_party.mana`,
 * `update_scene.presentUpsert.0.vibe`). ONE home with the fold, the `malformedToolCalls` precedent: a call can
 * now be malformed (dropped whole), stripped (applied minus an invented key), or clean — and each is NAMED.
 *
 * A call whose args are non-JSON or fail their schema is NOT reported here — it is already a whole-call drop
 * that `malformedToolCalls` names, and reporting its keys too would double-count one loss.
 */
export function strippedToolCallKeys(calls: readonly RpgToolCall[]): readonly string[] {
  const stripped: string[] = [];
  for (const call of calls) {
    const schema = call.name === "update_scene" ? updateSceneArgsSchema : TOOL_ROUND_ARRAY_ARMS.get(call.name)?.schema;
    if (schema === undefined) {
      continue; // `no_changes` / an unknown name — nothing was meant to apply, so nothing was stripped
    }
    const args = parseToolCallArgs(call.arguments);
    if (args === null) {
      continue;
    }
    const parsed = schema.safeParse(args);
    if (parsed.success) {
      vanishedKeyPaths(args, parsed.data, `${call.name}.`, stripped);
    }
  }
  return stripped;
}
