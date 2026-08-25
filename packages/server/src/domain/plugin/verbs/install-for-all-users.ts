// verb: installForAllUsers — the SERVER-WIDE install, resolved as an ADMIN-TRIGGERED FAN-OUT OF PER-USER
// ROWS (D147 clause (d), owner-ruled 2026-08-24). There is no shared row, no shared principal and no consent
// junction: the deployment PUBLISHES a bundle, and every user gets their own ordinary `plugins` row that runs
// under them when THEY turn it on. The two questions D147 recorded as open — per-user consent over a shared
// install, and whose principal a shared install runs as — dissolve rather than get answered.
//
// AUTHORITY = GLOBAL ADMIN, and this is the ONE legitimately admin verb in this domain. It does NOT relax
// clause (a): the per-row management verbs still have no `can` seam and still decide on the owner-scoped row
// load alone. The gate arrives through `PluginDistributionDeps.requireAdmin`, scoped to the distribution
// verbs.
//
// WHY THAT IS SAFE WHERE AN "ADMIN MAY MANAGE ANY ROW" BRANCH IS NOT — the distinction is the whole ruling.
// A cross-owner ENABLE would run one user's untrusted guest bundle under another user's identity, credential
// and room reach (the bridge closes over the enabling caller), so the escalation is IN the act and no role is
// senior enough to perform it. This verb performs no such act: it only MINTS rows that are disabled, granted
// nothing, and standing a consent ask. It runs no guest code, spends nothing, and never touches an EXISTING
// row's consent, grant or status — a user who already holds the slug is skipped entirely, their row untouched.
// Force-enable is therefore not merely unimplemented here; it is unbuildable without reopening clause (b).
//
// FLOW: admin gate → `parseBundle` ONCE (a bad zip/manifest is refused before anything is written, so a
// failed publish leaves no record and no partial fan-out) → store the published bytes in the ADMIN's CAS →
// upsert the distribution record → fan out one real install per existing user.
//
// A FAILED FAN-OUT IS RESUMED BY RE-PUBLISHING, not by a heal path. A recipient install that throws aborts
// the call with the record already written; re-running the same publish skips every recipient already served
// (the `already-installed` arm) and completes the rest. That is why the skip arm is a reported outcome rather
// than an error — it is also the retry mechanism.

import type { InstallForAllUsersParams } from "../contract/params.ts";
import type { PluginFanoutSkip } from "../contract/results.ts";
import type { PluginContext, PluginDistributionDeps, PluginService } from "../contract/service.ts";
import { upsertDistribution } from "../persistence/distributed-plugins.ts";
import type { DistributionInstallDeps } from "../substrate/distribution.ts";
import { alreadyHolds, installDistributedCopy } from "../substrate/distribution.ts";
import { PLUGIN_BUNDLE_MIME, parseBundle } from "../substrate/manifest.ts";

export function createInstallForAllUsers(ctx: PluginContext, deps: PluginDistributionDeps & DistributionInstallDeps): PluginService["installForAllUsers"] {
  return async ({ caller, bundle }: InstallForAllUsersParams) => {
    deps.requireAdmin(caller);
    // Validate the untrusted bytes ONCE, for the whole deployment, before a single row moves.
    const { manifest } = parseBundle(bundle);

    const stored = await ctx.assets.store(caller, bundle, PLUGIN_BUNDLE_MIME);
    await upsertDistribution(ctx.db, {
      slug: manifest.id,
      name: manifest.name,
      version: manifest.version,
      bundleAssetId: stored.assetId,
      distributedBy: caller.userId,
      now: ctx.now(),
    });

    const recipients = await deps.listRecipients(caller);
    const skipped: PluginFanoutSkip[] = [];
    let applied = 0;
    // THE FAN-OUT IS DELIBERATELY SERIAL: each iteration is a CAS write plus two verb calls against one sqlite
    // file, so a Promise.all over every account on the box would turn a publish into a write storm — and a
    // serial loop keeps a mid-fan-out failure legible (see the header's resume note).
    for (const recipient of recipients) {
      // biome-ignore lint/performance/noAwaitInLoops: serial by design — see the comment above the loop.
      const held = await alreadyHolds(ctx, recipient, manifest.id);
      if (held) {
        skipped.push({ userId: recipient.userId, userHandle: recipient.handle, reason: "already-installed" });
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: serial by design — see the comment above the loop.
      await installDistributedCopy(deps, recipient, bundle);
      applied += 1;
    }

    return { slug: manifest.id, name: manifest.name, version: manifest.version, applied, skipped };
  };
}
