// domain/plugin/substrate/distribution — the ONE per-recipient half of every fan-out (D147 clause (d)).
// Both admin distribution verbs and the self-scoped new-user application funnel through here, so "what a
// distributed copy looks like when it lands" is decided in exactly one place.
//
// THE CONSENT POSTURE IS THE SEEDER'S, VERBATIM, and it is the load-bearing part. A distributed copy is a row
// the recipient never asked for, so it lands INSTALLED, DISABLED, with ZERO granted capabilities and a
// standing re-consent ask — able to do literally nothing until that person reads what it wants and allows it.
// That is TWO verb calls, not one, for the same reason the example seeder is: `install` with an empty grant
// records the row, and `setGrant` with an empty grant is what raises the standing "this plugin is asking for
// capabilities you have not allowed" state the client's consent affordance is gated on.
//
// NOTHING HERE IS A SECOND INSTALL PATH. It drives the REAL `install`/`setGrant` verbs under the RECIPIENT's
// own Principal, so a distributed bundle meets the same unzip hardening, the same manifest validation, the
// same CAS store and the same `(owner, slug)` UNIQUE as a hand upload — and the copy is owned, and later
// enabled, by the person it belongs to (D147 clause (b): enabling runs guest code as the enabler, so it can
// never be performed on someone's behalf).

import type { Principal } from "@orb/contracts/identity";
import type { DistributionInstallDeps, PluginContext } from "../contract/service.ts";
import { getByOwnerSlug } from "../persistence/plugins.ts";

/** Does `recipient` already hold `slug`, at ANY version? A distribution never overwrites a row a person
 *  already has — theirs may be newer, older, or simply their own choice, and all three are theirs. */
export async function alreadyHolds(ctx: PluginContext, recipient: Principal, slug: string): Promise<boolean> {
  return (await getByOwnerSlug(ctx.db, recipient.userId, slug)) !== undefined;
}

/** Land ONE distributed copy for ONE recipient, consent-first (see the header). Throws whatever the real
 *  install verb throws — a fan-out that swallowed a refusal would report a user as served who is not. */
export async function installDistributedCopy(deps: DistributionInstallDeps, recipient: Principal, bundle: Uint8Array): Promise<void> {
  const installed = await deps.install({ caller: recipient, bundle, grant: [] });
  // The second half of the posture: raise the standing ask. Deliberately not folded into `install` — a fresh
  // install has nothing to re-consent to, which is right for a person who just chose a grant against the
  // manifest and exactly wrong for a row they never asked for. `acknowledgedNetHosts` is `[]` because the
  // echo gate only runs when the grant includes `net.fetch`, and this grant is empty.
  await deps.setGrant({ caller: recipient, pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });
}
