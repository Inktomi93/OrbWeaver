// The automation room's exhaustive event-to-filter map. It is split from `invalidation.ts` for the same
// reason as the RPG map in `invalidation-reads.ts`: the central seam owns dispatch and the one
// `invalidateQueries` chokepoint, while this module owns one self-contained bus union's read decisions.
//
// The room is LIVE-ONLY. A reconnect cannot replay a missed rule terminal, so the gap-heal covers every
// durable read an automation event can move for the open chat. Inactive queries are only marked stale;
// active surfaces refetch immediately.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import type { InvalidateFilter } from "./invalidation-reads.ts";
import type { Trpc } from "./trpc.ts";

type AutomationBusFilterMap = {
  readonly [K in AutomationBusEvent["type"]]: (event: Extract<AutomationBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const nothing = (): readonly InvalidateFilter[] => [];

const AUTOMATION_BUS_FILTERS: AutomationBusFilterMap = {
  quickReplySurfaced: nothing,
  suggestionRaised: nothing,
  suggestionResolved: nothing,
  // Both terminals follow a durable fire-log write. Reconcile the rule's status, its disclosure, and the
  // room-wide Activity tab from the same signal so a visible list never freezes at its first read.
  ruleFired: (event, trpc) => [
    trpc.automation.listRules.queryFilter({ chatId: event.chatId }),
    trpc.automation.listFires.queryFilter({ ruleId: event.ruleId }),
    trpc.automation.listChatActivity.queryFilter({ chatId: event.chatId }),
  ],
  ruleErrored: (event, trpc) => [
    trpc.automation.listRules.queryFilter({ chatId: event.chatId }),
    trpc.automation.listFires.queryFilter({ ruleId: event.ruleId }),
    trpc.automation.listChatActivity.queryFilter({ chatId: event.chatId }),
  ],
  // Auto-disable can also follow a corrupt stored action with no new fire row. Only the rule projection moves;
  // an error terminal that did write a fire row has already invalidated both activity reads above.
  ruleAutoDisabled: (event, trpc) => [trpc.automation.listRules.queryFilter({ chatId: event.chatId })],
  // Rule deletion cascades its durable fire rows, so the room-wide Activity projection moves with the set.
  rulesChanged: (event, trpc) => [
    trpc.automation.listRules.queryFilter({ chatId: event.chatId }),
    trpc.automation.listChatActivity.queryFilter({ chatId: event.chatId }),
  ],
};

/** Resolve one automation-room event through the total map. */
export function automationEventFilters(event: AutomationBusEvent, trpc: Trpc): readonly InvalidateFilter[] {
  const handler = AUTOMATION_BUS_FILTERS[event.type] as (value: AutomationBusEvent, proxy: Trpc) => readonly InvalidateFilter[];
  return handler(event, trpc);
}

/** Every durable read the live-only automation room can move, for reconnect gap-heal. */
export function allAutomationRoomFilters(chatId: ChatId, trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.automation.listRules.queryFilter({ chatId }), trpc.automation.listFires.pathFilter(), trpc.automation.listChatActivity.queryFilter({ chatId })];
}
