// The one handle rule for a restore: a card restores under the handle its export carried, and a chat bundle
// re-links its seats by those same carried handles. Only a card that carries none falls back to its name slug.

import { characterHandleSchema } from "@orb/contracts/character";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";

/** A handle a file carried, or null when the value is not one the app could have minted.
 *
 *  SECURITY: a carried handle is untrusted, and the library export writes it as a path segment. Only a fixed
 *  point of {@link slugifyHandle} is accepted, which keeps `..`, separators, NUL and the reserved `__group__*`
 *  namespace out; the length contract alone admits all of them. A rejected value falls back to the name slug. */
export function carriedHandle(value: unknown): CharacterHandle | null {
  if (typeof value !== "string" || slugifyHandle(value) !== value) {
    return null;
  }
  const parsed = characterHandleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The handle a restored card asks for before the per-owner collision suffix: its carried handle, else the
 *  slug of its name (a foreign card carries no handle). */
export function requestedHandle(card: { readonly handle: CharacterHandle | null; readonly name: string }): CharacterHandle {
  return card.handle ?? castId<CharacterHandle>(slugifyHandle(card.name));
}
