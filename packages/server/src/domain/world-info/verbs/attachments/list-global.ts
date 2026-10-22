// verb: listGlobal — the caller's global books, newest first (owner-scoped via the book). `role` is null on
// this scope. A read: no audit.

import type { ListGlobalParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoContext, WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { listGlobalBooks } from "#src/domain/world-info/persistence/queries.ts";

export function createListGlobal(ctx: WorldInfoContext): WorldInfoService["listGlobal"] {
  return ({ principal }: ListGlobalParams) => listGlobalBooks(ctx.db, principal.userId);
}
