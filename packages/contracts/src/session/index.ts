// Browser-session views, not agent-SDK prompt-cache lineage. Tokens, token hashes and sealed OIDC
// credentials never cross this boundary. Only the admin view carries the queried user's id.

import type { SessionId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** One browser-session row as exposed to the admin device list. `revokedAt` is `null` while the device
 *  is live. Deliberately secret-free: no `tokenHash`/token/pepper/`userId`, and no `oidcIdToken*` column
 *  (that sealed blob has exactly ONE reader — the logout revoke — and is never projected). */
export interface SessionView {
  id: SessionId;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string | null;
}

/** The secret-free session view, stamped with the user the admin asked for. */
export interface SessionAdminView extends Readonly<SessionView> {
  readonly userId: UserId;
}

// `.readonly()` keeps the wire type's readonly fields: the device list narrows `revokedAt` through a const alias,
// which TypeScript honours only on a readonly property.
export const sessionAdminViewSchema = z
  .strictObject({
    id: typeIdSchema(ID_PREFIX.session),
    userId: brandedId("UserId"),
    expiresAt: z.number(),
    lastSeenAt: z.number(),
    revokedAt: z.number().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.number(),
  })
  .readonly() satisfies z.ZodType<SessionAdminView>;
