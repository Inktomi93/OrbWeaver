// domain/discovery/contract/errors — the ONE typed error discovery mints, for the ONE path where a failure
// is the CALLER's failure: the on-demand single-card distill (`suggestCharacterTags`, the character editor's
// "Suggest tags" button). Everywhere else discovery mints nothing — a compute pass's infra fault PROPAGATES
// unchanged, an LLM validation failure DEGRADES to a result that CARRIES the degrade as data
// (`ComparisonNarrative.degraded` / `AskCardAnswer.degraded`), and an empty corpus is a zero-count result, not
// a fault. Do not grow this file to cover those: the 2026-08-03 `DiscoveryError` deletion was correct
// precisely because it was a class with no throw site.
//
// The WHY it exists: `distillCharacters` contains a per-card failure on purpose so one bad card can never
// abort a 500-card sweep. On the on-demand path the pass IS one card, so that same containment handed the
// editor a 200 carrying `{distilled: 0, failed: 1}` that no client reads — the button went quiet and the user
// was told nothing. The narrow arm throws; the batch arm still reports counts (both pinned by tests).
//
// TWO refusals on that narrow arm, and only one is minted here — the other is the house's:
//   • the id resolves to no owned row → `DomainNotFoundError` (@orb/kit/errors) → NOT_FOUND, leak-free. The
//     cross-tenant sweep requires a stranger's rejection to be indistinguishable from a miss, so the ownership
//     belt runs BEFORE any statement about the card's content — a coded "that card has no text" would confirm
//     the card exists (that collapse was written, and the sweep rejected it, 2026-08-03).
//   • the summarizer produced nothing usable → {@link DistillFailedError}.
//   • the card has NOTHING to summarize but its name → {@link CardNotDistillableError}. (Formerly DEFERRED
//     here as "there is no such state": `composeCardText` always emits a `Name:` line, so the pass's
//     `text.trim().length > 0` readiness filter could never reject a row, and a name-only card was sent to a
//     summarizer under a schema REQUIRING genre / tone / setting / pitch / overview / 3-8 tags — every facet
//     invented from a name, staged as pending tag suggestions. The owner ruled 2026-08-03 that an honest
//     refusal beats fabricated labels, so the readiness floor is now real CONTENT (`CardDistillTarget.
//     hasContent`) and the state is reachable. The DEFERRAL was right about one thing and it still holds:
//     an error class is minted only WITH its throw site, in the same commit.)

import { CARD_NOT_DISTILLABLE_REASON } from "@orb/contracts/discovery";
import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/**
 * The on-demand card reached the summarizer and produced nothing usable — its reply failed the payload schema
 * on BOTH the first turn and the bounded retry, or that retry hit a provider fault (429 / timeout). Transient
 * and RETRYABLE (→ SERVICE_UNAVAILABLE), so the client's honest copy is "try again".
 */
export class DistillFailedError extends DomainUnavailableError {}

/**
 * The on-demand card carries no writing at all — no description / personality / scenario / greeting / example
 * dialogue, just a name. Nothing can be distilled from it that the model would not INVENT, so the pass refuses
 * instead of staging fabricated tags. NOT retryable and not the summarizer's fault (→ BAD_REQUEST): the caller
 * fixes it by writing the card, which is what the message and the `card_not_distillable` reason code say.
 *
 * ORDERING IS LOAD-BEARING: this is a statement ABOUT a card, so it may only be thrown AFTER the ownership
 * belt has resolved an owned row (`DomainNotFoundError` first — see the file header). Thrown on a foreign id
 * it would confirm that card exists; the cross-tenant sweep rejected exactly that collapse on 2026-08-03.
 * The BATCH arm never throws it — a name-only card there is a counted skip (`DistillStats.skipped`).
 */
export class CardNotDistillableError extends DomainOperationError {
  constructor() {
    super(CARD_NOT_DISTILLABLE_REASON, "That card has nothing to summarize yet — add a description first.");
    this.name = this.constructor.name;
  }
}
