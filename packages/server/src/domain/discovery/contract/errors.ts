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
//
// DEFERRED, deliberately unbuilt: there is no "that card has nothing to distill" refusal, because there is no
// such state — `composeCardText` always emits a `Name:` line, so the pass's readiness filter can never reject
// a row. That is its own defect (a name-only card is sent to a summarizer under a schema REQUIRING genre /
// tone / setting / pitch / overview / 3-8 tags, so every facet is invented from a name and the invented tags
// stage as pending suggestions) — but the fix is a readiness-threshold change that flips behavior this repo's
// own distill tests encode, so it is an owner call, not a lane fix. Minting the error class ahead of that
// decision would be the phantom taxonomy over again.

import { DomainUnavailableError } from "@orb/kit/errors";

/**
 * The on-demand card reached the summarizer and produced nothing usable — its reply failed the payload schema
 * on BOTH the first turn and the bounded retry, or that retry hit a provider fault (429 / timeout). Transient
 * and RETRYABLE (→ SERVICE_UNAVAILABLE), so the client's honest copy is "try again".
 */
export class DistillFailedError extends DomainUnavailableError {}
