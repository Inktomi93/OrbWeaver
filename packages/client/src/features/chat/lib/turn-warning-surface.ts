// The chat `warning` seam as the bus reducer's three callbacks: every warning goes through the turn cadence,
// and what the cadence releases becomes a notice. One factory so the room and its CT drive the same path.

import type { ChatWarning } from "@orb/contracts/chat";
import type { ChatBusDeps } from "#data";
import type { NotifyAction, NotifyNotice } from "#lib";
import { createTurnWarningCadence } from "./turn-warning-cadence.ts";
import { turnDropsNotice, warningNotice } from "./warning-notice.ts";

/** The next step a notice can offer, by what it is about: custom parameters are a connection property, and a
 *  Smart pick that fell back is fixed where its picker model is bound. */
export interface WarningSurfaceDeps {
  readonly warn: (notice: NotifyNotice) => void;
  readonly openConnections: NotifyAction;
  readonly openUtilityModel: NotifyAction;
  readonly openRerankModel: NotifyAction;
}

type WarningCallbacks = Required<Pick<ChatBusDeps, "onWarning" | "onTurnStarted" | "onTurnSettled">>;

export function createWarningSurface(deps: WarningSurfaceDeps): WarningCallbacks {
  const cadence = createTurnWarningCadence();
  const actionFor = new Map<ChatWarning["code"], NotifyAction>([
    ["custom_parameters_ignored", deps.openConnections],
    ["smart_arbitration_degraded", deps.openUtilityModel],
    ["speaker_rerank_unavailable", deps.openRerankModel],
  ]);
  const raise = (notice: NotifyNotice, warnings: readonly ChatWarning[]): void => {
    const action = warnings.map((warning) => actionFor.get(warning.code)).find((found) => found !== undefined);
    deps.warn(action === undefined ? notice : { ...notice, action });
  };
  return {
    onTurnStarted: (chatId, turn): void => cadence.turnStarted(chatId, `${turn.provider}\u0000${turn.model}`),
    onWarning: (warning, chatId): void => {
      const now = cadence.warning(chatId, warning);
      if (now !== null) {
        raise(warningNotice(now), [now]);
      }
    },
    onTurnSettled: (chatId): void => {
      const drops = cadence.turnSettled(chatId);
      if (drops !== null) {
        raise(turnDropsNotice(drops), drops);
      }
    },
  };
}
