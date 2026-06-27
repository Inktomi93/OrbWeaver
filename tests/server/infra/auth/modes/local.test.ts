import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthConfig, ResolveDeps, ResolvedIdentity } from "@orb/server/infra/auth";
import { MODE_RESOLVERS } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// `local` mode resolver — a PURE passthrough to the shared cookie read path (the `_config` arg is ignored;
// the password mint/verify half lives elsewhere). Reached via MODE_RESOLVERS.local (the resolver isn't on
// the barrel). The distinctive invariants: it delegates the cookie validate, and its outcome is invariant
// under `config`.

const resolveLocal = MODE_RESOLVERS.local;

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "local",
    fallback: "owner",
    defaultHandle: "owner",
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...over,
  };
}

const headers = (init: Record<string, string> = {}): Headers => new Headers(init);
const COOKIE = { cookie: "__Host-orb_session=t" };
const IDENTITY: ResolvedIdentity = {
  externalId: null,
  handle: castId<Handle>("alice"),
  groups: [],
};
const validatorDeps: ResolveDeps = {
  validateCookie: (): Promise<ResolvedIdentity | null> => Promise.resolve(IDENTITY),
};

describe("resolveLocal", () => {
  test("no validateCookie injected → null (delegates to the inert cookie path)", async () => {
    expect(await resolveLocal(headers(COOKIE), cfg(), {})).toBeNull();
  });

  test("with a validator + our cookie → the cookie-path identity (delegation)", async () => {
    expect(await resolveLocal(headers(COOKIE), cfg(), validatorDeps)).toEqual(IDENTITY);
  });

  test("the outcome is invariant under `config` (the resolver ignores its config arg)", async () => {
    const a = await resolveLocal(headers(COOKIE), cfg({ fallback: "deny" }), validatorDeps);
    const b = await resolveLocal(
      headers(COOKIE),
      cfg({ fallback: "owner", defaultHandle: "someone-else", trustedLocalHosts: ["x"] }),
      validatorDeps,
    );
    expect(a).toEqual(b);
    expect(a).toEqual(IDENTITY);
  });
});
