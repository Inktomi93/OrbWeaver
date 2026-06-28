// domain/buddy/substrate/view — the buddy's egocentric VIEW of canon (agent part #3, buddy.md movement
// table). For the solo buddy chat the `buddy_turns` transcript IS the view; this is the window-discipline
// trim + the per-turn prompt assembly. PURE (no I/O). The token budget + the runtime context cap are
// DERIVED by `ask` from the connection capability descriptor (`context.window`) and passed in — NOT a
// buddy literal (buddy.md "vLLM window discipline": the local Messages-API returns a non-fail-fast 500 on
// overflow, so the working set must stay under the window by construction).

import { estimateTokens } from "@orb/kit/tokens";
import type { BuddyTurnRole } from "../contract/results";

/** How many of the most-recent turns feed back as memory (the COUNT ceiling; the token budget is the
 *  orthogonal SIZE ceiling). Kept tight: agent turns also carry tool I/O. */
export const MEMORY_TURNS = 12;

/** One transcript turn for the view-builder (role + content only). */
interface ViewTurn {
  readonly role: BuddyTurnRole;
  readonly content: string;
}

/** Trim a recent-turns transcript (oldest-first input) to a token budget, dropping OLDEST turns until
 *  the kept tail fits. Recency-biased (the newest exchange always survives). The estimate over-counts
 *  prose, so it errs toward trimming early — the safe direction for the local window. */
export function fitSeedToBudget(history: readonly ViewTurn[], budgetTokens: number): ViewTurn[] {
  let used = 0;
  const kept: ViewTurn[] = [];
  // Walk newest → oldest, keep while under budget, then restore oldest-first order.
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn === undefined) {
      continue;
    }
    const cost = estimateTokens(turn.content);
    if (kept.length > 0 && used + cost > budgetTokens) {
      break;
    }
    kept.push(turn);
    used += cost;
  }
  return kept.reverse();
}

/** Build the per-turn prompt: a compact transcript of recent turns (when any) + the new message. The
 *  system prompt carries the soul, so this is purely the conversational context to remember. */
export function buildPromptWithMemory(
  history: readonly ViewTurn[],
  buddyName: string | null,
  message: string,
): string {
  if (history.length === 0) {
    return message;
  }
  const them = buddyName ?? "You";
  const transcript = history
    .map((t) => (t.role === "user" ? `User: ${t.content}` : `${them}: ${t.content}`))
    .join("\n");
  return `Recent conversation so far:\n${transcript}\n\nThe user now says: ${message}`;
}
