// RPG control names qualify a datum or action by its carrier when several carriers share a region.

/** A per-carrier FIELD's accessible name: `"Sabine Veyra HP value"`. Prefix form — the reader hears whose
 *  datum it is before what the datum is, so a name-navigating walk groups by person. */
export function trackerFieldName(label: string, subject: string | undefined): string {
  return subject === undefined ? label : `${subject} ${label}`;
}

/** A per-carrier ACTION's accessible name: `"Add condition to Sabine Veyra"`. Verb-first with the subject
 *  inside — the house action grammar (`Duplicate X`, `Actions for X`; `library-row.tsx`), which reads as an
 *  instruction rather than a label. The preposition is the caller's because the verb picks it. */
export function trackerActionName(verb: string, preposition: "to" | "from" | "for" | "on", subject: string | undefined): string {
  return subject === undefined ? verb : `${verb} ${preposition} ${subject}`;
}
