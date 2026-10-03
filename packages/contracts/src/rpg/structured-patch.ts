// The PATCH-LIST shape of the structured state round: one entry per scalar value, `{plane, call, field, item, value}`,
// generated from the round's OWN wire tools for a grammar that caps optional and union-typed properties. The decoder
// only ASSEMBLES raw tool-call arguments; the tool round's shared path validates them, so equal intent records equally.

import { z } from "zod";
import type { RpgRecordedToolCall, RpgToolCall, RpgUnassembledValue } from "./extraction.ts";
import { RPG_NO_CHANGES_TOOL, recordUnassembledCall } from "./extraction.ts";
import type { RpgStateRoundTool, RpgStructuredChanges } from "./structured-round.ts";
import { RPG_STATE_CHANGES_FIELD } from "./structured-round.ts";

const PLANE_KEY = "plane";
const CALL_KEY = "call";
const FIELD_KEY = "field";
const ITEM_KEY = "item";
const VALUE_KEY = "value";
/** A path segment's separator in `field` (`addCondition.name`, `presentUpsert.relationship.kind`). */
const PATH_SEPARATOR = ".";
/** The largest `call` / `item` id a reply may use: far beyond any real beat, and well inside safe integers. */
export const RPG_PATCH_INDEX_MAX = 999;
/** A strict decimal number: the only text a numeric field shapes into a number. */
const NUMERIC = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
/** ES2025 `JSON.rawJSON`, shipped by every runtime this server supports (engines: node 26 or later) but not yet in TS's
 *  lib. It writes a number's digits into the arguments verbatim, so a value too large for a double parses to the same
 *  `Infinity` the tool round's `JSON.parse` sees, and the shared parse refuses it the same way. */
const rawJson = (JSON as JSON & { readonly rawJSON: (text: string) => unknown }).rawJSON;
/** Why an entry could not be assembled, in the per-call parse's own vocabulary. The path and message carry only
 *  schema words and numbers: a member's view strips hidden spans from the sent half alone, so every name the model
 *  sent (a field, a plane) rides in the sent value instead. */
const ID_RANGE = `expected a whole number from 0 to ${RPG_PATCH_INDEX_MAX}`;
const UNASSEMBLED_PATH = { tool: "(tool)", call: "(call)", item: "(item)", field: "(field)" } as const;

type SchemaNode = Readonly<Record<string, unknown>>;
type Args = Record<string, unknown>;

/** One writable scalar of a tool: where it lands and the schema node that types it. `arrayAt` is the index of the
 *  path segment that is an array of objects (its element is chosen by the entry's `item`); `append` marks a leaf
 *  that is itself an array of scalars (each entry adds one element). */
interface PatchLeaf {
  readonly segments: readonly string[];
  readonly arrayAt: number | null;
  readonly append: boolean;
  readonly node: SchemaNode;
}

function isRecord(value: unknown): value is Args {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unionArms(node: SchemaNode): readonly SchemaNode[] | null {
  const arms = node["anyOf"] ?? node["oneOf"];
  return Array.isArray(arms) ? arms.filter(isRecord) : null;
}

const SCALAR_TYPES: readonly unknown[] = ["string", "number", "integer", "boolean"];

function isScalar(node: SchemaNode): boolean {
  const arms = unionArms(node);
  return arms !== null ? arms.every(isScalar) : SCALAR_TYPES.includes(node["type"]) || Array.isArray(node["enum"]);
}

type ChildKind = "append" | "object-array" | "tools-only" | "scalar" | "object";

/** How one property is written in the patch list. A second array-of-objects level has no `item` to address it. */
function childKind(child: SchemaNode, insideArray: boolean): ChildKind {
  const items = child["items"];
  if (child["type"] === "array") {
    if (isRecord(items) && isScalar(items)) {
      return "append";
    }
    return insideArray ? "tools-only" : "object-array";
  }
  return isScalar(child) ? "scalar" : "object";
}

/** Walk one object node into its writable leaves; a field the patch list cannot address lands in `toolsOnly`. */
function collectLeaves(
  node: SchemaNode,
  at: { readonly segments: readonly string[]; readonly arrayAt: number | null },
  out: PatchLeaf[],
  toolsOnly: string[],
): void {
  const properties = node["properties"];
  for (const [key, child] of Object.entries(isRecord(properties) ? properties : {})) {
    if (!isRecord(child)) {
      continue;
    }
    const segments = [...at.segments, key];
    const items = isRecord(child["items"]) ? child["items"] : {};
    CHILD_HANDLERS[childKind(child, at.arrayAt !== null)]({ child, items, segments, arrayAt: at.arrayAt, out, toolsOnly });
  }
}

interface ChildVisit {
  readonly child: SchemaNode;
  readonly items: SchemaNode;
  readonly segments: readonly string[];
  readonly arrayAt: number | null;
  readonly out: PatchLeaf[];
  readonly toolsOnly: string[];
}

/** What each kind of property contributes — a mapped Record, so a new kind without a handler fails tsc. */
const CHILD_HANDLERS: Readonly<Record<ChildKind, (visit: ChildVisit) => void>> = {
  append: (v) => v.out.push({ segments: v.segments, arrayAt: v.arrayAt, append: true, node: v.items }),
  scalar: (v) => v.out.push({ segments: v.segments, arrayAt: v.arrayAt, append: false, node: v.child }),
  "object-array": (v) => collectLeaves(v.items, { segments: v.segments, arrayAt: v.segments.length - 1 }, v.out, v.toolsOnly),
  object: (v) => collectLeaves(v.child, { segments: v.segments, arrayAt: v.arrayAt }, v.out, v.toolsOnly),
  "tools-only": (v) => v.toolsOnly.push(v.segments.join(PATH_SEPARATOR)),
};

/** A tool's parameter branches (one, or one per `oneOf` arm — the per-actor tracker split), each with its leaves
 *  keyed by field path. Map-keyed, so a model-sent `constructor` or `toString` finds nothing. */
function toolBranches(tool: Pick<RpgStateRoundTool, "parameters">): {
  readonly branches: readonly ReadonlyMap<string, PatchLeaf>[];
  readonly toolsOnly: readonly string[];
} {
  const toolsOnly: string[] = [];
  const arms = unionArms(tool.parameters);
  const roots = arms !== null && arms.length > 0 ? arms : [tool.parameters];
  const branches = roots.map((root) => {
    const leaves: PatchLeaf[] = [];
    collectLeaves(root, { segments: [], arrayAt: null }, leaves, toolsOnly);
    return new Map(leaves.map((leaf) => [leaf.segments.join(PATH_SEPARATOR), leaf] as const));
  });
  return { branches, toolsOnly: [...new Set(toolsOnly)] };
}

/** Every field path a tool's patch entries may name, in schema order, across its branches.
 *
 * @public Test-anchored: the schema pins compare the generated field enum against this. */
export function patchFieldPaths(tool: Pick<RpgStateRoundTool, "parameters">): readonly string[] {
  return [...new Set(toolBranches(tool).branches.flatMap((branch) => [...branch.keys()]))];
}

/** What a leaf accepts, as the model reads it: its allowed words, `number`, or nothing for free text. */
function leafHint(node: SchemaNode): string {
  const arms = unionArms(node);
  if (arms !== null) {
    return [...new Set(arms.map(leafHint).filter((hint) => hint !== ""))].join(" or ");
  }
  const allowed = node["enum"];
  if (Array.isArray(allowed)) {
    return `one of ${allowed.join(" | ")}`;
  }
  return node["type"] === "number" || node["type"] === "integer" ? "number" : "";
}

function enumValues(leaf: PatchLeaf): readonly unknown[] | null {
  const allowed = leaf.node["enum"];
  return Array.isArray(allowed) ? allowed : null;
}

/** The field that picks a branch (`targetRef` across the per-actor tracker split): a top-level closed field every
 *  branch has, with different values per branch. Each branch is named by its values ("Mira", "Kael or Mira"). */
function branchOwners(branches: readonly ReadonlyMap<string, PatchLeaf>[]): { readonly path: string; readonly names: readonly string[] } | null {
  const [first] = branches;
  if (branches.length < 2 || first === undefined) {
    return null;
  }
  for (const [path, leaf] of first) {
    const values = branches.map((branch) => {
      const own = branch.get(path);
      return own === undefined || own.segments.length !== 1 ? null : enumValues(own);
    });
    if (leaf.segments.length === 1 && values.every((own) => own !== null) && new Set(values.map((own) => JSON.stringify(own))).size > 1) {
      return { path, names: values.map((own) => own.join(" or ")) };
    }
  }
  return null;
}

/** One path's hint across branches: plain when every branch takes the same, else each value set with the branch it
 *  belongs to (`hp for Mira, mana for Corvin`), so no branch's values drop out of the model's only guidance. */
function mergedHint(path: string, branches: readonly ReadonlyMap<string, PatchLeaf>[], owners: ReturnType<typeof branchOwners>): string {
  const present = branches.flatMap((branch, index) => {
    const leaf = branch.get(path);
    return leaf === undefined ? [] : [{ leaf, owner: owners?.names[index] ?? "" }];
  });
  const hints = present.map(({ leaf }) => leafHint(leaf.node));
  if (owners === null || owners.path === path || (present.length === branches.length && new Set(hints).size === 1)) {
    const values = present.flatMap(({ leaf }) => enumValues(leaf) ?? []);
    return values.length > 0 ? `one of ${[...new Set(values)].join(" | ")}` : (hints[0] ?? "");
  }
  const grouped = new Map<string, string[]>();
  for (const { leaf, owner } of present) {
    const accepts = enumValues(leaf)?.join(" | ") ?? leafHint(leaf.node);
    grouped.set(accepts, [...(grouped.get(accepts) ?? []), owner]);
  }
  return [...grouped].map(([accepts, names]) => `${accepts === "" ? "" : `${accepts} `}for ${names.join(" or ")}`).join(", ");
}

/** A tool's field paths as the prompt teaches them: each path, with the values it accepts where they are closed or
 *  numeric, merged across per-actor branches. The grammar cannot carry these (every value is text), so the prompt
 *  carries them. */
export function describePatchFields(tool: Pick<RpgStateRoundTool, "parameters">): readonly string[] {
  const { branches } = toolBranches(tool);
  const owners = branchOwners(branches);
  return patchFieldPaths(tool).map((path) => {
    const hint = mergedHint(path, branches, owners);
    return hint === "" ? path : `${path} (${hint})`;
  });
}

/** The tool fields the patch list cannot express (an array of objects inside an array of objects): writable through
 *  the tool round only.
 *
 * @public Test-anchored: the coverage pin asserts no state tool field is left tools-only. */
export function patchToolsOnlyFields(tool: Pick<RpgStateRoundTool, "parameters">): readonly string[] {
  return toolBranches(tool).toolsOnly;
}

/**
 * The patch-list response schema (zod, for the caller to project), generated from the round's own wire tools: one
 * member per tool pinning `plane` and enumerating that tool's field paths, plus a `no_changes` member. Every property
 * is required and none is a union, so the grammar carries no optional and no union-typed property. `call` groups one
 * tool call's entries; `item` picks the element of an array-of-objects field (`0` everywhere else).
 */
export function stateRoundPatchSchema(tools: readonly RpgStateRoundTool[]): z.ZodType {
  const members: z.ZodType[] = [];
  for (const tool of tools) {
    const [first, ...rest] = patchFieldPaths(tool);
    if (tool.name === RPG_NO_CHANGES_TOOL) {
      members.push(z.strictObject({ [PLANE_KEY]: z.enum([RPG_NO_CHANGES_TOOL]) }).describe(tool.description));
    } else if (first !== undefined) {
      const entry = z.strictObject({
        [PLANE_KEY]: z.enum([tool.name]),
        [CALL_KEY]: z.number().int().nonnegative().max(RPG_PATCH_INDEX_MAX),
        [FIELD_KEY]: z.enum([first, ...rest]),
        [ITEM_KEY]: z.number().int().nonnegative().max(RPG_PATCH_INDEX_MAX),
        [VALUE_KEY]: z.string(),
      });
      members.push(entry.describe(tool.description));
    }
  }
  return z.strictObject({ [RPG_STATE_CHANGES_FIELD]: z.array(z.union(members)).min(1) });
}

/** Every declared scalar type a leaf may take, across its union arms. */
function scalarTypes(node: SchemaNode): ReadonlySet<unknown> {
  const arms = unionArms(node);
  return new Set(arms !== null ? arms.flatMap((arm) => [...scalarTypes(arm)]) : [node["type"]]);
}

/**
 * Shape one value's text into what a tool call would carry: strict digits become those digits as a JSON number where
 * the field takes one (number first, so a number|string `"5"` lands as `5`), `true`/`false` a boolean where it takes one, and every other
 * text stays the string sent. A SHAPING step only: a value its field will refuse is kept as sent, and the shared
 * per-call parse refuses it exactly as it refuses that value in a tool call's arguments.
 */
function shapeValue(node: SchemaNode, raw: string): unknown {
  const types = scalarTypes(node);
  if ((types.has("number") || types.has("integer")) && NUMERIC.test(raw)) {
    return rawJson(raw);
  }
  if (types.has("boolean") && (raw === "true" || raw === "false")) {
    return raw === "true";
  }
  return raw;
}

/** A tool's writable leaves by field path, across its per-actor branches (they share paths and types and differ only
 *  in per-round enums, which the shared parse never sees). Map-keyed, so a model-sent `constructor` finds nothing. */
function toolLeaves(tool: Pick<RpgStateRoundTool, "parameters">): ReadonlyMap<string, PatchLeaf> {
  const leaves = new Map<string, PatchLeaf>();
  for (const branch of toolBranches(tool).branches) {
    for (const [path, leaf] of branch) {
      if (!leaves.has(path)) {
        leaves.set(path, leaf);
      }
    }
  }
  return leaves;
}

/** One reply entry that names a change: its plane and the rest as sent. */
interface ReadEntry {
  readonly plane: string;
  readonly call: number;
  readonly field: string;
  readonly item: number;
  readonly value: string;
  /** The entry as the model sent it, for the record of an entry that could not be placed. */
  readonly sent: Args;
}

/** Read one reply entry, or `null` when it is not a change at all (`no_changes` reads as its own plane). */
function readEntry(entry: unknown): ReadEntry | null {
  if (!isRecord(entry) || typeof entry[PLANE_KEY] !== "string") {
    return null;
  }
  const { [PLANE_KEY]: plane, [CALL_KEY]: call, [FIELD_KEY]: field, [ITEM_KEY]: item, [VALUE_KEY]: value } = entry;
  if (plane === RPG_NO_CHANGES_TOOL) {
    return { plane, call: 0, field: "", item: 0, value: "", sent: entry };
  }
  if (typeof call !== "number" || typeof field !== "string" || typeof item !== "number" || typeof value !== "string") {
    return null;
  }
  return { plane, call, field, item, value, sent: entry };
}

function isPatchIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= RPG_PATCH_INDEX_MAX;
}

/** The record at `cursor[segment]`, created when absent. */
function childRecord(cursor: Args, segment: string): Args {
  const existing = cursor[segment];
  if (isRecord(existing)) {
    return existing;
  }
  const created: Args = {};
  cursor[segment] = created;
  return created;
}

/** Walk to the object that owns a leaf's last segment; an array-of-objects segment steps into element `item`. */
function leafOwner(args: Args, leaf: PatchLeaf, item: number): Args {
  let cursor = args;
  for (const [index, segment] of leaf.segments.slice(0, -1).entries()) {
    cursor = childRecord(cursor, segment);
    if (index === leaf.arrayAt) {
      cursor = childRecord(cursor, String(item));
    }
  }
  return cursor;
}

/** The leaf an entry lands on, or why it cannot form an argument of its call (a tool the round does not offer, an id
 *  out of range, a field the tool does not have). */
function placement(
  entry: ReadEntry,
  leaves: ReadonlyMap<string, PatchLeaf> | undefined,
): { readonly leaf: PatchLeaf } | { readonly refusal: RpgUnassembledValue } {
  const sent = { field: entry.field, value: entry.value };
  if (leaves === undefined) {
    return {
      refusal: {
        path: UNASSEMBLED_PATH.tool,
        message: "this pass offered no tool by that name, so these values were dropped",
        sent: { plane: entry.plane, ...sent },
      },
    };
  }
  if (!isPatchIndex(entry.call)) {
    return { refusal: { path: UNASSEMBLED_PATH.call, message: `Invalid call: ${ID_RANGE}, received ${String(entry.call)}`, sent } };
  }
  if (!isPatchIndex(entry.item)) {
    return { refusal: { path: UNASSEMBLED_PATH.item, message: `Invalid item: ${ID_RANGE}, received ${String(entry.item)}`, sent } };
  }
  const leaf = leaves.get(entry.field);
  // `entry.plane` is an offered tool's name here (it found leaves), so the message stays schema words.
  return leaf !== undefined
    ? { leaf }
    : { refusal: { path: UNASSEMBLED_PATH.field, message: `${entry.plane} has no such field, so this value was dropped`, sent } };
}

/** Place one entry's shaped value in its call's arguments. A scalar set twice keeps the LATER value, as a tool call's
 *  repeated JSON key does. */
function place(args: Args, entry: ReadEntry, leaf: PatchLeaf): void {
  const owner = leafOwner(args, leaf, entry.item);
  const key = leaf.segments.at(-1) ?? "";
  const value = shapeValue(leaf.node, entry.value);
  owner[key] = leaf.append ? [...(Array.isArray(owner[key]) ? owner[key] : []), value] : value;
}

/** Turn every `item`-keyed record under an array-of-objects segment back into an array, in item order. */
function finishArrays(args: Args, leaves: Iterable<PatchLeaf>): Args {
  for (const leaf of leaves) {
    if (leaf.arrayAt === null) {
      continue;
    }
    const owner = leaf.segments.slice(0, leaf.arrayAt).reduce<unknown>((cursor, segment) => (isRecord(cursor) ? cursor[segment] : undefined), args);
    const key = leaf.segments[leaf.arrayAt] ?? "";
    const elements = isRecord(owner) ? owner[key] : undefined;
    if (isRecord(owner) && isRecord(elements)) {
      owner[key] = Object.entries(elements)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, element]) => element);
    }
  }
  return args;
}

/** One assembled call in the making: its plane and its raw arguments. */
interface CallDraft {
  readonly plane: string;
  readonly args: Args;
}

/** One plane's entries that could not be assembled, as sent, each with why. */
interface Unplaced {
  readonly sent: Args[];
  readonly values: RpgUnassembledValue[];
}

/**
 * Assemble a patch-list reply into the tool calls it stands for, or `null` when it is not a non-empty `changes` list.
 * Entries group into calls by `(plane, call)` and into array elements by `item`; each value is shaped by its field's
 * declared type and placed at its path. Nothing here validates: every assembled call goes through the tool round's
 * own per-call parse, salvage and record, so a value its field refuses is salvaged or dropped there, by the same zod
 * message, at the same path, as in a tool call's arguments.
 *
 * An entry that cannot form an argument (a tool the round does not offer, a field the tool lacks, a prototype key, an
 * id out of range) never reaches a call: each plane's such entries become ONE `unassembled` record row, `dropped`,
 * carrying them as sent and naming each one's cause. `unreadable` counts entries that are not a change at all.
 */
export function patchChangesToToolCalls(value: unknown, tools: readonly RpgStateRoundTool[]): RpgStructuredChanges | null {
  const changes = isRecord(value) ? value[RPG_STATE_CHANGES_FIELD] : undefined;
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const leavesByPlane = new Map(tools.map((tool) => [tool.name, toolLeaves(tool)] as const));
  const drafts = new Map<string, CallDraft>();
  const unplaced = new Map<string, Unplaced>();
  const dropped: string[] = [];
  let unreadable = 0;
  for (const raw of changes) {
    const entry = readEntry(raw);
    if (entry === null) {
      unreadable += 1;
      continue;
    }
    if (entry.plane === RPG_NO_CHANGES_TOOL) {
      drafts.set(RPG_NO_CHANGES_TOOL, { plane: RPG_NO_CHANGES_TOOL, args: {} });
      continue;
    }
    const placed = placement(entry, leavesByPlane.get(entry.plane));
    if ("refusal" in placed) {
      const own = unplaced.get(entry.plane) ?? { sent: [], values: [] };
      own.sent.push(entry.sent);
      own.values.push(placed.refusal);
      unplaced.set(entry.plane, own);
      dropped.push(`${entry.plane}.${entry.field}`);
      continue;
    }
    const key = JSON.stringify([entry.plane, entry.call]);
    const draft = drafts.get(key) ?? { plane: entry.plane, args: {} };
    place(draft.args, entry, placed.leaf);
    drafts.set(key, draft);
  }
  const calls: readonly RpgToolCall[] = [...drafts.values()].map((draft) => ({
    name: draft.plane,
    arguments: JSON.stringify(finishArrays(draft.args, leavesByPlane.get(draft.plane)?.values() ?? [])),
  }));
  const unassembledRows: RpgRecordedToolCall[] = [...unplaced].map(([plane, own]) => recordUnassembledCall(plane, JSON.stringify(own.sent), own.values));
  return { calls, unassembled: unassembledRows, unreadable, dropped };
}
