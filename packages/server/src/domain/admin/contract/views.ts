// domain/admin/contract/views — admin read-models, consumed by the client via tRPC inference, not a deep
// import — so they stay here, not in @orb/contracts. Each strict schema is its procedure's tRPC output parser:
// an extra key fails the call instead of reaching the browser.
// FLAG[admin-view-stays-local]: AdminUserView stays here rather than @orb/contracts/identity — promote it
// only if the client ever deep-imports the shape instead of reading it through tRPC inference.

import type { UserKind, UserRole, UserRoleState } from "@orb/contracts/identity";
import { userKindSchema, userRoleSchema } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

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

/** Resolved server data is not the wire role string. */
export interface AdminUserData extends Omit<AdminUserView, "role"> {
  readonly role: UserRoleState;
}

export const adminUserViewSchema = z.strictObject({
  id: brandedId<UserId>(),
  handle: brandedId<Handle>(),
  externalId: brandedId<ExternalId>().nullable(),
  role: userRoleSchema,
  enabled: z.boolean(),
  kind: userKindSchema,
  ownerHandle: brandedId<Handle>().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<AdminUserView>;

/** The secret-free session view, stamped with the user the admin asked for. */
export interface SessionAdminView extends Readonly<SessionView> {
  readonly userId: UserId;
}

// `.readonly()` keeps the wire type's readonly fields: the device list narrows `revokedAt` through a const alias,
// which TypeScript honours only on a readonly property.
export const sessionAdminViewSchema = z
  .strictObject({
    id: typeIdSchema(ID_PREFIX.session),
    userId: brandedId<UserId>(),
    expiresAt: z.number(),
    lastSeenAt: z.number(),
    revokedAt: z.number().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.number(),
  })
  .readonly() satisfies z.ZodType<SessionAdminView>;
