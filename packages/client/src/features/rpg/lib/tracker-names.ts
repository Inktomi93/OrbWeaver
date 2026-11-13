// RPG control names qualify a datum or action by its carrier when several carriers share a region.

/** A per-carrier FIELD's accessible name: `"Sabine Veyra HP value"`. Prefix form — the reader hears whose
 *  datum it is before what the datum is, so a name-navigating walk groups by person. */
export function trackerFieldName(label: string, subject: string | undefined): string {
  return subject === undefined ? label : `${subject} ${label}`;
}

/** A tracker datum's field name: the tracker's label, then the word that says it is the reading. */
export function trackerValueName(label: string): string {
  return `${label} value`;
}

/** An editable value's rest button: its field name, then the text the button shows, so the visible words are in the
 *  name (WCAG 2.5.3). */
export function trackerValueRestName(field: string, shown: string): string {
  return `${field}: ${shown}`;
}

/** A per-carrier ACTION's accessible name: `"Add condition to Sabine Veyra"`. Verb-first with the subject
 *  inside — the house action grammar (`Duplicate X`, `Actions for X`; `library-row.tsx`), which reads as an
 *  instruction rather than a label. The preposition is the caller's because the verb picks it. */
export function trackerActionName(verb: string, preposition: "to" | "from" | "for" | "on", subject: string | undefined): string {
  return subject === undefined ? verb : `${verb} ${preposition} ${subject}`;
}
