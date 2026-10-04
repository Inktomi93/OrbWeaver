// Tells the viewer once when the pass after the turn cannot fit their connection's context window, so game state is
// lost every turn, with a door to that connection's context-window setting. The verdict is the server's
// (`effectiveDelivery.stateRoundOverflow`); the window is never raised for the host (owner ruling).

import type { RpgGameView } from "@orb/contracts/rpg";
import { useEffect } from "react";
import { CONNECTIONS_LIST_ADDRESS, notify } from "#lib";
import { openConfigTo, requestConnectionEditor } from "#state";

const STATE_ROUND_OVERFLOW_NOTICE = "This model's context is too small for game state; set its context window under Advanced (16k recommended).";
const OPEN_CONTEXT_WINDOW = "Open its context window";

// One notice per game, connection and window for the session: a refetch of the same verdict is not news, and a
// changed window that still does not fit is.
const noticed = new Set<string>();

export function useStateRoundOverflowNotice(game: RpgGameView | null): void {
  const overflow = game === null ? null : game.effectiveDelivery.stateRoundOverflow;
  const gameId = game === null ? null : game.id;
  const connectionId = overflow === null ? null : overflow.connectionId;
  const windowTokens = overflow === null ? null : overflow.windowTokens;
  useEffect(() => {
    if (gameId === null || connectionId === null || windowTokens === null) {
      return;
    }
    const key = `${gameId}\u0000${connectionId}\u0000${String(windowTokens)}`;
    if (noticed.has(key)) {
      return;
    }
    noticed.add(key);
    notify.warn({
      title: STATE_ROUND_OVERFLOW_NOTICE,
      action: {
        label: OPEN_CONTEXT_WINDOW,
        onClick: (): void => {
          openConfigTo(CONNECTIONS_LIST_ADDRESS.group, CONNECTIONS_LIST_ADDRESS.sub);
          requestConnectionEditor(connectionId, { openAdvanced: true });
        },
      },
    });
  }, [gameId, connectionId, windowTokens]);
}
