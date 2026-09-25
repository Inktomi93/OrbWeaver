// The share preconditions as one ordered decision: a sign-in mode a relayed visitor can use, a relay binary this
// process can run, then (local only) a claimed owner. The first failing one is the refusal, naming its fix.

import type { ShareRefusal, ShareRefusalNotice } from "@orb/contracts/identity";
import { CONTAINER_SHARE_GUIDE, SHARE_MODE_REFUSAL } from "@orb/contracts/identity";
import type { ShareFacts } from "../contract/service.ts";

// Where an oidc box's friends already join: the addresses its identity provider returns people to.
function oidcAddress(facts: ShareFacts): string {
  return facts.publicAddresses.length === 0 ? "the address in OIDC_REDIRECT_URIS" : facts.publicAddresses.join(" or ");
}

// Each refusal's sentence; the unclaimed-owner one names this machine's setup address, the oidc one the public address.
function message(code: ShareRefusal, facts: ShareFacts): string {
  switch (code) {
    case "share_single_user":
      return "Sharing needs a sign-in: under single-user every visitor who comes through the relay is refused. Switch to the local sign-in mode (pnpm start --share does it) and start sharing again.";
    case "share_forward_header":
      return "A relay on this machine delivers every visitor from a loopback address, and forward-header mode trusts a loopback proxy to name the user, so a visitor could claim any account. Friends reach this server through your proxy instead.";
    case "share_oidc":
      return `Your identity provider sends people back only to the addresses registered with it, and a relay's random name is never one of them, so no one could sign in through it. Friends join at ${oidcAddress(facts)} with an invite link.`;
    case "share_in_container":
      return `This server runs in a container, which carries no relay, so it cannot share from here. Run a Cloudflare tunnel as a container beside it instead (${CONTAINER_SHARE_GUIDE}).`;
    case "share_owner_unclaimed":
      return `The owner has no password yet, so a shared link would let a stranger reach an unclaimed box. Open ${facts.localSetupUrl()} on this machine, finish setup, then start sharing.`;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function refusal(code: ShareRefusal, facts: ShareFacts): ShareRefusalNotice {
  return { code, message: message(code, facts) };
}

/** The first unmet precondition known without a read: the sign-in mode, then the container. The status carries it, so
 *  the card shows a refusal no start could get past before anyone presses Start. */
export function standingShareRefusal(facts: ShareFacts): ShareRefusalNotice | null {
  const modeRefusal = SHARE_MODE_REFUSAL[facts.authMode];
  if (modeRefusal !== null) {
    return refusal(modeRefusal, facts);
  }
  return facts.inContainer ? refusal("share_in_container", facts) : null;
}

/** The first unmet precondition, or null when a share may start. `ownerNeedsPassword` is the pending read of the owner
 *  row; it is awaited only under `local`, the one mode with a first-run claim. */
export async function shareRefusal(facts: ShareFacts): Promise<ShareRefusalNotice | null> {
  const standing = standingShareRefusal(facts);
  if (standing !== null) {
    return standing;
  }
  if (facts.authMode === "local" && (await facts.ownerNeedsPassword())) {
    return refusal("share_owner_unclaimed", facts);
  }
  return null;
}
