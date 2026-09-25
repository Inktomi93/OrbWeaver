// D254 — the local signup account, for chat's signup batch. The statement is handed out unexecuted with its
// minted id, because the seat and the audit row in the same batch must name the account before it exists.
// A `local` signup carries no external identity, so it follows the `createUser` rules (a `user`-role human
// with a password hash), not `decideProvision`.

import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { insertSignupUserStatement, selectHandleTakenCaseless } from "../persistence/users.ts";

export function createSignup(ctx: SessionsContext): Pick<SessionsService, "signupUserStatement" | "signupHandleTaken"> {
  return {
    signupUserStatement: ({ handle, passwordHash, at, admission }): ReturnType<SessionsService["signupUserStatement"]> => {
      const userId = newId<UserId>();
      return { userId, statement: insertSignupUserStatement(ctx.db, { id: userId, handle, passwordHash, at }, admission) };
    },
    signupHandleTaken: (handle): Promise<boolean> => selectHandleTakenCaseless(ctx.db, handle),
  };
}
