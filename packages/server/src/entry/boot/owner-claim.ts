// The oidc boot step that hands the owner claim URL to the operator (D258, D289). An OWNER_HANDLES handle match claims
// the owner only from a loopback callback or with this code, so this is how an owner behind a proxy or a published
// port claims the box. SECURITY: the URL goes to an owner-only file and the log names only the command that reads it.

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import { fileReadCommand } from "#foundation/env";
import { superviseDetached } from "#foundation/observability";
import type { OwnerClaimCode } from "#infra/auth";
import { removeSecretFile, writeSecretFile } from "#infra/crypto";
import { ownerClaimLoginUrl } from "../http/index.ts";

/** What {@link announceOwnerClaim} reads, where it writes the URL, and where it prints the read command. */
export interface OwnerClaimAnnouncement {
  readonly log: { readonly warn: (fields: Record<string, unknown>, msg: string) => void };
  readonly sessions: Pick<SessionsService, "loadUserById">;
  /** The owner row boot found, if any. */
  readonly ownerId: UserId | undefined;
  readonly ownerClaim: OwnerClaimCode;
  /** `OIDC_REDIRECT_URIS`: the first http(s) entry's origin is where the claim URL points. */
  readonly redirectAllowlist: readonly string[];
  /** The owner claim URL's file under the data layout's `secrets/` slot. */
  readonly claimUrlFile: string;
  /** Picks the container or the bare-metal spelling of the command that reads the file. */
  readonly inContainer: boolean;
}

/**
 * While the owner is unclaimed (no owner row, or one with no subject), issue the claim code, write its URL to the
 * claim file and log the command that reads it. A claimed owner gets no code, and a claim file left by an earlier
 * boot is removed.
 */
export async function announceOwnerClaim(step: OwnerClaimAnnouncement): Promise<void> {
  const owner = step.ownerId === undefined ? null : await step.sessions.loadUserById(step.ownerId);
  if (owner !== null && owner.externalId !== null) {
    await removeSecretFile(step.claimUrlFile);
    return;
  }
  const code = step.ownerClaim.issue();
  const ownerClaimUrl = ownerClaimLoginUrl(step.redirectAllowlist, code) ?? `/api/auth/oidc/login?ownerClaim=${code}`;
  await writeSecretFile(step.claimUrlFile, `${ownerClaimUrl}\n`);
  const ownerClaimFile = resolve(step.claimUrlFile);
  step.log.warn(
    { ownerClaimFile },
    `boot(oidc): the owner is unclaimed. Read the one-time owner claim URL with \`${fileReadCommand(step.inContainer, ownerClaimFile)}\` and sign in as the owner through it to claim the box. It works once, a restart writes a new one, and this log never carries it. An OWNER_HANDLES handle match alone does not claim the owner from off this machine`,
  );
}

/** `claim` whose spending callback also removes the claim file, so the file never outlives the code it holds. */
export function removeOwnerClaimFileOnSpend(claim: OwnerClaimCode, claimUrlFile: string): OwnerClaimCode {
  return {
    ...claim,
    redeem: (state: string): boolean => {
      const spent = claim.redeem(state);
      if (spent) {
        superviseDetached(`owner-claim-file:${randomUUID()}`, "ownerClaim.removeFile", {}, () => removeSecretFile(claimUrlFile));
      }
      return spent;
    },
  };
}
