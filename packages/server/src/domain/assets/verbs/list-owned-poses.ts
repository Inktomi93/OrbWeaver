// verb: listOwnedPoses — the caller's OWN BYO pose-library entries (comfyui-control §4.12.2, C6c; the picker's
// BYO half, C6d). Owner-scoped off `principal.userId` through the `asset_id → assets.ownerId` join in the query
// WHERE (the row carries no ownerId, D20) — a pose whose asset another user owns can never surface (leak-free).

import type { AssetsContext } from "../context";
import type { ListOwnedPosesParams } from "../contract/params";
import type { AssetsService } from "../contract/service";
import { selectOwnedPoses } from "../persistence/poses";

export function createListOwnedPoses(ctx: AssetsContext): AssetsService["listOwnedPoses"] {
  return async ({ principal, category }: ListOwnedPosesParams) => selectOwnedPoses(ctx.db, principal.userId, category);
}
