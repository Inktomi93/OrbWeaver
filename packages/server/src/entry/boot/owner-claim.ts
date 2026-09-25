// The oidc boot step that prints the owner claim URL (D258). An OWNER_HANDLES handle match claims the owner only from a
// loopback callback or with this code, so this line is how an owner behind a proxy or a published container port
// claims the box. It prints only while the owner is unclaimed, so a claimed box logs no secret.

import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import type { OwnerClaimCode } from "#infra/auth";
import { ownerClaimLoginUrl } from "../http/index.ts";

/** What {@link announceOwnerClaim} reads and where it prints. */
export interface OwnerClaimAnnouncement {
  readonly log: { readonly warn: (fields: Record<string, unknown>, msg: string) => void };
  readonly sessions: Pick<SessionsService, "loadUserById">;
  /** The owner row boot found, if any. */
  readonly ownerId: UserId | undefined;
  readonly ownerClaim: OwnerClaimCode;
  /** `OIDC_REDIRECT_URIS`: the first http(s) entry's origin is where the claim URL points. */
  readonly redirectAllowlist: readonly string[];
}

/** While the owner is unclaimed (no owner row, or one with no subject), issue the claim code and print its URL. */
export async function announceOwnerClaim(step: OwnerClaimAnnouncement): Promise<void> {
  const owner = step.ownerId === undefined ? null : await step.sessions.loadUserById(step.ownerId);
  if (owner !== null && owner.externalId !== null) {
    return;
  }
  const code = step.ownerClaim.issue();
  const ownerClaimUrl = ownerClaimLoginUrl(step.redirectAllowlist, code) ?? `/api/auth/oidc/login?ownerClaim=${code}`;
  step.log.warn(
    { ownerClaimUrl },
    "boot(oidc): the owner is unclaimed. Sign in as the owner at this URL to claim the box; it works once, and a restart prints a new one. An OWNER_HANDLES handle match alone does not claim the owner from off this machine",
  );
}
