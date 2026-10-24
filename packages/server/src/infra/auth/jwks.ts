// The JWT/JWKS VERIFY side of forward-header auth (mint stays entry/openid-client; verify is infra/jose —
// docs/law/Tier-5-Entry.md). authentik forwards `X-Authentik-Jwt` alongside `X-Authentik-Meta-Jwks`, the
// latter being either the JWKS JSON literal or an https URL to it. This module builds a jose key-set from
// whichever shape arrives and verifies the JWT against it with a pinned alg allowlist, then maps the
// verified payload to a ForwardJwtClaims. It is the `verifyForwardJwt` port injected at the seam.
//
// FAIL-CLOSED, every path returns null (the sealed-executor / spine law: a reject is null, never a 500,
// never a fall-through to the unsigned path). This covers points (3) and (5) of the five fail-closed
// points (points 1/2/4 live in modes/forward-header.ts):
//   (3) jwksFor nulls on bad-JSON / non-https / off-allowlist — a request-supplied JWKS is the lone
//       user-influenced input, so a remote URL must be https AND (when an allowlist is set) on it.
//   (5) jwtVerify throws (bad signature, wrong alg, expired, issuer/audience mismatch, alg-confusion) →
//       the verifier catches and returns null.
//
// LRU-bounded, sha256-keyed cache: the prior neo cache keyed on the raw header value with no eviction, so
// a hostile upstream varying the header per request grew it unbounded. Keyed on sha256(metaJwks) and
// capped, a varied-whitespace body that parses to the same JSON still churns keys but eviction bounds it.
// Each graph owns its key cache and injected transport; native JOSE memoizes remote retrieval and refetches
// on rotation. No cached native key set can retain another graph's execution or lifetime.

import { createHash } from "node:crypto";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { JWTPayload } from "jose";
import { createLocalJWKSet, createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import type { Logger } from "#foundation/observability";
import { securityEvent } from "#foundation/observability";
import type { ForwardJwtClaims, ForwardJwtVerifier, ForwardJwtVerifyArgs, JwksKeySet, JwksReader } from "./contract.ts";
import { normalizeHost } from "./host.ts";

// authentik joins groups with "|"; tolerate commas too. Mirrors modes/forward-header.ts' unsigned parser
// (module-private there — a five-line repeat beats an infra-internal export just to share it).
const GROUP_SEPARATOR = /[|,]/u;

// The asymmetric algs authentik signs with. Defense-in-depth: jose already blocks alg:none and
// key/alg-class confusion, but pinning means a future JWKS quirk or jose behavior change can't widen what
// we accept (an attacker can't downgrade an RS256 key to an HS256 MAC over the public key material).
const PINNED_ALGS = ["RS256", "ES256"] as const;

/** Bound on the LRU. JWKS rotation is rare so 32 is generous; the cap defeats the hostile upstream that
 *  varies the header per request, not a legitimate rotating key set. */
const JWKS_CACHE_CAP = 32;

type AnyKeySet = JwksKeySet;

/** Tiny LRU: Map iteration order = insertion order; `delete+set` on read promotes to most-recent; on
 *  insert past cap, evict the least-recent (oldest key). No dep added. */
class LruMap<K, V> {
  private readonly map = new Map<K, V>();
  private readonly cap: number;
  constructor(cap: number) {
    this.cap = cap;
  }
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: K, v: V): void {
    if (this.map.has(k)) {
      this.map.delete(k);
    } else if (this.map.size >= this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
    this.map.set(k, v);
  }
  clear(): void {
    this.map.clear();
  }
}

function cacheKey(metaJwks: string): string {
  return createHash("sha256").update(metaJwks).digest("hex");
}

/**
 * Build (or fetch from cache) the JWKS for verifying a forward-header JWT. Returns null on any rejection —
 * bad JSON, non-https URL, off-allowlist host (fail-closed point 3) — emitting `securityEvent`. Callers
 * treat null as "identity rejected" (→ owner fallback or 401). The literal `{…}` path accepts any JWKS
 * regardless of the allowlist because it is not an egress vector; the URL path is the only user-influenced
 * outbound reference, so it is https-gated + allowlist-gated.
 */
interface JwksReadState {
  readonly cache: LruMap<string, AnyKeySet>;
  readonly execution: typeof fetch;
  readonly log: Logger | undefined;
}

function readJwks({ cache, execution, log }: JwksReadState, metaJwks: string, allowlist: readonly string[]): AnyKeySet | null {
  const key = cacheKey(metaJwks);
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const trimmed = metaJwks.trim();
  let set: AnyKeySet;
  if (trimmed.startsWith("{")) {
    try {
      // JSON.parse returns `unknown` (ts-reset); createLocalJWKSet validates the shape and throws on a
      // bad set, so the boundary cast is covered by the catch (both parse + shape errors).
      set = createLocalJWKSet(JSON.parse(trimmed) as Parameters<typeof createLocalJWKSet>[0]);
    } catch {
      securityEvent("jwks_rejected", { reason: "parse" }, "security: forwarded JWKS literal failed to parse — rejecting", log);
      return null;
    }
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      securityEvent("jwks_rejected", { reason: "url-parse" }, "security: forwarded JWKS URL failed to parse — rejecting", log);
      return null;
    }
    if (url.protocol !== "https:") {
      securityEvent("jwks_rejected", { jwksHost: url.host, reason: "non-https" }, "security: forwarded JWKS URL is not https — rejecting", log);
      return null;
    }
    if (allowlist.length > 0 && !allowlist.includes(normalizeHost(url.host))) {
      securityEvent(
        "jwks_rejected",
        { jwksHost: url.host, reason: "off-allowlist" },
        "security: forwarded JWKS URL host is not on FORWARD_AUTH_JWKS_ALLOWLIST — rejecting",
        log,
      );
      return null;
    }
    // JOSE owns lazy retrieval, caching and key rotation; the injected execution retains the caller's
    // physical guard and lifetime, while this reader keeps the HTTPS/allowlist admission unchanged.
    set = createRemoteJWKSet(url, { [customFetch]: execution });
  }
  cache.set(key, set);
  return set;
}

/** Own one configured client's key cache without replacing another graph's keys or fetch operation. */
export function createJwksReader(execution: typeof fetch, log?: Logger): JwksReader {
  const state: JwksReadState = { cache: new LruMap<string, AnyKeySet>(JWKS_CACHE_CAP), execution, log };
  const { cache } = state;
  let disposed = false;
  return {
    jwksFor: (metaJwks, allowlist) => (disposed ? null : readJwks(state, metaJwks, allowlist)),
    [Symbol.dispose]: (): void => {
      disposed = true;
      cache.clear();
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

/** Verify `jwt` against `keyset` with the pinned alg allowlist + optional issuer/audience, returning the
 *  payload — or null on ANY failure (bad signature, wrong alg, expired, issuer/audience mismatch,
 *  alg-confusion): fail-closed point 5. jose throws on every one of those; we catch and null. */
async function jwtVerifyOrNull(
  { jwt, issuer, audience }: Pick<ForwardJwtVerifyArgs, "jwt" | "issuer" | "audience">,
  keyset: AnyKeySet,
  log: Logger | undefined,
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(jwt, keyset, {
      algorithms: [...PINNED_ALGS],
      ...(issuer !== undefined ? { issuer } : {}),
      ...(audience !== undefined ? { audience } : {}),
    });
    return payload;
  } catch {
    securityEvent("jwt_verify_failed", {}, "security: forwarded JWT verification failed (signature / alg / expiry / issuer / audience) — rejecting", log);
    return null;
  }
}

/** Map a verified JWT payload to a ForwardJwtClaims. `handle` is `preferred_username` (undefined when
 *  absent — the seam's fail-closed point 4 rejects that); `externalId` is `sub`; `email` the standard
 *  claim; groups tolerate array or separator-joined string. */
function claimsFromPayload(payload: JWTPayload): ForwardJwtClaims {
  const handle = typeof payload["preferred_username"] === "string" ? castId<Handle>(payload["preferred_username"]) : undefined;
  // castId at the untrusted seam: the verified JWT's `sub` IS the stable SSO external id (the ExternalId
  // brand's own definition) — this parse is the one place the wire string becomes the branded value.
  const externalId = typeof payload.sub === "string" ? castId<ExternalId>(payload.sub) : null;
  const rawEmail = payload["email"];
  const email = typeof rawEmail === "string" && rawEmail.length > 0 ? rawEmail : null;
  return {
    handle,
    externalId,
    groups: groupsFromClaim(payload["groups"]),
    email,
  };
}

/** The `ForwardJwtVerifier` the seam injects into infra/auth. Wires its owned key reader → jwtVerify → claim mapping;
 *  returns null on any JWKS-build or signature/shape failure (fail-closed points 3 + 5). */
export function createForwardJwtVerifier(readKeyset: JwksReader["jwksFor"], log?: Logger): ForwardJwtVerifier {
  return {
    verify: async (args: ForwardJwtVerifyArgs): Promise<ForwardJwtClaims | null> => {
      const keyset = readKeyset(args.metaJwks, args.allowlist);
      if (keyset === null) {
        return null;
      }
      const payload = await jwtVerifyOrNull(args, keyset, log);
      if (payload === null) {
        return null;
      }
      return claimsFromPayload(payload);
    },
  };
}
