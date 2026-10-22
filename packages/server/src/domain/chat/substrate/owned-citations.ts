// The pictures a caller's body may place in a room: its `asset:` citations the WRITER owns. A `message_assets`
// link is the room's placement of a picture for every member and for the model, so a writer that links a
// caller's body links only through this, never a cited id on the strength of the row's author.

import { assetIdsInContent } from "@orb/kit/content";
import type { AssetId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";

/** The ids `content` cites, minus `alreadyLinked`, that `writerUserId` owns. No citation ⇒ no ownership read. */
export async function ownedCitedAssetIds(
  ctx: Pick<ChatContext, "filterOwnedAssetIds">,
  writerUserId: UserId,
  content: string,
  alreadyLinked: readonly AssetId[],
): Promise<AssetId[]> {
  const cited = assetIdsInContent(content).filter((id) => !alreadyLinked.includes(id));
  return cited.length === 0 ? [] : [...(await ctx.filterOwnedAssetIds(writerUserId, cited))];
}
