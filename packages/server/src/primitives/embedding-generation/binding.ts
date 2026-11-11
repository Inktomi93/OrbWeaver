// What an encoder lookup answers for a binding that cannot resolve yet: no usable row, or no usable key. Every other
// failure of the lookup is a fault and surfaces with its own identity, so a turn fails on it instead of degrading:
// a database error, a stored key that no longer decrypts, a stored connection row that cannot be read, a local-light
// dtype the deployment does not serve.

import { isResolveRefusal } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";

/** A binding that cannot resolve yet: a resolve refusal (`isResolveRefusal`), or a revoked or missing key. */
export function isUnresolvableBinding(error: unknown): boolean {
  return isResolveRefusal(error) || error instanceof DomainNoCredentialError;
}
