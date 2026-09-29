// verb: getFrameAsset — resolve one installed bundle image for an ACTIVE isolated frame.
//
// The browser contributes only `bundlePath`. Owner and plugin come from the active high-entropy frame handle
// at the HTTP edge; this verb rechecks the owned row, live ui.frame consent and resident instance on EVERY
// read, then resolves path -> assetId through plugin_assets. Disable/uninstall therefore revoke reads without
// waiting for the handle TTL, and upgrade removal makes an old path disappear immediately.

import { PLUGIN_UI_ASSET_ENTRY_RE, PLUGIN_UI_ASSET_MAX_BYTES } from "@orb/contracts/plugin";
import { sniffMime } from "@orb/kit/image-sniff";
import type { GetFrameAssetParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { getPluginBundleAssetId } from "../persistence/plugin-assets.ts";
import { getById } from "../persistence/plugins.ts";

export function createGetFrameAsset(ctx: PluginContext, registry: PluginRegistry): PluginService["getFrameAsset"] {
  return async ({ caller, pluginId, bundlePath }: GetFrameAssetParams) => {
    if (!PLUGIN_UI_ASSET_ENTRY_RE.test(bundlePath)) {
      return null;
    }
    const row = await getById(ctx.db, caller.userId, pluginId);
    if (row === undefined || !row.grantedCapabilities.includes("ui.frame") || !registry.has(pluginId)) {
      return null;
    }
    const assetId = await getPluginBundleAssetId(ctx.db, pluginId, bundlePath);
    if (assetId === undefined) {
      return null;
    }
    const asset = await ctx.assets.readBytes(caller, assetId);
    if (asset.bytes.byteLength > PLUGIN_UI_ASSET_MAX_BYTES) {
      return null;
    }
    const mime = sniffMime(asset.bytes);
    // `sniffMime`'s closed recognized vocabulary is exactly the four formats admitted at install. Recheck the
    // stored claim too: neither a corrupt CAS row nor a future looser writer may turn this into active content.
    if (mime === "application/octet-stream" || mime !== asset.mime) {
      return null;
    }
    return { bytes: asset.bytes, mime };
  };
}
