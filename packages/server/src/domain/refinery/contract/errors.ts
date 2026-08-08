// domain/refinery/contract/errors — the two typed errors refinery mints. Everything else is the house's:
// a foreign/absent session or character collapses to `DomainNotFoundError` (@orb/kit/errors → NOT_FOUND,
// leak-free — the cross-tenant sweep's required shape), and ownership belts run BEFORE any statement
// about content (the discovery existence-oracle ordering, `distill.ts`'s belt). Both classes here are
// minted WITH their throw sites, in the same commit (the discovery errors-file law).

import { REFINERY_STAGE_NOT_READY_REASON } from "@orb/contracts/refinery";
import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/**
 * A stage run refused OUT OF ORDER — analyze with no rewrite run to judge, or an `iterate` round with no
 * analyze run to refine against. NOT retryable and not the model's fault (→ BAD_REQUEST): the caller fixes
 * it by running the missing stage first, which is what the message says. Thrown only AFTER the ownership
 * belt resolved an owned session (ordering is load-bearing — on a foreign id it would confirm the session
 * exists).
 */
export class RefineryStageNotReadyError extends DomainOperationError {
  constructor(message: string) {
    super(REFINERY_STAGE_NOT_READY_REASON, message);
    this.name = this.constructor.name;
  }
}

/**
 * The stage reached the model and produced nothing usable — the reply failed the payload schema on BOTH
 * the first turn and the bounded retry, or the retry hit a provider fault. Transient and RETRYABLE
 * (→ SERVICE_UNAVAILABLE); NEVER a fallback write (security pass §4.7 — a double failure is a typed
 * error, not a degraded run row). The `DistillFailedError` twin.
 */
export class RefineryRunFailedError extends DomainUnavailableError {
  constructor(message: string, options?: ErrorOptions) {
    super(message);
    this.name = this.constructor.name;
    // The original StructuredOutputError rides as `cause` (its `raw` holds the reply for the caller's
    // policy surface; the MESSAGE never quotes it — the paths-not-messages law).
    this.cause = options?.cause;
  }
}
