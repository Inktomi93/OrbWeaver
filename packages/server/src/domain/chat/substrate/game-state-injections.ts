// The game-state injection a gather contributes, and the swap that points an assembled turn at another form of it.
// Chat reads no rpg type: a gather hands over the injections as data, and this stamps and replaces them by content.

import type { AssembleContext, ChatInjection } from "@orb/contracts/chat";

/** The `game-state` stamp, so the BUILD walk accounts the state block under its own source. Its one home. */
export function stampGameState(injections: readonly ChatInjection[]): readonly ChatInjection[] {
  return injections.map((injection): ChatInjection => ({ ...injection, origin: "game-state" }));
}

/** The assembled turn with each stamped `from` injection replaced by the `to` entry at the same index. A turn built
 *  from one form of the gather's reminder is re-pointed at another without a rebuild, so nothing else in it moves. */
export function swapGameState(assembled: AssembleContext, from: readonly ChatInjection[], to: readonly ChatInjection[]): AssembleContext {
  const injections = assembled.chatInjections;
  if (injections === undefined) {
    return assembled;
  }
  const swapped = injections.map((injection) => {
    const at = injection.origin === "game-state" ? from.findIndex((candidate) => candidate.content === injection.content) : -1;
    return (at === -1 ? undefined : to[at]) ?? injection;
  });
  return { ...assembled, chatInjections: swapped };
}
