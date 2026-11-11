// What the resolver throws for an encoder binding that cannot resolve yet. Every other failure of a lookup is not an
// answer about the binding and must surface with its own identity.

import { NoConnectionError } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";

/** A binding that cannot resolve yet: no usable connection, or a revoked or missing key. */
export function isUnresolvableBinding(error: unknown): error is NoConnectionError | DomainNoCredentialError {
  return error instanceof NoConnectionError || error instanceof DomainNoCredentialError;
}
