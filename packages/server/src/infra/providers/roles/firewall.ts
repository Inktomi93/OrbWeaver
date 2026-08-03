// The credential firewall (runtime policy half). Every role dispatcher routes through
// `assertCredentialAllowed` before deriving a backend, fail-closed — denies any source×role pairing not
// explicitly allowed, plus the max-pro-sub owner-consent gate. Denials emit a securityEvent (vocab only,
// never key material) and throw ProviderError(kind:"forbidden").

import type { CredentialSource } from "@orb/contracts/credentials";
import { securityEvent } from "#foundation/observability";
import type { FirewallRequest, ProviderRole } from "../contract/index.ts";
import { ProviderError } from "../contract/index.ts";

// Exhaustive over ProviderRole (a new role without an entry is a tsc error). A source not listed is denied.
const ROLE_SOURCE_POLICY: Record<ProviderRole, readonly CredentialSource[]> = {
  chat: ["max-pro-sub", "openrouter", "vllm", "custom_openai"],
  // agent-sdk drives ONLY the two Claude-runtime skins (sub + OR-Anthropic); vLLM was REMOVED from the
  // agent-sdk api (owner ruling 2026-07-27 — `assertCoherent`/`disciplineOptions` reject it), so the firewall
  // row no longer advertises a pairing the sealed backend can never serve (stickler F8).
  agent: ["max-pro-sub", "openrouter"],
  embed: ["openrouter", "vllm", "local-light"],
  rerank: ["openrouter", "vllm", "local-light"],
  imageEmbed: ["openrouter", "vllm", "local-light"],
  summarize: ["openrouter", "vllm"],
  // The structured-output primitive — same posture as summarize (openrouter|vllm; the metered sub is
  // reached only through the chat outputFormat path, never this role). Owner ruling 2026-07-27 split.
  structured: ["openrouter", "vllm"],
  generateImage: ["openrouter"],
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
