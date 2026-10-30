// domain/persona/contract/results — the thin result shapes. Most verbs return `PersonaDetail`
// (@orb/contracts/persona) or `void`; only the two delete-ish verbs carry a discriminant the caller acts on
// (did a row actually go away?). One home for those shapes (§7.4 / types-in-contract).

import type { PersonaId } from "@orb/kit/ids";

export type { DisconnectResult, RemovePersonaResult } from "@orb/contracts/persona";

/** The owner's seed pointers after a delete's re-point. `defaultMoved` is true when the deleted persona was
 *  the default, so `remove` can tell the client where the default went. */
export interface PersonaSeedRepoint {
  readonly defaultPersonaId: PersonaId | null;
  readonly currentPersonaId: PersonaId | null;
  readonly defaultMoved: boolean;
}
