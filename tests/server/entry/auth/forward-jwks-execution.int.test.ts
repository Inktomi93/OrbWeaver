// Signed-header verification uses the production graph's network owner, never an ambient transport.
// @subject packages/server/src/entry/http/app.ts
// @subject packages/server/src/infra/auth/jwks.ts

import { authMeSchema } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CLIENT_ID, createNativeIssuer, ISSUER } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

const KEY_HOST = new URL(ISSUER).hostname;
const KEY_URL = new URL("jwks", ISSUER).href;

function rootFor(execution: typeof fetch): Promise<ServerTestHarness> {
  return createServerHarness({
    authConfig: {
      ...authConfigFromEnv(),
      mode: "forward-header",
      fallback: "deny",
      verifyForwardJwt: true,
      jwksAllowlist: [KEY_HOST],
      jwtIssuer: ISSUER,
      jwtAudience: CLIENT_ID,
      forwardTrustedProxies: [],
    },
    physicalPeer: () => "93.184.215.14",
    networkExecution: {
      resolver: (hostname) => (hostname === KEY_HOST ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted JWKS address resolution"))),
      fetch: execution,
    },
  });
}

function signedToken(issuer: Awaited<ReturnType<typeof createNativeIssuer>>, handle: Handle): Promise<string> {
  // biome-ignore lint/style/useNamingConvention: preferred_username is the native signed issuer claim.
  return issuer.signedToken({ preferred_username: handle, sub: `subject-${handle}`, iss: ISSUER, aud: CLIENT_ID });
}

function headers(jwt: string): Headers {
  return new Headers({ "x-authentik-jwt": jwt, "x-authentik-meta-jwks": KEY_URL });
}

test("actual signed-header verification uses the owning graph network execution", async () => {
  const issuer = await createNativeIssuer();
  const jwt = await signedToken(issuer, castId<Handle>("scoped-header-member"));
  const execution = vi.fn<typeof fetch>((input, init) => {
    const request = new Request(input, init);
    expect(request.url).toBe(KEY_URL);
    expect(request.method).toBe("GET");
    return issuer.fetch(request);
  });
  const ambient = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unowned ambient JWKS execution"));
  try {
    await using root = await rootFor(execution);
    const response = await root.http.request("/api/auth/me", {
      headers: headers(jwt),
    });
    expect(response.status).toBe(200);
    expect.soft(authMeSchema.parse(await response.json())).toEqual({ authenticated: true, handle: "scoped-header-member", role: "user" });
    expect.soft(execution).toHaveBeenCalledTimes(1);
    expect.soft(ambient).not.toHaveBeenCalled();
  } finally {
    ambient.mockRestore();
  }
});

test("actual graphs isolate same-URL signing keys and revoke held cached and literal verification at disposal", async () => {
  const firstIssuer = await createNativeIssuer();
  const secondIssuer = await createNativeIssuer();
  const firstExecution = vi.fn<typeof fetch>((input, init) => firstIssuer.fetch(input, init));
  const secondExecution = vi.fn<typeof fetch>((input, init) => secondIssuer.fetch(input, init));
  await using first = await rootFor(firstExecution);
  await using second = await rootFor(secondExecution);
  const firstToken = await signedToken(firstIssuer, castId<Handle>("first-graph"));
  const secondToken = await signedToken(secondIssuer, castId<Handle>("second-graph"));
  const firstKeys = await (await firstIssuer.fetch(KEY_URL)).text();
  const held = first.app.forwardJwtVerifier;
  const literal = { jwt: firstToken, metaJwks: firstKeys, allowlist: [KEY_HOST], issuer: ISSUER, audience: CLIENT_ID };
  const ambient = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unowned ambient JWKS execution"));
  try {
    expect(authMeSchema.parse(await (await first.http.request("/api/auth/me", { headers: headers(firstToken) })).json())).toMatchObject({
      authenticated: true,
      handle: "first-graph",
    });
    expect(authMeSchema.parse(await (await second.http.request("/api/auth/me", { headers: headers(secondToken) })).json())).toMatchObject({
      authenticated: true,
      handle: "second-graph",
    });
    expect(await held.verify(literal)).toMatchObject({ handle: "first-graph" });
    expect(authMeSchema.parse(await (await first.http.request("/api/auth/me", { headers: headers(secondToken) })).json()).authenticated).toBe(false);
    expect(firstExecution).toHaveBeenCalledTimes(1);
    expect(secondExecution).toHaveBeenCalledTimes(1);
    await first[Symbol.asyncDispose]();
    expect(await held.verify(literal)).toBeNull();
    expect(await held.verify({ ...literal, metaJwks: KEY_URL })).toBeNull();
    expect(authMeSchema.parse(await (await second.http.request("/api/auth/me", { headers: headers(secondToken) })).json()).authenticated).toBe(true);
    expect(firstExecution).toHaveBeenCalledTimes(1);
    expect(secondExecution).toHaveBeenCalledTimes(1);
    expect(ambient).not.toHaveBeenCalled();
  } finally {
    ambient.mockRestore();
  }
});

test("graph disposal cancels and physically joins a key retrieval held by native JOSE", async () => {
  const issuer = await createNativeIssuer();
  const entered = Promise.withResolvers<void>();
  const cancelling = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let sent = false;
  const execution: typeof fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              if (!sent) {
                sent = true;
                controller.enqueue(new TextEncoder().encode('{"keys":'));
                return;
              }
              entered.resolve();
              await released.promise;
            },
            async cancel() {
              cancelling.resolve();
              await released.promise;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "content-type": "application/json" } },
      ),
    );
  await using root = await rootFor(execution);
  const pending = root.app.forwardJwtVerifier.verify({
    jwt: await signedToken(issuer, castId<Handle>("held-key-request")),
    metaJwks: KEY_URL,
    allowlist: [KEY_HOST],
    issuer: ISSUER,
    audience: CLIENT_ID,
  });
  await entered.promise;
  let disposed = false;
  const closing = root[Symbol.asyncDispose]().then(() => {
    disposed = true;
  });
  try {
    await cancelling.promise;
    expect(disposed).toBe(false);
  } finally {
    released.resolve();
  }
  await closing;
  expect(disposed).toBe(true);
  expect(await pending).toBeNull();
});
