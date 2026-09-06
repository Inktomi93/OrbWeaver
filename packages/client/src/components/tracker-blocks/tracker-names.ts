// The tracker kit's SUBJECT-QUALIFICATION grammar — the one home for "whose datum is this?" in an
// accessible name (#1383).
//
// The kit has always had the rule (`MeterRow.subject`, `TrackerChip.subject`: "two npc cards on one tab
// must not both offer a button called 'Vitality value'") but every surface spelled it inline, so a surface
// that forgot simply shipped the collision. The rpg Status region did: four characters' cards published
// 4× "Add condition", 4× "Status line", 3× "HP value", 3× "HP max" with no group boundary, and a
// screen-reader user editing a sheet could not tell whose sheet it was.
//
// It is a `.ts` module, not an export from a component file — `useComponentExportOnlyModules` (a component
// module may export only components), the same constraint that homes `rowActionSubject` beside
// `library-row.tsx` rather than inside it. That helper is the LIBRARY-ROW disambiguator (a row's name plus
// the stamp it already shows, resolved across a whole list to break a stamp collision); this is the
// TRACKER-KIT one (a datum's label prefixed by the person carrying it). Different collisions, different
// inputs — deliberately not merged.
//
// `undefined` subject = the surface has only one carrier on screen (the character TAKEOVER is the whole
// panel), where a prefix on every control would be noise. Absent subject ⇒ the bare name, unchanged.

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
