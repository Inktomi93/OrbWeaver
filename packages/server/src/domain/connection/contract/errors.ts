// domain/connection/contract/errors — the typed connection errors. The `code` strings live in
// `@orb/contracts/inference` (`CONNECTION_OP_CODES`), because the client keys on them (no inline re-spell,
// §7.5); every reader imports them from there.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserConnectionId } from "@orb/kit/ids";

/** The caller may not use this provider: no such row, or a plugin row none of the caller's enabled installs
 *  contributes (D147). One refusal for both, so another user's plugin provider has no existence oracle. */
export class ProviderUnknownError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.providerUnknown;
  constructor(providerId: string) {
    super(CONNECTION_OP_CODES.providerUnknown, `"${providerId}" is not a registered provider.`);
  }
}

export class ConnectionNotFoundError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.notFound;
  constructor(connectionId: UserConnectionId) {
    super(CONNECTION_OP_CODES.notFound, `connection ${connectionId} not found`);
  }
}
