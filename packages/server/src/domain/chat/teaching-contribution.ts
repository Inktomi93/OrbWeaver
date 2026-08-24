// domain/chat — THE RATIFIED 11th ROOT SLOT (`teaching-contribution.ts`, the S2 teaching seam's exit): the
// domain's OWN contributions to "what this chat's model is told it can do", compose-built and registered at
// `entry/compose`. Same shape of exception as `guard.ts` and `workload-contributions.ts` (D117): not a verb,
// I/O-capable, and cross-domain by construction — a domain DECLARES its teaching, one collector folds them
// (`substrate/teaching.ts`), and the turn knows no domain. Reachable only through the front door
// (`index.ts`), so the registry is assembled at the composition root and never imported by a verb.
//
// Chat's own contribution is the rpg-gather PROJECTION — contributor #0. The game's depth-0 state-block
// reminder was the seam's only contributor before it existed, and it stays byte-identical: same content,
// same order, same `game-state` stamp. Chat learns nothing rpg-shaped here (the input is the structural
// `ChatRpgGatherResult` chat already owns), and the gather's NON-injection outputs — macros, celBindings,
// cardKeepLastX, terminalTools — are untouched by this seam and still ride `buildTurnContext` directly.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatTeachingRegistry, TeachingCollection, TeachingContext, TeachingContribution } from "./contract/context.ts";

/** Contributor #0 — the rpg gather's injections + tool names, projected onto the teaching contract.
 *
 *  THE `game-state` STAMP LIVES HERE, and this is its one home. It used to sit at the injections merge
 *  (`substrate/assemble-gather.ts`), which was correct while rpg was the only contributor and became wrong
 *  the moment the merge went generic: a teaching contribution is not necessarily a game (C1's guidance line
 *  is authors-note register), so a merge-site stamp would mislabel every later contributor's budget
 *  accounting. The stamp's original reason is preserved exactly — the BUILD walk accounts the state block
 *  under its own source without chat ever reading an rpg type. */
const rpgGatherProjection: TeachingContribution = {
  id: "chat.rpg-gather",
  order: 0,
  collect: (tctx: TeachingContext): Promise<TeachingCollection> =>
    Promise.resolve({
      injections: (tctx.rpgGather?.injections ?? []).map((injection): ChatInjection => ({ ...injection, origin: "game-state" })),
      // The gather's own `tools` — `[]` in every mode as built (the fold rides `terminalTools`, which is NOT
      // a registry attach), so today's union is empty and the turn is byte-identical. Projected rather than
      // hard-coded `[]` so an rpg mode that DOES contribute registry tools attaches them through the one
      // seam instead of being silently dropped here.
      toolNames: tctx.rpgGather?.tools ?? [],
    }),
};

/** Chat's own teaching contributions, in registration order (the collector sorts by `order`). */
export function createChatTeachingContributions(): ChatTeachingRegistry {
  return [rpgGatherProjection];
}
