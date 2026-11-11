// @subject packages/server/src/entry/http/auth-routes.ts
// A back-channel logout token names a subject, and the route keeps no replay cache. These cases pin what a
// re-delivered token does through the real route: it ends every session its subject holds at that moment, a session
// signed in after the first delivery included, and it never ends a session of a subject it does not name.
import { AUTH_FALLBACK_KEY, authMeSchema, OIDC_BACKCHANNEL_LOGOUT_EVENT, OIDC_LOGOUT_TOKEN_FIELD } from "@orb/contracts/identity";
import { CSRF_EXEMPT_ROUTES } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, AuthSubject } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";

const AUTH_ME_ROUTE = "/api/auth/me";
const OK = 200;

async function admits(root: AuthModeRoot, headers: Readonly<Record<string, string>>): Promise<boolean> {
  const response = await root.http.request(AUTH_ME_ROUTE, { headers });
  return authMeSchema.parse(await response.json()).authenticated;
}

async function deliver(root: AuthModeRoot, token: string): Promise<number> {
  const route = CSRF_EXEMPT_ROUTES.oidcBackchannelLogout;
  const response = await root.http.request(route.path, { method: route.method, body: new URLSearchParams([[OIDC_LOGOUT_TOKEN_FIELD, token]]) });
  await response.arrayBuffer();
  return response.status;
}

function logoutClaims(who: AuthSubject): Record<string, unknown> {
  return { sub: who.subject, events: { [OIDC_BACKCHANNEL_LOGOUT_EVENT]: {} } };
}

test("a re-delivered logout token ends a session its subject signed in after the first delivery, and no other subject's", async () => {
  await using root = await createAuthModeRoot("oidc", { env: { [AUTH_FALLBACK_KEY]: "deny" } });
  const owner = await signIn(root, await ownerSubject(root));
  const member = await mintMember(root);
  const token = await root.issuer.logoutToken(logoutClaims(member));

  const first = await signIn(root, member);
  expect(await deliver(root, token)).toBe(OK);
  expect(await admits(root, first.headers)).toBe(false);

  const later = await signIn(root, member);
  expect(await admits(root, later.headers)).toBe(true);
  expect(await deliver(root, token)).toBe(OK);
  expect(await admits(root, later.headers)).toBe(false);
  expect(await admits(root, owner.headers)).toBe(true);
});
