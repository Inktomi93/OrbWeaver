// A plugin's standing in a room is its caller's present seat on an enabled account. A disabled installer stands as
// a departed one (owner-ruled), so a queued event delivery, a tool call or a transform for a plugin whose installer
// was disabled after it was admitted finds no standing at the moment it runs.

import type { ResolvePluginChatAuthority } from "@orb/contracts/plugin";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatContext } from "../contract/context.ts";
import { loadPresentRole } from "../persistence/participants-read.ts";
import { permitsHost } from "../substrate/auth/decide.ts";

const NO_STANDING = { canRead: false, canWrite: false } as const;

/** Resolve read and write authority from the caller's present seat, never join order. */
export function createPluginChatAuthority(input: DbAssemblyInput<Pick<ChatContext, "db" | "can" | "resolveUserEnabled">>): ResolvePluginChatAuthority {
  const ctx = { ...input, db: databaseForOwner(input.db) };
  return async (caller, chatId) => {
    const role = await loadPresentRole(ctx.db, chatId, caller.userId);
    if (role === null || !(await ctx.resolveUserEnabled(caller.userId))) {
      return NO_STANDING;
    }
    return { canRead: true, canWrite: permitsHost(ctx.can, caller, role) };
  };
}
