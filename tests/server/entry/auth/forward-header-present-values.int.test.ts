// A forwarded identity value that is present is the proxy's word even when empty: one that does not parse refuses the
// request, never defers to a lower-precedence header, and never turns a refused subject into "no subject". A refused
// presented identity is terminal: it answers anonymous and never reaches the owner fallback.
// @subject packages/server/src/infra/auth/modes/forward-header.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, FORWARD_AUTH_TRUSTED_PROXIES_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, forwardHeaders } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { authMe, FORWARD_USERNAME_CLAIM, policy, signedForwardRoot } from "../_auth-roots.ts";

const PROXY_PEER = "10.1.2.3";
const TRUSTED_PROXIES = "10.0.0.0/8";
const LOOPBACK = "127.0.0.1";
const LOOPBACK_PROXY = "127.0.0.1/32";
const ANONYMOUS = { authenticated: false, handle: null, role: null };
const AUTHENTIK_USER = "x-authentik-username";
const AUTHENTIK_UID = "x-authentik-uid";
const AUTHELIA_USER = "remote-user";

// The default header chain (no FORWARD_AUTH_USER_HEADER), with no owner fallback to blur an unauthenticated answer.
function unsignedChain(): Promise<ServerTestHarness> {
  return createServerHarness({
    physicalPeer: () => PROXY_PEER,
    env: { [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: TRUSTED_PROXIES, [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny" },
  });
}

test("an empty authentik username refuses the request rather than deferring to a lower header that names the owner", async () => {
  await using root = await unsignedChain();
  const ownerHandle = (await root.principalFor(root.ownerId)).handle;
  expect(await authMe(root, { [AUTHENTIK_USER]: "", [AUTHELIA_USER]: ownerHandle })).toEqual(ANONYMOUS);
});

test("an empty authentik uid against a row bound to a subject refuses the login rather than matching by handle", async () => {
  await using root = await unsignedChain();
  const bound = { [AUTHENTIK_USER]: "bound-member", [AUTHENTIK_UID]: "bound-member-subject" };
  expect((await authMe(root, bound)).authenticated).toBe(true);
  expect(await authMe(root, { ...bound, [AUTHENTIK_UID]: "" })).toEqual(ANONYMOUS);
});

// A loopback peer with the owner fallback on: the case where a refused identity could otherwise become the owner.
function loopbackUnsignedFallback(): Promise<ServerTestHarness> {
  return createServerHarness({
    physicalPeer: () => LOOPBACK,
    env: { [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: LOOPBACK_PROXY, [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "owner" },
  });
}

test.for([
  { name: "no identity header at all keeps the owner fallback", headers: {}, owner: true },
  { name: "an empty username is refused, not the owner", headers: { [AUTHENTIK_USER]: "" }, owner: false },
  { name: "a member with an empty uid is refused, not the owner", headers: { [AUTHENTIK_USER]: "fallback-member", [AUTHENTIK_UID]: "" }, owner: false },
  { name: "an empty username beside a remote-user is refused, not the owner", headers: { [AUTHENTIK_USER]: "", [AUTHELIA_USER]: "owner" }, owner: false },
])("loopback with the owner fallback, unsigned: $name", async ({ headers, owner }) => {
  await using root = await loopbackUnsignedFallback();
  const ownerHandle = (await root.principalFor(root.ownerId)).handle;
  expect(await authMe(root, headers)).toEqual(owner ? { authenticated: true, handle: ownerHandle, role: "owner" } : ANONYMOUS);
});

test.for([
  { name: "no identity header at all keeps the owner fallback", claims: null, owner: true },
  { name: "a JWT whose sub does not parse is refused, not the owner", claims: { [FORWARD_USERNAME_CLAIM]: "jwt-fallback-member", sub: "" }, owner: false },
  { name: "a JWT with no username is refused, not the owner", claims: { sub: "jwt-fallback-subject" }, owner: false },
  {
    name: "a JWT that fails verification is refused, not the owner",
    claims: { [FORWARD_USERNAME_CLAIM]: "jwt-fallback-member", sub: "jwt-fallback-subject", aud: "another-audience" },
    owner: false,
  },
])("loopback with the owner fallback, signed: $name", async ({ claims, owner }) => {
  await using root = await createAuthModeRoot("forward-header", { physicalPeer: () => LOOPBACK, env: { [AUTH_FALLBACK_KEY]: "owner" } });
  const ownerHandle = (await root.principalFor(root.ownerId)).handle;
  const headers = claims === null ? {} : await forwardHeaders(root.issuer, claims);
  expect(await authMe(root, headers)).toEqual(owner ? { authenticated: true, handle: ownerHandle, role: "owner" } : ANONYMOUS);
});

test("a verified JWT with an empty sub refuses the login rather than matching a bound row by handle", async () => {
  const signed = await signedForwardRoot(policy({}));
  await using root = signed.root;
  const bound = await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: "jwt-bound-member", sub: "jwt-bound-member-subject" });
  expect((await authMe(root, bound)).authenticated).toBe(true);
  expect(await authMe(root, await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: "jwt-bound-member", sub: "" }))).toEqual(ANONYMOUS);
});
