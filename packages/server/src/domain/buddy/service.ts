// domain/buddy — COMPOSITION ROOT. Wires the 8 verbs over the injected `BuddyContext` (db + determinism
// seam + the connection/agent-turn/tool-server/roleClients ops + the workloads-backed agentEnv). ZERO
// logic: it only calls the verb factories and assembles the `BuddyService`. The context is built at the
// entry composition root and passed in (buddy sideways-imports none of its injected deps —
// `domain-no-cross-feature`). The reaction engine (`startBuddyObserver`) is started out-of-band, not a
// verb — DEFERRED (FLAG[PD-45]) with the observer subsystem (it reacts to chat/workload buses that land with chat, D38).

import type { BuddyContext, BuddyService } from "./contract/service";
import { createAsk } from "./verbs/ask";
import { createClearChat } from "./verbs/clear-chat";
import { createConfirm } from "./verbs/confirm";
import { createGet } from "./verbs/get";
import { createHatch } from "./verbs/hatch";
import { createHistory } from "./verbs/history";
import { createSetAgency } from "./verbs/set-agency";
import { createSetReactions } from "./verbs/set-reactions";

export function createBuddyService(ctx: BuddyContext): BuddyService {
  return {
    get: createGet(ctx),
    hatch: createHatch(ctx),
    ask: createAsk(ctx),
    confirm: createConfirm(ctx),
    history: createHistory(ctx),
    clearChat: createClearChat(ctx),
    setReactions: createSetReactions(ctx),
    setAgency: createSetAgency(ctx),
  };
}
