// domain/imagery/contract/errors — the imagery domain's typed errors (imagery-design/01 §3.4). They extend
// the kit domain-error taxonomy (like tag's `TagNotFoundError extends DomainNotFoundError`) so the transport
// boundary maps them (`ImageryNotConfiguredError` → BAD_REQUEST via `DomainOperationError`; a "not
// configured" surface reads as a fixable request, not a crash — GenerationFailed is an upstream fault →
// SERVICE_UNAVAILABLE). Re-exported from the front door; thrown by `generatePicture`.
//
// LAYERING NOTE: the committed design sketch spells these `extends Error`; the repo convention (every other
// domain) is the kit taxonomy so the tRPC error-mapping middleware classifies them — that convention wins.

import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/** No `generateImage` role/credential is configured for the caller (the settings-panel deep-link error). */
export class ImageryNotConfiguredError extends DomainOperationError {
  constructor(message: string) {
    super("imagery_not_configured", message);
  }
}

/** The provider returned zero decodable images (an upstream generation fault — carries the detail). */
export class GenerationFailedError extends DomainUnavailableError {}
