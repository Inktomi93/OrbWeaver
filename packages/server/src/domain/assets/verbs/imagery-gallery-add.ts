import type { ImageryGalleryAdd } from "@orb/contracts/assets";
import type { AssetsService } from "../contract/service.ts";

export function createImageryGalleryAdd(addToGallery: AssetsService["addToGallery"]): ImageryGalleryAdd {
  return async (owner, assetId, subjectCharacterId) => {
    await addToGallery({ principal: owner, assetId, subjectCharacterId });
  };
}
