// domain/discovery/contract/errors — the typed domain error(s) the discovery compute/read paths throw.

import { DomainError } from "@orb/kit/errors";

/** A discovery compute/read failed in a way the caller (a workload runner or the tRPC seam) must surface —
 *  e.g. a clustering pass handed a `k` larger than the (collapsed) population. Distinct from a `noop` (an
 *  empty corpus is NOT an error — the compute passes return zero-count stats). */
export class DiscoveryError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryError";
  }
}
