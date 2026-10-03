// The state round as ONE schema-constrained reply, in two shapes: the UNION here (`changes[]` of `{tool, args}`, the
// round's own wire tools verbatim) and the PATCH LIST (`structured-patch.ts`, flat enough for a grammar that caps
// optional and union-typed properties). Either reply decodes to the SAME `RpgToolCall`s a tool round returns.

import { dropNullValues } from "#inference";
import type { RpgToolCall } from "./extraction.ts";

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
 *  list) the `plane.field` entries that could not form an argument, which ride their own recorded call instead. */
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
