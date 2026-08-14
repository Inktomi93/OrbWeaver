// `useGreetingAlternates` — the card read behind the seeded-greeting step (R3, §4.8/F6).
//
// The alternates a greeting can be stepped through live on the CHARACTER CARD, not on the chat, so the strip
// needs `character.get` per seated character to know how many there are and which one is showing. Three
// properties keep that honest:
//   • WINDOW-GATED. The reads fire only while the room is still in its greeting window (no user row yet) —
//     i.e. on a brand-new room, for a bounded founding cast, and never again for the rest of the chat's life.
//   • NON-SUSPENDING. The strip is an affordance on a row that already rendered; a cold or failed card read
//     yields no entry, so the row simply shows no pager. It must never block or error the transcript.
//   • READ-ONLY. It resolves what to OFFER; the server re-reads the same card to resolve what to WRITE, so a
//     card edited between the two is not a race — the verb's answer is authoritative by construction.

import type { CharacterId } from "@orb/kit/ids";
import { useQueries } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** The seated characters' greeting alternates, keyed by character id. Empty while the window is closed. */
export function useGreetingAlternates(characterIds: readonly CharacterId[], windowOpen: boolean): ReadonlyMap<string, readonly string[]> {
  const trpc = useTRPC();
  const ids = windowOpen ? characterIds : [];
  const cards = useQueries({
    queries: ids.map((characterId) => ({
      ...trpc.character.get.queryOptions({ characterId }),
      // An affordance read: a slow or failed card degrades to "no pager", never into the thread's boundary.
      throwOnError: false,
    })),
  });
  const byId = new Map<string, readonly string[]>();
  for (const [i, result] of cards.entries()) {
    const id = ids[i];
    const greetings = result.data?.greetings;
    if (id !== undefined && greetings !== undefined) {
      byId.set(
        id,
        greetings.map((g) => (typeof g === "string" ? g : g.text)),
      );
    }
  }
  return byId;
}
