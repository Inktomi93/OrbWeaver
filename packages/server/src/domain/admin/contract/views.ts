// domain/admin/contract/views — admin read-models, consumed by the client via tRPC inference, not a deep
// import — so they stay here, not in @orb/contracts.
// FLAG[PD-2]: promote AdminUserView to @orb/contracts/identity iff the client ever deep-imports the shape.

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

// FLAG[PD-6]: when domain/sessions lands its canonical session view, reconcile this port view against it.
export interface SessionAdminView {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly expiresAt: number;
  readonly lastSeenAt: number;
  readonly revokedAt: number | null;
  readonly userAgent: string | null;
  readonly createdAt: number;
}

// Declared here because infra's EngineStatusRecord vocab never crosses the providers boundary.
export interface AdminEngineStatus {
  readonly status: string;
  readonly detail: string;
  readonly updatedAt: number;
}
