// infra/providers/backends/anth-direct/credential-guard — the one place the anth-direct runner converts a
// brand-protected `ResolvedCredential` into the bare OR key it sends as the Bearer `authToken`, fail-closing
// on a wrong source. The role dispatcher already routes `source==="openrouter"` here (deriveRunner), but the
// runner RE-ASSERTS at its own door (defense in depth: a mis-wired composition root must fail with a TYPED
// error, never a `TypeError` on a missing `.apiKey`).
//
// THE SUB-EXCLUSION AT THE RUNNER DOOR (part 02 §3d, tier-1): this guard is the type-level + runtime backstop
// of the sub-exclusion. A `max-pro-sub` credential carries NO key material (credentials/index.ts:139-143 —
// "No row, no key") and does NOT typecheck into the OR arm; reaching this guard with any non-`openrouter`
// source is an operator wiring error, so it throws `kind:"invalid"` (non-retryable). The SECOND, load-bearing
// half of the sub-exclusion — the SDK's AMBIENT credential surface — is neutralized in `client.ts` (the belt);
// this guard covers the resolved OBJECT, the belt covers the SDK's lazy config/OAuth minting.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import { ProviderError } from "../../contract";

/** The v1 credential source anth-direct serves — a wire literal, named so a call site states intent. The
 *  optional first-party `anthropic` source (W11) lands as a second arm here + `client.ts`. */
const OPENROUTER_SOURCE = "openrouter";

/**
 * Extract the OpenRouter API key from a resolved credential, or fail-closed. A non-`openrouter` source
 * reaching the anth-direct runner is an operator wiring error (the dispatcher guarantees the pairing, and the
 * sub-exclusion makes `max-pro-sub` unconstructable into this arm), so it throws `kind:"invalid"`
 * (non-retryable). The message names the SOURCE vocab only — never the key (the `ProviderError` core stays
 * secret-free).
 */
export function requireAnthDirectKey(credential: ResolvedCredential): string {
  if (credential.source !== OPENROUTER_SOURCE) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `anth-direct requires a "${OPENROUTER_SOURCE}" credential, got "${credential.source}"`,
    });
  }
  return credential.apiKey;
}
