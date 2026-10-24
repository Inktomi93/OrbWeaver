// The one seat rule for a restore: a card restores under the handle its export carried, and a chat bundle
// re-links each seat to the card exported beside it, by that card's identity, else by the carried handle.

import { characterHandleSchema } from "@orb/contracts/character";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import type { CardIdentityHashes, RestoredSeat } from "../contract/identity.ts";

/** A handle a file carried, or null when the value is not one the app could have minted.
 *
 *  SECURITY: a carried handle is untrusted, and the library export writes it as a path segment. It is read
 *  through {@link characterHandleSchema}, whose slug alphabet keeps `..`, separators, NUL and the reserved
 *  `__group__*` namespace out. A rejected value falls back to the name slug. */
export function carriedHandle(value: unknown): CharacterHandle | null {
  const parsed = characterHandleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The character a restored seat binds to. The card identity comes first, through the character restore's
 *  own lookup, so the seat lands on whatever that card restored AS: the suffixed row a handle collision made,
 *  or the existing row a content dedup reused. Only a seat without one (an older bundle, a card the exporter
 *  did not own, a card this account never restored) binds by its carried handle. */
export async function resolveSeat(
  seat: RestoredSeat,
  find: {
    readonly byIdentity: (hashes: CardIdentityHashes) => Promise<CharacterId | null>;
    readonly byHandle: (handle: CharacterHandle) => Promise<CharacterId | null>;
  },
): Promise<CharacterId | null> {
  const byIdentity = seat.card === null ? null : await find.byIdentity(seat.card);
  if (byIdentity !== null) {
    return byIdentity;
  }
  const handle = carriedHandle(seat.handle);
  return handle === null ? null : await find.byHandle(handle);
}

/** The handle a restored card asks for before the per-owner collision suffix: its carried handle, else the
 *  slug of its name (a foreign card carries no handle). */
export function requestedHandle(card: { readonly handle: CharacterHandle | null; readonly name: string }): CharacterHandle {
  return card.handle ?? castId<CharacterHandle>(slugifyHandle(card.name));
}
