// verb: uninstallForAllUsers — withdraw a published plugin (D147 clause (d)). The mirror of the install
// fan-out: drop the distribution record so no future user receives it, and run the REAL per-user uninstall
// for every recipient still holding the distributed copy — each under THEIR OWN Principal, so the owner-scoped
// row load is still the gate and no cross-owner management branch exists anywhere in this path.
//
// THE DIVERGENCE POLICY IS SLUG **AND VERSION** (decided at build; the ruling left it to the builder). A row
// whose `version` differs from the distributed one is a plugin that person has taken over — they upgraded it
// themselves, or they had installed their own copy before the distribution ever reached them. Withdrawing a
// deployment default must not delete a thing somebody chose, so those rows are SKIPPED, and reported: "three
// users still have this" is exactly the fact an admin who just withdrew a plugin needs, and a silent skip
// would leave them believing it is gone everywhere.
//
// A user who never held the slug is not a skip and not an error — there is nothing to withdraw from them, so
// they are simply not counted. `skipped` stays a list of DECISIONS, not of non-events.
//
// GRANTS ON SURVIVING ROWS ARE NEVER TOUCHED. The only writes here are the record delete and the real
// uninstall (deactivate → delete row → reap the bundle asset); a diverged row is read and left alone.

import { PluginNotDistributedError } from "../contract/errors.ts";
import type { UninstallForAllUsersParams } from "../contract/params.ts";
import type { PluginFanoutSkip } from "../contract/results.ts";
import type { PluginContext, PluginDistributionDeps, PluginService } from "../contract/service.ts";
import { deleteDistribution, getDistribution } from "../persistence/distributed-plugins.ts";
import { getByOwnerSlug } from "../persistence/plugins.ts";

export function createUninstallForAllUsers(
  ctx: PluginContext,
  deps: PluginDistributionDeps & { readonly uninstall: PluginService["uninstall"] },
): PluginService["uninstallForAllUsers"] {
  return async ({ caller, slug }: UninstallForAllUsersParams) => {
    deps.requireAdmin(caller);
    // Read the record FIRST: its `version` is the divergence oracle, and deleting it before the fan-out would
    // destroy the only statement of what "the distributed copy" was.
    const record = await getDistribution(ctx.db, slug);
    if (record === undefined) {
      throw new PluginNotDistributedError(slug);
    }

    const recipients = await deps.listRecipients(caller);
    const skipped: PluginFanoutSkip[] = [];
    let applied = 0;
    // Serial for the same reason the install fan-out is: one sqlite file, and each iteration deactivates a
    // resident instance, deletes a row and reaps a CAS asset.
    for (const recipient of recipients) {
      const row = await getByOwnerSlug(ctx.db, recipient.userId, slug);
      if (row === undefined) {
        continue;
      }
      if (row.version !== record.version) {
        skipped.push({ userId: recipient.userId, userHandle: recipient.handle, reason: "version-diverged" });
        continue;
      }
      // The REAL uninstall, as its OWNER — never an admin any-row path.
      await deps.uninstall({ caller: recipient, pluginId: row.id });
      applied += 1;
    }

    // Last, so a throw mid-fan-out leaves the record standing and the withdrawal re-runnable (the install
    // fan-out's resume posture, in the other direction).
    await deleteDistribution(ctx.db, slug);
    return { slug: record.slug, name: record.name, version: record.version, applied, skipped };
  };
}
