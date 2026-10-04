// domain/connection/contract/errors — the typed connection errors. The `code` strings live in
// `@orb/contracts/inference` (`CONNECTION_OP_CODES`), because the client keys on them (no inline re-spell,
// §7.5); every reader imports them from there.

import type { EmbedWidthRefusalDetail } from "@orb/contracts/inference";
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

/** A write that would move the caller's index onto an embedder whose vectors are not the width its connection
 *  states. The write is undone before this is thrown, so nothing was rebuilt or deleted. */
export class EmbedWidthUnmakeableError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.embedWidthUnmakeable;
  constructor(width: EmbedWidthRefusalDetail) {
    super(
      CONNECTION_OP_CODES.embedWidthUnmakeable,
      `The model makes ${String(width.measured)}-wide vectors, not the ${String(width.stated)} its connection states.`,
      { stated: width.stated, measured: width.measured },
    );
  }
}

export class ConnectionNotFoundError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.notFound;
  constructor(connectionId: UserConnectionId) {
    super(CONNECTION_OP_CODES.notFound, `connection ${connectionId} not found`);
  }
}
