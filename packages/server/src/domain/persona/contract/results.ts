// domain/persona/contract/results — the thin result shapes. Most verbs return `PersonaDetail`
// (contract/views.ts) or `void`; only the two delete-ish verbs carry a discriminant the caller acts on
// (did a row actually go away?). One home for those shapes (§7.4 / types-in-contract).

/** `remove` — `deleted` is always `true` on success (a not-owned/missing persona throws instead). */
export interface RemovePersonaResult {
  readonly deleted: boolean;
}

/** `disconnectFromCharacter` — `false` when the junction row was already absent (idempotent no-op). */
export interface DisconnectResult {
  readonly disconnected: boolean;
}
