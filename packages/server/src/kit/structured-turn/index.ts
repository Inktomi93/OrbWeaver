// @orb/server/kit/structured-turn — the ONE structured-output mechanics helper (D79). Turn-runner-INJECTED:
// the caller closes its own role op (an agentTurn / a runChatTurn / a summarize client) over its already-built
// wire request and hands us a `run(correction?)` closure plus the zod payload schema. We own the MECHANICS —
// fence-strip / JSON-extract → JSON.parse → zod safeParse → ONE bounded retry with the issues appended → typed
// payload or throw — and nothing else: recovery POLICY (workload `failed`, error result, canned fallback) stays
// at the caller. Absorbs the extraction mechanics of the retired discovery/substrate/json-extract.ts.
//
// Imports ZERO infra by design (it sits at the bottom of the server tier list, below the ResponseFormat-carrying
// requests) — that is what lets one implementation serve every structured lane.

import type { z } from "zod";

/** Thrown when BOTH the first turn and the one bounded retry fail extraction/validation. Carries the last
 *  zod issue summary + the raw reply so the caller's policy surface can log/inspect. */
export class StructuredOutputError extends Error {
  readonly issues: string;
  readonly raw: string;
  constructor(issues: string, raw: string) {
    super(`structured output failed validation after one retry: ${issues}`);
    this.name = "StructuredOutputError";
    this.issues = issues;
    this.raw = raw;
  }
}

/**
 * What the bounded retry reports to the caller's observability seam.
 *
 * METADATA ONLY, deliberately: the zod MESSAGES are absent because they quote the model's own output
 * ("…received 'Ambrose the Grey'"), i.e. RP content, which must never reach a span attribute or a log field.
 * The schema PATHS are ours — they name the contract, not the story — and a count plus the failing paths is
 * what actually answers "which field does this model keep getting wrong".
 */
export interface StructuredRetrySummary {
  readonly issueCount: number;
  /** The failing schema paths in issue order; a root-level issue contributes `""`. */
  readonly paths: readonly string[];
}

export interface StructuredTurnArgs<T> {
  /** The caller's runtime validator — also the meaning of the payload (the caller owns it). */
  readonly payloadSchema: z.ZodType<T>;
  /** Runs one turn against the caller's wire request (which already carries the `ResponseFormat`). On the
   *  retry, `correction` is the zod issue summary — the caller's closure appends it to its prompt. */
  readonly run: (correction?: string) => Promise<string>;
  /**
   * Called EXACTLY ONCE, immediately before the bounded second attempt runs — never on a first-try success
   * and never on the final failure (that one is the thrown {@link StructuredOutputError}, which the caller
   * already sees).
   *
   * INJECTED because this module sits at the BOTTOM of the server tier list (it imports zero infra by
   * design, which is what lets one implementation serve every structured lane) — it is BELOW `foundation`,
   * so it cannot call `addSpanEvent` itself. Without this seam the retry was unobservable by construction: a
   * lane that silently costs two provider calls instead of one looked identical to one that cost one, and
   * the only trace of it was a wall-clock duration nobody could attribute.
   *
   * It must not throw and must not be async — it annotates, it does not participate.
   */
  readonly onRetry?: ((summary: StructuredRetrySummary) => void) | undefined;
}

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
