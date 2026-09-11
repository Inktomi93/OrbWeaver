// The `customParameters` editor's pure model (D143a) — the row list the editor edits, and the round trip
// between it and the stored `Record<string, unknown>`.
//
// THE PENDING MARKER is the whole reason this is a model and not two `Object.entries` calls. A row whose
// name is blank or duplicated, or whose value text is not JSON yet, cannot be expressed in the stored
// record — but the autosave status must not read "Saved" over it (the fold reads `form.state.isValid`). So
// an unfinished row commits its slot with an EXPLICIT `undefined` value: the one shape the wire schema
// refuses, which `pendingCustomParameterNames` turns into the form's refusal. Nothing carrying it ever
// reaches the server — the save driver holds every write while the form is invalid.

import type { CustomParameters } from "@orb/contracts/preset";

/** One authored parameter. `text` is the RAW value source the author is typing, never the parsed value —
 *  the parse happens at the record boundary so a half-typed value stays visible instead of vanishing. */
export interface CustomParameterRow {
  /** Stable across renames — the record key is not identity (renaming a row must not remount it). */
  readonly id: string;
  readonly key: string;
  readonly text: string;
}

/** The name shown for a row that has none, in a refusal message. */
const UNNAMED = "(unnamed)";
/** The stem a new row is born with; a numeric suffix is added until it is unique in the list. */
const NEW_KEY_STEM = "new_parameter";

/** Parse one value cell. `undefined` = not JSON yet (which the caller renders as the row's error and
 *  commits as the pending marker). Blank is deliberately NOT healed to `null`: an empty cell is an
 *  unfinished row, and silently sending `null` is a value the author never wrote.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function parseCustomParameterValue(text: string): { readonly value: unknown } | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return;
  }
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(catch): the doc comment above explains — undefined is the
  // "not JSON yet" pending marker the caller renders as the row's error and holds out of the wire schema.
  // Ends if the caller stops treating undefined as the pending marker.
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return;
  }
  return { value: parsed };
}

/** Seed the editor's rows from the stored blob. Insertion order is the record's own, so the list reads in
 *  the order it was authored (the record is rebuilt from the rows, so that order then persists). */
export function customParameterRows(stored: CustomParameters | undefined): CustomParameterRow[] {
  return Object.entries(stored ?? {}).map(([key, value], index) => ({
    id: `${index}:${key}`,
    key,
    text: value === undefined ? "" : JSON.stringify(value),
  }));
}

/** A new row's name — `new_parameter`, then `new_parameter_2`… so a second Add is immediately a real,
 *  distinct slot rather than a duplicate the author has to fix before the editor works. */
export function newCustomParameterRow(rows: readonly CustomParameterRow[]): CustomParameterRow {
  const taken = new Set(rows.map((row) => row.key));
  let key = NEW_KEY_STEM;
  for (let n = 2; taken.has(key); n += 1) {
    key = `${NEW_KEY_STEM}_${n}`;
  }
  return { id: `new:${key}:${rows.length}`, key, text: "" };
}

/** The row's refusal, or `undefined` when it is clean. Duplicate detection is over the WHOLE list, so both
 *  halves of a collision are marked (marking only the later one reads as "the first one is fine"). */
export function customParameterRowError(rows: readonly CustomParameterRow[], row: CustomParameterRow): string | undefined {
  if (row.key.trim().length === 0) {
    return "Give this parameter a name.";
  }
  if (rows.filter((other) => other.key === row.key).length > 1) {
    return "Another parameter already uses this name.";
  }
  return parseCustomParameterValue(row.text) === undefined
    ? 'Not valid JSON — quote text values ("middle-out"), and use true/false, numbers, [lists] or {objects} as-is.'
    : undefined;
}

/** The rows as the stored blob. An unfinished row commits its slot as `undefined` (see the header); an
 *  EMPTY list commits `undefined` for the whole field, so clearing the last row round-trips to unset
 *  rather than persisting `{}`. */
export function customParameterRecord(rows: readonly CustomParameterRow[]): CustomParameters | undefined {
  if (rows.length === 0) {
    return;
  }
  const record: CustomParameters = {};
  for (const row of rows) {
    const parsed = customParameterRowError(rows, row) === undefined ? parseCustomParameterValue(row.text) : undefined;
    record[row.key] = parsed?.value;
  }
  return record;
}

/** The names of every slot the editor left unfinished — the form validator's input, and empty when the
 *  blob is clean (including the never-edited blob a preset arrives with). */
export function pendingCustomParameterNames(stored: CustomParameters | undefined): string[] {
  return Object.entries(stored ?? {}).flatMap(([key, value]) => (value === undefined ? [key.trim().length === 0 ? UNNAMED : key] : []));
}
