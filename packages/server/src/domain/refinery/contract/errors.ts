// domain/refinery/contract/errors — the three typed errors refinery mints. Everything else is the house's:
// a foreign/absent session or character collapses to `DomainNotFoundError` (@orb/kit/errors → NOT_FOUND,
// leak-free — the cross-tenant sweep's required shape), and ownership belts run BEFORE any statement
// about content (the discovery existence-oracle ordering, `distill.ts`'s belt). Both classes here are
// minted WITH their throw sites, in the same commit (the discovery errors-file law).

import type { RefineryStage } from "@orb/contracts/refinery";
import { REFINERY_OUTPUT_BUDGET_REASON, REFINERY_ROUND_IN_FLIGHT_REASON, REFINERY_STAGE_NOT_READY_REASON } from "@orb/contracts/refinery";
import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";
import type { StageBudgetMisfit } from "./prompts.ts";

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
 * A stage run refused because the CALLER'S OWN preset caps `maxOutputTokens` below what this stage's payload
 * needs (the owner ruling on live-e2e 2026-08-09 open fork 1; the predicate is `stageBudgetMisfitOf`). NOT
 * retryable, not the model's fault, and not a server capacity problem (→ BAD_REQUEST): re-running changes
 * nothing until a knob moves, which is why it is refused before a single token is decoded rather than
 * discovered 21 seconds later as a truncation.
 *
 * THE MESSAGE IS THE FIT RECEIPT, and it is built HERE so the sentence has one spelling: the computed need,
 * the cap that is under it, and the two knobs that fix it — the same pair the preflight warn line offers
 * ("Raise max output in the preset, or narrow the selection"), because the refusal is that warning's other
 * half, not a different diagnosis. The client quotes this text verbatim off the wire reason code; it must
 * therefore stay self-contained and free of internals (the paths-not-messages law).
 */
export class RefineryOutputBudgetError extends DomainOperationError {
  constructor(stage: RefineryStage, misfit: StageBudgetMisfit) {
    super(
      REFINERY_OUTPUT_BUDGET_REASON,
      `This ${stage} run needs about ${misfit.needTokens} output tokens, but your preset caps max output at ${misfit.capTokens} — it would truncate and fail. Raise max output in the preset, or narrow the selection.`,
    );
    this.name = this.constructor.name;
  }
}

/**
 * A refinement round refused because the session already has one IN FLIGHT (#1568) — the leased claim
 * `iterate` takes before it spends. NOT retryable-by-machine and not a fault (→ BAD_REQUEST): the session is
 * busy, and the caller's fix is to wait for the round that is running, which is what the message says.
 * Thrown AFTER the ownership belt (the same existence-oracle ordering as {@link RefineryStageNotReadyError})
 * and BEFORE any model call, so a refused round costs nothing.
 *
 * THE CLAIM IS A LEASE, so this refusal is bounded even when the holder dies: a crashed round's claim expires
 * and the next `iterate` takes it. See `substrate/round-claim.ts` for the deadline and why it is that number.
 */
export class RefineryRoundInFlightError extends DomainOperationError {
  constructor() {
    super(REFINERY_ROUND_IN_FLIGHT_REASON, "A refinement round is already running for this session — wait for it to finish, then iterate again.");
    this.name = this.constructor.name;
  }
}

/**
 * The stage reached the model and produced nothing usable — the reply failed the payload schema on BOTH
 * the first turn and the bounded retry, or the retry hit a provider fault. Transient and RETRYABLE
 * (→ SERVICE_UNAVAILABLE); NEVER a fallback write (security pass §4.7 — a double failure is a typed
 * error, not a degraded run row). The `DistillFailedError` twin.
 */
/**
 * The caller has NO `summarize` connection bound (`RoleClients.resolved("structured") === null`) — refinery's
 * every pass is schema-constrained and rides that binding (inference program §7.5-1). Not the model's
 * fault and not transient in the retry sense (→ SERVICE_UNAVAILABLE, the `no-connection` class): the fix
 * is a Connections-pane edit, which is what the message says.
 */
export class RefineryNotConfiguredError extends DomainUnavailableError {
  constructor() {
    super("No summarize connection is bound — bind one under Connections › Model roles to run the refinery.");
    this.name = this.constructor.name;
  }
}

export class RefineryRunFailedError extends DomainUnavailableError {
  constructor(message: string, options?: ErrorOptions) {
    super(message);
    this.name = this.constructor.name;
    // The original StructuredOutputError rides as `cause` (its `raw` holds the reply for the caller's
    // policy surface; the MESSAGE never quotes it — the paths-not-messages law).
    this.cause = options?.cause;
  }
}
