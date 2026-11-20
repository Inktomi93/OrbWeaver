// @subject packages/server/src/entry/http/auth-routes.ts
// A back-channel logout token names a subject, and the route accepts each token id once within the token's lifetime
// (OIDC BCL §2.6). These cases drive the real route: a re-delivered token is refused and ends no session, a new token
// for the same subject still ends it, and no token ends a session of a subject it does not name.
import { AUTH_FALLBACK_KEY, authMeSchema, OIDC_BACKCHANNEL_LOGOUT_EVENT, OIDC_LOGOUT_TOKEN_FIELD } from "@orb/contracts/identity";
import { CSRF_EXEMPT_ROUTES } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, AuthSubject } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";

const AUTH_ME_ROUTE = "/api/auth/me";
const OK = 200;
const BAD_REQUEST = 400;

async function admits(root: AuthModeRoot, headers: Readonly<Record<string, string>>): Promise<boolean> {
  const response = await root.http.request(AUTH_ME_ROUTE, { headers });
  return authMeSchema.parse(await response.json()).authenticated;
}

async function deliver(root: AuthModeRoot, token: string): Promise<{ readonly status: number; readonly body: unknown }> {
  const route = CSRF_EXEMPT_ROUTES.oidcBackchannelLogout;
  const response = await root.http.request(route.path, { method: route.method, body: new URLSearchParams([[OIDC_LOGOUT_TOKEN_FIELD, token]]) });
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) };
}

function logoutClaims(who: AuthSubject): Record<string, unknown> {
  return { sub: who.subject, events: { [OIDC_BACKCHANNEL_LOGOUT_EVENT]: {} } };
}

test("a re-delivered logout token is refused and leaves a session its subject signed in after the first delivery", async () => {
  await using root = await createAuthModeRoot("oidc", { env: { [AUTH_FALLBACK_KEY]: "deny" } });
  const owner = await signIn(root, await ownerSubject(root));
  const member = await mintMember(root);
  const token = await root.issuer.logoutToken(logoutClaims(member));

  const first = await signIn(root, member);
  expect(await deliver(root, token)).toEqual({ status: OK, body: null });
  expect(await admits(root, first.headers)).toBe(false);

  const later = await signIn(root, member);
  expect(await admits(root, later.headers)).toBe(true);
  expect(await deliver(root, token)).toEqual({ status: BAD_REQUEST, body: { error: "invalid_request" } });
  expect(await admits(root, later.headers)).toBe(true);

  // Control: the refusal keys on the token id, not the subject, so a new token still ends the later session.
  expect(await deliver(root, await root.issuer.logoutToken(logoutClaims(member)))).toEqual({ status: OK, body: null });
  expect(await admits(root, later.headers)).toBe(false);
  expect(await admits(root, owner.headers)).toBe(true);
});

test("a logout token the route refused before revoking stays deliverable", async () => {
  await using root = await createAuthModeRoot("oidc", { env: { [AUTH_FALLBACK_KEY]: "deny" } });
  const member = await mintMember(root);
  const session = await signIn(root, member);
  // A sid-only token verifies but is refused before any revoke, so its id must not enter the replay record.
  const sidOnly = await root.issuer.logoutToken({ sid: "idp-session", events: { [OIDC_BACKCHANNEL_LOGOUT_EVENT]: {} } });
  expect(await deliver(root, sidOnly)).toEqual({ status: BAD_REQUEST, body: { error: "unsupported_logout_token" } });
  expect(await deliver(root, sidOnly)).toEqual({ status: BAD_REQUEST, body: { error: "unsupported_logout_token" } });
  expect(await admits(root, session.headers)).toBe(true);
});
