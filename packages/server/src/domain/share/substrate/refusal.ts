// The share preconditions as one ordered decision: a sign-in mode a relayed visitor can use, a relay binary this
// process can run, then (local only) a claimed owner. The first failing one is the refusal, naming its fix.

import type { AuthMode, ShareRefusal } from "@orb/contracts/identity";
import type { ShareFacts, ShareRefusalNotice } from "../contract/service.ts";

// Per mode: null when a relayed visitor can sign in, else the refusal. Mapped over every mode so a new one fails tsc.
const MODE_REFUSAL: Record<AuthMode, ShareRefusal | null> = {
  "single-user": "share_single_user",
  "forward-header": "share_forward_header",
  local: null,
  oidc: null,
};

// Each refusal's sentence; only the unclaimed-owner one needs this machine's setup address.
function message(code: ShareRefusal, localSetupUrl: () => string): string {
  switch (code) {
    case "share_single_user":
      return "Sharing needs a sign-in: under single-user every visitor who comes through the relay is refused. Switch to the local sign-in mode (pnpm start --share does it) and start sharing again.";
    case "share_forward_header":
      return "A relay on this machine delivers every visitor from a loopback address, and forward-header mode trusts a loopback proxy to name the user, so a visitor could claim any account. Share under the local or oidc sign-in mode.";
    case "share_in_container":
      return "This server runs in a container, which carries no relay. Run the relay as a container beside this one instead.";
    case "share_owner_unclaimed":
      return `The owner has no password yet, so a shared link would let a stranger reach an unclaimed box. Open ${localSetupUrl()} on this machine, finish setup, then start sharing.`;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

function refusal(code: ShareRefusal, facts: ShareFacts): ShareRefusalNotice {
  return { code, message: message(code, facts.localSetupUrl) };
}

/** The first unmet precondition, or null when a share may start. `ownerNeedsPassword` is the pending read of the owner
 *  row; it is awaited only under `local`, the one mode with a first-run claim. */
export async function shareRefusal(facts: ShareFacts): Promise<ShareRefusalNotice | null> {
  const modeRefusal = MODE_REFUSAL[facts.authMode];
  if (modeRefusal !== null) {
    return refusal(modeRefusal, facts);
  }
  if (facts.inContainer) {
    return refusal("share_in_container", facts);
  }
  if (facts.authMode === "local" && (await facts.ownerNeedsPassword())) {
    return refusal("share_owner_unclaimed", facts);
  }
  return null;
}
