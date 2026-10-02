// domain/persona/substrate/dedup-name — the persona NAME index both doors and the chat attribution resolve
// through. The fold itself is the persona serde's (`foldPersonaName`, beside the content identity), so one
// language folds every name: SQLite's `lower()` is ASCII-only while JS `toLowerCase()` is Unicode-aware,
// and two folds disagree the moment a name carries a non-ASCII capital. The stored value is never folded.

import type { PersonaId } from "@orb/kit/ids";
import { foldPersonaName } from "#kit/serde/persona";

/** Index an owner's personas by their folded name — the lookup chat attribution resolves a `user_name`
 *  through. FIRST ROW WINS a folded-name collision, so the caller's ordering IS the collision rule —
 *  persistence hands these newest-first, which makes "newest wins" the answer. */
export function indexByDedupName(rows: readonly { readonly id: PersonaId; readonly name: string }[]): Map<string, PersonaId> {
  const byName = new Map<string, PersonaId>();
  for (const row of rows) {
    const key = foldPersonaName(row.name);
    if (!byName.has(key)) {
      byName.set(key, row.id);
    }
  }
  return byName;
}
