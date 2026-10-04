// The reply half of the plan: a structured reply leaves the backend already normalized. Under a reshaping mode
// the model writes an explicit null for an optional it would have omitted; that null is dropped at exactly the
// paths the plan reshaped. A null the author's schema declared is the author's value and always stays.

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

/** Drop the null at every reshaped path of a parsed reply. */
export function normalizeStructuredValue(value: unknown, reshapedPaths: readonly string[]): unknown {
  return reshapedPaths.reduce((current, path) => dropAt(current, segmentsOf(path)), value);
}

function parseReply(text: string): unknown {
  try {
    return JSON.parse(text);
    // @orb-waive caught-failure-ownership(catch): a reply that is not bare JSON falls to the tolerant extractor, and a reply with no object is returned untouched for the caller's own parse to refuse. Ends if normalization starts failing the call.
  } catch {
    return extractJsonObject(text);
  }
}

/** A structured reply's text with the plan's reshaped nulls dropped. A reply that holds no JSON object is returned
 *  unchanged: the caller's parse is what refuses it. */
export function normalizeStructuredText(text: string, format: PlannedResponseFormat | undefined): string {
  if (format === undefined || !format.nullMeansAbsent) {
    return text;
  }
  const parsed = parseReply(text);
  return parsed === null || typeof parsed !== "object" ? text : JSON.stringify(normalizeStructuredValue(parsed, format.reshapedPaths));
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
