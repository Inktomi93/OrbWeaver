// What tells a character's library row apart from its namesakes (ui-surface-and-interaction-rules §6.6).
//
// The handle is the disambiguator, spent only when character.list says nameIsAmbiguous: that flag is library-wide,
// page-independent and lens-independent, where a loaded-page collision scan would change names as later pages
// arrive. A handle that is the name's own slug repeats the name and tells the rows apart no better than the name,
// so it is never shown: the row whose handle came from its name carries no qualifier, and its namesakes carry the
// handles that differ.

import type { CharacterSummary } from "@orb/contracts/character";
import { slugifyHandle } from "@orb/kit/slug";

/** The handle a row shows after its name, or `undefined` when the name alone already names the row. */
export function characterRowQualifier(character: Pick<CharacterSummary, "name" | "handle" | "nameIsAmbiguous">): string | undefined {
  return character.nameIsAmbiguous && character.handle !== slugifyHandle(character.name) ? character.handle : undefined;
}
