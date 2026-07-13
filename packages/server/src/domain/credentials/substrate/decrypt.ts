// domain/credentials/substrate/decrypt — the single decrypt-with-AAD seam (resolve/test-health/fetch-models).
// A decrypt failure is treated as absent, never thrown: logs a redacted error and returns null.
// SECURITY: logs only errorMessage(err) — never the plaintext key, never the AAD.

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
