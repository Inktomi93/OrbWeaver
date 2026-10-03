// The PATCH-LIST shape of the structured state round: one entry per scalar value, `{plane, call, field, item, value}`,
// for a grammar that caps optional and union-typed properties. Every field path, its declared type and its per-round
// enum come from the round's OWN wire tools (the constrained projection), so the patch list can never offer or accept
// a value the tool round would refuse. Values are decoded by declared type only; the reply is never parsed as JSON.

import { z } from "zod";
import type { RpgToolCall, RpgToolCallRefusal } from "./extraction.ts";
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
/** Why a patch value was refused, in the per-call parse's own vocabulary. */
const ID_OUT_OF_RANGE = `Invalid input: call and item are whole numbers from 0 to ${RPG_PATCH_INDEX_MAX}`;
const UNKNOWN_FIELD = "Unrecognized key";
const UNKNOWN_TOOL = "Unrecognized tool";
const REPEATED_FIELD = "Invalid input: this call already set this field";
/** A strict decimal number: the only text a numeric field accepts. */
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

type Decoded = { readonly value: unknown } | undefined;

/** Each declared scalar type's text decoder: strict, so a field never receives a value of another type. */
const SCALAR_DECODERS: Readonly<Record<string, (raw: string) => Decoded>> = {
  number: (raw) => (NUMERIC.test(raw) ? { value: Number(raw) } : undefined),
  integer: (raw) => (NUMERIC.test(raw) && Number.isInteger(Number(raw)) ? { value: Number(raw) } : undefined),
  boolean: (raw) => (raw === "true" || raw === "false" ? { value: raw === "true" } : undefined),
  string: (raw) => ({ value: raw }),
};

function isNumericArm(arm: SchemaNode): boolean {
  return arm["type"] === "number" || arm["type"] === "integer";
}

/** One scalar decoded by its declared type, or `undefined` when the text is not a value of that type (or not in the
 *  per-round enum). A number|string union prefers the number, so `"5"` lands as `5` on every vehicle. */
function decodeScalar(node: SchemaNode, raw: string): Decoded {
  const arms = unionArms(node);
  if (arms !== null) {
    const ordered = [...arms.filter(isNumericArm), ...arms.filter((arm) => !isNumericArm(arm))];
    return ordered.map((arm) => decodeScalar(arm, raw)).find((decoded) => decoded !== undefined);
  }
  const allowed = node["enum"];
  if (Array.isArray(allowed)) {
    return allowed.includes(raw) ? { value: raw } : undefined;
  }
  const decoder = typeof node["type"] === "string" ? SCALAR_DECODERS[node["type"]] : undefined;
  return decoder?.(raw);
}

/** One patch entry as sent, with the grouping it names. `idValid` is false when its `call` or `item` is not a whole
 *  number in range — such an entry cannot be placed and is refused by name. */
interface RawPatch {
  readonly field: string;
  readonly item: number;
  readonly value: string;
  readonly idValid: boolean;
}

interface ReadEntry {
  readonly plane: string;
  readonly call: number | null;
  readonly patch: RawPatch | null;
}

function isPatchIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= RPG_PATCH_INDEX_MAX;
}

/** Read one reply entry, or `null` when it is not a change at all. A `call` out of range reads as `null` call. */
function readEntry(entry: unknown): ReadEntry | null {
  const plane = isRecord(entry) ? entry[PLANE_KEY] : undefined;
  if (!isRecord(entry) || typeof plane !== "string") {
    return null;
  }
  if (plane === RPG_NO_CHANGES_TOOL) {
    return { plane, call: 0, patch: null };
  }
  const { [CALL_KEY]: call, [FIELD_KEY]: field, [ITEM_KEY]: item, [VALUE_KEY]: value } = entry;
  if (typeof call !== "number" || typeof field !== "string" || typeof item !== "number" || typeof value !== "string") {
    return null;
  }
  const idValid = isPatchIndex(call) && isPatchIndex(item);
  return { plane, call: isPatchIndex(call) ? call : null, patch: { field, item, value, idValid } };
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

/** Place one decoded value. Returns false when the slot is already taken (a repeated scalar is refused, never
 *  silently overwritten). */
function place(args: Args, leaf: PatchLeaf, item: number, value: unknown): boolean {
  const owner = leafOwner(args, leaf, item);
  const key = leaf.segments.at(-1) ?? "";
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

/** What a leaf would have accepted, in the parse's own words, for a refused value's issue line. */
function expectation(node: SchemaNode): string {
  const arms = unionArms(node);
  if (arms !== null) {
    return "Invalid input";
  }
  const allowed = node["enum"];
  if (Array.isArray(allowed)) {
    return `Invalid option: expected one of ${allowed.map((option) => JSON.stringify(option)).join("|")}`;
  }
  return `Invalid input: expected ${typeof node["type"] === "string" ? node["type"] : "a value"}, received string`;
}

/** Why one entry could not be placed in its call, or `null` once it is placed. */
function placeEntry(args: Args, patch: RawPatch, leaves: ReadonlyMap<string, PatchLeaf>): string | null {
  if (!patch.idValid) {
    return ID_OUT_OF_RANGE;
  }
  const leaf = leaves.get(patch.field);
  if (leaf === undefined) {
    return UNKNOWN_FIELD;
  }
  const decoded = decodeScalar(leaf.node, patch.value);
  if (decoded === undefined) {
    return expectation(leaf.node);
  }
  return place(args, leaf, patch.item, decoded.value) ? null : REPEATED_FIELD;
}

/** Build one call from its entries against ONE parameter branch: the args, and every value refused with why. */
function buildCall(patches: readonly RawPatch[], leaves: ReadonlyMap<string, PatchLeaf>): { readonly args: Args; readonly refused: RpgToolCallRefusal[] } {
  const args: Args = {};
  const refused: RpgToolCallRefusal[] = [];
  for (const patch of patches) {
    const message = placeEntry(args, patch, leaves);
    if (message !== null) {
      refused.push({ field: patch.field, sent: patch.value, message });
    }
  }
  return { args: finishArrays(args, leaves.values()), refused };
}

interface PatchGroup {
  readonly plane: string;
  readonly patches: RawPatch[];
}

/** Group the reply's entries into calls by `(plane, call)`, in first-seen order; entries whose `call` is out of range
 *  share one group per plane, where each is refused by name. Count entries that are not a change at all. */
function groupEntries(changes: readonly unknown[]): { readonly groups: readonly PatchGroup[]; readonly unreadable: number } {
  const grouped = new Map<string, PatchGroup>();
  let unreadable = 0;
  for (const entry of changes) {
    const read = readEntry(entry);
    if (read === null) {
      unreadable += 1;
      continue;
    }
    const key = JSON.stringify([read.plane, read.call]);
    const group = grouped.get(key) ?? { plane: read.plane, patches: [] };
    grouped.set(key, group);
    if (read.patch !== null) {
      group.patches.push(read.patch);
    }
  }
  return { groups: [...grouped.values()], unreadable };
}

/** The top-level closed fields whose allowed values differ between a tool's branches: the field that picks a branch
 *  (`targetRef` across the per-actor tracker split). */
function discriminators(branches: readonly ReadonlyMap<string, PatchLeaf>[]): ReadonlySet<string> {
  const enumOf = (leaf: PatchLeaf | undefined): string => JSON.stringify(leaf?.node["enum"] ?? null);
  const first = branches[0];
  if (branches.length < 2 || first === undefined) {
    return new Set();
  }
  const fields = [...first.entries()]
    .filter(
      ([path, leaf]) => leaf.segments.length === 1 && Array.isArray(leaf.node["enum"]) && branches.some((branch) => enumOf(branch.get(path)) !== enumOf(leaf)),
    )
    .map(([path]) => path);
  return new Set(fields);
}

/** Rank a branch's build: first by whether it refused a branch-picking value (so the entity the model named keeps its
 *  call), then by how much it refused. */
function rankOf(built: { readonly refused: readonly RpgToolCallRefusal[] }, picks: ReadonlySet<string>): readonly [number, number] {
  return [built.refused.filter((refusal) => picks.has(refusal.field)).length, built.refused.length];
}

/** One group to its call, built against the branch that keeps the named entity and refuses the least. A group with
 *  nothing placed still yields a call, carrying its refusals, so the record names what was sent. */
function decodeGroup(group: PatchGroup, branches: readonly ReadonlyMap<string, PatchLeaf>[] | undefined): RpgToolCall {
  if (group.plane === RPG_NO_CHANGES_TOOL) {
    return { name: RPG_NO_CHANGES_TOOL, arguments: "{}" };
  }
  if (branches === undefined || branches.length === 0) {
    return { name: group.plane, arguments: "{}", refused: group.patches.map((patch) => ({ field: patch.field, sent: patch.value, message: UNKNOWN_TOOL })) };
  }
  const picks = discriminators(branches);
  const built = branches.map((leaves) => buildCall(group.patches, leaves));
  const best = built.reduce((winner, next) => {
    const [a, b] = [rankOf(next, picks), rankOf(winner, picks)];
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? next : winner;
  });
  return { name: group.plane, arguments: JSON.stringify(best.args), ...(best.refused.length > 0 ? { refused: best.refused } : {}) };
}

/**
 * Decode a patch-list reply into tool calls, or `null` when it is not a non-empty `changes` list. Entries group into
 * calls by `(plane, call)` and into array elements by `item`. Each value is decoded by its field's declared type and
 * checked against the round's own per-call enums; where a tool's parameters split per actor, the call is built against
 * the branch that keeps the actor the model named. A refused value is never written: it rides its call as a refusal,
 * so the turn's record marks that call salvaged (other fields kept) or dropped (nothing kept), exactly as the tool
 * round's per-call salvage does.
 */
export function patchChangesToToolCalls(value: unknown, tools: readonly RpgStateRoundTool[]): RpgStructuredChanges | null {
  const changes = isRecord(value) ? value[RPG_STATE_CHANGES_FIELD] : undefined;
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const byName = new Map(tools.map((tool) => [tool.name, toolBranches(tool).branches] as const));
  const { groups, unreadable } = groupEntries(changes);
  const calls = groups.map((group) => decodeGroup(group, byName.get(group.plane)));
  const dropped = calls.flatMap((call) => (call.refused ?? []).map((refusal) => `${call.name}.${refusal.field}`));
  return { calls, unreadable, dropped };
}
