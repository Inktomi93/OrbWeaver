// parsers — the row→view JSON read-seam. drizzle never validates a `$type<T>()` JSON column: it hands
// back whatever `JSON.parse` produced, typed as `T` on a promise. These zod `.catch(...)` parsers are
// the ONE place a stored blob is coerced into a trusted shape (the §8.4 parse-at-the-DB-seam model), so
// a corrupt row degrades to a safe default instead of poisoning a view.
//
// The null-vs-[] asymmetry is LOAD-BEARING (Tier-1-DB.md movement table — preserve it): `parseStringArray`
// belongs to a column that is ALWAYS a list (absent ⇒ empty list `[]`); the `*Column`/map/record
// parsers belong to NULLABLE columns where "absent" and "empty" differ (absent ⇒ `null`). Do not
// collapse the two — a `[]` where a consumer expects `null` (or vice-versa) is a real semantic bug.

import { z } from "zod";

const stringArray = z.array(z.string());
const record = z.record(z.string(), z.unknown());

/** A column that is always a list: any non-array / corrupt value collapses to `[]` (never null). */
export function parseStringArray(raw: unknown): string[] {
  return stringArray.catch([]).parse(raw);
}

// Consumer class is the corpus/tags domain not yet ported from neo (neo-tavern's corpus verbs —
// archetypes/tag-suggest/distill — consume the equivalent for tags/subGenres columns). Contract
// difference vs neo's variant is deliberate: neo's returns `string[]` (never null); ours is
// `string[] | null` (the world-info.ts keys-column asymmetry) — a future corpus port must decide
// which contract its columns want.
/** A NULLABLE list column: absent / corrupt collapses to `null` (the asymmetry vs {@link parseStringArray}). */
export function parseStringArrayColumn(raw: unknown): string[] | null {
  return stringArray.nullable().catch(null).parse(raw);
}

/** A nullable open-valued `Record<string,unknown>` JSON column: absent / corrupt ⇒ `null`. */
export function parseRecord(raw: unknown): Record<string, unknown> | null {
  return record.nullable().catch(null).parse(raw);
}
