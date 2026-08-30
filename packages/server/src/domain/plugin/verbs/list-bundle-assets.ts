// verb: listBundleAssets — the path → CAS-id map for ONE owned plugin's bundle-shipped images (#820 seam 11).
// It is what turns a UI node's `bundleAsset: "ui/assets/happy.png"` into an `assetId` the renderer can hand to
// the owner-scoped `assets.resolveBlobRefs`; the guest never learns an id, and the SPEC never carries one.
//
// AUTHORITY = OWNERSHIP, the same single gate every per-row plugin verb uses (D147): the
// `getById(db, caller.userId, pluginId)` load IS the decision, so a foreign or absent pluginId is a leak-free
// `PluginNotFoundError` and not an existence oracle. That load is also why the projected ids are safe — the
// map that comes back is, by construction, the asker's own plugin's own assets in the asker's own CAS.
//
// THE IDS ARE NOT A CAPABILITY, which is what keeps this read cheap to reason about. An `AssetId` buys nothing
// on its own: the blob route is keyed by HASH and the id→hash resolve (`assets.resolveBlobRefs`) puts the
// SESSION owner in its WHERE. So even a leaked id from this map would resolve to nothing for anyone else, and
// the wall the `image` node has always had — "a foreign id yields no ref and paints the placeholder" — is
// unchanged by the bundle arm. This verb adds a NAME lookup, not a new trust.
//
// It deliberately does NOT gate on `status`: a disabled plugin registers no surfaces, so nothing asks — and
// making the map disappear on toggle-off would only mean a surface that was mid-render paints placeholders
// instead of art, with no security difference (the ids were already the caller's own).

import { PluginNotFoundError } from "../contract/errors.ts";
import type { ListBundleAssetsParams } from "../contract/params.ts";
import type { PluginContext, PluginService } from "../contract/service.ts";
import { listPluginBundleAssets } from "../persistence/plugin-assets.ts";
import { getById } from "../persistence/plugins.ts";

export function createListBundleAssets(ctx: PluginContext): PluginService["listBundleAssets"] {
  return async ({ caller, pluginId }: ListBundleAssetsParams) => {
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    return await listPluginBundleAssets(ctx.db, pluginId);
  };
}
