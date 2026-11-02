// A forwarded identity value that is present is the proxy's word even when empty: one that does not parse refuses the
// request, never defers to a lower-precedence header, and never turns a refused subject into "no subject".
// @subject packages/server/src/infra/auth/modes/forward-header.ts
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, FORWARD_AUTH_TRUSTED_PROXIES_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { authMe, FORWARD_USERNAME_CLAIM, policy, signedForwardRoot } from "../_auth-roots.ts";

const PROXY_PEER = "10.1.2.3";
const TRUSTED_PROXIES = "10.0.0.0/8";
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

test("a verified JWT with an empty sub refuses the login rather than matching a bound row by handle", async () => {
  const signed = await signedForwardRoot(policy({}));
  await using root = signed.root;
  const bound = await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: "jwt-bound-member", sub: "jwt-bound-member-subject" });
  expect((await authMe(root, bound)).authenticated).toBe(true);
  expect(await authMe(root, await signed.signedHeaders({ [FORWARD_USERNAME_CLAIM]: "jwt-bound-member", sub: "" }))).toEqual(ANONYMOUS);
});
