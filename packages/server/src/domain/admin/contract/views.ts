// domain/admin/contract/views — the admin read-models (what the client receives via tRPC service-method-
// signature inference; admin.md §"Public surface"). These are domain-internal: the client gets them by
// INFERENCE off the tRPC procedure return, NOT a deep import — so they stay here, not in `@orb/contracts`.
// FLAG[PD-2]: promote `AdminUserView` to `@orb/contracts/identity` IFF the client ever deep-imports the shape
// directly (admin.md open decision); inference-only keeps it domain-internal.

import type { UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";

/** A `users` row as the admin panel sees it — NEVER carries `passwordHash` or any secret column
 *  (invariant #5; `userCols` is the only projection that produces it). */
export interface AdminUserView {
  readonly id: UserId;
  readonly handle: Handle;
  readonly externalId: ExternalId | null;
  readonly role: UserRole;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One BFF session as the admin device-list surface sees it. Declared HERE as the slice admin consumes
 *  from `SessionAdminPort` (dependency inversion — admin owns the port's view shape). FLAG[PD-6]: when
 *  `domain/sessions` lands its canonical session view, reconcile this port view against it (the real
 *  `SessionsService` is structurally checked against `SessionAdminPort` at the composition root). */
export interface SessionAdminView {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly expiresAt: number;
  readonly lastSeenAt: number;
  readonly revokedAt: number | null;
  readonly userAgent: string | null;
  readonly createdAt: number;
}

/** One vLLM engine's status as the admin panel surfaces it — admin's OWN view, declared here because the
 *  infra `EngineStatusRecord` vocab is DELIBERATELY sealed inside `infra/providers` ("never crosses the
 *  providers boundary"). The composition root maps the supervisor's records into this view. */
export interface AdminEngineStatus {
  readonly status: string;
  readonly detail: string;
  readonly updatedAt: number;
}
