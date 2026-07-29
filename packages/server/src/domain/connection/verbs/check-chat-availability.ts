// verb: checkChatAvailability — the honest-refusal pre-send gate for the composer (#54). Answers ONE
// question deterministically, WITHOUT firing a turn or any API call: "would this chat's own resolved
// connection (`resolveChat → deriveRunner → requireBackend`) succeed?"
//
// ENGINE-AGNOSTIC by construction: it runs the SAME `resolveChat` the turn runs (selection + coherence +
// credential-presence), so whatever mode the chat resolves to (local vLLM, OpenRouter, the two agent-sdk
// Claude skins, custom-byo) is judged by the turn's own resolution — never a per-engine special case. The
// resolution's DETERMINISTIC throws ARE the unavailable signal:
//   - `ConnectionRoutingError`/`AgentModelHealError` (incoherent (api, source)) → no-connection.
//   - `DomainNoCredentialError` (a hosted mode with no configured credential row)  → no-connection.
//   - `DomainForbiddenError` (an owner-only source pinned by a non-owner)          → no-connection.
// On a CLEAN resolve the one remaining deterministic gap is a local engine that is disabled/absent: a chat
// resolving to `vllm` while `!vllmAvailable` (ENGINES_POSTURE=off / no GPU) → engine-off. A present-but-
// ASLEEP engine reads AVAILABLE (it wakes on the turn). A configured HOSTED connection reads AVAILABLE and
// is NEVER pre-flighted — a bad key still fails at send with the existing provider error; we only pre-refuse
// the deterministic "nothing to serve with" cases (latency + false negatives forbid a hosted preflight).
// An UNEXPECTED error (not one of the deterministic classes above) is RE-THROWN, never laundered into a
// false "unavailable" — the gate lies about nothing.

import type { ChatSendAvailability } from "@orb/contracts/connection";
import { DomainForbiddenError, DomainNoCredentialError } from "@orb/kit/errors";
import type { ConnectionContext } from "../context";
import { AgentModelHealError, ConnectionRoutingError } from "../contract/errors";
import type { CheckChatAvailabilityParams } from "../contract/params";
import type { ConnectionService } from "../contract/service";

const UNAVAILABLE_NO_CONNECTION: ChatSendAvailability = { available: false, cause: "no-connection" };
const UNAVAILABLE_ENGINE_OFF: ChatSendAvailability = { available: false, cause: "engine-off" };
const AVAILABLE: ChatSendAvailability = { available: true };

export function createCheckChatAvailability(ctx: ConnectionContext, resolveChat: ConnectionService["resolveChat"]): ConnectionService["checkChatAvailability"] {
  return async (params: CheckChatAvailabilityParams): Promise<ChatSendAvailability> => {
    let resolvedSource: string;
    try {
      const resolved = await resolveChat({ principal: params.principal, routableChat: params.routableChat });
      resolvedSource = resolved.credential.source;
    } catch (error) {
      // The turn's OWN resolution throws deterministically for the "nothing serveable" cases — that throw IS
      // the refusal signal. An unexpected error is a real fault: re-throw it rather than fake "unavailable".
      if (error instanceof ConnectionRoutingError || error instanceof AgentModelHealError) {
        return UNAVAILABLE_NO_CONNECTION;
      }
      if (error instanceof DomainNoCredentialError || error instanceof DomainForbiddenError) {
        return UNAVAILABLE_NO_CONNECTION;
      }
      throw error;
    }
    // Clean resolve: the only remaining deterministic gap is a local engine that isn't running at all. A chat
    // resolving to `vllm` while the engine posture is off (or no GPU) has no registered backend — the exact
    // `requireBackend` throw that fails LATE at send today. Every hosted/agent source is unconditionally wired.
    if (resolvedSource === "vllm" && !ctx.vllmAvailable) {
      return UNAVAILABLE_ENGINE_OFF;
    }
    return AVAILABLE;
  };
}
