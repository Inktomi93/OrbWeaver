// Room source: `rpg` — the per-game live event relay (SSE-1 §4.2), MOVED verbatim from
// `routers/rpg.ts::stream`. Every authorization verdict and its ORDERING are unchanged; only the transport
// underneath it moved.
//
// AUTHZ (unchanged): rpg has NO `ownerId` — a game's authority derives `rpg_games.chatId → chat_participants`
// (D18/D20). So this room gates on CHAT MEMBERSHIP, reusing chat's member-scoped `chatEventBounds` attach
// probe. Two properties carry over EXACTLY:
//   • ACCEPT-ALWAYS AT ATTACH (withhold-not-throw). A game may be BORN while a client is attached, and a
//     client may legitimately attach before it is seated — so a non-member does not get a refusal, it gets
//     silence. Refusing here would be a behavior change AND an existence oracle.
//   • RE-GATE PER YIELD. The listener attaches FIRST (`on()` buffers from that instant, so the gate→relay
//     gap loses nothing), then every single relayed event re-runs the membership probe — which is what makes
//     a KICKED member stop receiving mid-stream.
//
// The per-yield probe is a live DB read, so it can throw anything the chat service throws (not just the
// leak-free NOT_FOUND it catches). Under the multiplex that throw is caught by the socket's per-room pump
// and becomes a `roomFailed` CONTROL frame — the room detaches, the socket and every other room survive.
// That is strictly better than the shape this code had as its own procedure, where the same throw ended the
// whole stream (the 2026-08-01 zombie-subscription incident: an unwrapped subscription throw is a RETRYABLE
// tRPC 500 that `httpSubscriptionLink` reconnects every ~3s forever with ZERO client callbacks).
//
// LIVE-ONLY: no cursor, no replay (the rpg bus has no durable half — `domain/rpg/bus.ts`). The client
// gap-heals on the socket's live edge.

import type { Principal } from "@orb/contracts/identity";
import type { StreamDataFrame } from "@orb/contracts/stream";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import type { ChatService } from "#domain/chat";
import { subscribeRpgEvents } from "#domain/rpg";
import type { RoomSourceDef } from "../room-source";

/** Is the caller a present member of `chatId`? Reuses chat's member-scoped attach probe (rpg authority
 *  derives through the chat FK chain). `false` on the withhold-not-throw NOT_FOUND (no chat / not a member);
 *  anything else propagates and becomes this room's `roomFailed`. */
async function isChatMember(chat: ChatService, principal: Principal, chatId: ChatId): Promise<boolean> {
  try {
    await chat.chatEventBounds({ principal, chatId });
    return true;
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return false;
    }
    throw err;
  }
}

export const rpgRoomSource: RoomSourceDef<"rpg"> = {
  // LIVE-ONLY: the rpg bus has no durable half, so there is no cursor and nothing to resume from — the
  // client heals every (re)connect with a blanket invalidate instead.
  resumable: false,
  authorizeAttach: () => Promise.resolve(),
  async *run({ ref, principal, services, signal }): AsyncGenerator<StreamDataFrame> {
    for await (const event of subscribeRpgEvents(ref.chatId, signal)) {
      if (await isChatMember(services.chat, principal, ref.chatId)) {
        yield { channel: "rpg", chatId: ref.chatId, event };
      }
    }
  },
};
