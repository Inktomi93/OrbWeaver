import type { ResolvePluginChatAuthority } from "@orb/contracts/plugin";
import type { ChatContext } from "../context.ts";
import { loadPresentRole } from "../persistence/participants-read.ts";
import { permitsHost } from "../substrate/auth/decide.ts";

/** Resolve read and write authority from the caller's present seat, never join order. */

export function createPluginChatAuthority(ctx: Pick<ChatContext, "db" | "can">): ResolvePluginChatAuthority {
  return async (caller, chatId) => {
    const role = await loadPresentRole(ctx.db, chatId, caller.userId);
    return { canRead: role !== null, canWrite: role !== null && permitsHost(ctx.can, caller, role) };
  };
}
