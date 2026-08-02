// infra/providers/roles/agent — the `agent` role dispatcher (agent mode = chat + tools + a multi-turn
// loop; agent-sdk-only today). Rides the same firewall base as chat. agent mode is always the agent-sdk
// backend, so the backend key is fixed; the firewall still gates the source (the two Claude-runtime skins:
// sub / OR-Anthropic — vLLM is NOT agent-sdk-eligible since 2026-07-27, and BYO is never allowed) + the
// owner-consent belt.

import type { AgentTurnRequest, ChatResult, ProviderDeps } from "../contract";
import { requireBackend, runRole } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "agent";
const AGENT_BACKEND = "agent-sdk";

/** Bind the agent-turn dispatcher to the wired backend registry. */
export function createAgentRole(deps: ProviderDeps): (req: AgentTurnRequest) => Promise<ChatResult> {
  return async (req) => {
    assertCredentialAllowed({
      role: ROLE,
      source: req.credential.source,
      api: "agent-sdk",
      ownerConsented: req.ownerConsented,
    });
    const backend = requireBackend(deps.backends, AGENT_BACKEND, ROLE);
    return await runRole({
      backend,
      impl: backend.runAgentTurn,
      role: ROLE,
      req,
      attrs: { "provider.source": req.credential.source, "provider.model": req.model },
    });
  };
}
