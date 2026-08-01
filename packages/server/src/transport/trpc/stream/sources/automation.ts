// Room source: `automation` — the per-chat automation feedback feed (SSE-1 §4.2/S4), MOVED from
// `routers/automation.ts::stream` (`automationStream`, body intact). Every authorization verdict and its
// ORDERING are unchanged; only the transport underneath moved. This is a PURE SERVER-SIDE fold: the channel
// has no client consumer today — it is the sanctioned-dormant DOORWAY (spec §14 PLUS), and whoever builds the
// quick-reply chips UI gets the multiplex for free instead of a sixth browser connection.
//
// EPHEMERAL BY DESIGN — the classification that decides everything else here. The automation bus has no
// durable half at all (automation-design/03 §1.4: the chips are transient, `automation-bus.ts` is the WHOLE
// story), so this room is `resumable: false`: no cursor, no replay, no reconnect barrier, and its queue
// overflow policy is `collapse` (`frame-queue.ts`) rather than the `lag` a durable room can afford. The
// `resumable` ⟺ `lag` correspondence is pinned at runtime in `room-sources.test.ts` — this room is on the
// live-only side of it with `user`/`rpg`.
//
// AUTHZ — REFUSE AT ATTACH, which is the deliberate asymmetry against chat/rpg. `resolveStreamAuthority` is
// a MEMBER gate that THROWS `AutomationChatNotFound` (→ the leak-free NOT_FOUND) for a non-present member, so
// unlike a chat/rpg room — which a client may legitimately attach before the game/chat exists, and which
// therefore withholds rather than refuses — an automation room that the caller is not seated in does not
// exist for them. That verdict was the subscription's first act before the fold and is this room's
// `authorizeAttach` after it.
//
// THE GATE ALSO RUNS INSIDE THE PUMP, because it is where the TIER comes from: the same call returns
// `host` | `member`, and a `member`-tier subscriber receives ONLY the room-visible `quickReplySurfaced` chips
// — every other event (rule fire/error/disable/config-change) is the host's hidden hand. Resolving it in the
// pump also keeps the pre-fold ORDERING exact (gate first, bus tail second — this bus, unlike chat's, never
// promised the gate→listen gap loses nothing), and it re-derives the tier on every pump START: a reconnect or
// a lag-restart therefore re-reads membership, so a demoted host is narrowed and a kicked member's pump
// throws into a `roomFailed` instead of silently keeping a stale verdict. Cached-verdict-in-the-cell is
// exactly what §5.5 forbids.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { StreamDataFrame } from "@orb/contracts/stream";
import { subscribeAutomation } from "../../automation-bus";
import type { RoomSourceDef } from "../room-source";

/** The one MEMBER-visible automation-bus event (04 §5) — the transient quick-reply chips. Every OTHER event
 *  (ruleFired/ruleErrored/ruleAutoDisabled/rulesChanged) is the host's hidden hand, filtered out below for a
 *  `member`-tier subscriber. */
const MEMBER_VISIBLE_EVENT: AutomationBusEvent["type"] = "quickReplySurfaced";

export const automationRoomSource: RoomSourceDef<"automation"> = {
  // LIVE-ONLY: the automation bus has no durable half — the chips are transient, so there is nothing to
  // resume from and nothing a shed could re-read (hence `collapse`, not `lag`).
  resumable: false,

  // The subscribe-time visibility gate, verbatim: a non-present member gets AutomationChatNotFound →
  // NOT_FOUND, before any bus tail attaches and before the room is recorded on the socket cell.
  authorizeAttach: async ({ ref, principal, services }) => {
    await services.automation.resolveStreamAuthority({ principal, chatId: ref.chatId });
  },

  async *run({ ref, principal, services, signal }): AsyncGenerator<StreamDataFrame> {
    // Re-resolved here for the TIER (and so a restarted pump re-reads membership) — see the header.
    const authority = await services.automation.resolveStreamAuthority({ principal, chatId: ref.chatId });
    const isHost = authority === "host";
    for await (const event of subscribeAutomation(ref.chatId, signal)) {
      // A `member`-tier subscriber receives ONLY the room-visible chips; every other event is the host's
      // hidden hand (rule fire/error/disable/config-change), filtered out here per subscriber.
      if (!isHost && event.type !== MEMBER_VISIBLE_EVENT) {
        continue;
      }
      yield { channel: "automation", chatId: ref.chatId, event };
    }
  },
};
