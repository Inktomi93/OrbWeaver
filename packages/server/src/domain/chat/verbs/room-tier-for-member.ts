// The room-tier rows a non-host member may read (`RoomTierForMemberOp`), for regex's member-readable `listForChat`.
// SECURITY: the room tier is the host's library, and a member reads it only as part of the room's display set. So
// this applies the display read's own rules, from their one home each: the sharing switch
// (`resolveHostDisplayScripts`), the room's levers (`resolveHostTierRegexEntries` under `regexAllowOf`), and the
// display-pass filter (`drawsOnDisplay`). Withheld sharing yields nothing; shared yields only the enabled
// display-pass rows the room applies, never a save-pass, prompt-only or disabled one. Chat owns the answer because
// the switch and the levers are chat metadata; regex consumes it as an injected op and never reads `chats`.

import type { RoomTierForMemberOp } from "@orb/contracts/chat";
import { resolveHostDisplayScripts } from "@orb/contracts/chat";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatContext } from "../contract/context.ts";
import { loadChatRow } from "../persistence/queries.ts";
import { drawsOnDisplay, regexAllowOf, resolveHostTierRegexEntries } from "../substrate/regex-tier.ts";

export function createRoomTierForMember(input: DbAssemblyInput<Pick<ChatContext, "db">>): RoomTierForMemberOp {
  const ctx = { db: databaseForOwner(input.db) };
  return async (chatId, hostRows) => {
    const chat = await loadChatRow(ctx.db, chatId);
    if (chat === undefined || !resolveHostDisplayScripts(chat.metadata.hostDisplayScripts)) {
      return [];
    }
    return resolveHostTierRegexEntries({ hostGlobal: [], preset: [], character: [], chat: hostRows, allow: regexAllowOf(chat.metadata) })
      .map((entry) => entry.script)
      .filter(drawsOnDisplay);
  };
}
