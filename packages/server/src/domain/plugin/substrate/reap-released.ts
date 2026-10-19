// The reap of assets a plugin verb has just released. A reap only ever deletes, so skipping one keeps bytes and
// fails safe; a refused reference walk or a store fault must never abort a verb whose own transition has landed.

import { errorMessage } from "@orb/kit/error-message";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { PluginContext } from "../contract/service.ts";

/** Reap `assetIds` without throwing. A failed reap is logged with `failure`, the verb error the reap is cleaning
 *  up after, so that error stays the one the caller sees. A skipped id stays until the scheduled assets-gc
 *  sweep can read every reference cleanly. */
export async function reapReleasedAssets(
  ctx: Pick<PluginContext, "assets">,
  plugin: { readonly pluginId: PluginId } | { readonly slug: string },
  assetIds: readonly AssetId[],
  failure?: unknown,
): Promise<void> {
  try {
    await ctx.assets.reapOrphans(assetIds);
  } catch (reapErr) {
    getLog().warn(
      { ...plugin, assetIds, reapError: errorMessage(reapErr), ...(failure === undefined ? {} : { verbError: errorMessage(failure) }) },
      "plugin: released assets were kept because their reap failed; the scheduled assets-gc sweep collects them once every reference reads cleanly",
    );
  }
}
