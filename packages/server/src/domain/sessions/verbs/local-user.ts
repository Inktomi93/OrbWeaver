// D257 — the two handle writes other tiers make: admin's local-account mint and boot's owner seed-key rename.
// Both run through this domain's `users` writers, so the handle key is derived where every other handle is.

import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { insertLocalUserStatement, updateUser } from "../persistence/users.ts";

export function createLocalUser(ctx: SessionsContext): Pick<SessionsService, "localUserInsertStatement" | "renameUserHandle"> {
  return {
    localUserInsertStatement: (row): ReturnType<SessionsService["localUserInsertStatement"]> => insertLocalUserStatement(ctx.db, row),
    renameUserHandle: (userId, handle, at): Promise<void> => updateUser(ctx.db, userId, { handle, updatedAt: at }),
  };
}
