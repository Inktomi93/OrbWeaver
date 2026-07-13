// verb: listGlobal — the caller's global books, newest first (owner-scoped via the book). `role` is null on
// this scope. A read: no audit.

import type { WorldInfoContext } from "../../context";
import type { ListGlobalParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { listGlobalBooks } from "../../persistence/queries";

export function createListGlobal(ctx: WorldInfoContext): WorldInfoService["listGlobal"] {
  return ({ principal }: ListGlobalParams) => listGlobalBooks(ctx.db, principal.userId);
}
