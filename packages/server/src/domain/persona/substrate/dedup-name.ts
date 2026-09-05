// domain/persona/substrate/dedup-name — the ONE normalisation a persona's NAME is deduped under, for every
// door that resolves "do I already have this person?".
//
// WHY IT NEEDS A HOME. Personas arrive through two doors that never talk to each other: the single-FILE
// import (`verbs/import`, and the bundle descriptor that delegates to it) and the BULK profile import
// (`persistence/import-write`). Both dedup on the owner's persona name, and they used to disagree about what
// "the same name" means — the single door compared the stored string BYTE-FOR-BYTE (`eq(personas.name, …)`)
// while the bulk door compared `name.trim().toLowerCase()`. So "Alice" through one door and " alice " through
// the other minted TWO rows for one person, and which door a persona came through is an accident of how the
// user happened to import, never a statement about identity.
//
// IT NORMALISES THE COMPARISON, NEVER THE STORED VALUE. A persona's name is user-facing prose the owner
// chose; "Alice" stays "Alice" in the row and on every surface. Only the question "is this the same person?"
// is asked in the folded form.
//
// IT IS ALSO WHY THE LOOKUP IS A JS MATCH OVER THE OWNER'S OWN ROWS rather than a SQL predicate: SQLite's
// `lower()` is ASCII-only while JS `toLowerCase()` is Unicode-aware, so a SQL-side fold and a JS-side fold
// disagree the moment a name carries a non-ASCII capital ("École"). Two normalisations is exactly the defect
// this file exists to end, so the fold happens in ONE language. The scan it costs is over one owner's
// personas — a set the list surface already reads whole, and the set the bulk door has always pre-fetched.

import type { PersonaId } from "@orb/kit/ids";

/** The folded form a persona name is deduped under: surrounding whitespace removed, case folded. */
export function dedupPersonaName(name: string): string {
  return name.trim().toLowerCase();
}

/** Index an owner's personas by their folded name — the lookup both import doors resolve through.
 *
 *  It lives here rather than in persistence for two reasons that point the same way: persistence is
 *  queries-only (an in-memory index is a subsystem's job, not a query's), and the FOLD and the INDEX BUILT
 *  FROM IT have to stay in one file or they are two normalisations again.
 *
 *  FIRST ROW WINS a folded-name collision, so the caller's ordering IS the collision rule — persistence hands
 *  these newest-first, which makes "newest wins" the answer for both doors (it was already the single-file
 *  door's documented rule; the bulk door used to take whatever an unordered select returned first). */
export function indexByDedupName(rows: readonly { readonly id: PersonaId; readonly name: string }[]): Map<string, PersonaId> {
  const byName = new Map<string, PersonaId>();
  for (const row of rows) {
    const key = dedupPersonaName(row.name);
    if (!byName.has(key)) {
      byName.set(key, row.id);
    }
  }
  return byName;
}
