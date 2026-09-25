// Which room Home resumes, and which rooms it lists beside it. The hero is the room the viewer last spoke in, so a
// room someone else was busy in never reads as "where you left off"; one split feeds both tiles, so they never
// disagree about which room is the hero.

import type { ChatId } from "@orb/kit/ids";

interface HearthCandidate {
  readonly id: ChatId;
  readonly viewerLastTurnAt: number | null;
}

/** The hero and the rest, in page order: the room on this page the viewer spoke in most recently, else the page's
 *  newest room (an account that has not spoken here yet). */
export function splitHearth<Room extends HearthCandidate>(items: readonly Room[]): { readonly hearth: Room | undefined; readonly rest: readonly Room[] } {
  let spokenIn: Room | undefined;
  let latest = Number.NEGATIVE_INFINITY;
  for (const room of items) {
    if (room.viewerLastTurnAt !== null && room.viewerLastTurnAt > latest) {
      spokenIn = room;
      latest = room.viewerLastTurnAt;
    }
  }
  const hearth = spokenIn ?? items[0];
  return { hearth, rest: items.filter((room) => room.id !== hearth?.id) };
}

/** Has this account never spoken in any room its list covers? Home then greets it instead of saying where it left off. */
export function isFirstRun(page: { readonly totalCount: number; readonly viewerLastTurnAt: number | null }): boolean {
  return page.totalCount > 0 && page.viewerLastTurnAt === null;
}
