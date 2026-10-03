// The PATCH-LIST shape of the structured state round: one entry per scalar value, `{plane, call, field, item, value}`,
// generated from the round's OWN wire tools for a grammar that caps optional and union-typed properties. The decoder
// only ASSEMBLES raw tool-call arguments; the tool round's shared path validates them, so equal intent records equally.

import { z } from "zod";
import type { RpgToolCall } from "./extraction.ts";
import { RPG_NO_CHANGES_TOOL } from "./extraction.ts";
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

/** A tool's field paths as the prompt teaches them: each path, with the values it accepts where they are closed or
 *  numeric. The grammar cannot carry these (every value is text), so the prompt and the decoder carry them. */
export function describePatchFields(tool: Pick<RpgStateRoundTool, "parameters">): readonly string[] {
  const described = new Map<string, string>();
  for (const branch of toolBranches(tool).branches) {
    for (const [path, leaf] of branch) {
      const hint = leafHint(leaf.node);
      described.set(path, hint === "" ? path : `${path} (${hint})`);
    }
  }
  return [...described.values()];
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
 * Shape one value's text into what a tool call would carry: strict digits become a number where the field takes one
 * (number first, so a number|string `"5"` lands as `5`), `true`/`false` a boolean where it takes one, and every other
 * text stays the string sent. A SHAPING step only: a value its field will refuse is kept as sent, and the shared
 * per-call parse refuses it exactly as it refuses that value in a tool call's arguments.
 */
function shapeValue(node: SchemaNode, raw: string): unknown {
  const types = scalarTypes(node);
  if ((types.has("number") || types.has("integer")) && NUMERIC.test(raw) && Number.isFinite(Number(raw))) {
    return Number(raw);
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

/** Place one entry's shaped value in its call's arguments. False when it cannot form an argument: an id out of range,
 *  a field the tool does not have, or a scalar this call already set (never silently overwritten). */
function place(args: Args, entry: ReadEntry, leaves: ReadonlyMap<string, PatchLeaf>): boolean {
  const leaf = leaves.get(entry.field);
  if (leaf === undefined || !isPatchIndex(entry.item)) {
    return false;
  }
  const owner = leafOwner(args, leaf, entry.item);
  const key = leaf.segments.at(-1) ?? "";
  const value = shapeValue(leaf.node, entry.value);
  if (leaf.append) {
    owner[key] = [...(Array.isArray(owner[key]) ? owner[key] : []), value];
    return true;
  }
  if (Object.hasOwn(owner, key)) {
    return false;
  }
  owner[key] = value;
  return true;
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

/**
 * Assemble a patch-list reply into the tool calls it stands for, or `null` when it is not a non-empty `changes` list.
 * Entries group into calls by `(plane, call)` and into array elements by `item`; each value is shaped by its field's
 * declared type and placed at its path. Nothing here validates: every assembled call goes through the tool round's
 * own per-call parse, salvage and record, so a value its field refuses is salvaged or dropped there, by the same zod
 * message, at the same path, as in a tool call's arguments.
 *
 * An entry that cannot form an argument (an unknown plane or field, a prototype key, an id out of range, a repeated
 * scalar) is kept out of the assembled call. Each plane's such entries ride ONE extra call carrying them as sent, so
 * the same record functions mark it (a state tool's call is `dropped`; an unknown plane is recorded the way the tool
 * round records an unknown tool name). `unreadable` counts entries that are not a change at all.
 */
export function patchChangesToToolCalls(value: unknown, tools: readonly RpgStateRoundTool[]): RpgStructuredChanges | null {
  const changes = isRecord(value) ? value[RPG_STATE_CHANGES_FIELD] : undefined;
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const leavesByPlane = new Map(tools.map((tool) => [tool.name, toolLeaves(tool)] as const));
  const drafts = new Map<string, CallDraft>();
  const unplaced = new Map<string, Args[]>();
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
    const leaves = leavesByPlane.get(entry.plane);
    const key = JSON.stringify([entry.plane, entry.call]);
    const draft = drafts.get(key) ?? { plane: entry.plane, args: {} };
    if (leaves !== undefined && isPatchIndex(entry.call) && place(draft.args, entry, leaves)) {
      drafts.set(key, draft);
      continue;
    }
    unplaced.set(entry.plane, [...(unplaced.get(entry.plane) ?? []), entry.sent]);
    dropped.push(`${entry.plane}.${entry.field}`);
  }
  const calls: RpgToolCall[] = [...drafts.values()].map((draft) => ({
    name: draft.plane,
    arguments: JSON.stringify(finishArrays(draft.args, leavesByPlane.get(draft.plane)?.values() ?? [])),
  }));
  for (const [plane, entries] of unplaced) {
    calls.push({ name: plane, arguments: JSON.stringify(entries) });
  }
  return { calls, unreadable, dropped };
}
