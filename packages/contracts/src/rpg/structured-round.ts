// The state round as ONE schema-constrained reply, in two shapes: the UNION (`changes[]` of `{tool, args}`, the
// round's own wire tools verbatim) and the PATCH LIST (`changes[]` of `{plane, field, value}`, flat enough for a
// grammar that caps optional and union-typed properties). Either reply decodes to the SAME `RpgToolCall`s a tool
// round returns, so every vehicle shares one fold.

import { z } from "zod";
import { dropNullValues } from "#inference";
import type { RpgToolCall } from "./extraction.ts";
import { parseToolCallArgs, RPG_NO_CHANGES_TOOL, RPG_STATE_TOOL_ARGS } from "./extraction.ts";

/** The two structured shapes: the round's tools verbatim, and the flat field list for a grammar that caps optional
 *  and union-typed properties. A row takes the first one its grammar fits, in this order. */
export const RPG_STRUCTURED_ROUND_SHAPES = ["union", "patch"] as const;
export type RpgStructuredRoundShape = (typeof RPG_STRUCTURED_ROUND_SHAPES)[number];

/** The reply's one root field: the ordered list of tool calls the model would otherwise have made. */
export const RPG_STATE_CHANGES_FIELD = "changes";
const CHANGE_TOOL_KEY = "tool";
const CHANGE_ARGS_KEY = "args";

/** A state round's wire tool as the round builds it (name + description + its JSON-Schema parameters). */
export interface RpgStateRoundTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/**
 * The response schema for a structured state round, generated from the round's own tool list so the two
 * vehicles can never offer different write surfaces. Each tool is one `anyOf` member pinning `tool` to its name
 * and `args` to that tool's parameters; `minItems: 1` makes a quiet beat say `no_changes` rather than return
 * nothing. The root is an object because an OpenAI-compatible `json_schema` must be one.
 *
 * Generic over `projected`'s brand, like the other constrainers: `projected` is the constrained extraction schema
 * the tools' parameters were lifted from, and every node added here is an object pinned
 * `additionalProperties: false`, so the result is as wire-ready as its source.
 */
export function stateRoundChangesSchema<S extends Record<string, unknown>>(_projected: S, tools: readonly RpgStateRoundTool[]): S {
  const members = tools.map((tool) => ({
    type: "object",
    description: tool.description,
    properties: {
      [CHANGE_TOOL_KEY]: { type: "string", enum: [tool.name] },
      [CHANGE_ARGS_KEY]: tool.parameters,
    },
    required: [CHANGE_TOOL_KEY, CHANGE_ARGS_KEY],
    additionalProperties: false,
  }));
  return {
    type: "object",
    properties: { [RPG_STATE_CHANGES_FIELD]: { type: "array", minItems: 1, items: { anyOf: members } } },
    required: [RPG_STATE_CHANGES_FIELD],
    additionalProperties: false,
  } as Record<string, unknown> as S;
}

/** What a structured state reply decoded to: the calls, how many entries were not a change at all, and (patch
 *  list) the `plane.field` values the tool's own schema refused, which were dropped rather than written. */
export interface RpgStructuredChanges {
  readonly calls: readonly RpgToolCall[];
  readonly unreadable: number;
  readonly dropped: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Decode a structured state reply into tool calls, or `null` when the reply is not `{changes: [...]}` with at
 * least one entry (the round then fails loudly; constrained decoding makes this a wire that ignored the schema).
 * An entry that is not an object with a string `tool` is counted, never guessed at. `args` keeps the tool path's
 * string encoding so the existing salvage, drop and disclosure logic reads it unchanged; explicit `null`s are
 * dropped first because a strict-compatible projection emits them for omitted optionals.
 */
export function structuredChangesToToolCalls(value: unknown): RpgStructuredChanges | null {
  const changes = isRecord(value) ? value[RPG_STATE_CHANGES_FIELD] : undefined;
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const calls: RpgToolCall[] = [];
  let unreadable = 0;
  for (const entry of changes) {
    const tool = isRecord(entry) ? entry[CHANGE_TOOL_KEY] : undefined;
    if (!isRecord(entry) || typeof tool !== "string") {
      unreadable += 1;
      continue;
    }
    calls.push({ name: tool, arguments: JSON.stringify(dropNullValues(entry[CHANGE_ARGS_KEY] ?? {})) });
  }
  return { calls, unreadable, dropped: [] };
}

// ── THE PATCH LIST ────────────────────────────────────────────────────────────────────────────────────────────────
// One change per entry: which tool (`plane`), which of its top-level arguments (`field`), and the value as a string
// (JSON for anything that is not a plain string). Every property is required and the only union is the per-plane
// member list itself, so the grammar carries no optional and no union-typed property at all. Omit means keep:
// a field nobody wrote is simply absent from the call it builds.
const PATCH_PLANE_KEY = "plane";
const PATCH_FIELD_KEY = "field";
const PATCH_VALUE_KEY = "value";

/**
 * The patch-list response schema (zod, for the caller to project), generated from each round tool's own argument
 * schema: one member per tool, `field` enumerating that tool's argument names, plus a `no_changes` member. A tool
 * with no argument schema (anything but the seven state tools) is left out.
 */
export function stateRoundPatchSchema(tools: readonly Pick<RpgStateRoundTool, "name" | "description">[]): z.ZodType {
  const members: z.ZodType[] = [];
  for (const tool of tools) {
    const args = RPG_STATE_TOOL_ARGS.get(tool.name);
    if (args !== undefined) {
      const fields = Object.keys(args.shape) as [string, ...string[]];
      members.push(
        z.strictObject({ [PATCH_PLANE_KEY]: z.enum([tool.name]), [PATCH_FIELD_KEY]: z.enum(fields), [PATCH_VALUE_KEY]: z.string() }).describe(tool.description),
      );
    } else if (tool.name === RPG_NO_CHANGES_TOOL) {
      members.push(z.strictObject({ [PATCH_PLANE_KEY]: z.enum([RPG_NO_CHANGES_TOOL]) }).describe(tool.description));
    }
  }
  return z.strictObject({ [RPG_STATE_CHANGES_FIELD]: z.array(z.union(members)).min(1) });
}

/** One patch value through its field's own schema: as sent, else as JSON. `undefined` = the schema refused both. */
function decodePatchValue(field: z.ZodType, raw: string): { readonly value: unknown } | undefined {
  if (field.safeParse(raw).success) {
    return { value: raw };
  }
  const parsed = parseToolCallArgs(raw);
  return parsed !== null && field.safeParse(parsed).success ? { value: parsed } : undefined;
}

/** One decoded patch entry: a field value for a plane, the `no_changes` escape, a value its schema refused (named
 *  `plane.field`), or not a change at all. */
type PatchEntry =
  | { readonly kind: "set"; readonly plane: string; readonly field: string; readonly value: unknown }
  | { readonly kind: "quiet" }
  | { readonly kind: "dropped"; readonly name: string }
  | { readonly kind: "unreadable" };

function decodePatchEntry(entry: unknown): PatchEntry {
  const plane = isRecord(entry) ? entry[PATCH_PLANE_KEY] : undefined;
  if (!isRecord(entry) || typeof plane !== "string") {
    return { kind: "unreadable" };
  }
  if (plane === RPG_NO_CHANGES_TOOL) {
    return { kind: "quiet" };
  }
  const field = entry[PATCH_FIELD_KEY];
  const raw = entry[PATCH_VALUE_KEY];
  const schema = typeof field === "string" ? RPG_STATE_TOOL_ARGS.get(plane)?.shape[field] : undefined;
  const decoded = schema === undefined || typeof raw !== "string" ? undefined : decodePatchValue(schema as z.ZodType, raw);
  if (decoded === undefined || typeof field !== "string") {
    return { kind: "dropped", name: `${plane}.${typeof field === "string" ? field : "?"}` };
  }
  return { kind: "set", plane, field, value: decoded.value };
}

interface PatchCall {
  readonly plane: string;
  readonly args: Record<string, unknown>;
}

/** Fold one field into the open call for its plane, or open the next call (another plane, or a field the open
 *  call already holds — two actors' `update_party` changes stay two calls). */
function placePatch(built: PatchCall[], set: Extract<PatchEntry, { kind: "set" }>): void {
  const open = built.at(-1);
  if (open !== undefined && open.plane === set.plane && !(set.field in open.args)) {
    open.args[set.field] = set.value;
    return;
  }
  built.push({ plane: set.plane, args: { [set.field]: set.value } });
}

/**
 * Decode a patch-list reply into tool calls, or `null` when it is not a non-empty `changes` list. Consecutive
 * entries for one plane build one call ({@link placePatch}). Each value is decoded through its tool's own field
 * schema and a refused one is DROPPED by name, never written; the assembled call then meets the same per-call
 * salvage every tool call does.
 */
export function patchChangesToToolCalls(value: unknown): RpgStructuredChanges | null {
  const changes = isRecord(value) ? value[RPG_STATE_CHANGES_FIELD] : undefined;
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const built: PatchCall[] = [];
  const dropped: string[] = [];
  let unreadable = 0;
  for (const entry of changes.map(decodePatchEntry)) {
    if (entry.kind === "set") {
      placePatch(built, entry);
    } else if (entry.kind === "quiet") {
      built.push({ plane: RPG_NO_CHANGES_TOOL, args: {} });
    } else if (entry.kind === "dropped") {
      dropped.push(entry.name);
    } else {
      unreadable += 1;
    }
  }
  return { calls: built.map((call) => ({ name: call.plane, arguments: JSON.stringify(call.args) })), unreadable, dropped };
}
