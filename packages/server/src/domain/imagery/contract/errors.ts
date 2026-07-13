// domain/imagery/contract/errors — imagery's typed errors, extending the kit domain-error taxonomy so the
// transport boundary maps them (ImageryNotConfiguredError → BAD_REQUEST, GenerationFailed → SERVICE_UNAVAILABLE).

import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

export class ImageryNotConfiguredError extends DomainOperationError {
  constructor(message: string) {
    super("imagery_not_configured", message);
  }
}

export class GenerationFailedError extends DomainUnavailableError {}
