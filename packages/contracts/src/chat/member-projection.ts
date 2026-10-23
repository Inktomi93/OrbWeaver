// @orb/contracts/chat/member-projection — the pure §3.6 member projection of one `MessageView`: hidden-class
// spans stripped from the body, tool positions rebased onto it, and the reasoning channel withheld on a
// deception-active game. The server applies it where the payload is produced (`substrate/member-visibility.ts`).

import { projectHiddenSpans, stripHiddenSpans } from "@orb/kit/content";
import type { MessageView, ToolCallRecord } from "./messages.ts";

// Strip hidden-class spans from one message view's content. Identity when nothing is hidden (the common
//  case allocates nothing). Only `content` carries body prose; the `reasoning` channel is handled SEPARATELY
//  by the game-conditional reasoning strip ({@link stripReasoningFromView}) — a body strip never touches
//  reasoning, so a non-deception game's reasoning is unaffected.
function stripHiddenForMember(view: MessageView): MessageView {
  const { content, hadHidden } = stripHiddenSpans(view.content);
  return hadHidden ? { ...view, content, toolCalls: memberToolCalls(view.toolCalls, view.content) } : view;
}

/** Tool positions belong to the delivered body, while native and occurrence identities stay unchanged. */
export function memberToolCalls(records: readonly ToolCallRecord[], content: string): ToolCallRecord[] {
  const offsets = projectHiddenSpans(
    content,
    records.flatMap((record) => [record.textOffset ?? 0, record.exchangeTextEnd ?? 0]),
  ).offsets;
  return records.map((record, index) => ({
    ...record,
    ...(record.textOffset === undefined ? {} : { textOffset: offsets[index * 2] ?? record.textOffset }),
    ...(record.exchangeTextEnd === undefined ? {} : { exchangeTextEnd: offsets[index * 2 + 1] ?? record.exchangeTextEnd }),
  }));
}

// Withhold the whole REASONING channel from a member of a deception-active game. Nulls `view.reasoning`
//  (identity when it is already null — the common non-reasoning row allocates nothing). The BODY is left to
//  {@link stripHiddenForMember}; a caller applies BOTH when the game is deception-active.
//
//  THE §8.8 REPLAY PARTS NEED NO ARM HERE, and that is by construction rather than by omission: they are
//  deliberately absent from `MessageView` (see `messages.ts`), read host-side through the engine's own
//  `loadReasoningParts` op, and therefore never reach a member's wire at all.
function stripReasoningFromView(view: MessageView): MessageView {
  return view.reasoning === null ? view : { ...view, reasoning: null };
}

/** The FULL member projection of one view (§3.6): the unconditional hidden-span BODY strip, plus — when the
 *  game is DECEPTION-ACTIVE — the whole reasoning channel withheld. `reasoningHostOnly` is the per-chat verdict
 *  the caller resolved once (`resolveReasoningHostOnly && viewer !== host`); `false` keeps reasoning visible
 *  for a non-deception game. The ONE composed member-view projection every commit / list / replay / bus
 *  surface routes through, so the two strips never drift apart. */
export function projectViewForMember(view: MessageView, reasoningHostOnly: boolean): MessageView {
  const bodyStripped = stripHiddenForMember(view);
  return reasoningHostOnly ? stripReasoningFromView(bodyStripped) : bodyStripped;
}
