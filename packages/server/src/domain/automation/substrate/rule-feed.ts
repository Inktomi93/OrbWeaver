// domain/automation/substrate/rule-feed — the ONE place that answers "announce this rule-set change to
// whom?".
//
// It exists because the answer stopped being unconditional at C5. `AutomationBusEvent` is a per-CHAT feedback
// bus: `rulesChanged` carries a `chatId`, and the transport source fans it to that chat's subscribers
// (`transport/trpc/stream/sources/automation.ts`). An owner-GLOBAL rule has no chat, so a lifecycle write on
// one has nobody on that bus to tell — and the five verbs that emit this event would each have had to
// re-derive that, which is exactly how one of them ends up emitting a fabricated chat id and delivering an
// owner's private rule churn into an unrelated room.
//
// THE GAP IS NAMED, NOT PAPERED OVER: the owner-global lane has no live feed, and its surface (the Automation
// settings pane) reconciles through each mutation's own `invalidates` instead. Giving it one is a real graft
// — an owner-plane bus member, its producer belt, its coverage sites and a per-USER stream source — and it is
// not this row's. What this function guarantees meanwhile is that no verb quietly invents a room.

import type { ChatId } from "@orb/kit/ids";
import type { AutomationContext } from "../contract/service.ts";

/** Announce that a chat's rule set moved, when there IS a chat. A chat-less (owner-global) rule emits
 *  nothing — see the header for why that is the honest answer rather than a missing case. */
export function notifyRulesChanged(ctx: Pick<AutomationContext, "notify">, chatId: ChatId | null): void {
  if (chatId === null) {
    return;
  }
  ctx.notify({ type: "rulesChanged", chatId });
}
