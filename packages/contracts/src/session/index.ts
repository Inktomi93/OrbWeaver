// Browser-session views, not agent-SDK prompt-cache lineage. Tokens, token hashes and sealed OIDC
// credentials never cross this boundary. Only the admin view carries the queried user's id.

import type { ExternalId, SessionId, UserId } from "@orb/kit/ids";
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

/** Why a link claim bound nothing, read from settled durable state after the fact. `already-linked` = the row
 *  already carried exactly this subject (idempotent no-op); `not-found` = no such row; `target-bound` = the row
 *  is already bound to a DIFFERENT stable subject (bind-once refusal, never rebound); `subject-taken` = the
 *  subject already lives on another row. There is no `linked` arm: a bind that landed is reported by the claim
 *  statement's own non-empty `RETURNING`, never by a settlement read. */
export type UnclaimedLinkOutcome =
  | { readonly outcome: "already-linked"; readonly userId: UserId }
  | { readonly outcome: "not-found" }
  | { readonly outcome: "target-bound" }
  | { readonly outcome: "subject-taken" };

/** The sessions op that names a link refusal from settled state. It rethrows `failure` when durable state does
 *  not explain it, so a broken audit insert in the same batch surfaces as itself. */
export type SettleUnclaimedLink = (userId: UserId, externalId: ExternalId, failure?: unknown) => Promise<UnclaimedLinkOutcome>;

/** The current owner's id, or `undefined` before the first owner row exists. */
export type GetOwnerUserId = () => Promise<UserId | undefined>;

/** Is this a fresh local box whose owner row has no password yet (first-run setup pending)? */
export type OwnerNeedsPassword = () => Promise<boolean>;
