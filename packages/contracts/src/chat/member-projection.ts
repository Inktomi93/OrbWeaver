// @orb/contracts/chat/member-projection — the pure §3.6 member projection of one `MessageView`: hidden-class
// spans stripped from the body and from each tool call's name, arguments and result, tool positions rebased onto the
// body, and the reasoning channel withheld on a deception-active game. The server applies it where the payload
// is produced (`substrate/member-visibility.ts`), and a non-host fork copies tool calls through `memberToolCalls`
// (`packages/server/src/domain/chat/verbs/fork.ts`).
//
// A TOOL PAYLOAD IS DECODED BEFORE THE STRIP, through the kit's `stripHiddenSpansInJsonText`, the walk rpg's tool-call
// disclosure takes too: a member reads the re-encoding, never the model's own spelling. Arguments that are not JSON have
// no decoded strings to strip, so a member reads them as withheld: an empty string, the rpg disclosure's posture. A
// result that is not JSON is prose (`ToolCallRecord.result`) and is stripped as prose.

import { projectHiddenSpans, stripHiddenSpans, stripHiddenSpansInJsonText } from "@orb/kit/content";
import type { MessageView, ToolCallRecord } from "./messages.ts";

// Strip hidden-class spans from one message view's content and its tool calls. Identity when the body hides nothing
//  and the view carries no tool call (the common case allocates nothing). The `reasoning` channel is handled
//  SEPARATELY by the game-conditional reasoning strip ({@link stripReasoningFromView}) — a body strip never touches
//  reasoning, so a non-deception game's reasoning is unaffected.
function stripHiddenForMember(view: MessageView): MessageView {
  const { content, hadHidden } = stripHiddenSpans(view.content);
  if (!hadHidden && view.toolCalls.length === 0) {
    return view;
  }
  return { ...view, content, toolCalls: memberToolCalls(view.toolCalls, view.content) };
}

/** The member projection of tool calls: positions rebased onto the delivered body, and hidden spans removed from
 *  `name`, `arguments` and `result` (the file header). A registered tool's name holds no tag, so only a name the model
 *  invented for a tool the round did not offer changes. Native and occurrence identities stay unchanged. */
export function memberToolCalls(records: readonly ToolCallRecord[], content: string): ToolCallRecord[] {
  const offsets = projectHiddenSpans(
    content,
    records.flatMap((record) => [record.textOffset ?? 0, record.exchangeTextEnd ?? 0]),
  ).offsets;
  return records.map((record, index) => ({
    ...record,
    name: stripHiddenSpans(record.name).content,
    arguments: stripHiddenSpansInJsonText(record.arguments) ?? "",
    result: record.result === null ? null : (stripHiddenSpansInJsonText(record.result) ?? stripHiddenSpans(record.result).content),
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
