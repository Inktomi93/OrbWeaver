// @subject packages/server/src/entry/http/upload.ts
// @subject packages/server/src/entry/http/auth-routes.ts
// @subject packages/server/src/entry/http/card-frame.ts
import { request as nativeRequest } from "node:http";
import { storedAssetSchema } from "@orb/contracts/assets";
import { CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { authMeSchema } from "@orb/contracts/identity";
import type { ExternalId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";
import { createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";
import {
  BACKCHANNEL_ROUTE,
  BUNDLE_ROUTE,
  bodyRequest,
  CSRF_HEADERS,
  DEBUG_ROUTE,
  FRAME_ROUTES,
  INTAKE_ROUTES,
  LOCAL_AUTH_ROUTES,
  LOGOUT_ROUTE,
  observedBody,
  PENDING_ROUTES,
  PLUGIN_DELETE_ROUTE,
} from "./_body-limit-inputs.ts";

const GUARDED_INGEST = [...INTAKE_ROUTES.map(({ path }) => path), BUNDLE_ROUTE];
const PASSWORD = "body-limit-owner-password";
const LOGOUT_TOKEN_FIELD = "logout_token";

test("every actual ingest refuses anonymous bytes before any input pull", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "deny" } });
  for (const path of GUARDED_INGEST) {
    using input = observedBody(0);
    const response = await bodyRequest(root, path, input.body);
    expect(response.status, path).toBe(401);
    await response.arrayBuffer();
    expect(input.snapshot(), path).toMatchObject({ pulls: 0, bytes: 0, tripwire: false });
  }
});

for (const credential of ["fallback", "cookie"] as const) {
  test(`every actual ingest rejects missing CSRF before ${credential} body intake`, async () => {
    await using root = await createServerHarness({
      authConfig: { ...authConfigFromEnv(), mode: credential === "cookie" ? "local" : "single-user", fallback: credential === "cookie" ? "deny" : "owner" },
      physicalPeer: () => "127.0.0.1",
    });
    const headers = new Headers();
    if (credential === "cookie") {
      const minted = await root.http.request("/api/auth/first-run", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: new URLSearchParams({ password: PASSWORD }),
      });
      if (minted.status !== 200) {
        throw new Error(`the actual local first-run cookie producer refused with ${String(minted.status)}`);
      }
      await minted.arrayBuffer();
      headers.set(
        "cookie",
        minted.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      );
    }
    const me = authMeSchema.parse(await (await root.http.request("/api/auth/me", { headers })).json());
    expect(me.authenticated).toBe(true);
    for (const path of GUARDED_INGEST) {
      using input = observedBody(0);
      const response = await bodyRequest(root, path, input.body, headers);
      expect(response.status, path).toBe(403);
      await response.arrayBuffer();
      expect(input.snapshot(), path).toMatchObject({ pulls: 0, bytes: 0, tripwire: false });
    }
  });
}

test("the real trusted proxy-header identity reaches every ingest cap without ambient CSRF", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "forward-header", fallback: "deny", forwardTrustedProxies: ["127.0.0.1/32"] },
    physicalPeer: () => "127.0.0.1",
  });
  const headers = { "x-authentik-username": "body-cap-proxy", "x-authentik-uid": "body-cap-proxy-subject" };
  expect(authMeSchema.parse(await (await root.http.request("/api/auth/me", { headers })).json()).authenticated).toBe(true);
  for (const route of INTAKE_ROUTES) {
    using input = observedBody(0);
    const response = await bodyRequest(root, route.path, input.body, { ...headers, "content-length": String(route.bytes) });
    expect(response.status, route.path).toBe(413);
    await response.arrayBuffer();
    expect(input.snapshot().pulls).toBe(0);
  }
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers, body: "" });
  expect(response.status).toBe(202);
  await response.arrayBuffer();
});

test("frame caps precede handler authentication, while local and pending CSRF precedes caps", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  for (const route of FRAME_ROUTES) {
    using input = observedBody(route.bytes);
    const response = await bodyRequest(root, route.path, input.body, {});
    expect(response.status, route.path).toBe(413);
    await response.arrayBuffer();
    expect(input.snapshot()).toMatchObject({ bytes: route.bytes, tripwire: false });
  }
  for (const route of LOCAL_AUTH_ROUTES) {
    using input = observedBody(0);
    const response = await bodyRequest(root, route.path, input.body, { "content-length": String(route.bytes) });
    expect(response.status, route.path).toBe(403);
    await response.arrayBuffer();
    expect(input.snapshot().pulls).toBe(0);
  }
  await using oidc = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "oidc", fallback: "deny" }, oidc: NATIVE_OIDC_SETTINGS });
  for (const route of PENDING_ROUTES) {
    using input = observedBody(0);
    const response = await bodyRequest(oidc, route.path, input.body, { "content-length": String(route.bytes) });
    expect(response.status, route.path).toBe(403);
    await response.arrayBuffer();
    expect(input.snapshot().pulls).toBe(0);
  }
});

test("first-run cap remains before its in-handler origin gate", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" },
    physicalPeer: () => "93.184.215.14",
  });
  using input = observedBody(0);
  const response = await bodyRequest(root, "/api/auth/first-run", input.body, { ...CSRF_HEADERS, "content-length": String(BACKCHANNEL_ROUTE.bytes) });
  expect(response.status).toBe(413);
  await response.arrayBuffer();
  expect(input.snapshot().pulls).toBe(0);
  const small = await root.http.request("/api/auth/first-run", { method: "POST", headers: CSRF_HEADERS, body: new URLSearchParams({ password: PASSWORD }) });
  expect(small.status).toBe(403);
  await small.arrayBuffer();
});

test("intentionally uncapped mutations remain bodyless and pending preview keeps its existing cap", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  for (const route of [
    { path: LOGOUT_ROUTE, method: "POST", status: 200 },
    { path: PLUGIN_DELETE_ROUTE.replace(":id", "0".repeat(32)), method: "DELETE", status: 204 },
  ]) {
    using input = observedBody(0);
    const response = await root.http.request(route.path, { method: route.method, body: input.body, duplex: "half", headers: CSRF_HEADERS });
    expect(response.status).toBe(route.status);
    await response.arrayBuffer();
    expect(input.snapshot()).toMatchObject({ pulls: 0, tripwire: false });
  }
  await using oidc = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "oidc", fallback: "deny" }, oidc: NATIVE_OIDC_SETTINGS });
  const preview = await oidc.http.request(PENDING_ROUTES[0]?.path ?? "", { method: "POST", headers: CSRF_HEADERS, body: "not JSON" });
  expect(preview.status).toBe(404);
  expect(await preview.json()).toEqual({ error: "join_unavailable" });
});

test("native debug authentication and media admission run before body intake", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  using input = observedBody(0);
  const response = await bodyRequest(root, DEBUG_ROUTE.path, input.body, { "content-type": "text/plain", "content-length": String(DEBUG_ROUTE.bytes) });
  expect(response.status).toBe(415);
  await response.arrayBuffer();
  expect(input.snapshot().pulls).toBe(0);
  await using anonymous = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "deny" } });
  using refused = observedBody(0);
  const denied = await bodyRequest(anonymous, DEBUG_ROUTE.path, refused.body, { "content-type": "application/json" });
  expect([401, 404]).toContain(denied.status);
  await denied.arrayBuffer();
  expect(refused.snapshot().pulls).toBe(0);
});

test("small real multipart and JSON producers survive the native caps and retain owner-scoped output", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const principal = await root.principalFor(root.ownerId);
  const bytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], "body-cap.png", { type: "image/png" }));
  form.set("kind", "avatar");
  const upload = await root.http.request("/api/assets/upload", { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(upload.status).toBe(200);
  const stored = storedAssetSchema.parse(await upload.json());
  expect(Array.from((await root.app.assets.readOwnedAssetBytes(principal, stored.assetId)).bytes)).toEqual(Array.from(bytes));
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const body = cardFrameMintRequestSchema.parse({ chatId: chat.id, characterId: null, html: "<p>Body-limit witness</p>" });
  const mint = await root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: { ...CSRF_HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(mint.status).toBe(200);
  const frame = cardFrameMintResponseSchema.parse(await mint.json());
  const document = await root.http.request(frame.url);
  expect(document.status).toBe(200);
  expect(await document.text()).toContain(body.html);
});

test("native signed backchannel bytes revoke a real session only after valid authentication", async () => {
  const issuer = await createNativeIssuer();
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "oidc", fallback: "deny" },
    oidc: NATIVE_OIDC_SETTINGS,
    networkExecution: {
      resolver: (hostname) => (hostname === new URL(ISSUER).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted issuer"))),
      fetch: issuer.fetch,
    },
  });
  const subject = castId<ExternalId>("body-limit-oidc-subject");
  const user = await root.actor({ externalId: subject });
  const session = await root.app.sessions.create({ userId: user.id });
  const invalid = await root.http.request(BACKCHANNEL_ROUTE.path, { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_FIELD, "invalid signature"]]) });
  expect(invalid.status).toBe(400);
  await invalid.arrayBuffer();
  expect(await root.app.sessions.validate(session.token)).not.toBeNull();
  const token = await issuer.logoutToken({ sub: subject, events: { "http://schemas.openid.net/event/backchannel-logout": {} } });
  const response = await root.http.request(BACKCHANNEL_ROUTE.path, { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_FIELD, token]]) });
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  expect(await root.app.sessions.validate(session.token)).toBeNull();
});

test("the real native listener refuses an oversized auth form before password authentication", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const address = await root.listen();
  const body = new URLSearchParams({ handle: "wire-body-cap", password: PASSWORD.repeat(BACKCHANNEL_ROUTE.bytes) }).toString();
  const status = await new Promise<number>((resolve, reject) => {
    const request = nativeRequest(
      {
        host: "127.0.0.1",
        port: address.port,
        path: "/api/auth/login",
        method: "POST",
        headers: { ...CSRF_HEADERS, "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body) },
      },
      (response) => {
        response.on("error", reject);
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    request.end(body);
  });
  expect(status).toBe(413);
  expect(await root.app.sessions.listForUser(root.ownerId)).toEqual([]);
});
