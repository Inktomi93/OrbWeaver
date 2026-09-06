// The PAGE→NODE seam primitives, shared by every probe that evaluates something in a browser (#1004).
//
// WHY THIS EXISTS. `(await page.evaluate(script)) as T` is an assertion with no compiler behind it: the
// script is a STRING, the page is a different realm, and the value comes back as JSON. The cast is the
// instrument telling itself what it hopes it got. The design-audit half of this campaign measured both
// failure modes on a real tool (ops/page-validate.ts in ui-audit carries the receipts): a REQUIRED field
// that went missing crashed opaquely inside an innocent consumer three files away, and a field at the
// WRONG KIND — or any optional one — produced no error at all, just a family that censused nothing and a
// run that read CLEAN.
//
// The house shape is `_shared/devtools-runtime.ts`'s `validateBridgeOutput` (2026-08): validate at the
// seam, throw a NAMED error, never hand a half-trusted object downstream. These primitives are that
// discipline factored out so each probe's validator is a few lines of shape declaration rather than a
// re-derived tower of typeof checks — and so the three tools cannot drift on what "malformed" means.
//
// SCOPE: container-level, plus the fields the NODE side actually reads. Deeper re-spelling would be a
// second copy of the contract that drifts; the point is that a lie is LOUD, not that the type is proven.
import { refuseDirectInvocation } from "./entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap");

/** What a value IS, for the error line — a reader needs "returned a string" to find the segment. */
export function describePageValue(value: unknown): string {
  if (value === undefined) {
    return "nothing";
  }
  if (value === null) {
    return "null";
  }
  return Array.isArray(value) ? "an array" : typeof value;
}

/** THE THROWING DOOR. Deliberately NOT called `instrumentError`: `_shared/evidence.ts` already exports
 *  that name for the door that PRINTS a gap and RETURNS `EXIT.toolError`, and two exports with one name
 *  and opposite control flow is how a `return instrumentError(...)` and a `instrumentError(...)` that
 *  never returns end up looking identical at a call site (#1317 item 2). This one throws; every local
 *  copy of the throwing shape imports it instead of re-declaring a third spelling. */
export function instrumentRefusal(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

/** The boolean half of `pageObject` — a plain (non-array, non-null) object, for the readers that
 *  classify a value rather than settle it. ONE home under ONE name: five copies of this predicate across
 *  `_shared` and `ui-audit` is what #1317 item 3 named, and #1319 re-homed the rest. The name is generic on
 *  purpose — most callers (settings/theme/ratchet rows) never touch a `page.evaluate()` boundary, and a
 *  second exported name for the same binding is a duplicate export (knip). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pageObject(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    instrumentRefusal(`${label} returned ${describePageValue(value)}, not an object`);
  }
  return value;
}

export function pageArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    instrumentRefusal(`${label} returned ${describePageValue(value)}, not a list`);
  }
  return value;
}

export function pageBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    instrumentRefusal(`${label} returned ${describePageValue(value)}, not a boolean`);
  }
  return value;
}

export function pageString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    instrumentRefusal(`${label} returned ${describePageValue(value)}, not a string`);
  }
  return value;
}

/** Finite on purpose: a NaN that reached a budget comparison answers `false` to every `>` and reads as
 *  a pass, which is the quiet arm of exactly this defect class. */
export function pageNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    instrumentRefusal(`${label} returned ${describePageValue(value)}, not a finite number`);
  }
  return value;
}

/** A finite number inside a stated inclusive range. `pageNumber` alone only rules out NaN, so a negative
 *  count, a negative width or an opacity of 12 walked straight into a printed verdict; the ranges live at
 *  the CALL SITES because only the consumer knows what its own field can legally be (#1509). `min`/`max`
 *  are both optional: an open end is a real answer for a length, which has a floor and no ceiling. */
export function pageNumberInRange(value: unknown, label: string, bounds: { readonly min?: number; readonly max?: number }): number {
  const number = pageNumber(value, label);
  const low = bounds.min ?? Number.NEGATIVE_INFINITY;
  const high = bounds.max ?? Number.POSITIVE_INFINITY;
  if (number < low || number > high) {
    const range = `${bounds.min === undefined ? "any" : String(bounds.min)}..${bounds.max === undefined ? "any" : String(bounds.max)}`;
    instrumentRefusal(`${label} returned ${String(number)}, outside the expected range ${range}`);
  }
  return number;
}

/** A population, an index or a monotonic generation: a NON-NEGATIVE INTEGER. Distinct from a bounded
 *  measurement because a fractional count is as wrong as a negative one — both mean the page script
 *  answered a different question than the one the reader is about to print. */
export function pageCount(value: unknown, label: string): number {
  const number = pageNumber(value, label);
  if (!Number.isInteger(number) || number < 0) {
    instrumentRefusal(`${label} returned ${String(number)}, not a non-negative whole count`);
  }
  return number;
}

/** Every own value of a flat counter map must be a finite number — a total check rather than a
 *  hand-listed key set, so a counter added later is covered without an edit here. */
export function pageNumberMap(value: unknown, label: string): Record<string, number> {
  const record = pageObject(value, label);
  for (const [key, entry] of Object.entries(record)) {
    pageNumber(entry, `${label} counter "${key}"`);
  }
  return record as Record<string, number>;
}

/** Assert a set of REQUIRED boolean fields in one call — the shape most `__orb` environment reads are. */
export function pageBooleanFields(record: Record<string, unknown>, fields: readonly string[], label: string): void {
  for (const field of fields) {
    pageBoolean(record[field], `${label} field "${field}"`);
  }
}

export function pageNumberFields(record: Record<string, unknown>, fields: readonly string[], label: string): void {
  for (const field of fields) {
    pageNumber(record[field], `${label} field "${field}"`);
  }
}

/** THE NAV BRIDGE RESULT — ONE predicate for FOUR call sites (`_shared/nav.ts`, `snap/ops/drive.ts`,
 *  and both nav reads in `snap/ops/appearance-invariant-runtime.ts`). They each declared their own
 *  local `NavResult`/`NavResultShape` interface and each cast to it, which is three spellings of one
 *  wire shape and the exact "second copy that drifts" the RULE-AUTHORING checklist forbids. `ok` is
 *  load-bearing: every caller branches on it, so an absent `ok` reads as falsy and reports a NAV FAILED
 *  that never happened — or, worse, a truthy non-boolean reports success. */
export interface NavResultShape {
  readonly ok: boolean;
  readonly reason?: string;
}

export function navResultShape(value: unknown, label: string): NavResultShape {
  const record = pageObject(value, label);
  const ok = pageBoolean(record["ok"], `${label} field "ok"`);
  const reason = record["reason"];
  if (reason !== undefined) {
    pageString(reason, `${label} field "reason"`);
  }
  return { ok, ...(reason === undefined ? {} : { reason: reason as string }) };
}
