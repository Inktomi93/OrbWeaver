// The D121-E display-tier room policy (owner ruling 2026-08-02): does this room broadcast the HOST's display
// scripts, and who is its host. Both halves are chat's data (the `hostDisplayScripts` metadata flag and the
// roster's host seat), so chat owns the answer and regex consumes it as an injected op. A hostless room (an
// archived orphan whose host left) answers a null host: nobody's scripts can be broadcast.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RegexContext } from "#domain/regex";
import type { ChatContext } from "../context.ts";
import { loadChatRow } from "../persistence/queries.ts";
import { loadPresentHostUserId } from "../persistence/reactions.ts";

export function createResolveRoomDisplayPolicy(input: DbAssemblyInput<Pick<ChatContext, "db">>): RegexContext["resolveRoomDisplayPolicy"] {
  const ctx = { db: databaseForOwner(input.db) };
  return async (chatId) => {
    // The row read parses metadata through the fault-isolated seam, so a corrupt sibling sub-blob never takes
    // the toggle down with it; a gone chat reads off.
    const enabled = (await loadChatRow(ctx.db, chatId))?.metadata.hostDisplayScripts === true;
    if (!enabled) {
      // While the option is off the verb returns `[]` regardless, so the roster read never runs.
      return { enabled: false, hostUserId: null };
    }
    return { enabled: true, hostUserId: await loadPresentHostUserId(ctx.db, chatId) };
  };
}
