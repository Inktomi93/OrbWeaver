// Guest reads are installer-scoped; published bytes are reachable only behind distribution admission.

import { PLUGIN_ASSET_READ_MAX_BYTES } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { PluginAssetReadDeps, PluginAssetReads } from "../contract/plugin-reads.ts";
import { readTornAsMiss } from "../substrate/torn-entry.ts";

/** Bind the reduced asset surface and the two lifecycle byte readers. */

export function createPluginAssetReads(deps: PluginAssetReadDeps): PluginAssetReads {
  const { assets, resolveOwnerPrincipal, logger } = deps;
  return {
    read: async ({ installerUserId, assetId }): ReturnType<PluginAssetReads["read"]> => {
      const caller = await resolveOwnerPrincipal(installerUserId);
      // FAIL-CLOSED, leak-free: a malformed, foreign or absent id all collapse to `null`, so a guest gets no existence
      // oracle for another owner's assets. A fault in the read is not an existence answer and surfaces as itself.
      const id = typeIdSchema(ID_PREFIX.asset).safeParse(assetId);
      if (!id.success) {
        return null;
      }
      try {
        const owned = await readTornAsMiss(logger, { assetId: id.data }, () => assets.readOwnedAssetBytes(caller, id.data));
        if (owned === null) {
          return null;
        }
        const sizeBytes = owned.bytes.length;
        return {
          mime: owned.mime,
          sizeBytes,
          dataBase64: sizeBytes > PLUGIN_ASSET_READ_MAX_BYTES ? null : Buffer.from(owned.bytes).toString("base64"),
        };
      } catch (error) {
        if (!(error instanceof DomainNotFoundError)) {
          throw error;
        }
        return null;
      }
    },
    // The id comes from an owner-scoped plugin row; distribution has a separate byte reader.
    readBytes: async (_caller, assetId): ReturnType<PluginAssetReads["readBytes"]> => {
      const bytes = await readTornAsMiss(logger, { assetId }, () => assets.loadAssetBytes(assetId));
      if (bytes === null) {
        throw new DomainNotFoundError("asset", assetId);
      }
      const ref = await assets.assetCasRefById(assetId);
      return { bytes, mime: ref?.mime ?? "application/zip" };
    },
    readPublishedBundle: async (assetId): Promise<Uint8Array> => {
      const bytes = await readTornAsMiss(logger, { assetId }, () => assets.loadAssetBytes(assetId));
      if (bytes === null) {
        throw new DomainNotFoundError("asset", assetId);
      }
      return bytes;
    },
  };
}
