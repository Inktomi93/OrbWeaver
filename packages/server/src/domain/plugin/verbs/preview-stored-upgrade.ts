// verb: previewStoredUpgrade — the review step before a stored-source upgrade. It fetches the row's REMEMBERED
// source (a `url` row's bundle URL, or a `git` row's repository through the clone guard), parses the bytes
// through the install funnel, and returns what applying them would change plus the identity the matching
// `upgradeFromStoredUrl` / `upgradeFromStoredGit` must echo. That echo is the binding: the upgrade re-fetches
// and refuses bytes or a commit other than the ones this preview showed, so the owner applies what they read.
//
// OWNER-SCOPED BEFORE ANY EGRESS, like every stored-source verb: a stranger holding a real pluginId is a
// leak-free NOT_FOUND before the server fetches that owner's remembered source. Writes nothing.

import { ManifestInvalidError, PluginDowngradeRefusedError, PluginNoSourceUrlError, PluginNotFoundError } from "../contract/errors.ts";
import type { PreviewStoredUpgradeParams } from "../contract/params.ts";
import type { PluginStoredUpgradeIdentity } from "../contract/results.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { cloneThroughGuard } from "../substrate/git-clone.ts";
import { manifestWidening } from "../substrate/grants.ts";
import { hashPluginBundle, isVersionDowngrade, parseBundle } from "../substrate/manifest.ts";

type StoredRow = NonNullable<Awaited<ReturnType<typeof getById>>>;

async function fetchStoredSource(ctx: PluginContext, row: StoredRow): Promise<{ readonly bundle: Uint8Array; readonly identity: PluginStoredUpgradeIdentity }> {
  if (row.origin === "git" && row.sourceUrl !== null) {
    const cloned = await cloneThroughGuard(ctx, row.sourceUrl);
    return { bundle: cloned.bundle, identity: { source: "git", sourceCommit: cloned.commit } };
  }
  if (row.origin === "url" && row.sourceUrl !== null) {
    const bundle = await ctx.fetchBundle(row.sourceUrl);
    return { bundle, identity: { source: "url", bundleHash: hashPluginBundle(bundle) } };
  }
  throw new PluginNoSourceUrlError(row.id);
}

export function createPreviewStoredUpgrade(ctx: PluginContext): PluginService["previewStoredUpgrade"] {
  return async ({ caller, pluginId }: PreviewStoredUpgradeParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    const fetched = await fetchStoredSource(ctx, existing);
    const { manifest } = parseBundle(fetched.bundle);
    // The same two refusals `upgrade` makes, so the owner is never shown a version the apply step would refuse.
    if (manifest.id !== existing.slug) {
      throw new ManifestInvalidError(`bundle slug "${manifest.id}" does not match the installed plugin "${existing.slug}"`);
    }
    if (isVersionDowngrade(manifest.version, existing.version)) {
      throw new PluginDowngradeRefusedError(manifest.version, existing.version);
    }
    return {
      pluginId,
      fromVersion: existing.version,
      toVersion: manifest.version,
      shipsUiScript: { before: existing.manifest.uiEntry !== undefined, after: manifest.uiEntry !== undefined },
      widening: manifestWidening(existing, manifest),
      identity: fetched.identity,
    };
  };
}
