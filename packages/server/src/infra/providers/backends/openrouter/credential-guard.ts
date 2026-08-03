// infra/providers/backends/openrouter/credential-guard — the one place every openrouter runner converts a
// brand-protected `ResolvedCredential` into the bare API key it sends, fail-closing on a wrong source. The
// role dispatcher already routes `source==="openrouter"` here, but the runner re-asserts at its own door
// (defence in depth: a mis-wired composition root must fail with a TYPED error, never a `TypeError` on a
// missing `.apiKey`).

import type { ResolvedCredential } from "@orb/contracts/credentials";
import { ProviderError } from "../../contract/index.ts";

/** The credential source this whole family serves — a wire literal, named so a call site states intent. */
const OPENROUTER_SOURCE = "openrouter";

/**
 * Extract the OpenRouter API key from a resolved credential, or fail-closed. A non-`openrouter` source
 * reaching an openrouter runner is an operator wiring error (the dispatcher guarantees the pairing), so it
 * throws `kind:"invalid"` (non-retryable) rather than degrading. The message names the source vocab only —
 * never the key (the `ProviderError` core stays secret-free).
 */
export function requireOpenRouterApiKey(credential: ResolvedCredential, runnerLabel: string): string {
  if (credential.source !== OPENROUTER_SOURCE) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `openrouter ${runnerLabel} runner requires a "${OPENROUTER_SOURCE}" credential, got "${credential.source}"`,
    });
  }
  return credential.apiKey;
}
