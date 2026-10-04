// The words for the fit's room: what bounds it, and what separates it from that limit. The Preview bar and
// the transcript divider both read these, so the two surfaces name the same numbers the same way.

import type { ContextFitPreview, ContextLimit } from "@orb/contracts/chat";
import { groupThousands } from "@orb/kit/strings";

/** The limit when the reply reserve is at least it — no history fits beside the reply and only the newest
 *  message is sent — else `null`. */
export function limitOutgrownByReply(limit: ContextLimit | null, reserveOutputTokens: number): ContextLimit | null {
  return limit !== null && limit.tokens <= reserveOutputTokens ? limit : null;
}

/** The explainer under the bar: the room, the limit it comes from, the reply reserve and, on a model window, the
 *  safety margin for token-count error (the limit less the reserve and the room). */
export function roomExplainer(room: number, limit: ContextLimit, reserveOutputTokens: number): string {
  const head = `Room for prompt and history: ${groupThousands(room)}`;
  const reply = `${groupThousands(reserveOutputTokens)} are held for the reply`;
  if (limit.kind === "cap") {
    return `${head} of your ${groupThousands(limit.tokens)}-token cap. ${reply}.`;
  }
  const margin = limit.tokens - reserveOutputTokens - room;
  return `${head} of this model's ${groupThousands(limit.tokens)} tokens. ${reply} and ${groupThousands(margin)} are a safety margin for token-count error.`;
}

/** The no-room line, stated where a ratio would read "of 1". */
export function noRoomLine(limit: ContextLimit, reserveOutputTokens: number): string {
  return `No room for history: the reply (${groupThousands(reserveOutputTokens)}) is larger than the context limit (${groupThousands(limit.tokens)}). Only the newest message is sent.`;
}

/** The context-boundary divider's budget line: the system prompt plus kept history against the fit's room, the
 *  same pair the Preview bar draws. A ratio is drawn ONLY against a real room: when the window is a fallback
 *  guess (`ceilingEstimated`) the line names the window unknown (D41 no-silent-degrade), and when the reply
 *  outgrows the limit it says only the newest message fits instead of a ratio against 1. */
export function contextFitLabel(fit: ContextFitPreview): string {
  const reply = `${groupThousands(fit.reserveOutputTokens)} for the reply`;
  const outgrown = limitOutgrownByReply(fit.limit, fit.reserveOutputTokens);
  if (outgrown !== null) {
    return `Only the newest message fits · reply ${groupThousands(fit.reserveOutputTokens)} > limit ${groupThousands(outgrown.tokens)}`;
  }
  return fit.ceilingEstimated
    ? `${groupThousands(fit.usedTokens)} · window unknown · ${reply}`
    : `${groupThousands(fit.usedTokens)} of ${groupThousands(fit.ceilingTokens)} · ${reply}`;
}
