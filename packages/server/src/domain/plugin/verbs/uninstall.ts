// verb: uninstall — remove an installed plugin. Authority = OWNERSHIP (D147): the owner-scoped row load IS
// the gate (a foreign row is a leak-free NotFound); no admin any-row branch. Order:
// deactivate (dispose the resident instance + deregister its tools/transforms/subs — no ghost registrations)
// → READ the fetched-asset links → delete the row (`plugin_kv` + `plugin_assets` CASCADE off the FK) → reap the
// now-unreferenced bundle asset AND every cover this plugin fetched. The bundle FK is ON DELETE RESTRICT, so
// the row MUST go before the asset can be reaped (`reapIfOrphan` re-checks references — a within-user dedup
// that shares the asset with another plugin is never reaped). The fetched-asset read must PRECEDE the delete:
// the cascade takes the only record of which assets this install was retaining (#802).

import { PluginNotFoundError } from "../contract/errors.ts";
import type { UninstallPluginParams } from "../contract/params.ts";
import type { ActivationDeps, PluginContext, PluginService } from "../contract/service.ts";
import { listPluginFetchedAssetIds } from "../persistence/plugin-assets.ts";
import { deletePlugin, getById } from "../persistence/plugins.ts";
import { refreshConsentPrompt } from "../substrate/consent-prompt.ts";

export function createUninstall(ctx: PluginContext, deps: Pick<ActivationDeps, "deactivate">): PluginService["uninstall"] {
  return async ({ caller, pluginId }: UninstallPluginParams): Promise<void> => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }

    await deps.deactivate(pluginId);
    // READ BEFORE THE DELETE: the `plugin_assets` links CASCADE away with the row, so after `deletePlugin`
    // there is nothing left to name — the ids would survive only as blobs waiting for the scheduled sweep.
    const fetched = await listPluginFetchedAssetIds(ctx.db, pluginId);
    await deletePlugin(ctx.db, pluginId);
    // The bundle (RESTRICT — the row had to go first) plus every cover this plugin fetched (#802), now
    // unreferenced by the same delete. `reapIfOrphan` re-checks the whole registry per id, so a within-user
    // dedup that another plugin (or a character avatar) still shares is left alone.
    await ctx.assets.reapOrphans([existing.bundleAssetId, ...fetched]);
    // Removing a plugin ANSWERS its ask by withdrawing the question (#1041): the row is gone, so the
    // aggregate must not keep counting it — and when it was the last one standing, the ask is retracted
    // rather than left pointing at a screen with nothing to answer. Never `raised`: an uninstall can only
    // lower the count, so the standing row is corrected in place and the bell does not re-badge.
    await refreshConsentPrompt(ctx, caller.userId, false);
  };
}
