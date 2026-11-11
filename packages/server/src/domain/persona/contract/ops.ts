import type { LoadUserSettings } from "@orb/contracts/settings";
import type { Handle, UserId } from "@orb/kit/ids";

// domain/persona/contract/ops — the PRINCIPAL-LESS injected ops this domain hands OUT (the standalone
// compose-built factory shape, `ExtractQuiet`/`postNarratorMessage` precedent — never a `PersonaService`
// verb, never a tRPC procedure). A `PersonaService` verb resolves authority from ONE Principal, which is
// exactly what the multi-human keyhole was: a room's assembly is a ROOM-plane read under the frozen host
// (D106/D19), so no single Principal can legally speak for every human whose persona the room consumes.
//
// THE CONSENT RULE this op encodes (the persona layer of the permissions model): a persona is a
// single-owned library entity (`personas.ownerId`, D23) — but PLAYING it in a room (holding it as your
// `chat_participants.activePersonaId`, or having it host-pinned as `chats.anchorPersonaId`) is CONSENT to
// the room consuming its PRESENTATION SURFACE — name, description, placement preference — into the shared
// assembly and every member's display. Already-shipped posture, now stated as a rule: the member-gated
// macro-name producer (`chat/persistence/macro-names.ts`, Chat-Macro-Resolution §1 — "a co-participant's
// persona NAME is not a secret") and the persona-book world-info arm (`assembly/world-info/pool.ts`, which
// already feeds a member persona's ATTACHED LORE into the shared prompt) are the precedent.
//
// THE GATE is the persona OWNER's PRESENT membership in the room (`leftSeq IS NULL`) — never the reader's
// identity. `allowedOwnerIds` is that gate, and it is IN THE PARAMS on purpose (the injected-op caller-gate
// law): an op that reads tenant-scoped rows without carrying its gate is ungated by construction, and every
// future caller inherits an unfenced read. A persona whose owner is absent from the set simply does not
// appear in the result. The one exception is the room's PIN (`chats.anchorPersonaId`, ADR 0315): the host's
// standing pin keeps resolving after its owner leaves or is disabled, so a card never re-resolves to someone
// else on its own. It is read live through `chatId`, never copied, and clears when the owner deletes the
// persona. The op takes the room, never a pin id, so no caller can name a persona past the consent gate.

/** What the user-publics read needs from the domains that own the other two facts: the account handle
 *  (sessions owns the `users` read) and the user's settings (the profile avatar fallback). */
export interface UserPublicsDeps {
  readonly loadUserHandle: (userId: UserId) => Promise<Handle | null>;
  readonly loadUserSettings: LoadUserSettings;
}
