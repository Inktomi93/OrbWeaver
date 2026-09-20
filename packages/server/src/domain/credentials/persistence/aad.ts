// domain/credentials/persistence/aad — the one canonical site for the AES-256-GCM AAD string. Binds every
// ciphertext to its (ownerId, providerId) slot; a row moved to a different slot — or a provider id RESPELLED
// (inference program F2: `custom_openai` → `custom-openai` orphaned every row by construction) — fails GCM tag
// verification loudly rather than silently decrypting wrong. Must stay byte-identical across any refactor —
// never re-derive inline, every encrypt/decrypt calls aadFor.

import type { ProviderId } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";

export function aadFor(userId: UserId, provider: ProviderId): string {
  return `${userId}|${provider}`;
}
