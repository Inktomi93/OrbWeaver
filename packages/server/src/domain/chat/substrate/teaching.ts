// domain/chat/substrate/teaching — THE S2 COLLECTION: the one place a turn asks "what is this chat's model
// told it can do?". Runs every registered `TeachingContribution` in `order` and folds their output into ONE
// `TeachingCollection` the turn hands to assembly (`teachingInjections`) and to the wire (`attachedToolNames`).
//
// WHY a collection instead of per-domain hooks in `buildTurnContext`: prose steering converges on ONE
// `ChatInjection` channel (PD-63 single placement) and tool attach has ONE source. Before this seam the only
// contributor was the rpg gather, hard-wired at two sites; every later contributor would have added a third,
// a fourth, and the merge order would have been an accident of edit history. Here the order is DATA
// (`TeachingContribution.order`) and the merge is one function with pins on it.
//
// ERRORS ARE NOT SWALLOWED. A contribution that throws fails the turn. This is deliberately UNLIKE the D50
// prompt-transform seam (which skips a slow/broken transform and warns): a transform is an edit to a HUMAN's
// draft under a 250 ms deadline, while a teaching contribution is prompt CONTENT — assembling a turn that
// silently omits what the model was told it could do produces a wrong prompt that reads as a model failure,
// which is exactly the class of bug this codebase refuses to make quiet.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatTeachingRegistry, TeachingCollection, TeachingContext, TeachingKnobs } from "../contract/context.ts";

/** The per-chat teaching knobs every turn resolves ({@link TeachingKnobs}).
 *
 *  `offerChoices` is the B1 knob and B1 REPLACES this constant with the per-chat read: RULED F2 homes it on
 *  the chat (a per-chat field plus a `groupDefaults`-tier per-user default). No such field exists on today's
 *  tree — the only choices knob is the GAME's `features.cyoa` — so there is nothing to read yet and every
 *  chat resolves the shipped floor. The `tctx` FIELD is frozen now (A1's whole point) so B1's contribution
 *  consumes a contract that never changed shape; the `DEFAULT_CHAT_BEHAVIOR` precedent (`contract/foreign.ts`)
 *  is the same idea one seam over. */
export const DEFAULT_TEACHING_KNOBS: TeachingKnobs = { offerChoices: false };

/** The dedup identity of an injection ACROSS CONTRIBUTIONS — the full placement + content tuple. */
function injectionKey(injection: ChatInjection): string {
  return JSON.stringify([injection.position, injection.depth, injection.role, injection.content]);
}

/** THE DOUBLE-TEACH GUARD. Two contributions that emit the byte-identical injection (same position, depth,
 *  role and content) contribute it ONCE — first occurrence wins, order otherwise untouched.
 *
 *  This is the mechanism, not a convention: the teach TEXT has one home (`PROSE_SLOTS`), so the game's CYOA
 *  teach and a chat-level offer-choices teach ARE the same bytes, and a chat that has both knobs on gets one
 *  line instead of the same instruction twice. A future contributor gets the guard for free — it does not
 *  have to know rpg exists.
 *
 *  SCOPE, load-bearing: this collapses CONTRIBUTIONS only. The chat's own `chat_injections` rows never pass
 *  through here (they are merged at `assemble-gather`) — a host may legitimately author two identical rows,
 *  and deduplicating a human's authored canon would be this seam editing content it does not own. */
function dedupeInjections(injections: readonly ChatInjection[]): readonly ChatInjection[] {
  const seen = new Set<string>();
  return injections.filter((injection) => {
    const key = injectionKey(injection);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Collects the turn's teaching: every contribution in ascending `order` (ties keep registration order — a
 *  STABLE sort), injections concatenated then deduped, tool names unioned first-occurrence-first.
 *
 *  Contributions run CONCURRENTLY (each is an independent read); the fold is by the sorted order, never by
 *  completion order, so the assembled bytes do not depend on which read finished first.
 *
 *  An empty registry ⇒ `{ injections: [], toolNames: [] }` ⇒ the turn assembles exactly as it did before this
 *  seam existed. */
export async function collectTeaching(registry: ChatTeachingRegistry, tctx: TeachingContext): Promise<TeachingCollection> {
  if (registry.length === 0) {
    return { injections: [], toolNames: [] };
  }
  const ordered = [...registry].sort((a, b) => a.order - b.order);
  const collected = await Promise.all(ordered.map((contribution) => contribution.collect(tctx)));
  const injections = dedupeInjections(collected.flatMap((c) => c.injections));
  const toolNames = [...new Set(collected.flatMap((c) => c.toolNames))];
  return { injections, toolNames };
}
