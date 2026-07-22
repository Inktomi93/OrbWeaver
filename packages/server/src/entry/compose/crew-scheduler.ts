// Assembles the `CrewSchedulerEnv` for `startCrewScheduler` (chat-crew-design/04 §3; the buddy-observer compose
// adapter precedent). The scheduler is source-blind (consumes a lite turn-completed event); this is the one
// place the real chat bus is narrowed onto it — only `turnCompleted` beats reach the crew's decision verb.

import type { CrewSchedulerEnv, CrewService } from "#domain/crew";
import { subscribeAllChatEvents } from "../../transport/trpc";

export function createCrewSchedulerEnv(args: { readonly crew: Pick<CrewService, "onTurnCompleted"> }): CrewSchedulerEnv {
  return {
    crew: args.crew,
    onChatTurnCompleted: (handler) =>
      subscribeAllChatEvents((entry) => {
        if (entry.event.type === "turnCompleted") {
          handler({ chatId: entry.event.chatId });
        }
      }),
  };
}
