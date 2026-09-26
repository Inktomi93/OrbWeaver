// The chat `warning` seam as the bus reducer's three callbacks: every warning goes through the turn cadence,
// and what the cadence releases becomes a notice. One factory so the room and its CT drive the same path.

import type { ChatWarning } from "@orb/contracts/chat";
import type { ChatBusDeps } from "#data";
import type { NotifyAction, NotifyNotice } from "#lib";
import { createTurnWarningCadence } from "./turn-warning-cadence.ts";
import { turnDropsNotice, warningNotice } from "./warning-notice.ts";

export interface WarningSurfaceDeps {
  readonly warn: (notice: NotifyNotice) => void;
  /** The one next step a notice can offer: custom parameters are a connection property. */
  readonly openConnections: NotifyAction;
}

type WarningCallbacks = Required<Pick<ChatBusDeps, "onWarning" | "onTurnStarted" | "onTurnSettled">>;

export function createWarningSurface(deps: WarningSurfaceDeps): WarningCallbacks {
  const cadence = createTurnWarningCadence();
  const raise = (notice: NotifyNotice, warnings: readonly ChatWarning[]): void => {
    const offersConnections = warnings.some((warning) => warning.code === "custom_parameters_ignored");
    deps.warn(offersConnections ? { ...notice, action: deps.openConnections } : notice);
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
