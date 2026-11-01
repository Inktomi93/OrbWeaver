// The reads the composition root binds into one domain from another, rebuilt from the same production
// factories over the root's own database, so a domain suite drives its factory against the op production wires.

import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatId } from "@orb/kit/ids";
import { loadPresentHostUserId } from "@orb/server/domain/chat";
import { createResolvePersonasForParticipants } from "@orb/server/domain/persona";
import type { ServerTestHarness } from "./server.ts";

export function presentHostOf(root: Pick<ServerTestHarness, "db">): (chatId: ChatId) => ReturnType<typeof loadPresentHostUserId> {
  return (chatId) => loadPresentHostUserId(databaseHandle(root.db), chatId);
}

export function personasForParticipantsOf(root: Pick<ServerTestHarness, "db">): ReturnType<typeof createResolvePersonasForParticipants> {
  return createResolvePersonasForParticipants({ db: databaseHandle(root.db) });
}
