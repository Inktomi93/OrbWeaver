// domain/chat/substrate/teaching — THE S2 COLLECTION: the one place a turn asks "what is this chat's model
// told it can do?". Runs every registered `TeachingContribution` in `order` and folds their output into ONE
// `TeachingCollection` the turn hands to assembly (`teachingInjections`) and to the wire (`attachedToolNames`).
//
// WHY a collection instead of per-domain hooks in `buildTurnContext`: prose steering converges on ONE
// `ChatInjection` channel (single placement) and tool attach has ONE source. Before this seam the only
// contributor was the rpg gather, hard-wired at two sites; every later contributor would have added a third,
// a fourth, and the merge order would have been an accident of edit history. Here the order is DATA
// (`TeachingContribution.order`) and the merge is one function with pins on it.
//
// ERRORS ARE NOT SWALLOWED. A contribution that throws fails the turn. This is deliberately UNLIKE the D50
// prompt-transform seam (which skips a slow/broken transform and warns): a transform is an edit to a HUMAN's
// draft under a 250 ms deadline, while a teaching contribution is prompt CONTENT — assembling a turn that
// silently omits what the model was told it could do produces a wrong prompt that reads as a model failure,
// which is exactly the class of bug this codebase refuses to make quiet.

import type { ChatInjection, ChatMetadata } from "@orb/contracts/chat";
import { resolveCharactersCanReact, resolveOfferChoices, resolveReactionsEnabled } from "@orb/contracts/chat";
import type { ChatTeachingRegistry, TeachingCollection, TeachingContext, TeachingKnobs } from "../contract/context.ts";
import type { ChatBehaviorInputs } from "../contract/foreign.ts";

/** Resolves the per-chat teaching knobs every turn hands the collection ({@link TeachingKnobs}).
 *
 *  THE PRECEDENCE, and it is the only rule here: **the ROOM's explicit value wins; an absent room value
 *  inherits the HOST's per-user default.** Room = `chatMetadata.offerChoices` (chat's own column, RULED F2
 *  chat-homed); host default = `UserSettings.chat.offerChoices`, which reaches chat as a FOREIGN input under
 *  the frozen `runAsUserId` (D19) — so a member can never widen what this room's model is told, and a room
 *  created by a host who plays with choices on is born that way without a create-time copy into the blob.
 *  The `??` itself lives in `contracts` ({@link resolveOfferChoices}) because the CLIENT resolves the same
 *  pair to seat the host's toggle, and two spellings of one precedence is how a toggle starts lying about
 *  what the model is being told.
 *
 *  Takes the two RESOLVED VALUES rather than the ctx: this is a pure function with pins on it, and every
 *  collection site (the turn build, the host's preview) already holds both. */
export function resolveTeachingKnobs(metadata: ChatMetadata, behavior: ChatBehaviorInputs): TeachingKnobs {
  return {
    offerChoices: resolveOfferChoices(metadata.offerChoices, behavior.offerChoices),
    // B7 — the same room-over-host-default precedence, one resolver per knob (each spells its own default
    // direction: charactersCanReact is opt-in at both tiers, reactionsEnabled ships ON).
    charactersCanReact: resolveCharactersCanReact(metadata.charactersCanReact, behavior.charactersCanReact),
    reactionsEnabled: resolveReactionsEnabled(metadata.reactionsEnabled, behavior.reactionsEnabled),
  };
}

/** The dedup identity of an injection ACROSS CONTRIBUTIONS — the full placement + content tuple. */
function injectionKey(injection: ChatInjection): string {
  return JSON.stringify([injection.position, injection.depth, injection.role, injection.content]);
}

/** THE EXACT-DUPLICATE GUARD. Two contributions that emit the byte-identical injection (same position, depth,
 *  role and content) contribute it ONCE — first occurrence wins, order otherwise untouched. The teach TEXT
 *  has one home (`PROSE_SLOTS`), so two contributions teaching the same fence ARE the same bytes, and a
 *  future contributor gets the collapse for free without having to know the others exist.
 *
 *  WHAT THIS DOES **NOT** COVER — TRUTH-REPAIRED 2026-08-24 (B1), because the original text of this comment
 *  claimed it did and was wrong. It said "the game's CYOA teach and a chat-level offer-choices teach ARE the
 *  same bytes, and a chat that has both knobs on gets one line instead of the same instruction twice." A real
 *  game turn does not emit its teach as its own injection: rpg pushes every teach into ONE `blocks` array
 *  with the game-state block, the delta and the steering license (`domain/rpg/substrate/reminder.ts:459`),
 *  joins it (`:571`), and ships exactly ONE injection (`domain/rpg/chat-ops/gather.ts:183,206`;
 *  `buildLiteReminder` has no other caller). The teach is therefore a SUBSTRING of a larger blob and this
 *  key — a whole-injection tuple — cannot see it. The claim read as proven only because A1's own fixture
 *  faked the gather as two injections, a shape production never produces.
 *
 *  So the both-knobs-on case is handled where the two sides are actually comparable: chat's own
 *  `teaching-contribution.ts` declines to teach a fence this turn's gather already carries. THIS guard's real
 *  and still-valuable scope is contribution-vs-contribution EXACT duplicates — a second standalone teacher.
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
