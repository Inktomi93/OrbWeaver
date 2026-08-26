// domain/credentials/substrate/decrypt — the single decrypt-with-AAD seam (resolve + every saved-row diagnostic).
// A decrypt failure is a typed, non-retryable configuration error — NEVER the same state as an intentionally
// empty plaintext key. SECURITY: the raw crypto error is discarded; neither it, sealed bytes, nor AAD can
// enter the thrown error or log record.

import { getLog } from "#foundation/observability";
import type { Sealed, SecretBox } from "#infra/crypto";
import { CredentialsDecryptError } from "../contract/errors.ts";

function throwDecryptFailure(sealed: Sealed): never {
  const error = new CredentialsDecryptError([sealed.ciphertext, sealed.iv, sealed.tag]);
  getLog().error({ code: error.code, retryable: error.retryable }, error.message);
  throw error;
}

/** Open a sealed credential bound to `aad`, or throw the secret-free typed configuration error. */
export function decryptSealed(box: SecretBox, sealed: Sealed, aad: string): string {
  try {
    return box.decrypt(sealed, aad);
  } catch {
    return throwDecryptFailure(sealed);
  }
}
