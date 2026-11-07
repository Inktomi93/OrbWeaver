// The JWT/JWKS VERIFY side of forward-header auth (mint stays entry/openid-client; verify is infra/jose —
// docs/law/Tier-5-Entry.md). A proxy forwards `X-Authentik-Jwt`; this module verifies it with a pinned alg
// allowlist against the keys the operator names in FORWARD_AUTH_JWKS, then maps the verified payload to a
// ForwardJwtClaims. It is the `verifyForwardJwt` port injected at the seam.
//
// SECURITY: the signed path skips the trusted-proxy peer gate, so its keys are the whole trust decision. They come
// from the operator's env source and nothing else. Never read a key, key set or key URL from a request: a caller
// who picks the keys signs any identity, the owner included, and a host allowlist cannot narrow the path on that host.
//
// FAIL-CLOSED, every path returns null (the sealed-executor / spine law: a reject is null, never a 500,
// never a fall-through to the unsigned path): jwtVerify throws on a bad signature, wrong alg, expiry,
// issuer/audience mismatch or alg-confusion, and the verifier catches it and returns null.
//
// Each graph owns its key set and injected transport; native JOSE memoizes remote retrieval and refetches
// on rotation. No native key set can retain another graph's execution or lifetime.

import { externalIdSchema, handleSchema } from "@orb/contracts/identity";
import type { JWTPayload } from "jose";
import { createLocalJWKSet, createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose";
import type { OperatorJwks } from "#foundation/env/record";
import type { Logger } from "#foundation/observability";
import { securityEvent } from "#foundation/observability";
import type { ForwardJwtClaims, ForwardJwtVerifier, ForwardJwtVerifyArgs, JwksKeySet, JwksReader, OperatorKeys } from "./contract.ts";

// authentik joins groups with "|"; tolerate commas too. Mirrors modes/forward-header.ts' unsigned parser
// (module-private there — a five-line repeat beats an infra-internal export just to share it).
const GROUP_SEPARATOR = /[|,]/u;

// The asymmetric algs a published key set can verify. Defense-in-depth: jose already blocks alg:none and
// key/alg-class confusion, but pinning means a future JWKS quirk or jose behavior change can't widen what
// we accept (an attacker can't downgrade an RS256 key to an HS256 MAC over the public key material).
const PINNED_ALGS = ["RS256", "ES256"] as const;

const REQUIRED_KEY_URL_PROTOCOL = "https:";
// A token with no expiry stays valid forever once the operator's key signed it.
const REQUIRED_CLAIMS = ["exp"];
// jwtVerify raises its own error class for every verdict, so anything else came from retrieving the keys.
const KEY_FETCH_FAILED = "key_fetch_failed";

/** Hold the operator's key set for one graph. Its remote retrieval runs on the graph's injected execution. */
export function createOperatorKeys(source: OperatorJwks, execution: typeof fetch): OperatorKeys {
  const set: JwksKeySet = source.kind === "url" ? createRemoteJWKSet(source.url, { [customFetch]: execution }) : createLocalJWKSet(source.jwks);
  let disposed = false;
  return {
    keys: () => (disposed ? null : set),
    [Symbol.dispose]: (): void => {
      disposed = true;
    },
  };
}

/** Read the OIDC issuer's discovered `jwks_uri` for back-channel logout, holding the set for the one URI in use. */
export function createJwksReader(execution: typeof fetch, log: Logger): JwksReader {
  let held: { readonly uri: string; readonly set: JwksKeySet } | null = null;
  let disposed = false;
  return {
    jwksFor: (jwksUri): JwksKeySet | null => {
      if (disposed) {
        return null;
      }
      if (held?.uri === jwksUri) {
        return held.set;
      }
      const url = URL.parse(jwksUri);
      if (url === null) {
        securityEvent("jwks_rejected", { reason: "url-parse" }, "security: issuer JWKS URL failed to parse — rejecting", log);
        return null;
      }
      if (url.protocol !== REQUIRED_KEY_URL_PROTOCOL) {
        securityEvent("jwks_rejected", { jwksHost: url.host, reason: "non-https" }, "security: issuer JWKS URL is not https — rejecting", log);
        return null;
      }
      // JOSE owns lazy retrieval, caching and key rotation; the injected execution retains the caller's physical guard and lifetime.
      const set = createRemoteJWKSet(url, { [customFetch]: execution });
      held = { uri: jwksUri, set };
      return set;
    },
    [Symbol.dispose]: (): void => {
      disposed = true;
      held = null;
    },
  };
}

function groupsFromClaim(claim: unknown): string[] {
  if (Array.isArray(claim)) {
    return claim.filter((g): g is string => typeof g === "string");
  }
  if (typeof claim === "string" && claim.length > 0) {
    return claim
      .split(GROUP_SEPARATOR)
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
  }
  return [];
}

/** Verify `jwt` against `keyset` with the pinned alg allowlist, issuer and audience, returning the payload — or null
 *  on ANY failure (bad signature, wrong alg, expired, no expiry, issuer/audience mismatch, alg-confusion, a failed
 *  key fetch). jose throws on every one of those; we catch and null. The log carries jose's fixed code, never token bytes. */
async function jwtVerifyOrNull(
  { jwt, issuer, audience }: Pick<ForwardJwtVerifyArgs, "jwt" | "issuer" | "audience">,
  keyset: JwksKeySet,
  log: Logger,
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(jwt, keyset, {
      algorithms: [...PINNED_ALGS],
      issuer,
      audience,
      requiredClaims: REQUIRED_CLAIMS,
    });
    return payload;
  } catch (err) {
    const reason = err instanceof errors.JOSEError ? err.code : KEY_FETCH_FAILED;
    securityEvent("jwt_verify_failed", { reason }, "security: forwarded JWT refused (`reason` names the failed step) — rejecting", log);
    return null;
  }
}

/** Map a verified JWT payload to a ForwardJwtClaims, or null for a present `sub` that does not parse. `handle` is
 *  `preferred_username` (undefined when absent — `resolveSignedJwt` refuses that); `externalId` is `sub`;
 *  `email` the standard claim; groups tolerate array or separator-joined string. */
function claimsFromPayload(payload: JWTPayload, log: Logger): ForwardJwtClaims | null {
  const handle = handleSchema.safeParse(payload["preferred_username"]).data;
  // The verified JWT's `sub` IS the stable SSO external id (the ExternalId brand's own definition); this parse
  // is the one place the wire string becomes the branded value. SECURITY: a present `sub` that does not parse
  // refuses the token. Read as "no subject", it would skip the bind-once mismatch check against a bound row.
  const externalId = payload.sub === undefined ? null : externalIdSchema.safeParse(payload.sub).data;
  if (externalId === undefined) {
    securityEvent("jwt_subject_unparseable", {}, "security: forwarded JWT verified but its sub claim does not parse — rejecting", log);
    return null;
  }
  const rawEmail = payload["email"];
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;
  return {
    handle,
    externalId,
    groups: groupsFromClaim(payload["groups"]),
    email,
  };
}

/** The `ForwardJwtVerifier` the seam injects into infra/auth. Wires the operator's keys → jwtVerify → claim mapping;
 *  returns null on any signature/shape failure and once the owning graph is disposed. */
export function createForwardJwtVerifier(operatorKeys: OperatorKeys["keys"], log: Logger): ForwardJwtVerifier {
  return {
    verify: async (args: ForwardJwtVerifyArgs): Promise<ForwardJwtClaims | null> => {
      const keyset = operatorKeys();
      if (keyset === null) {
        return null;
      }
      const payload = await jwtVerifyOrNull(args, keyset, log);
      if (payload === null) {
        return null;
      }
      return claimsFromPayload(payload, log);
    },
  };
}
