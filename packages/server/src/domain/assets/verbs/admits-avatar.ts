// verb: admitsAvatar — the read-only twin of the avatar store's refusals, for a dry run that must not write. It runs
// the store's own checks (the byte cap, the kind's media and the magic of the sniffed image type), so a preview and a
// run agree on which avatars land.

import type { AdmitsAvatar } from "@orb/contracts/assets";
import { sniffMime } from "@orb/kit/image-sniff";
import { AssetContentRejectedError } from "../contract/errors.ts";
import { exceedsAssetCap } from "../substrate/cap.ts";
import { assertKindAdmits, assertMagicMatches } from "../substrate/mime.ts";

export function createAdmitsAvatar(): AdmitsAvatar {
  return ({ bytes, maxBytes }) => {
    if (exceedsAssetCap(bytes, maxBytes)) {
      return false;
    }
    try {
      assertKindAdmits(bytes, "avatar");
      assertMagicMatches(bytes, sniffMime(bytes));
      return true;
    } catch (error) {
      if (error instanceof AssetContentRejectedError) {
        return false;
      }
      throw error;
    }
  };
}
