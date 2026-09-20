// domain/sessions/context — DI bundle builder (db + injected clock + the token mint + bound token hasher +
// session timing). A composition surface, one of the few places allowed to reach the tokens/ named subsystem
// — it binds the mint + the peppered hasher so verbs read ctx.mintToken/ctx.hashToken/ctx.ttlMs/
// ctx.slideThrottleMs and import nothing from tokens/.

import type { Db } from "@orb/db";
import type { SessionId, UserId } from "@orb/kit/ids";
import { createPasswordHasher } from "#infra/auth";
import type { Sealed } from "#infra/crypto";
import type { SessionsContext } from "./contract/service.ts";
import { createIdTokenBox, createTokenHasher, mintSessionToken, SESSION_TTL_MS, SLIDE_THROTTLE_MS } from "./tokens/tokens.ts";

export function createSessionsContext(
  db: Db,
  now: () => number,
  sessionSecret: string | null,
  seedUserConnections: (userId: UserId) => Promise<void>,
): SessionsContext {
  // #141 — the OIDC id_token cipher, keyed off the SAME pepper (HKDF, own purpose label — tokens/tokens.ts).
  const idTokenBox = createIdTokenBox(sessionSecret);
  return {
    db,
    now,
    seedUserConnections,
    mintToken: mintSessionToken,
    hashToken: createTokenHasher(sessionSecret),
    // Bound from the same pepper as the token hasher. Unset pepper -> a disabled hasher that throws at call time.
    verifyPassword: createPasswordHasher(sessionSecret).verify,
    // #141 — THE ONE AAD SITE for the sealed OIDC id_token, seal and open bound here together so the two
    // halves cannot drift: the AAD is the session ROW id, byte-identical (the `domain/credentials` shape,
    // where the single `aadFor()` site is what makes a lifted row fail LOUDLY instead of decrypting wrong).
    // A blob moved to another session's row therefore fails GCM tag verification.
    sealIdToken: (idToken: string, sessionId: SessionId): Sealed => idTokenBox.encrypt(idToken, sessionId),
    openIdToken: (sealed: Sealed, sessionId: SessionId): string => idTokenBox.decrypt(sealed, sessionId),
    ttlMs: SESSION_TTL_MS,
    slideThrottleMs: SLIDE_THROTTLE_MS,
  };
}
