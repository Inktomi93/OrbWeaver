import { databaseHandle } from "@orb/db/wiring-driver";
import "@orb/testkit/node/composed-real.ts";
import { access, readFile } from "node:fs/promises";
import { pendingJoinConfirmResultSchema, signedOutInvitePreviewSchema } from "@orb/contracts/chat";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { chatInvites, chatParticipants, closeDb, oidcPendingSignups, oidcTransactions, sessions, users } from "@orb/db";
import { MS_PER_HOUR } from "@orb/kit/time";
import { ownerHandles } from "@orb/server/domain/sessions";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createConfiguredOidc } from "@orb/server/entry/compose";
import { createFrozenClock } from "@orb/testkit/iso/clock.ts";
import { createControlledTimers } from "@orb/testkit/iso/timers.ts";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS as SETTINGS } from "@orb/testkit/node/oidc-issuer.ts";
import type { ServerHarnessOptions, ServerTestHarness, UnclaimedServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq, sql } from "drizzle-orm";
import type { JWTPayload } from "jose";
import { customFetch } from "openid-client";
import { vi } from "vitest";

// biome-ignore lint/style/useNamingConvention: preferred_username is the issuer's actual configured OIDC claim.
const MEMBER = { sub: "native-member-subject", preferred_username: "oidc-member" } satisfies JWTPayload;
const LOGOUT_TOKEN_PARAM = "logout_token";
const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

type HttpRoot = Pick<ServerTestHarness, "http" | "db">;
type Issuer = Awaited<ReturnType<typeof createNativeIssuer>>;

function cookieJar(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

function rootFor(
  issuer: Issuer,
  oidc: Partial<NonNullable<ServerHarnessOptions["oidc"]>> = {},
  edges: Pick<ServerHarnessOptions, "clock" | "timers"> = {},
): Promise<UnclaimedServerTestHarness> {
  return createServerHarness({
    ...edges,
    ownerId: null,
    authConfig: { ...authConfigFromEnv(), mode: "oidc", fallback: "deny" },
    physicalPeer: () => "93.184.215.14",
    oidc: { ...SETTINGS, ...oidc },
    networkExecution: {
      resolver: (hostname) => {
        if (hostname !== new URL(ISSUER).hostname) {
          return Promise.reject(new Error("unscripted OIDC address resolution"));
        }
        return Promise.resolve(["93.184.215.14"]);
      },
      fetch: (input, init) => issuer.fetch(input, init),
    },
  });
}

async function begin(root: HttpRoot, issuer: Issuer, claims: JWTPayload = MEMBER, query = ""): Promise<{ readonly callback: URL; readonly cookie: string }> {
  const response = await root.http.request(`/api/auth/oidc/login${query}`, { headers: { host: "localhost" } });
  expect(response.status).toBe(302);
  const authorization = response.headers.get("location");
  if (authorization === null) {
    throw new Error("actual OIDC login omitted its issuer redirect");
  }
  return { callback: issuer.authorize(authorization, claims), cookie: cookieJar(response) };
}

async function callback(root: HttpRoot, login: Awaited<ReturnType<typeof begin>>, cookie = login.cookie): Promise<Response> {
  return await root.http.request(login.callback, { headers: { host: "localhost", cookie } });
}

async function signIn(root: HttpRoot, issuer: Issuer, claims: JWTPayload = MEMBER, query = ""): Promise<string> {
  const result = await callback(root, await begin(root, issuer, claims, query));
  expect(result.status).toBe(302);
  expect(result.headers.get("location")).toBe("/");
  return cookieJar(result);
}

test("the native configured flow provisions a real account/session and spends its sealed ID-token hint at logout", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  expect("ownerId" in root).toBe(false);
  expect(await root.db.select().from(users)).toEqual([]);
  const login = await begin(root, issuer);
  const transactions = await root.db.select().from(oidcTransactions);
  expect(transactions).toHaveLength(1);
  expect(transactions[0]?.state).toBe(login.callback.searchParams.get("state"));
  expect(transactions[0]?.codeVerifier).not.toBe("");
  const result = await callback(root, login);
  expect(result.headers.get("location")).toBe("/");
  const cookie = cookieJar(result);
  const me = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await me.json())).toEqual({ authenticated: true, handle: MEMBER.preferred_username, role: "user" });
  const persisted = await root.db.select().from(sessions);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]?.oidcIdTokenCiphertext).not.toBeNull();
  expect(issuer.idTokens).toHaveLength(1);
  expect(JSON.stringify(persisted)).not.toContain(issuer.idTokens[0]);
  const noCsrf = await root.http.request("/api/auth/logout", { method: "POST", headers: { host: "localhost", cookie } });
  expect(noCsrf.status).toBe(403);
  const logout = await root.http.request("/api/auth/logout", { method: "POST", headers: { host: "localhost", cookie, [CSRF_HEADER]: "1" } });
  expect(logout.status).toBe(200);
  expect(logout.headers.get("cache-control")).toBe("no-store");
  const body = await logout.text();
  expect(body).toContain(encodeURIComponent(issuer.idTokens[0] ?? "missing actual native ID token"));
  expect(body).toContain("post_logout_redirect_uri");
  const signedOut = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await signedOut.json()).authenticated).toBe(false);
  expect(issuer.calls).toEqual(["GET /.well-known/openid-configuration", "POST /token"]);
});

test("a foreign browser cannot consume the real transaction, while the rightful callback succeeds once and replay refuses", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const login = await begin(root, issuer);
  const foreign = await callback(root, login, "");
  expect(foreign.headers.get("location")).toBe("/login?authError=invalid_state");
  expect(await root.db.select().from(oidcTransactions)).toHaveLength(1);
  expect(await root.db.select().from(sessions)).toEqual([]);
  expect(issuer.calls).toEqual(["GET /.well-known/openid-configuration"]);
  expect((await callback(root, login)).headers.get("location")).toBe("/");
  expect((await callback(root, login)).headers.get("location")).toBe("/login?authError=invalid_state");
  expect(await root.db.select().from(sessions)).toHaveLength(1);
  expect(issuer.calls.filter((call) => call === "POST /token")).toHaveLength(1);
});

test.each([
  { claim: "issuer", value: { iss: "https://foreign-issuer.example/" } },
  { claim: "audience", value: { aud: "foreign-client" } },
  { claim: "nonce", value: { nonce: "another-login-nonce" } },
])("native token processing refuses the wrong $claim without minting a session", async ({ value }) => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const result = await callback(root, await begin(root, issuer, { ...MEMBER, ...value }));
  expect(result.headers.get("location")).toBe("/login?authError=token_exchange_failed");
  expect(await root.db.select().from(users)).toEqual([]);
  expect(await root.db.select().from(sessions)).toEqual([]);
  expect(await root.db.select().from(oidcTransactions)).toEqual([]);
  expect(issuer.calls).toContain("POST /token");
});

test("native code grant carries the persisted PKCE verifier and issuer refusal never creates an identity", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const response = await root.http.request("/api/auth/oidc/login", { headers: { host: "localhost" } });
  const authorization = new URL(response.headers.get("location") ?? "missing issuer redirect");
  authorization.searchParams.set("code_challenge", "a-different-browser-challenge");
  const result = await callback(root, { callback: issuer.authorize(authorization.href, MEMBER), cookie: cookieJar(response) });
  expect(result.headers.get("location")).toBe("/login?authError=invalid_grant");
  expect(await root.db.select().from(users)).toEqual([]);
  expect(await root.db.select().from(sessions)).toEqual([]);
});

test("a genuine fresh OIDC root refuses a guessable owner handle, then claims only through its real boot file", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  // biome-ignore lint/style/useNamingConvention: preferred_username is the issuer's actual configured OIDC claim.
  const claims = { sub: "native-owner-subject", preferred_username: ownerHandles()[0] } satisfies JWTPayload;
  const unproven = await callback(root, await begin(root, issuer, claims));
  expect(unproven.headers.get("location")).toBe("/login?authError=not_authorized");
  expect(await root.app.sessions.getOwnerUserId()).toBeUndefined();
  expect(await root.db.select().from(users)).toEqual([]);
  if (root.ownerClaimFile === undefined) {
    throw new Error("configured OIDC root omitted the real claim file");
  }
  const claimUrl = new URL((await readFile(root.ownerClaimFile, "utf8")).trim());
  const cookie = await signIn(root, issuer, claims, claimUrl.search);
  const me = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await me.json())).toEqual({ authenticated: true, handle: claims.preferred_username, role: "owner" });
  const rows = await root.db.select().from(users);
  expect(rows).toHaveLength(1);
  expect(await root.app.sessions.getOwnerUserId()).toBe(rows[0]?.id);
});

test("native JOSE backchannel uses a cached remote keyset and never accepts a foreign signature", async () => {
  const issuer = await createNativeIssuer();
  const foreign = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const cookie = await signIn(root, issuer);
  const claims = { sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} } } satisfies JWTPayload;
  const forged = await foreign.logoutToken(claims);
  const rejected = await root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, forged]]) });
  expect(rejected.status).toBe(400);
  const stillLive = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await stillLive.json()).authenticated).toBe(true);
  const valid = await issuer.logoutToken(claims);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, valid]]) });
    expect(result.status).toBe(200);
  }
  const dead = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await dead.json()).authenticated).toBe(false);
  expect(issuer.calls.filter((call) => call === "GET /jwks")).toHaveLength(1);
});

test("a malformed raw issuer token response fails through native token processing", async () => {
  const issuer = await createNativeIssuer();
  const execute = issuer.fetch;
  vi.spyOn(issuer, "fetch").mockImplementation(async (input, init) => {
    const response = await execute(input, init);
    if (input instanceof Request && new URL(input.url).pathname === "/token") {
      await response.arrayBuffer();
      // biome-ignore lint/style/useNamingConvention: malformed issuer output retains the real token endpoint's wire fields.
      return Response.json({ access_token: "malformed-token-probe", token_type: "Bearer", id_token: "not-a-compact-jwt" });
    }
    return response;
  });
  await using root = await rootFor(issuer);
  const result = await callback(root, await begin(root, issuer));
  expect(result.headers.get("location")).toBe("/login?authError=token_exchange_failed");
  expect(await root.db.select().from(users)).toEqual([]);
  expect(await root.db.select().from(sessions)).toEqual([]);
});

test.each([false, true])("a real JIT-closed pending join is consumed atomically and respects requireApproval=%s", async (approval) => {
  const issuer = await createNativeIssuer();
  // biome-ignore lint/style/useNamingConvention: these are the canonical validated OIDC startup setting names.
  await using root = await rootFor(issuer, { OIDC_SIGNUP: false, OIDC_REQUIRE_APPROVAL: approval });
  if (root.ownerClaimFile === undefined) {
    throw new Error("configured OIDC omitted its owner claim file");
  }
  const claimUrl = new URL((await readFile(root.ownerClaimFile, "utf8")).trim());
  // biome-ignore lint/style/useNamingConvention: preferred_username is the issuer's actual configured OIDC claim.
  await signIn(root, issuer, { sub: "native-owner-subject", preferred_username: ownerHandles()[0] }, claimUrl.search);
  const ownerId = await root.app.sessions.getOwnerUserId();
  if (ownerId === undefined) {
    throw new Error("real owner claim produced no owner row");
  }
  const owner = await root.internalCallerFor(ownerId);
  const room = (await owner.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const invite = await owner.invites.createInvite({ chatId: room.id, input: { allowSignup: true, maxUses: 1, expiresAt: root.clock.now() + MS_PER_HOUR } });
  const result = await callback(root, await begin(root, issuer, MEMBER, `?invite=${encodeURIComponent(invite.token)}`));
  expect(result.headers.get("location")).toBe("/login?pendingJoin=1");
  const pendingCookie = cookieJar(result);
  const pending = await root.db.select().from(oidcPendingSignups);
  expect(pending).toHaveLength(1);
  expect(pending[0]?.subject).toBe(MEMBER.sub);
  expect(pending[0]?.idTokenCiphertext).not.toBeNull();
  expect(JSON.stringify(pending)).not.toContain(issuer.idTokens.at(-1));
  expect(pendingCookie).not.toContain(pending[0]?.secretHash);
  expect(await root.db.select().from(users)).toHaveLength(1);
  const noCsrf = await root.http.request("/api/auth/oidc/pending/preview", { method: "POST", headers: { cookie: pendingCookie } });
  expect(noCsrf.status).toBe(403);
  const preview = await root.http.request("/api/auth/oidc/pending/preview", { method: "POST", headers: { cookie: pendingCookie, [CSRF_HEADER]: "1" } });
  expect(signedOutInvitePreviewSchema.parse(await preview.json()).chatId).toBe(room.id);
  const confirmInit = {
    method: "POST",
    headers: { cookie: pendingCookie, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ persona: { name: "Native joiner", description: "" } }),
  };
  const confirmed = await root.http.request("/api/auth/oidc/pending/confirm", confirmInit);
  expect(confirmed.status).toBe(200);
  expect(pendingJoinConfirmResultSchema.parse(await confirmed.json())).toEqual({ signedIn: !approval, chatId: room.id });
  expect(await root.db.select().from(oidcPendingSignups)).toEqual([]);
  const joined = (await root.db.select().from(users)).filter((row) => row.externalId === MEMBER.sub);
  expect(joined).toHaveLength(1);
  expect(joined[0]?.enabled).toBe(!approval);
  const joiner = joined[0];
  if (joiner === undefined) {
    throw new Error("the successful real pending join produced no user row");
  }
  expect(await root.db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner.id))).toHaveLength(1);
  expect((await root.db.select().from(chatInvites).where(eq(chatInvites.id, invite.invite.id)))[0]?.uses).toBe(1);
  const replay = await root.http.request("/api/auth/oidc/pending/confirm", confirmInit);
  expect(replay.status).toBe(404);
  const signedIn = await root.http.request("/api/auth/me", { headers: { cookie: cookieJar(confirmed) } });
  expect(authMeSchema.parse(await signedIn.json()).authenticated).toBe(!approval);
});

test("native key caches are graph-local for identical issuer/kid and survive another root's disposal", async () => {
  const firstIssuer = await createNativeIssuer();
  const secondIssuer = await createNativeIssuer();
  await using first = await rootFor(firstIssuer);
  await using second = await rootFor(secondIssuer);
  await signIn(first, firstIssuer);
  await signIn(second, secondIssuer);
  const claims = { sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} } } satisfies JWTPayload;
  const firstToken = await firstIssuer.logoutToken(claims);
  const secondToken = await secondIssuer.logoutToken(claims);
  const post = async (root: HttpRoot, token: string): Promise<Response> =>
    await root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, token]]) });
  expect((await post(first, firstToken)).status).toBe(200);
  expect((await post(second, secondToken)).status).toBe(200);
  await first[Symbol.asyncDispose]();
  await signIn(second, secondIssuer);
  expect((await post(second, secondToken)).status).toBe(200);
  expect(firstIssuer.calls.filter((call) => call === "GET /jwks")).toHaveLength(1);
  expect(secondIssuer.calls.filter((call) => call === "GET /jwks")).toHaveLength(1);
});

test("native discovery is lazy/single-flight, retries rejection and keeps settled success", async () => {
  const issuer = await createNativeIssuer();
  const raw = issuer.fetch;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let physicalDiscoveries = 0;
  vi.spyOn(issuer, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === "/.well-known/openid-configuration") {
      physicalDiscoveries += 1;
      if (physicalDiscoveries === 1) {
        entered.resolve();
        await release.promise;
        throw new Error("controlled issuer discovery outage");
      }
    }
    return await raw(request);
  });
  await using root = await rootFor(issuer);
  expect(physicalDiscoveries).toBe(0);
  const first = Promise.all([
    root.http.request("/api/auth/oidc/login", { headers: { host: "localhost" } }),
    root.http.request("/api/auth/oidc/login", { headers: { host: "localhost" } }),
  ]);
  try {
    await entered.promise;
    expect(physicalDiscoveries).toBe(1);
  } finally {
    release.resolve();
  }
  const failed = await first;
  expect(failed.map((response) => response.status)).toEqual([500, 500]);
  await Promise.all(failed.map((response) => response.arrayBuffer()));
  expect(await root.db.select().from(oidcTransactions)).toEqual([]);
  const next = await Promise.all([
    root.http.request("/api/auth/oidc/login", { headers: { host: "localhost" } }),
    root.http.request("/api/auth/oidc/login", { headers: { host: "localhost" } }),
  ]);
  expect(next.map((response) => response.status)).toEqual([302, 302]);
  expect((await root.http.request("/api/auth/oidc/login", { headers: { host: "localhost" } })).status).toBe(302);
  expect(physicalDiscoveries).toBe(2);
});

test("the actual GC timer reaps expired transactions while retaining a live login", async () => {
  const issuer = await createNativeIssuer();
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: the same timers transfer to rootFor; local using would duplicate the root's teardown ownership.
  const timers = createControlledTimers(clock);
  const interval = timers.interval;
  let sweep: (() => void) | undefined;
  vi.spyOn(timers, "interval").mockImplementation((tick, ms) => {
    if (ms === MS_PER_HOUR && sweep === undefined) {
      sweep = tick;
    }
    return interval(tick, ms);
  });
  await using root = await rootFor(issuer, {}, { clock, timers });
  await begin(root, issuer);
  root.clock.advance(MS_PER_HOUR);
  const live = await begin(root, issuer);
  if (sweep === undefined) {
    throw new Error("configured OIDC did not arm its actual hourly GC callback");
  }
  void sweep();
  await expect.poll(async () => (await root.db.select().from(oidcTransactions)).map((row) => row.state)).toEqual([live.callback.searchParams.get("state")]);
});

test("root teardown aborts and joins native remote-JWKS body cancellation before database closure", async () => {
  const issuer = await createNativeIssuer();
  const raw = issuer.fetch;
  const reading = Promise.withResolvers<void>();
  const cancelling = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  vi.spyOn(issuer, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === "/jwks") {
      return new Response(
        new ReadableStream<Uint8Array>({
          pull: () => reading.resolve(),
          cancel: () => {
            cancelling.resolve();
            return release.promise;
          },
        }),
      );
    }
    return await raw(request);
  });
  await using root = await rootFor(issuer);
  await signIn(root, issuer);
  const token = await issuer.logoutToken({ sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} } });
  const request = root.http.request("/api/auth/oidc/backchannel-logout", { method: "POST", body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, token]]) });
  await reading.promise;
  let disposed = false;
  const disposal = root[Symbol.asyncDispose]().then(() => {
    disposed = true;
  });
  try {
    await cancelling.promise;
    expect(disposed).toBe(false);
    expect(await root.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
  } finally {
    release.resolve();
    await disposal;
    expect((await request).status).toBe(400);
  }
  await expect(root.db.all(sql`select 1`)).rejects.toThrow();
  await expect(access(root.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  expect(root.timers.pending()).toBe(0);
});

test("failed OIDC GC construction joins its held actual database sweep and retains the borrowed database", async () => {
  await using resources = new AsyncDisposableStack();
  const held = await freshHeldDb();
  resources.defer(() => closeDb(held.db));
  const gate = held.hold(/^delete from "oidc_transactions"/u);
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: createServerHarness owns these timers on admission and must dispose them on failed construction without an outer fallback.
  const timers = createControlledTimers(clock);
  const failure = new Error("controlled OIDC timer-arm failure");
  const interval = timers.interval;
  vi.spyOn(timers, "interval").mockImplementation((tick, ms) => {
    if (ms === MS_PER_HOUR) {
      throw failure;
    }
    return interval(tick, ms);
  });
  let settled = false;
  const result = createServerHarness({
    ownerId: null,
    authConfig: { ...authConfigFromEnv(), mode: "oidc", fallback: "deny" },
    db: held.db,
    clock,
    timers,
    oidc: SETTINGS,
  }).then(
    () => {
      throw new Error("OIDC construction unexpectedly succeeded");
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  try {
    await gate.reached;
    expect(settled).toBe(false);
    expect(await held.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
  } finally {
    gate.release();
    expect(await result).toBe(failure);
  }
  expect(timers.pending()).toBe(0);
  expect(await held.db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
});

test("configured native issuer execution preserves offset shared-byte views and streaming cancellation", async () => {
  const issuer = await createNativeIssuer();
  const entered = Promise.withResolvers<void>();
  const bodies: number[][] = [];
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path !== "/byte-body-probe" && path !== "/stream-body-probe") {
      return await issuer.fetch(request);
    }
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("application/octet-stream");
    bodies.push([...new Uint8Array(await request.arrayBuffer())]);
    if (path === "/stream-body-probe") {
      entered.resolve();
      await new Promise<void>((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(request.signal.reason);
        } else {
          request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
        }
      });
    }
    return new Response("accepted actual issuer bytes");
  };
  await using root = await createServerHarness({
    networkExecution: {
      resolver: (hostname) =>
        hostname === new URL(ISSUER).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted issuer host")),
      fetch: execute,
    },
  });
  await using oidc = await createConfiguredOidc({
    db: databaseHandle(root.db),
    now: root.clock.now,
    built: root.app,
    settings: SETTINGS,
    scheduleInterval: root.timers.interval,
  });
  const issuerFetch = (await oidc.getConfig())[customFetch];
  if (issuerFetch === undefined) {
    throw new Error("the configured native client omitted its actual issuer execution hook");
  }
  const bytes = new Uint8Array(new SharedArrayBuffer(12));
  bytes.set([99, 98, 97, 96, 1, 2, 3, 4, 5, 6, 95, 94]);
  const headers = { "content-type": "application/octet-stream" };
  const response = await issuerFetch(new URL("/byte-body-probe", ISSUER).href, { method: "POST", headers, body: bytes.subarray(4, 10), redirect: "manual" });
  expect(await response.text()).toBe("accepted actual issuer bytes");
  expect(bodies).toEqual([[1, 2, 3, 4, 5, 6]]);
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start: (target) => {
      target.enqueue(new Uint8Array([7, 8, 9]));
      target.close();
    },
  });
  const pending = issuerFetch(new URL("/stream-body-probe", ISSUER).href, {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
    redirect: "manual",
    signal: controller.signal,
  });
  await entered.promise;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(bodies).toEqual([
    [1, 2, 3, 4, 5, 6],
    [7, 8, 9],
  ]);
});

test.each([
  { value: null, label: "null" },
  { value: 7, label: "number" },
])("a signed backchannel $label event refuses before revocation; an object event still revokes", async ({ value }) => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const cookie = await signIn(root, issuer);
  const before = await root.db.select().from(sessions);
  expect(before).toHaveLength(1);
  const invalid = await issuer.logoutToken({ sub: MEMBER.sub, events: { [LOGOUT_EVENT]: value } });
  const rejected = await root.http.request("/api/auth/oidc/backchannel-logout", {
    method: "POST",
    body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, invalid]]),
  });
  expect(rejected.status).toBe(400);
  expect(await root.db.select().from(sessions)).toEqual(before);
  const live = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await live.json()).authenticated).toBe(true);
  const valid = await issuer.logoutToken({ sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} } });
  expect(
    (
      await root.http.request("/api/auth/oidc/backchannel-logout", {
        method: "POST",
        body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, valid]]),
      })
    ).status,
  ).toBe(200);
  const dead = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await dead.json()).authenticated).toBe(false);
});

test.each([
  { label: "missing issue time", omitted: ["iat"], patch: {} },
  { label: "missing expiration", omitted: ["exp"], patch: {} },
  { label: "missing token ID", omitted: ["jti"], patch: {} },
  { label: "non-string token ID", omitted: [], patch: { jti: 7 } },
  { label: "non-string session ID", omitted: [], patch: { sid: 7 } },
])("a signed logout token with $label refuses before the real session is revoked", async ({ omitted, patch }) => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const cookie = await signIn(root, issuer);
  const before = await root.db.select().from(sessions);
  expect(before).toHaveLength(1);
  const token = await issuer.logoutToken({ sub: MEMBER.sub, events: { [LOGOUT_EVENT]: {} }, ...patch }, omitted);
  const result = await root.http.request("/api/auth/oidc/backchannel-logout", {
    method: "POST",
    body: new URLSearchParams([[LOGOUT_TOKEN_PARAM, token]]),
  });
  expect(result.status).toBe(400);
  expect(await root.db.select().from(sessions)).toEqual(before);
  const me = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await me.json()).authenticated).toBe(true);
});
