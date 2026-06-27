import { createHmac } from "node:crypto";

// The peppered token-hash primitive (HMAC-SHA256 over an opaque token, keyed by the SESSION_SECRET
// pepper). The sessions + invites domains store a token's HASH, never the token itself; HMAC-peppering it
// means a DB leak ALONE can't forge a session/invite (the stored hash is useless without the pepper).
//
// Exposed as an injectable factory (the project's DI idiom): entry/ constructs it with
// `createTokenHasher(env.SESSION_SECRET)` and injects it into the consuming domains. This crypto
// primitive does NOT read env — the pepper VALUE arrives from foundation/env via the composition root,
// mirroring the SecretBox/key split. An unset pepper ⇒ a DISABLED hasher (hash() throws at CALL time);
// SESSION_SECRET is only required by the modes that mint cookie sessions, so the boot path degrades
// rather than crashing a single-user deploy that never hashes a token.

const HMAC_ALGORITHM = "sha256";

/** @public — the peppered token-hashing seam; constructed at entry/ and injected into sessions/invites. */
export interface TokenHasher {
  /** false when no SESSION_SECRET pepper is configured → hash() will throw. */
  readonly enabled: boolean;
  /** HMAC-SHA256 hex digest of `token`, keyed by the pepper. Throws when disabled. */
  hash: (token: string) => string;
}

/** Build a TokenHasher over the SESSION_SECRET pepper, or a disabled hasher when no pepper is set. */
export function createTokenHasher(pepper: string | null | undefined): TokenHasher {
  const key = pepper !== null && pepper !== undefined && pepper.length > 0 ? pepper : null;
  return {
    enabled: key !== null,
    hash(token: string): string {
      if (key === null) {
        throw new Error(
          "SESSION_SECRET is not configured but is required for token hashing. " +
            "Set SESSION_SECRET in the deployment env.",
        );
      }
      return createHmac(HMAC_ALGORITHM, key).update(token).digest("hex");
    },
  };
}
