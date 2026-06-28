// domain/credentials/substrate/decrypt — the single decrypt-with-AAD seam (used by resolve / test-health /
// fetch-models; cross-verb value sharing is banned, so the shared helper lives in substrate). A decrypt
// failure (rotated CREDENTIALS_KEY, corrupt row, a row lifted into a different `(owner, provider)` slot →
// GCM tag mismatch) is treated as ABSENT, never thrown into the turn: it logs a redacted error and returns
// `null` so the caller falls through to "no credential" rather than crashing the request.
//
// SECURITY: this logs only `errorMessage(err)` (a GCM "unable to authenticate data" string — no secret) —
// NEVER the plaintext key, NEVER the AAD. The max-pro-sub OAuth token is keyless (no row), so it never
// reaches this path at all.

import { errorMessage } from "@orb/kit/error-message";
import { getLog } from "#foundation/observability";
import type { Sealed, SecretBox } from "#infra/crypto";

/** Open a sealed credential bound to `aad`, or `null` on any failure (logged, redacted). */
export function decryptSealed(box: SecretBox, sealed: Sealed, aad: string): string | null {
  try {
    return box.decrypt(sealed, aad);
  } catch (err) {
    getLog().error(
      { err: errorMessage(err) },
      "credentials: failed to decrypt user key (treating as absent — CREDENTIALS_KEY rotated?)",
    );
    return null;
  }
}
