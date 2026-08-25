// verb: applyDistributedPlugins — the NEW-USER half of the fan-out (D147 clause (d)). A user created AFTER a
// bundle was published never appeared in that publish's recipient list, so the entry hook drives this once per
// user (the `ensureSeeded` precedent) and the published set reaches them too.
//
// AUTHORITY = SELF, and deliberately so: it installs for the CALLER and nobody else, takes no id, and reads a
// set that is deployment policy rather than anyone's data. There is no admin gate here because there is no
// admin question — the escalation risk in this whole area is cross-owner action, and this verb can only ever
// touch the caller's own rows. It lands each copy in the same consent-first posture the publish does
// (disabled, zero grant, standing ask), so arriving at a populated pane never means arriving at a running one.
//
// IDEMPOTENT BY SLUG: a slug the caller already holds at ANY version is skipped, so a double-drive mints
// nothing and a user who UNINSTALLED a distributed plugin only stays free of it because of the entry-side
// latch (`UserSettings.onboarding.distributedPluginsApplied` — the deletion-respect guard, exactly as the
// example seeder's latch is). This verb is the braces; that latch is the belt.
//
// THE BYTES ARE READ CROSS-OWNER, on purpose and narrowly: the published bundle is an asset in the PUBLISHING
// ADMIN's CAS, and the recipient is someone else. It is legitimate because the asset id never comes from a
// caller — it comes from the distribution record an admin wrote — and because the recipient's own `install`
// immediately stores its OWN copy (D21: no shared bytes), so nothing cross-owner survives the call. The seam
// is `PluginDistributionDeps.readPublishedBundle`, separate from `ctx.assets.readBytes` so the ordinary
// owner-gated read is not quietly widened.

import type { ApplyDistributedPluginsParams } from "../contract/params.ts";
import type { DistributionInstallDeps, PluginContext, PluginDistributionDeps, PluginService } from "../contract/service.ts";
import { listDistributions } from "../persistence/distributed-plugins.ts";

import { alreadyHolds, installDistributedCopy } from "../substrate/distribution.ts";

export function createApplyDistributedPlugins(
  ctx: PluginContext,
  deps: PluginDistributionDeps & DistributionInstallDeps,
): PluginService["applyDistributedPlugins"] {
  return async ({ caller }: ApplyDistributedPluginsParams) => {
    const records = await listDistributions(ctx.db);
    const installedSlugs: string[] = [];
    const skippedSlugs: string[] = [];
    // Serial: the set is small (a deployment publishes a handful), and each iteration is a bundle read plus a
    // CAS write plus two verb calls — the install fan-out's reasoning, at the other axis.
    for (const record of records) {
      // biome-ignore lint/performance/noAwaitInLoops: serial by design — see the comment above the loop.
      const held = await alreadyHolds(ctx, caller, record.slug);
      if (held) {
        skippedSlugs.push(record.slug);
        continue;
      }
      const bundle = await deps.readPublishedBundle(record.bundleAssetId);
      await installDistributedCopy(deps, caller, bundle);
      installedSlugs.push(record.slug);
    }
    return { installedSlugs, skippedSlugs };
  };
}
