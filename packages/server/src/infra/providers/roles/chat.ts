// infra/providers/roles/chat — the `chat` role dispatcher (the firewall + routing for a stateless chat
// turn). Firewall-checks, derives the sealed backend from {api, source}, and runs it. The domain builds
// the `ChatRequest` once and calls this; it never sees the runner.

import type { ChatRequest, ChatResult, ProviderDeps } from "../contract";
import { deriveRunner, requireBackend, requireRoleImpl } from "./dispatch";
import { assertCredentialAllowed } from "./firewall";

const ROLE = "chat";

/** Bind the chat dispatcher to the wired backend registry. */
export function createChatRole(deps: ProviderDeps): (req: ChatRequest) => Promise<ChatResult> {
  return async (req) => {
    assertCredentialAllowed({
      role: ROLE,
      source: req.credential.source,
      api: req.api,
      ownerConsented: req.ownerConsented,
    });
    const backend = requireBackend(deps.backends, deriveRunner(req.api, req.credential.source), ROLE);
    return await requireRoleImpl(backend, backend.runChatTurn, ROLE)(req);
  };
}
