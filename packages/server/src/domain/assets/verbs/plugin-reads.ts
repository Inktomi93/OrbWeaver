// Guest reads are installer-scoped; published bytes are reachable only behind distribution admission.

import { PLUGIN_ASSET_READ_MAX_BYTES } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginAssetReadDeps, PluginAssetReads } from "../contract/plugin-reads.ts";

/** Bind the reduced asset surface and the two lifecycle byte readers. */

export function createPluginAssetReads(deps: PluginAssetReadDeps): PluginAssetReads {
  const { assets, resolveOwnerPrincipal } = deps;
  return {
    read: async ({ installerUserId, assetId }): ReturnType<PluginAssetReads["read"]> => {
      const caller = await resolveOwnerPrincipal(installerUserId);
      // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — documented above: any
      // unreadable asset (a foreign/absent id, `AssetNotFoundError`) collapses to `null`, leak-free (no
      // existence oracle). Ends if this needs to tell "foreign" apart from an infra failure.
      try {
        const owned = await assets.readOwnedAssetBytes(caller, castId<AssetId>(assetId));
        const sizeBytes = owned.bytes.length;
        return {
          mime: owned.mime,
          sizeBytes,
          dataBase64: sizeBytes > PLUGIN_ASSET_READ_MAX_BYTES ? null : Buffer.from(owned.bytes).toString("base64"),
        };
      } catch {
        // Leak-free: a foreign/absent id (`AssetNotFoundError`) — and any unreadable asset — collapses to
        // `null`, indistinguishable from one another (no existence oracle for another owner's CAS).
        return null;
      }
    },
    // The id comes from an owner-scoped plugin row; distribution has a separate byte reader.
    readBytes: async (_caller, assetId): ReturnType<PluginAssetReads["readBytes"]> => {
      const bytes = await assets.loadAssetBytes(assetId);
      if (bytes === null) {
        throw new DomainNotFoundError("asset", assetId);
      }
      const ref = await assets.assetCasRefById(assetId);
      return { bytes, mime: ref?.mime ?? "application/zip" };
    },
    readPublishedBundle: async (assetId): Promise<Uint8Array> => {
      const bytes = await assets.loadAssetBytes(assetId);
      if (bytes === null) {
        throw new DomainNotFoundError("asset", assetId);
      }
      return bytes;
    },
  };
}
