// The one Principal constructor (D1, D40). Only the request seam and the frozen-host bridge may import it
// (`.dependency-cruiser.ts` principal-mint-owners); the caller owns admission and where the role came from.
import type { Principal } from "@orb/contracts/identity";

/** Brand already-resolved identity fields as the caller's Principal. */
export function mintPrincipal(fields: Pick<Principal, keyof Principal>): Principal {
  return fields as Principal;
}
