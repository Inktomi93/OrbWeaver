import type { WorldInfoContext, WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { countOwnedBooks } from "#src/domain/world-info/persistence/queries.ts";

export function createCount(ctx: WorldInfoContext): WorldInfoService["countBooks"] {
  return async ({ principal }) => await countOwnedBooks(ctx.db, principal.userId);
}
