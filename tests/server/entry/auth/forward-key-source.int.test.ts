// A signed forward-header identity verifies only against the operator's key source, never against keys a request names.
// @subject packages/server/src/infra/auth/jwks.ts
// @subject packages/server/src/infra/auth/modes/forward-header.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, authMeSchema, FORWARD_AUTH_TRUSTED_PROXIES_KEY } from "@orb/contracts/identity";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CLIENT_ID, createNativeIssuer, ISSUER } from "@orb/testkit/node/helpers";

type Issuer = Awaited<ReturnType<typeof createNativeIssuer>>;

const KEY_HOST = new URL(ISSUER).hostname;
const OPERATOR_KEY_URL = new URL("jwks", ISSUER).href;
// A second key set on the operator's own host, the way an IdP serves one per application.
const OTHER_APP_KEY_URL = new URL("other-app/jwks", ISSUER).href;
const ANONYMOUS = { authenticated: false, handle: null, role: null };

function rootFor(operator: Issuer, otherApp: Issuer): Promise<ServerTestHarness> {
  return createServerHarness({
    env: {
      [AUTH_MODE_KEY]: "forward-header",
      [AUTH_FALLBACK_KEY]: "deny",
      ["FORWARD_AUTH_VERIFY_JWT"]: "true",
      ["FORWARD_AUTH_JWKS"]: OPERATOR_KEY_URL,
      ["FORWARD_AUTH_JWT_ISSUER"]: ISSUER,
      ["FORWARD_AUTH_JWT_AUDIENCE"]: CLIENT_ID,
    },
    physicalPeer: () => PUBLIC_PEER_ADDRESS,
    networkExecution: {
      resolver: (hostname) =>
        hostname === KEY_HOST ? Promise.resolve([PUBLIC_PEER_ADDRESS]) : Promise.reject(new Error("unscripted JWKS address resolution")),
      fetch: (input, init) => {
        const request = new Request(input, init);
        return request.url === OTHER_APP_KEY_URL ? otherApp.fetch(OPERATOR_KEY_URL) : operator.fetch(request);
      },
    },
  });
}

function token(issuer: Issuer, handle: string, sub: string): Promise<string> {
  // biome-ignore lint/style/useNamingConvention: preferred_username is the native signed issuer claim.
  return issuer.signedToken({ iss: ISSUER, aud: CLIENT_ID, preferred_username: handle, sub });
}

async function me(root: ServerTestHarness, headers: Record<string, string>): Promise<ReturnType<typeof authMeSchema.parse>> {
  return authMeSchema.parse(await (await root.http.request("/api/auth/me", { headers })).json());
}

async function literalKeys(issuer: Issuer): Promise<string> {
  return await (await issuer.fetch(OPERATOR_KEY_URL)).text();
}

test("a caller-signed owner token carrying its own literal key set is refused, and the operator's key still admits", async () => {
  const operator = await createNativeIssuer();
  const caller = await createNativeIssuer();
  await using root = await rootFor(operator, caller);
  const owner = (await root.principalFor(root.ownerId)).handle;
  const forged = await me(root, {
    "x-authentik-jwt": await token(caller, owner, "caller-chosen-subject"),
    "x-authentik-meta-jwks": await literalKeys(caller),
  });
  expect(forged).toEqual(ANONYMOUS);
  const member = await me(root, { "x-authentik-jwt": await token(operator, "operator-member", "operator-subject"), "x-authentik-meta-jwks": OPERATOR_KEY_URL });
  expect(member).toEqual({ authenticated: true, handle: "operator-member", role: "user" });
});

test("a request cannot pick another key set on the operator's own host", async () => {
  const operator = await createNativeIssuer();
  const otherApp = await createNativeIssuer();
  await using root = await rootFor(operator, otherApp);
  const moved = await me(root, { "x-authentik-jwt": await token(otherApp, "other-app-user", "other-app-subject"), "x-authentik-meta-jwks": OTHER_APP_KEY_URL });
  expect(moved).toEqual(ANONYMOUS);
  expect(
    await me(root, { "x-authentik-jwt": await token(operator, "same-host-member", "same-host-subject"), "x-authentik-meta-jwks": OPERATOR_KEY_URL }),
  ).toEqual({
    authenticated: true,
    handle: "same-host-member",
    role: "user",
  });
});

test("the operator's key admits with no key header, so the header carries no authority", async () => {
  const operator = await createNativeIssuer();
  await using root = await rootFor(operator, await createNativeIssuer());
  expect(await me(root, { "x-authentik-jwt": await token(operator, "headerless-member", "headerless-subject") })).toEqual({
    authenticated: true,
    handle: "headerless-member",
    role: "user",
  });
});

test("with no operator source every forwarded JWT is refused, while the unsigned trusted-proxy path still admits", async () => {
  const issuer = await createNativeIssuer();
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "forward-header", [AUTH_FALLBACK_KEY]: "deny", [FORWARD_AUTH_TRUSTED_PROXIES_KEY]: `${PUBLIC_PEER_ADDRESS}/32` },
    physicalPeer: () => PUBLIC_PEER_ADDRESS,
  });
  expect(
    await me(root, { "x-authentik-jwt": await token(issuer, "no-source-member", "no-source-subject"), "x-authentik-meta-jwks": await literalKeys(issuer) }),
  ).toEqual(ANONYMOUS);
  expect(await me(root, { "remote-user": "proxy-member" })).toEqual({ authenticated: true, handle: "proxy-member", role: "user" });
});
