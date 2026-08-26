// domain/credentials/substrate/decrypt — the single decrypt-with-AAD seam (resolve + every saved-row diagnostic).
// A decrypt failure is a typed, non-retryable configuration error — NEVER the same state as an intentionally
// empty plaintext key. SECURITY: the raw crypto error is discarded; neither it, sealed bytes, nor AAD can
// enter the thrown error or log record.

import { getLog } from "#foundation/observability";
import type { Sealed, SecretBox } from "#infra/crypto";
import { CredentialsDecryptError } from "../contract/errors.ts";

/** Open a sealed credential bound to `aad`, or throw the secret-free typed configuration error. */
export function decryptSealed(box: SecretBox, sealed: Sealed, aad: string): string {
  try {
    return box.decrypt(sealed, aad);
  } catch {
    const error = new CredentialsDecryptError([sealed.ciphertext, sealed.iv, sealed.tag]);
    getLog().error({ code: error.code, retryable: error.retryable }, error.message);
    // biome-ignore lint/style/useErrorCause: Raw crypto errors may retain key/ciphertext material; this trust boundary deliberately drops them.
    throw error;
  }
}
