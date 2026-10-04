// The reply half of the plan: a structured reply leaves the backend already normalized. Under a reshaping mode
// the model writes an explicit null for an optional it would have omitted; that null is dropped at exactly the
// paths the plan reshaped. A null the author's schema declared is the author's value and always stays. An enum or
// const value that differs from the schema's only in letter case is the schema's value (Anthropic does not
// guarantee casing); every other value is left exactly as the model wrote it.

import { ARRAY_ITEMS_SEGMENT, MAP_VALUES_SEGMENT } from "@orb/contracts/inference";
import type { ChatResult } from "../contract/chat.ts";
import { extractJsonObject } from "../roles/structured-turn.ts";
import type { PlannedResponseFormat, StructuredPlan } from "./plan.ts";

type Segment = { readonly kind: "name"; readonly name: string } | { readonly kind: "items" } | { readonly kind: "values" };

const NAME_SEGMENT = /^\.?([A-Za-z_$][\w$-]*)/u;
const QUOTED_SEGMENT = /^\[("(?:[^"\\]|\\.)*")\]/u;

/** Parse a value path the scrub wrote (`changes[*].value`, `a["odd key"]`, `map{*}.b`). */
function segmentsOf(path: string): readonly Segment[] {
  const segments: Segment[] = [];
  let rest = path;
  while (rest.length > 0) {
    if (rest.startsWith(ARRAY_ITEMS_SEGMENT)) {
      segments.push({ kind: "items" });
      rest = rest.slice(ARRAY_ITEMS_SEGMENT.length);
      continue;
    }
    if (rest.startsWith(MAP_VALUES_SEGMENT)) {
      segments.push({ kind: "values" });
      rest = rest.slice(MAP_VALUES_SEGMENT.length);
      continue;
    }
    const quoted = QUOTED_SEGMENT.exec(rest);
    const plain = quoted === null ? NAME_SEGMENT.exec(rest) : null;
    const match = quoted ?? plain;
    if (match === null || match[1] === undefined) {
      throw new Error(`structured reply: unreadable reshaped path "${path}"`);
    }
    segments.push({ kind: "name", name: quoted === null ? match[1] : (JSON.parse(match[1]) as string) });
    rest = rest.slice(match[0].length);
  }
  return segments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Copy-on-write: the caller's value (an SDK result object) is never mutated.
function dropAt(value: unknown, segments: readonly Segment[]): unknown {
  const [head, ...tail] = segments;
  if (head === undefined) {
    return value;
  }
  if (head.kind === "items") {
    return Array.isArray(value) ? value.map((item) => dropAt(item, tail)) : value;
  }
  if (!isRecord(value)) {
    return value;
  }
  if (head.kind === "values") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dropAt(item, tail)]));
  }
  if (!(head.name in value)) {
    return value;
  }
  if (tail.length === 0) {
    if (value[head.name] !== null) {
      return value;
    }
    const { [head.name]: _absent, ...rest } = value;
    return rest;
  }
  return { ...value, [head.name]: dropAt(value[head.name], tail) };
}

const MAX_REF_HOPS = 32;

// The node a local `$ref` names, followed to a node that is not a reference.
function resolved(node: unknown, root: unknown): unknown {
  let current = node;
  for (let hop = 0; hop < MAX_REF_HOPS && isRecord(current) && typeof current["$ref"] === "string"; hop += 1) {
    const ref = current["$ref"];
    current = ref.startsWith("#/")
      ? ref
          .slice(2)
          .split("/")
          .reduce<unknown>((at, segment) => (isRecord(at) ? at[segment.replaceAll("~1", "/").replaceAll("~0", "~")] : undefined), root)
      : undefined;
  }
  return current;
}

function unionArms(node: Record<string, unknown>, root: unknown): readonly Record<string, unknown>[] {
  return ["anyOf", "oneOf"].flatMap((key) => {
    const arms = node[key];
    return Array.isArray(arms) ? arms.map((arm) => resolved(arm, root)).filter(isRecord) : [];
  });
}

// The strings a node pins a value to: its own enum or const, or those of its direct union arms.
function pinnedStrings(node: Record<string, unknown>, root: unknown): readonly string[] {
  const own = [...(Array.isArray(node["enum"]) ? node["enum"] : []), ...("const" in node ? [node["const"]] : [])];
  return [...own, ...unionArms(node, root).flatMap((arm) => pinnedStrings(arm, root))].filter((value): value is string => typeof value === "string");
}

function caseFixed(value: string, node: Record<string, unknown>, root: unknown): string {
  const pinned = pinnedStrings(node, root);
  if (pinned.length === 0 || pinned.includes(value)) {
    return value;
  }
  const matches = pinned.filter((candidate) => candidate.toLowerCase() === value.toLowerCase());
  return matches.length === 1 && matches[0] !== undefined ? matches[0] : value;
}

// The one union arm a container value can only belong to (the reshape's `anyOf: [object, null]`).
function containerArm(node: Record<string, unknown>, root: unknown, isArray: boolean): Record<string, unknown> {
  const arms = unionArms(node, root).filter((arm) => arm["type"] === (isArray ? "array" : "object") || (isArray ? "items" in arm : "properties" in arm));
  return arms.length === 1 && arms[0] !== undefined ? arms[0] : node;
}

// Copy-on-write: an unchanged subtree keeps its identity, so the caller can tell nothing was fixed.
function fixCasing(schema: unknown, value: unknown, root: unknown): unknown {
  const node = resolved(schema, root);
  if (!isRecord(node)) {
    return value;
  }
  if (typeof value === "string") {
    return caseFixed(value, node, root);
  }
  if (Array.isArray(value)) {
    const items = containerArm(node, root, true)["items"];
    const fixed = value.map((item) => fixCasing(items, item, root));
    return fixed.every((item, i) => item === value[i]) ? value : fixed;
  }
  if (!isRecord(value)) {
    return value;
  }
  const container = containerArm(node, root, false);
  const properties = isRecord(container["properties"]) ? container["properties"] : {};
  const entries = Object.entries(value).map(([key, item]): [string, unknown] => [
    key,
    fixCasing(properties[key] ?? container["additionalProperties"], item, root),
  ]);
  return entries.every(([key, item]) => item === value[key]) ? value : Object.fromEntries(entries);
}

/** A parsed reply normalized against its planned format: enum casing restored, then the null at every reshaped path
 *  dropped. Returns the same object when nothing changed. */
export function normalizeStructuredValue(value: unknown, format: Pick<PlannedResponseFormat, "schema" | "reshapedPaths">): unknown {
  const cased = fixCasing(format.schema, value, format.schema);
  return format.reshapedPaths.reduce((current, path) => dropAt(current, segmentsOf(path)), cased);
}

function parseReply(text: string): unknown {
  try {
    return JSON.parse(text);
    // @orb-waive caught-failure-ownership(catch): a reply that is not bare JSON falls to the tolerant extractor, and a reply with no object is returned untouched for the caller's own parse to refuse. Ends if normalization starts failing the call.
  } catch {
    return extractJsonObject(text);
  }
}

/** A structured reply's text normalized against the plan (casing, then the reshaped nulls). A reply that holds no JSON object is returned
 *  unchanged: the caller's parse is what refuses it. */
export function normalizeStructuredText(text: string, format: PlannedResponseFormat | undefined): string {
  if (format === undefined) {
    return text;
  }
  const parsed = parseReply(text);
  if (parsed === null || typeof parsed !== "object") {
    return text;
  }
  const normalized = normalizeStructuredValue(parsed, format);
  // An unchanged reply keeps its bytes: nothing was fixed, so nothing is re-serialized.
  return normalized === parsed && !format.nullMeansAbsent ? text : JSON.stringify(normalized);
}

/** A chat turn that carried a planned structured payload, folded so `reply` is the payload: the normalized text
 *  under `response-format`, or the one structured call's arguments under a tool vehicle (that call leaves
 *  `toolCalls`). A tool vehicle the model did not call leaves an empty reply: prose is never the payload. */
export function structuredChatResult(result: ChatResult, plan: StructuredPlan): ChatResult {
  const format = plan.responseFormat;
  if (format === undefined) {
    return result;
  }
  if (format.vehicle === "response-format") {
    return { ...result, reply: normalizeStructuredText(result.reply, format) };
  }
  const calls = result.toolCalls ?? [];
  const call = calls.find((candidate) => candidate.name === format.name);
  const others = calls.filter((candidate) => candidate !== call);
  return {
    ...result,
    reply: call === undefined ? "" : normalizeStructuredText(call.arguments, format),
    toolCalls: others.length > 0 ? others : undefined,
  };
}
