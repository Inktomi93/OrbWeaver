// Room source: `automation` — the per-chat automation feedback feed, MOVED from
// `routers/automation.ts::stream` (`automationStream`, body intact). Every authorization verdict and its
// ORDERING are unchanged; only the transport underneath moved. This is a PURE SERVER-SIDE fold: the channel
// has no client consumer today — it is a sanctioned-dormant DOORWAY, and whoever builds the
// quick-reply chips UI gets the multiplex for free instead of a sixth browser connection.
//
// EPHEMERAL BY DESIGN — the classification that decides everything else here. The automation bus has no
// durable half at all (the chips are transient, `automation-bus.ts` is the WHOLE
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
// — every other event (rule fire/error/disable/config-change) is the host's hidden hand. Resolving it at pump
// START keeps the pre-fold ORDERING exact (gate first, bus tail second — this bus, unlike chat's, never
// promised the gate→listen gap loses nothing) and fails a broken read fast even in a silent room.
//
// AND THE TIER IS RE-RESOLVED PER EVENT. Pump-start alone was a cached verdict with a longer leash: it
// re-derived on reconnect and lag-restart, so a host demoted mid-subscription kept receiving the whole hidden
// hand until they happened to reconnect — the exact cached-verdict-in-the-cell failure this design forbids at
// the attach, simply not carried one loop further in. `sources/chat.ts` (per-yield membership probe) and
// `sources/rpg.ts` (`isChatMember` inside the loop) are the house idiom; automation was the outlier.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { StreamDataFrame } from "@orb/contracts/stream";
import { subscribeAutomation } from "../../automation-bus.ts";
import type { RoomSourceDef } from "../room-source.ts";

/** The one MEMBER-visible automation-bus event — the transient quick-reply chips. Every OTHER event
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
    // The PUMP-START resolve, kept: it is the gate→listen ORDERING (this bus never promised the gap loses
    // nothing) and it fails a broken/kicked attach fast, even in a room that never emits another event.
    await services.automation.resolveStreamAuthority({ principal, chatId: ref.chatId });
    for await (const event of subscribeAutomation(ref.chatId, signal)) {
      // THE TIER IS RE-RESOLVED PER EVENT, not once per pump. A subscription is open for as long as a tab is,
      // and the host role moves underneath it: `acceptHostHandoff` swaps the roster atomically, a kick removes
      // the seat. A cached `isHost` boolean kept feeding a DEMOTED host every rule fire/error/disable — the
      // whole hidden hand — until they happened to reconnect, which is the cached-verdict-in-the-cell failure
      // the header already forbids for the ATTACH verdict; it was simply not being kept one loop further in.
      // This is the house idiom, not a new one: `sources/chat.ts` re-probes membership on every live yield and
      // `sources/rpg.ts` calls `isChatMember` inside its loop. Automation was the outlier. A KICK now throws
      // here exactly as it does at pump start (→ this room's `roomFailed`); a DEMOTION narrows to `member`
      // from the very next event. The read is one indexed roster lookup on a low-frequency bus.
      const authority = await services.automation.resolveStreamAuthority({ principal, chatId: ref.chatId });
      // A `member`-tier subscriber receives ONLY the room-visible chips; every other event is the host's
      // hidden hand (rule fire/error/disable/config-change), filtered out here per subscriber.
      if (authority !== "host" && event.type !== MEMBER_VISIBLE_EVENT) {
        continue;
      }
      yield { channel: "automation", chatId: ref.chatId, event };
    }
  },
};
