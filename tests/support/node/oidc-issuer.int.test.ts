// @subject tests/support/node/oidc-issuer.ts
import { createHash } from "node:crypto";
import { MS_PER_MINUTE, MS_PER_SECOND } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { CALLBACK, CLIENT_ID, CLIENT_SECRET, createNativeIssuer, ISSUER } from "@orb/testkit/node/oidc-issuer.ts";
import { createRemoteJWKSet, customFetch, decodeJwt, jwtVerify } from "jose";

const VERIFIER = "scripted-native-proof-verifier";
const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

function authorization(state: string): string {
  const url = new URL("authorize", ISSUER);
  url.search = new URLSearchParams([
    ["redirect_uri", CALLBACK],
    ["state", state],
    ["nonce", state],
    ["code_challenge_method", "S256"],
    ["code_challenge", createHash("sha256").update(VERIFIER).digest("base64url")],
  ]).toString();
  return url.href;
}

function redeem(issuer: Awaited<ReturnType<typeof createNativeIssuer>>, callback: URL): Promise<Response> {
  return issuer.fetch(new URL("token", ISSUER), {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}` },
    body: new URLSearchParams([
      ["code", callback.searchParams.get("code") ?? ""],
      ["grant_type", "authorization_code"],
      ["redirect_uri", CALLBACK],
      ["code_verifier", VERIFIER],
    ]),
  });
}

test("scripted authorization codes repeat across isolated issuers while simultaneous grants remain distinct and single-use", async () => {
  const [issuer, other] = await Promise.all([createNativeIssuer(), createNativeIssuer()]);
  const callbacks = ["first", "second"].map((state) => issuer.authorize(authorization(state), { sub: state }));
  const repeated = ["first", "second"].map((state) => other.authorize(authorization(state), { sub: state }));
  expect(callbacks.map((callback) => callback.searchParams.get("code"))).toEqual(repeated.map((callback) => callback.searchParams.get("code")));
  expect(new Set(callbacks.map((callback) => callback.searchParams.get("code"))).size).toBe(callbacks.length);
  const results = await Promise.all(callbacks.map((callback) => redeem(issuer, callback)));
  expect(results.map((response) => response.status)).toEqual([200, 200]);
  expect(issuer.idTokens.map((token) => decodeJwt(token).sub).sort((left, right) => String(left).localeCompare(String(right)))).toEqual(["first", "second"]);
  const replays = await Promise.all(callbacks.map((callback) => redeem(issuer, callback)));
  expect(replays.map((response) => response.status)).toEqual([400, 400]);
  expect(issuer.idTokens).toHaveLength(callbacks.length);
});

test("scripted logout JTIs repeat by ordinal without repeating issuer keys or bypassing native signature or expiry verification", async ({ clock }) => {
  const [issuer, other] = await Promise.all([createNativeIssuer(), createNativeIssuer()]);
  const claims = { sub: "native-subject", events: { [LOGOUT_EVENT]: {} } };
  const tokens = await Promise.all([issuer.logoutToken(claims), issuer.logoutToken(claims)]);
  const repeated = await Promise.all([other.logoutToken(claims), other.logoutToken(claims)]);
  expect(tokens.map((token) => decodeJwt(token).jti)).toEqual(repeated.map((token) => decodeJwt(token).jti));
  expect(new Set(tokens.map((token) => decodeJwt(token).jti)).size).toBe(tokens.length);
  const keyset = createRemoteJWKSet(new URL("jwks", ISSUER), { [customFetch]: issuer.fetch });
  const verified = await Promise.all(tokens.map((token) => jwtVerify(token, keyset, { algorithms: ["RS256"], issuer: ISSUER, audience: CLIENT_ID })));
  expect(verified.map(({ payload }) => payload.sub)).toEqual([claims.sub, claims.sub]);
  await expect(jwtVerify(repeated[0], keyset, { algorithms: ["RS256"], issuer: ISSUER, audience: CLIENT_ID })).rejects.toThrow("signature verification failed");
  const frozenAt = clock.now();
  const frozenToken = await issuer.logoutToken({
    ...claims,
    iat: Math.floor(frozenAt / MS_PER_SECOND),
    exp: Math.floor((frozenAt + MS_PER_MINUTE) / MS_PER_SECOND),
  });
  const admittedAtFrozenTime = await jwtVerify(frozenToken, keyset, {
    algorithms: ["RS256"],
    issuer: ISSUER,
    audience: CLIENT_ID,
    currentDate: new Date(frozenAt),
  });
  expect(admittedAtFrozenTime.payload.sub).toBe(claims.sub);
  await expect(jwtVerify(frozenToken, keyset, { algorithms: ["RS256"], issuer: ISSUER, audience: CLIENT_ID })).rejects.toMatchObject({
    code: "ERR_JWT_EXPIRED",
  });
});
