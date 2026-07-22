// The credential firewall (runtime policy half). Every role dispatcher routes through
// `assertCredentialAllowed` before deriving a backend, fail-closed — denies any source×role pairing not
// explicitly allowed, plus the max-pro-sub owner-consent gate. Denials emit a securityEvent (vocab only,
// never key material) and throw ProviderError(kind:"forbidden").

import type { CredentialSource } from "@orb/contracts/credentials";
import { securityEvent } from "#foundation/observability";
import type { FirewallRequest, ProviderRole } from "../contract";
import { ProviderError } from "../contract";

// Exhaustive over ProviderRole (a new role without an entry is a tsc error). A source not listed is denied.
const ROLE_SOURCE_POLICY: Record<ProviderRole, readonly CredentialSource[]> = {
  // `anthropic` (W11): the first-party Anthropic key serves BOTH chat (anth-direct, tool-less) and agent
  // (the agent-sdk native x-api-key path — W11 owner ruling: users may run their agents on their own key).
  chat: ["max-pro-sub", "openrouter", "anthropic", "vllm", "custom_openai"],
  agent: ["max-pro-sub", "openrouter", "anthropic", "vllm"],
  embed: ["openrouter", "vllm", "local-light"],
  rerank: ["openrouter", "vllm", "local-light"],
  imageEmbed: ["openrouter", "vllm", "local-light"],
  // `anthropic` (MA-10): the first-party Anthropic key summarizes over the direct wire (anth-direct,
  // vision-capable). `backendForSource` forks it to anth-direct; the OR-skin summarize stays on openrouter.
  summarize: ["openrouter", "vllm", "anthropic"],
  generateImage: ["openrouter", "venice", "comfyui"],
};

function deny(req: FirewallRequest, reason: string): never {
  securityEvent(
    "credential_firewall_denied",
    { role: req.role, source: req.source, api: req.api ?? null, reason },
    `credential firewall denied ${req.source} for the ${req.role} role`,
  );
  throw new ProviderError({
    kind: "forbidden",
    retryable: false,
    message: `credential firewall: ${reason}`,
  });
}

export function assertCredentialAllowed(req: FirewallRequest): void {
  const allowed = ROLE_SOURCE_POLICY[req.role];
  if (!allowed.includes(req.source)) {
    deny(req, `source "${req.source}" is not permitted for the "${req.role}" role`);
  }
  if (req.source === "max-pro-sub" && req.ownerConsented !== true) {
    deny(req, 'the "max-pro-sub" owner credential requires explicit owner consent for this turn');
  }
}
