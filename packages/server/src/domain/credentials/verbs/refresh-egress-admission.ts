// verb: refreshEgressAdmission — republish the SSRF egress belt's owner-saved endpoint admissions from the
// store. Param-free and principal-free: the scope is the OWNER row, resolved inside the derivation
// (`substrate/egress-admission.ts`), never the caller.
//
// ITS CALLER IS BOOT. `entry/lifecycle.ts` calls it once after compose, because the belt is installed
// BEFORE the db exists (it is the first boot step) and its owner-saved set would otherwise stay empty until
// the owner's next credential write — i.e. a restart would re-break every saved LAN/loopback connection.
// The write verbs (`add`/`remove`) re-derive inline rather than through this verb: a verb may not import a
// sibling verb's value (`domain-verb-isolation`), so the substrate is the shared home.

import type { CredentialContext } from "../context.ts";
import type { CredentialsService } from "../contract/service.ts";
import { republishOwnerSavedEndpoints } from "../substrate/egress-admission.ts";

export function createRefreshEgressAdmission(ctx: CredentialContext): CredentialsService["refreshEgressAdmission"] {
  return (): Promise<void> => republishOwnerSavedEndpoints(ctx);
}
