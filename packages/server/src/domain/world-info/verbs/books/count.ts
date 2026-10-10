import type { WorldInfoContext } from "../../context.ts";
import type { WorldInfoService } from "../../contract/service.ts";
import { countOwnedBooks } from "../../persistence/queries.ts";

export function createCount(ctx: WorldInfoContext): WorldInfoService["countBooks"] {
  return async ({ principal }) => await countOwnedBooks(ctx.db, principal.userId);
}
