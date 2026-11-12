// The room host a member's request may run as: the present host when that host is also in the room's consent set
// (present and enabled), else null. Imagery's room run-as reads it, so a member's picture never spends a disabled
// host's connections, the same rule `loadRoom` applies to a turn.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { presentAndEnabledHumanUserIdsOf } from "../substrate/participants-humans.ts";

type Ctx = Pick<ChatContext, "db" | "resolveUserEnabled">;

export function createLoadConsentingHostUserId(input: DbAssemblyInput<Ctx>): (chatId: ChatId) => Promise<UserId | null> {
  const ctx: Ctx = { ...input, db: databaseForOwner(input.db) };
  return async (chatId) => {
    const participants = await loadParticipants(ctx.db, chatId);
    const hostUserId = hostUserIdOf(participants);
    if (hostUserId === null) {
      return null;
    }
    return (await presentAndEnabledHumanUserIdsOf(ctx, participants)).includes(hostUserId) ? hostUserId : null;
  };
}
