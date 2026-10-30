// The three owner-built statements D337 rules into admin's audited batches. Sessions builds each; admin places it
// in its batch and the composition root wires it, so these signatures are admin's own, over `@orb/db` handles.

import type { UserRole } from "@orb/contracts/identity";
import type { AwaitableStatementToken, StatementToken } from "@orb/db/wiring";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";

/** Revokes every live session of a user, unexecuted, so the kick commits with the privileged write. */
export type RevokeAllForUserStatement = (userId: UserId, revokedAt: number) => StatementToken;

/** Binds an external subject to a user, unexecuted; non-empty rows back means bound. */
export type LinkExternalIdStatement = (userId: UserId, externalId: ExternalId, at: number) => AwaitableStatementToken<{ id: UserId }[]>;

/** Inserts a local account, unexecuted; the handle key is derived by the builder. */
export type LocalUserInsertStatement = (row: {
  readonly id: UserId;
  readonly handle: Handle;
  readonly role: UserRole;
  readonly passwordHash: string;
  readonly at: number;
}) => AwaitableStatementToken<{ id: UserId }[]>;

export interface SessionStatementWiring {
  readonly revokeAllForUserStatement: RevokeAllForUserStatement;
  readonly linkExternalIdStatement: LinkExternalIdStatement;
  readonly localUserInsertStatement: LocalUserInsertStatement;
}
