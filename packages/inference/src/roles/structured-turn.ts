// `runStructuredTurn` — the ONE structured-output mechanics helper (D79), for every structured lane. The caller
// closes its own role op over its already-built request and hands a `run(correction?)` closure plus the zod
// payload schema; this owns fence-strip / JSON-extract → JSON.parse → zod safeParse → ONE bounded retry with the
// issues appended → typed payload or throw. Recovery POLICY (workload `failed`, error result, canned fallback)
// and the retry's tracing stay with the caller.

import type { z } from "zod";
import type { StructuredRetrySummary, StructuredTurnArgs } from "../contract/structured-turn.ts";
import { StructuredOutputError } from "../contract/structured-turn.ts";

type ParseOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: string; readonly summary: StructuredRetrySummary };

/**
 * Run a structured turn: one completion, parse+validate, and on failure ONE bounded retry with the validation
 * issues appended. Returns the typed payload or throws {@link StructuredOutputError} — the caller decides what
 * a throw means.
 */
export async function runStructuredTurn<T>(args: StructuredTurnArgs<T>): Promise<T> {
  const firstText = await args.run();
  const first = parseStructured(args.payloadSchema, firstText);
  if (first.ok) {
    return first.value;
  }
  args.onRetry?.(first.summary);
  const secondText = await args.run(first.issues);
  const second = parseStructured(args.payloadSchema, secondText);
  if (second.ok) {
    return second.value;
  }
  throw new StructuredOutputError(second.issues, secondText);
}

/** Extract → parse → validate ONE reply. The issue summary matches the tool-registry convention
 *  (`path: message`) so a model reads it against its own schema. */
function parseStructured<T>(schema: z.ZodType<T>, text: string): ParseOutcome<T> {
  const obj = extractJsonObject(text);
  if (obj === null) {
    // A reply with no JSON at all is one failure at the root — the summary stays shaped, so a consumer
    // never has to special-case "the extraction failed" against "the validation failed".
    return { ok: false, issues: "no JSON object found in the reply", summary: { issueCount: 1, paths: [""] } };
  }
  const parsed = schema.safeParse(obj);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  // The PATHS ride the observability summary; the MESSAGES ride only the model-facing `correction` (they
  // quote the model's own output, so they are prompt material, never trace/log material).
  const paths = parsed.error.issues.map((issue) => issue.path.join("."));
  return { ok: false, issues, summary: { issueCount: parsed.error.issues.length, paths } };
}

/**
 * Parse the first balanced `{…}` object out of an LLM reply, tolerant of markdown fences / prose padding /
 * a `<think>` preamble — the balanced-brace scan from the first `{` skips any wrapper. Quote- and escape-aware
 * so a `}` inside a string literal never closes the scan early. Returns the parsed object or `null`.
 * (Verbatim the mechanics of the retired discovery/substrate/json-extract.ts.)
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '"') {
      i = skipStringLiteral(raw, i);
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return tryParse(raw.slice(start, i + 1));
      }
    }
  }
  return null;
}

/** Given `open` = the index of an opening `"`, return the index of the closing `"` (escape-aware), or the
 *  last index if the string is unterminated (the scan then falls through to the no-parse return). */
function skipStringLiteral(raw: string, open: number): number {
  for (let i = open + 1; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\\") {
      i += 1; // skip the escaped char
    } else if (ch === '"') {
      return i;
    }
  }
  return raw.length - 1;
}

function tryParse(slice: string): Record<string, unknown> | null {
  // @orb-waive caught-failure-ownership(catch): null flows to extractJsonObject's null →
  // the typed "no JSON object found in the reply" refusal path. Ends if that refusal path is removed.
  try {
    const parsed: unknown = JSON.parse(slice);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
