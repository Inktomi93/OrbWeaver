// domain/rpg/substrate/state-round-fit — what the post-commit state round needs from the connection's window.
// Priced with the estimator and the output reserve the chat history fit uses: the round sends no `max_tokens`, and
// an unset response length is the shared default on both the fit and the wire.

import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import { estimateTokens } from "@orb/kit/tokens";

/** The tokens a round needs: every text block its request carries (system prompt, user prompt, the tool or schema
 *  payload), plus room for the reply. */
export function stateRoundNeededTokens(requestText: readonly string[]): number {
  return requestText.reduce((sum, text) => sum + estimateTokens(text), 0) + DEFAULT_MAX_OUTPUT_TOKENS;
}
