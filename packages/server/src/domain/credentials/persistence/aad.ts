// domain/credentials/persistence/aad — THE one canonical site for the AES-256-GCM additional-authenticated-
// data string (credentials.md "AES-256-GCM AAD invariant", load-bearing; invariant #3). The AAD binds every
// ciphertext to its `(ownerId, provider)` slot:
//
//     aad = `${userId}|${provider}`
//
// where `userId` is the row's owner (orbweaver's column is `ownerId`; the VALUE is the same user id, so the
// AAD stays byte-identical to neo-tavern's). A row moved to a different slot WILL NOT decrypt — GCM tag
// verification fails LOUDLY (a wrong-key/lifted-row error), never a silent wrong decrypt. This string MUST
// stay byte-identical across any refactor: a change to the separator, field order, or stringification is a
// silent data-loss event for every stored credential. NEVER re-derive it inline — every encrypt/decrypt in
// this domain calls `aadFor`; the SecretBox CARRIES this value, it does not compute it.

import type { CredentialProvider } from "@orb/contracts/credentials";
import type { UserId } from "@orb/kit/ids";

/** The GCM AAD for a `(owner, provider)` slot — `${userId}|${provider}`, byte-identical, single-sited. */
export function aadFor(userId: UserId, provider: CredentialProvider): string {
  return `${userId}|${provider}`;
}
