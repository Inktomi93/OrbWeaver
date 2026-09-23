// domain/connection/contract/errors — the typed connection errors. The `code` strings live in
// `@orb/contracts/inference` (`CONNECTION_OP_CODES`), because the client keys on them (no inline re-spell,
// §7.5); every reader imports them from there.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserConnectionId } from "@orb/kit/ids";

export class ConnectionNotFoundError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.notFound;
  constructor(connectionId: UserConnectionId) {
    super(CONNECTION_OP_CODES.notFound, `connection ${connectionId} not found`);
  }
}
