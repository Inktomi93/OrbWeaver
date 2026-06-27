// infra/providers/roles/firewall — THE CREDENTIAL FIREWALL (the runtime policy half). Every role
// dispatcher routes through `assertCredentialAllowed` BEFORE deriving a backend, fail-closed. It is the
// belt complementing two other firewall layers:
//   1. The MINT gate (credentials domain): a `max-pro-sub` `ResolvedCredential` is unconstructable
//      except after `requireOwner` (D17) — the box belongs to the owner, not any admin.
//   2. The ENV firewall + strategy-isolation (agent-sdk backend `env.ts` + the dep-cruiser
//      `credential-firewall-openrouter-not-agent-sdk` rule): the Max-sub OAuth token is structurally
//      unreachable from an OpenRouter-routed spawn, and no openrouter module may reach the agent-sdk
//      backend through ANY import chain. Those are built/enforced elsewhere; this is the dispatch belt.
//
// THIS belt enforces (fail-closed — deny on anything not explicitly allowed):
//   • SOURCE × ROLE compatibility — which credential source may drive which role. e.g. a `max-pro-sub`
//     or `custom_openai` credential CANNOT drive `embed`/`rerank` (those endpoints don't authenticate
//     it); `generateImage` is hosted-only.
//   • The `max-pro-sub` OWNER-CONSENT belt (D17) — a turn funded by the owner's box credential that the
//     owner did not trigger is refused unless explicit owner consent is ON (default OFF: ban-prone + $).
// Denials emit a `securityEvent` (source/role/api vocab only — NEVER key material) and throw a typed
// `ProviderError(kind:"forbidden")`.

import type { CredentialSource } from "@orb/contracts/credentials";
import { securityEvent } from "#foundation/observability";
import type { FirewallRequest, ProviderRole } from "../contract";
import { ProviderError } from "../contract";

// The source-eligibility table — the ONE policy home, exhaustive over `ProviderRole` (a new role
// without an entry is a `tsc` error). A source NOT listed for a role is denied. File-local (the policy
// is internal); the public surface is `assertCredentialAllowed`.
const ROLE_SOURCE_POLICY: Record<ProviderRole, readonly CredentialSource[]> = {
  // The sub (agent-sdk), the OpenRouter skin/chat-completions, local vLLM, and a BYO endpoint can all
  // serve a chat turn (the (api, source) pairing is further gated by `deriveRunner`).
  chat: ["max-pro-sub", "openrouter", "vllm", "custom_openai"],
  // Agent mode is the agent-sdk backend only: the sub, the skin, or the local loopback — not a BYO key.
  agent: ["max-pro-sub", "openrouter", "vllm"],
  // Embeddings: a hosted key or the local engine. `max-pro-sub` doesn't authenticate embed endpoints;
  // a BYO chat endpoint doesn't serve them either.
  embed: ["openrouter", "vllm"],
  rerank: ["openrouter", "vllm"],
  imageEmbed: ["openrouter", "vllm"],
  // Summarize is a chat-turn shaper on the user's hosted/local backend (never the metered sub).
  summarize: ["openrouter", "vllm"],
  // Image generation is hosted-primary (OpenRouter image models) today.
  generateImage: ["openrouter"],
};

/** Deny: log a security event (vocab only, no secrets) and throw a fail-closed forbidden error. */
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

/**
 * The firewall check. Throws `ProviderError(kind:"forbidden")` (and emits a security event) when the
 * credential source is not allowed for the role, or a `max-pro-sub`-funded turn lacks owner consent.
 * Returns void on allow. Called by every role dispatcher before backend derivation (fail-closed).
 */
export function assertCredentialAllowed(req: FirewallRequest): void {
  const allowed = ROLE_SOURCE_POLICY[req.role];
  if (!allowed.includes(req.source)) {
    deny(req, `source "${req.source}" is not permitted for the "${req.role}" role`);
  }
  // The D17 owner-consent belt: the owner's box credential never funds a turn the owner didn't
  // consent to (default OFF). The mint gate already proved owner ownership; this gates non-owner use.
  if (req.source === "max-pro-sub" && req.ownerConsented !== true) {
    deny(req, 'the "max-pro-sub" owner credential requires explicit owner consent for this turn');
  }
}
