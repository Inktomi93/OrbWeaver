// domain/admin/contract/views — admin read-models, consumed by the client via tRPC inference, not a deep
// import — so they stay here, not in @orb/contracts.
// FLAG[admin-view-stays-local]: AdminUserView stays here rather than @orb/contracts/identity — promote it
// only if the client ever deep-imports the shape instead of reading it through tRPC inference.

import type { UserKind, UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";

/** Never carries passwordHash or any secret column. ownerHandle names an agent's owner — null for humans. */
export interface AdminUserView {
  readonly id: UserId;
  readonly handle: Handle;
  readonly externalId: ExternalId | null;
  readonly role: UserRole;
  readonly enabled: boolean;
  readonly kind: UserKind;
  readonly ownerHandle: Handle | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// Reconciled against domain/sessions' canonical SessionView (packages/contracts/src/session/index.ts).
export interface SessionAdminView {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly expiresAt: number;
  readonly lastSeenAt: number;
  readonly revokedAt: number | null;
  readonly userAgent: string | null;
  readonly createdAt: number;
}
