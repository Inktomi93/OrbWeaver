// domain/imagery/contract/errors — imagery's typed errors, extending the kit domain-error taxonomy so the
// transport boundary maps them (ImageryNotConfiguredError / ImageEditUnsupportedError → BAD_REQUEST,
// GenerationFailed / PromptExtractionFailed → SERVICE_UNAVAILABLE).

import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

export class ImageryNotConfiguredError extends DomainOperationError {
  constructor(message: string) {
    super("imagery_not_configured", message);
  }
}

export class GenerationFailedError extends DomainUnavailableError {}

/** Prompt extraction / vision caption returned empty after `processReply` — the side-LLM produced nothing
 *  usable (doc 02 §1/§2). Retryable upstream failure, not a bad request. */
export class PromptExtractionFailedError extends DomainUnavailableError {}

/** `editImage` on a resolved model whose `input.imageEdit` is not true — the asymmetric edit posture
 *  (doc 01 §3.4): an explicit edit THROWS (a silent text→image degrade of THIS image would violate least
 *  surprise), whereas B3's avatar-reference enhancement drops-with-warning. A bad request (the caller picked
 *  a model that cannot edit), not an outage. */
export class ImageEditUnsupportedError extends DomainOperationError {
  constructor(message: string) {
    super("imagery_edit_unsupported", message);
  }
}
