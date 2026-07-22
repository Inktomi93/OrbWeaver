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

/** The paid-key credential converted for a wire: the source picks the client dialect (OR Bearer skin vs
 *  first-party `x-api-key`), the key is the Bearer/`x-api-key` value. Never the whole credential (the runner
 *  only ever needs the source + the bare key). The `source` union is the ONE home for anth-direct's served
 *  sources — `client.ts`/`index.ts` derive it via `AnthDirectCredential["source"]` (no re-spelled alias). */
export interface AnthDirectCredential {
  readonly source: "openrouter" | "anthropic";
  readonly key: string;
}

/**
 * Extract the (source, key) an anth-direct client needs, or fail-closed. anth-direct serves exactly two paid
 * sources: `openrouter` (Bearer skin) and the first-party `anthropic` key (W11, `x-api-key`). Any other source
 * reaching the runner is an operator wiring error (the dispatcher guarantees the pairing, and the sub-exclusion
 * makes `max-pro-sub` unconstructable into these arms), so it throws `kind:"invalid"` (non-retryable). The
 * message names the SOURCE vocab only — never the key (the `ProviderError` core stays secret-free).
 */
export function requireAnthDirectCredential(credential: ResolvedCredential): AnthDirectCredential {
  if (credential.source === "openrouter" || credential.source === "anthropic") {
    return { source: credential.source, key: credential.apiKey };
  }
  throw new ProviderError({
    kind: "invalid",
    retryable: false,
    message: `anth-direct requires an "openrouter" or "anthropic" credential, got "${credential.source}"`,
  });
}
