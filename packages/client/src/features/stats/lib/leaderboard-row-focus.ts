// The leaderboard row a drill was opened from. The finder (LIST pane) and the dashboard (CONTENT pane) are different
// shell regions with no shared React ancestor, and the finder's rows live in a virtualized list that mounts them by
// window, so the dashboard addresses the row by the character attribute the finder stamps on it.

import type { CharacterId } from "@orb/kit/ids";
import { LEADERBOARD_ROW_ATTR } from "./leaderboard-row-attr.ts";

/** The leaderboard row body for `characterId`, when it is on screen and operable. */
export function openerRow(characterId: CharacterId): HTMLElement | null {
  const row = document.querySelector<HTMLElement>(`[${LEADERBOARD_ROW_ATTR}="${characterId}"] [data-slot="list-row-body"]`);
  return row === null || row.closest("[inert]") !== null ? null : row;
}
