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
// On a CLEAN resolve to the LOCAL vLLM engine, two more deterministic gaps (`resolveLocalVllmAvailability`):
//   - posture `off` / no GPU (`!vllmAvailable`)                       → engine-off (disabled/absent).
//   - posture `adopt-only` + the gen engine live-status DOWN         → engine-down. adopt-only is a PASSIVE
//     consumer (never spawns, `postureManages` false), so a dead engine STAYS dead → refuse up front rather
//     than fail LATE. A present-but-ASLEEP (or warming/up) engine reads AVAILABLE — it wakes on the turn.
//   - posture `adopt-or-start` + DOWN                                → AVAILABLE: the fleet MANAGER spawns on
//     the turn (cold-slow, not doomed) — refusing it would be a false negative on a connection that WILL come up.
// A configured HOSTED connection reads AVAILABLE and is NEVER pre-flighted — a bad key still fails at send with
// the existing provider error; we only pre-refuse the DETERMINISTIC cases (latency + false negatives forbid a
// hosted preflight). `unknown` reachability (no supervisor telemetry) NEVER refuses. An UNEXPECTED error (not
// one of the deterministic classes above) is RE-THROWN, never laundered into a false "unavailable".

import type { ChatSendAvailability } from "@orb/contracts/connection";
import { DomainForbiddenError, DomainNoCredentialError } from "@orb/kit/errors";
import type { ConnectionContext } from "../context.ts";
import { AgentModelHealError, ConnectionRoutingError } from "../contract/errors.ts";
import type { CheckChatAvailabilityParams } from "../contract/params.ts";
import type { ConnectionService } from "../contract/service.ts";

const UNAVAILABLE_NO_CONNECTION: ChatSendAvailability = { available: false, cause: "no-connection" };
const UNAVAILABLE_ENGINE_OFF: ChatSendAvailability = { available: false, cause: "engine-off" };
const UNAVAILABLE_ENGINE_DOWN: ChatSendAvailability = { available: false, cause: "engine-down" };
const AVAILABLE: ChatSendAvailability = { available: true };

/** The LOCAL vLLM serveability arm — off/absent → engine-off; a DOWN engine under the passive `adopt-only`
 *  posture → engine-down (it won't self-recover); every other state (asleep/warming/up, or ANY state under the
 *  spawn-on-demand `adopt-or-start` manager, or unknown telemetry) → available. */
function resolveLocalVllmAvailability(ctx: ConnectionContext): ChatSendAvailability {
  if (ctx.enginesPosture === "off" || !ctx.vllmAvailable) {
    return UNAVAILABLE_ENGINE_OFF;
  }
  if (ctx.enginesPosture === "adopt-only" && ctx.localGenEngineReachability() === "down") {
    return UNAVAILABLE_ENGINE_DOWN;
  }
  return AVAILABLE;
}

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
    // Only the local vLLM arm has deterministic reachability gaps; every hosted/agent source is unconditionally
    // wired (and never pre-flighted).
    return resolvedSource === "vllm" ? resolveLocalVllmAvailability(ctx) : AVAILABLE;
  };
}
