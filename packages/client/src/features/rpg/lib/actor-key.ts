// The stable member-scope selector KEY for a participant actor: the contract's canonical immutable-ref
// projection. One home for Sheet / Inventory / the subject dropdown, so every member-scoped surface
// addresses the same actor by the same key through renames and same-name participant entries.

import type { RpgActorView } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";

/** The stable selector key for an actor. */
export function actorKey(actor: RpgActorView): string {
  return actorRefKey(actor.actorRef);
}

/**
 * The A11Y SUBJECT for each actor in one participant list, keyed by {@link actorKey} — the string every control on
 * that actor's block runs through the tracker kit's `subject` grammar ("Mara Vitality value", "Add
 * condition to Mara").
 *
 * A DISPLAY NAME IS NOT UNIQUE (#1531). Two participant entries may legally carry the same name — #1366 keys
 * distinct SPELLINGS distinctly, and identical spellings stay allowed — and when they do, the whole #1383
 * repair collapses back to what it was built to fix: two groups with one accessible name and byte-identical
 * control names across them, on an EDITING surface. So a colliding name is qualified by its POSITION in the
 * participant list the reader is hearing, which is the one disambiguator that is speakable (an actor key read aloud
 * is not) and that tells them there is more than one.
 *
 * ONLY the contended names change. An uncontended actor is spoken as itself — the qualifier is a repair for
 * a collision, not a house style, and paying it everywhere would make every reading longer to fix a case
 * most participant lists never hit. The qualifier is a11y-only: nothing here touches the VISIBLE name, so the
 * accessible name still contains the visible label (WCAG 2.5.3).
 */
export function actorSubjects(actors: readonly RpgActorView[]): ReadonlyMap<string, string> {
  const totals = new Map<string, number>();
  for (const actor of actors) {
    totals.set(actor.name, (totals.get(actor.name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const subjects = new Map<string, string>();
  for (const actor of actors) {
    const total = totals.get(actor.name) ?? 1;
    if (total < 2) {
      subjects.set(actorKey(actor), actor.name);
      continue;
    }
    const ordinal = (seen.get(actor.name) ?? 0) + 1;
    seen.set(actor.name, ordinal);
    subjects.set(actorKey(actor), `${actor.name} (${String(ordinal)} of ${String(total)})`);
  }
  return subjects;
}
