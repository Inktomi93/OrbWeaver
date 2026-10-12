import type { ResolvePluginChatAuthority } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { loadPresentRole } from "../persistence/participants-read.ts";

/** Resolve read and write authority from the caller's present seat, never join order. */

export function createPluginChatAuthority(db: Db): ResolvePluginChatAuthority {
  return async (caller, chatId) => {
    const role = await loadPresentRole(db, chatId, caller.userId);
    return { canRead: role !== null, canWrite: role === "host" };
  };
}
