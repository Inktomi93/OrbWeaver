// domain/credentials/persistence/aad — the one canonical site for the AES-256-GCM AAD string. Binds every
// ciphertext to its (ownerId, provider) slot; a row moved to a different slot fails GCM tag verification
// loudly rather than silently decrypting wrong. Must stay byte-identical across any refactor — never
// re-derive inline, every encrypt/decrypt calls aadFor.

import type { CredentialProvider } from "@orb/contracts/credentials";
import type { UserId } from "@orb/kit/ids";

export function aadFor(userId: UserId, provider: CredentialProvider): string {
  return `${userId}|${provider}`;
}
