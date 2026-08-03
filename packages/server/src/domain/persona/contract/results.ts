// domain/persona/contract/results — the thin result shapes. Most verbs return `PersonaDetail`
// (contract/views.ts) or `void`; only the two delete-ish verbs carry a discriminant the caller acts on
// (did a row actually go away?). One home for those shapes (§7.4 / types-in-contract).

import type { PersonaDetail } from "./views";

/** `remove` — `deleted` is always `true` on success (a not-owned/missing persona throws instead). */
export interface RemovePersonaResult {
  readonly deleted: boolean;
}

/** `disconnectFromCharacter` — `false` when the junction row was already absent (idempotent no-op). */
export interface DisconnectResult {
  readonly disconnected: boolean;
}

/** `export` — one portable persona file, ready for either door (the bundle descriptor streams it; the
 *  single-entity door hands its bytes down as text). */
export interface PersonaPortableFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** `import` — NEVER throws for a malformed file (the delivery core's per-file isolation contract); a
 *  refusal carries the operator-facing reason the import door renders. `created:false` ⇒ a same-named
 *  persona was merged in place. */
export type PersonaImportOutcome =
  | { readonly ok: true; readonly persona: PersonaDetail; readonly created: boolean }
  | { readonly ok: false; readonly error: string };
