// Each execution is one portable file; image blobs ride the existing assets reference registry.
import type { PortableFile } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { buildImageryCall, imageryCallImportHash } from "#kit/serde/imagery";
import type { ImageryPortabilityContext, ImageryPortabilityService } from "../contract/portability.ts";
import { readOwnedImageryCalls } from "../persistence/portability-read.ts";

export function createExportProvenance(ctx: ImageryPortabilityContext): ImageryPortabilityService["exportAll"] {
  return async function* exportAll(ownerId: UserId): AsyncIterable<PortableFile> {
    for (const call of await readOwnedImageryCalls(ctx.db, ownerId)) {
      const identity = imageryCallImportHash(call);
      yield { filename: `${identity}.json`, bytes: buildImageryCall(call) };
    }
  };
}
