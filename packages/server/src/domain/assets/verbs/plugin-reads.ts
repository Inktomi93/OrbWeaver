// Guest reads are installer-scoped; published bytes are reachable only behind distribution admission.

import { PLUGIN_ASSET_READ_MAX_BYTES } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { isMissingFile } from "#primitives/errno";
import type { PluginAssetReadDeps, PluginAssetReads } from "../contract/plugin-reads.ts";

/** Bind the reduced asset surface and the two lifecycle byte readers. */

export function createPluginAssetReads(deps: PluginAssetReadDeps): PluginAssetReads {
  const { assets, resolveOwnerPrincipal, logger } = deps;
  // A torn CAS entry (the row stands, its bytes are gone) answers the same leak-free not-found that
  // `entry/http/blob.ts` gives for the same case, so it is no existence oracle; the fault is logged here instead.
  const tornAsMiss = async <T>(assetId: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
      getLog(logger).warn({ err: error, assetId }, "assets: a plugin asset's stored bytes are missing, so the read answers not found");
      return null;
    }
  };
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
        const owned = await tornAsMiss(id.data, () => assets.readOwnedAssetBytes(caller, id.data));
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
      const bytes = await tornAsMiss(assetId, () => assets.loadAssetBytes(assetId));
      if (bytes === null) {
        throw new DomainNotFoundError("asset", assetId);
      }
      const ref = await assets.assetCasRefById(assetId);
      return { bytes, mime: ref?.mime ?? "application/zip" };
    },
    readPublishedBundle: async (assetId): Promise<Uint8Array> => {
      const bytes = await tornAsMiss(assetId, () => assets.loadAssetBytes(assetId));
      if (bytes === null) {
        throw new DomainNotFoundError("asset", assetId);
      }
      return bytes;
    },
  };
}
