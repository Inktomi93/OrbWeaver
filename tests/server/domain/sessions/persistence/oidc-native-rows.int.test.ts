// The native OIDC flow's stored rows across the whole database: a refused or replayed callback mints no users,
// sessions or oidc_transactions row on an ownerless root, oidc_pending_signups rows settle exactly once (the joined account,
// seat and invite read through the owner's verbs), and shutdown closes the database handle.

import { access, readFile } from "node:fs/promises";
import { pendingJoinConfirmResultSchema, signedOutInvitePreviewSchema } from "@orb/contracts/chat";
import { authLogoutResultSchema, authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { closeDb, oidcPendingSignups, oidcTransactions, sessions, users } from "@orb/db";

import { brandedId } from "@orb/kit/ids";
import { MS_PER_HOUR } from "@orb/kit/time";
import { createControlledTimers, createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { beginOidcLogin, cookieHeader, finishOidcLogin, signInWithOidc } from "@orb/testkit/node/auth";
import { configureOidc, createServerHarness, freshDb, freshHeldDb } from "@orb/testkit/node/composed";
import { createNativeIssuer, ISSUER, NATIVE_OIDC_SETTINGS as SETTINGS } from "@orb/testkit/node/helpers";
import { sql } from "drizzle-orm";
import type { JWTPayload } from "jose";
import { customFetch } from "openid-client";
import { vi } from "vitest";
import { z } from "zod";
import type { HttpRoot } from "../../../entry/compose/oidc-native.fixtures.ts";
import {
  ID_TOKEN_SECRET,
  LOGOUT_EVENT,
  LOGOUT_TOKEN_PARAM,
  MEMBER,
  rootFor,
  SESSION_COOKIE_PATTERN,
  scriptTokenEndpoint,
  writes,
} from "../../../entry/compose/oidc-native.fixtures.ts";

// ── The callback's code→token exchange and every arm downstream of it, through the native client ──────────────

async function expectRefusedWithoutSession(root: HttpRoot, response: Response, location: string): Promise<void> {
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(location);
  expect(writes(response, SESSION_COOKIE_PATTERN)).toEqual([]);
  expect(await root.db.select().from(sessions)).toEqual([]);
}

// The issuer refuses a code presented with any redirect_uri but the authorized one, so arriving on another origin
// signs in only when the exchange presents the stored, allowlisted redirect_uri.

// The route passes the transaction's nonce, so openid-client requires the ID token it binds: an issuer that omits
// one cannot sign anybody in, and no session or account is left behind.

test("the native configured flow provisions a real account/session and spends its sealed ID-token hint at logout", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  expect("ownerId" in root).toBe(false);
  expect(await root.db.select().from(users)).toEqual([]);
  const login = await beginOidcLogin(root, issuer, MEMBER);
  const transactions = await root.db.select().from(oidcTransactions);
  expect(transactions).toHaveLength(1);
  expect(transactions[0]?.state).toBe(login.callback.searchParams.get("state"));
  expect(transactions[0]?.codeVerifier).not.toBe("");
  const result = await finishOidcLogin(root, login);
  expect(result.headers.get("location")).toBe("/");
  const cookie = cookieHeader(result);
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
  const login = await beginOidcLogin(root, issuer, MEMBER);
  const foreign = await finishOidcLogin(root, login, "");
  expect(foreign.headers.get("location")).toBe("/login?authError=invalid_state");
  expect(await root.db.select().from(oidcTransactions)).toHaveLength(1);
  expect(await root.db.select().from(sessions)).toEqual([]);
  expect(issuer.calls).toEqual(["GET /.well-known/openid-configuration"]);
  expect((await finishOidcLogin(root, login)).headers.get("location")).toBe("/");
  expect((await finishOidcLogin(root, login)).headers.get("location")).toBe("/login?authError=invalid_state");
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
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, { ...MEMBER, ...value }));
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
  const result = await finishOidcLogin(root, { callback: issuer.authorize(authorization.href, MEMBER), cookie: cookieHeader(response) });
  expect(result.headers.get("location")).toBe("/login?authError=invalid_grant");
  expect(await root.db.select().from(users)).toEqual([]);
  expect(await root.db.select().from(sessions)).toEqual([]);
});

test("a genuine fresh OIDC root refuses a guessable owner handle, then claims only through its real boot file", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  // biome-ignore lint/style/useNamingConvention: preferred_username is the issuer's actual configured OIDC claim.
  const claims = { sub: "native-owner-subject", preferred_username: root.app.sessions.rolePolicy.ownerHandles()[0] } satisfies JWTPayload;
  const unproven = await finishOidcLogin(root, await beginOidcLogin(root, issuer, claims));
  expect(unproven.headers.get("location")).toBe("/login?authError=not_authorized");
  expect(await root.app.sessions.getOwnerUserId()).toBeUndefined();
  expect(await root.db.select().from(users)).toEqual([]);
  if (root.ownerClaimFile === undefined) {
    throw new Error("configured OIDC root omitted the real claim file");
  }
  const claimUrl = new URL((await readFile(root.ownerClaimFile, "utf8")).trim());
  const cookie = await signInWithOidc(root, issuer, claims, claimUrl.search);
  const me = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await me.json())).toEqual({ authenticated: true, handle: claims.preferred_username, role: "owner" });
  const rows = await root.db.select().from(users);
  expect(rows).toHaveLength(1);
  expect(await root.app.sessions.getOwnerUserId()).toBe(rows[0]?.id);
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
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER));
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
  await signInWithOidc(root, issuer, { sub: "native-owner-subject", preferred_username: root.app.sessions.rolePolicy.ownerHandles()[0] }, claimUrl.search);
  const ownerId = await root.app.sessions.getOwnerUserId();
  if (ownerId === undefined) {
    throw new Error("real owner claim produced no owner row");
  }
  const owner = await root.internalCallerFor(ownerId);
  const room = (await owner.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const invite = await owner.invites.createInvite({ chatId: room.id, input: { allowSignup: true, maxUses: 1, expiresAt: root.clock.now() + MS_PER_HOUR } });
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER, `?invite=${encodeURIComponent(invite.token)}`));
  expect(result.headers.get("location")).toBe("/login?pendingJoin=1");
  const pendingCookie = cookieHeader(result);
  const pending = await root.db.select().from(oidcPendingSignups);
  expect(pending).toHaveLength(1);
  expect(pending[0]?.subject).toBe(MEMBER.sub);
  expect(pending[0]?.idTokenCiphertext).not.toBeNull();
  expect(JSON.stringify(pending)).not.toContain(issuer.idTokens.at(-1));
  expect(pendingCookie).not.toContain(pending[0]?.secretHash);
  expect(await owner.admin.listUsers()).toHaveLength(1);
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
  const joined = (await owner.admin.listUsers()).filter((row) => row.externalId === MEMBER.sub);
  expect(joined).toHaveLength(1);
  expect(joined[0]?.enabled).toBe(!approval);
  const joiner = joined[0];
  if (joiner === undefined) {
    throw new Error("the successful real pending join produced no user row");
  }
  expect((await owner.chat.getChat({ chatId: room.id })).participants.filter(({ userId }) => userId === joiner.id)).toHaveLength(1);
  expect((await owner.invites.listInvites({ chatId: room.id })).find(({ id }) => id === invite.invite.id)).toMatchObject({ remainingUses: 0 });
  const replay = await root.http.request("/api/auth/oidc/pending/confirm", confirmInit);
  expect(replay.status).toBe(404);
  const signedIn = await root.http.request("/api/auth/me", { headers: { cookie: cookieHeader(confirmed) } });
  expect(authMeSchema.parse(await signedIn.json()).authenticated).toBe(!approval);
});

test("native OIDC group claims fail closed under the graph's configured allowed groups", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer, {}, { rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: "owner", ["OIDC_ALLOWED_GROUPS"]: "friends" } });
  for (const groups of [undefined, null, 7, [], ["outsiders"], { value: "friends" }]) {
    const response = await finishOidcLogin(root, await beginOidcLogin(root, issuer, { ...MEMBER, groups }));
    expect(response.headers.get("location")).toBe("/login?authError=not_authorized");
    expect(await root.db.select().from(users)).toEqual([]);
    expect(await root.db.select().from(sessions)).toEqual([]);
  }
  const cookie = await signInWithOidc(root, issuer, { ...MEMBER, groups: [" friends "] });
  const signedIn = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await signedIn.json())).toMatchObject({ authenticated: true, role: "user" });
});

test("a handle that became an owner seed-key look-alike after the callback is refused at the confirm", async () => {
  await using resources = new AsyncDisposableStack();
  const db = await freshDb();
  resources.defer(() => closeDb(db));
  const issuer = await createNativeIssuer();
  const first = resources.use(
    await rootFor(issuer, { ["OIDC_SIGNUP"]: false }, { db, rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: "owner", ["OWNER_HANDLES"]: "original-owner" } }),
  );
  if (first.ownerClaimFile === undefined) {
    throw new Error("configured OIDC omitted its actual owner claim file");
  }
  const claimUrl = new URL((await readFile(first.ownerClaimFile, "utf8")).trim());
  await signInWithOidc(first, issuer, { sub: "restart-policy-owner", [SETTINGS.OIDC_USERNAME_CLAIM]: "original-owner" }, claimUrl.search);
  const ownerId = await first.app.sessions.getOwnerUserId();
  if (ownerId === undefined) {
    throw new Error("the actual owner claim produced no owner row");
  }
  const owner = await first.internalCallerFor(ownerId);
  const room = (await owner.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const invite = await owner.invites.createInvite({ chatId: room.id, input: { allowSignup: true, maxUses: 1, expiresAt: first.clock.now() + MS_PER_HOUR } });
  const pending = await finishOidcLogin(
    first,
    await beginOidcLogin(
      first,
      issuer,
      { sub: "restart-policy-joiner", [SETTINGS.OIDC_USERNAME_CLAIM]: "Boss" },
      `?invite=${encodeURIComponent(invite.token)}`,
    ),
  );
  expect(pending.headers.get("location")).toBe("/login?pendingJoin=1");
  const pendingCookie = cookieHeader(pending);
  expect(await db.select().from(oidcPendingSignups)).toHaveLength(1);
  await first[Symbol.asyncDispose]();

  const restarted = resources.use(
    await rootFor(issuer, { ["OIDC_SIGNUP"]: false }, { db, rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: "owner", ["OWNER_HANDLES"]: "boss" } }),
  );
  const confirmed = await restarted.http.request("/api/auth/oidc/pending/confirm", {
    method: "POST",
    headers: { cookie: pendingCookie, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ persona: { name: "Restart joiner", description: "" } }),
  });
  expect(confirmed.status).toBe(404);
  const restartedOwner = await restarted.internalCallerFor(ownerId);
  expect(
    (await restartedOwner.admin.listUsers()).filter(({ externalId }) => externalId === brandedId("ExternalId").parse("restart-policy-joiner")),
  ).toHaveLength(0);
  expect((await restartedOwner.invites.listInvites({ chatId: room.id })).find(({ id }) => id === invite.invite.id)).toMatchObject({ remainingUses: 1 });
  const signedOut = await restarted.http.request("/api/auth/me", { headers: { cookie: cookieHeader(confirmed) } });
  expect(authMeSchema.parse(await signedOut.json()).authenticated).toBe(false);
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
  await beginOidcLogin(root, issuer, MEMBER);
  root.clock.advance(MS_PER_HOUR);
  const live = await beginOidcLogin(root, issuer, MEMBER);
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
  await signInWithOidc(root, issuer, MEMBER);
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
    env: { ["AUTH_MODE"]: "oidc", ["AUTH_FALLBACK"]: "deny" },
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
  await using oidc = await configureOidc(root, SETTINGS);
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
  const cookie = await signInWithOidc(root, issuer, MEMBER);
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
  const cookie = await signInWithOidc(root, issuer, MEMBER);
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

test("a verified grant mints the session and threads the id_token to sessions.create VERBATIM", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER));
  expect(result.status).toBe(302);
  expect(result.headers.get("location")).toBe("/");
  expect(await root.db.select().from(oidcTransactions)).toEqual([]);
  const [idToken] = issuer.idTokens;
  const logout = await root.http.request("/api/auth/logout", { method: "POST", headers: { cookie: cookieHeader(result), [CSRF_HEADER]: "1" } });
  const endSession = new URL(authLogoutResultSchema.parse(await logout.json()).endSessionUrl ?? "missing end-session URL");
  expect(endSession.searchParams.get("id_token_hint")).toBe(idToken);
});

test("the exchange is handed the STORED redirect_uri (not the arrival origin) and the consumed transaction", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const login = await beginOidcLogin(root, issuer, MEMBER);
  const arrival = new URL(login.callback);
  arrival.host = "127.0.0.1";
  const result = await root.http.request(arrival, { headers: { host: arrival.host, cookie: login.cookie } });
  expect(result.headers.get("location")).toBe("/");
  expect(await root.db.select().from(oidcTransactions)).toEqual([]);
  expect(await root.db.select().from(sessions)).toHaveLength(1);
});

test("a grant with no id_token mints no session: the #141 null-hint degrade is unreachable through the nonce-bound grant", async () => {
  const issuer = await createNativeIssuer();
  scriptTokenEndpoint(issuer, async (native) => {
    const body = z.record(z.string(), z.unknown()).parse(await (await native()).json());
    const { ["id_token"]: _dropped, ...rest } = body;
    return Response.json(rest);
  });
  await using root = await rootFor(issuer);
  await expectRefusedWithoutSession(root, await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER)), "/login?authError=token_exchange_failed");
  expect(await root.db.select().from(users)).toEqual([]);
});

test("a THROWING exchange (replayed/expired code) mints no session, sets no cookie, and 302s with the sanitized code", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const login = await beginOidcLogin(root, issuer, MEMBER);
  const replayed = new URL(login.callback);
  replayed.searchParams.set("code", "a-code-the-issuer-never-issued");
  await expectRefusedWithoutSession(root, await finishOidcLogin(root, { ...login, callback: replayed }), "/login?authError=invalid_grant");
  expect(await root.db.select().from(oidcTransactions)).toEqual([]);
});

test("an exchange error carrying FREE TEXT is not reflected — the generic marker rides instead", async () => {
  const issuer = await createNativeIssuer();
  scriptTokenEndpoint(issuer, () => Promise.resolve(Response.json({ error: "<script>alert(1)</script>" }, { status: 400 })));
  await using root = await rootFor(issuer);
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER));
  expect(result.headers.get("location") ?? "").not.toContain("script");
  await expectRefusedWithoutSession(root, result, "/login?authError=token_exchange_failed");
});

test("nothing from the thrown error's message reaches the redirect or the body", async () => {
  const issuer = await createNativeIssuer();
  scriptTokenEndpoint(issuer, () => Promise.reject(new Error(`token endpoint said: ${ID_TOKEN_SECRET}`)));
  await using root = await rootFor(issuer);
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER));
  expect(result.headers.get("location") ?? "").not.toContain(ID_TOKEN_SECRET);
  expect(await result.clone().text()).not.toContain(ID_TOKEN_SECRET);
  await expectRefusedWithoutSession(root, result, "/login?authError=token_exchange_failed");
});

test("a verified grant with NO stable subject is refused fail-closed — no session (#699)", async () => {
  const issuer = await createNativeIssuer();
  // The deployment keys accounts on a claim this issuer never emits.
  await using root = await rootFor(issuer, { ["OIDC_UID_CLAIM"]: "employee_number" });
  await expectRefusedWithoutSession(root, await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER)), "/login?authError=no_identity");
  expect(await root.db.select().from(users)).toEqual([]);
});

test("a grant with NO usable username is refused too (the pre-existing null-identity arm)", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  await expectRefusedWithoutSession(root, await finishOidcLogin(root, await beginOidcLogin(root, issuer, { sub: MEMBER.sub })), "/login?authError=no_identity");
  expect(await root.db.select().from(users)).toEqual([]);
});

test("a DENIED provision (login gate refused) mints nothing — generic not_authorized", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer, {}, { rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: "owner", ["OIDC_ALLOWED_GROUPS"]: "friends" } });
  await expectRefusedWithoutSession(
    root,
    await finishOidcLogin(root, await beginOidcLogin(root, issuer, { ...MEMBER, groups: ["outsiders"] })),
    "/login?authError=not_authorized",
  );
  expect(await root.db.select().from(users)).toEqual([]);
});

test("an ACCOUNT-EXISTS collision deny surfaces its distinct code, still with no session", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  const email = "native-collision@example.test";
  const local = await root.actor({ handle: brandedId("Handle").parse("native-local-holder"), email });
  const result = await finishOidcLogin(root, await beginOidcLogin(root, issuer, { ...MEMBER, email }));
  await expectRefusedWithoutSession(root, result, "/login?authError=account_exists");
  expect(await root.db.select({ id: users.id, externalId: users.externalId }).from(users)).toEqual([{ id: local.id, externalId: null }]);
});

test("a provisioned but DISABLED account mints no session", async () => {
  const issuer = await createNativeIssuer();
  await using root = await rootFor(issuer);
  await root.actor({ handle: brandedId("Handle").parse(MEMBER.preferred_username), externalId: brandedId("ExternalId").parse(MEMBER.sub), enabled: false });
  await expectRefusedWithoutSession(root, await finishOidcLogin(root, await beginOidcLogin(root, issuer, MEMBER)), "/login?authError=account_disabled");
  expect(await root.db.select({ enabled: users.enabled }).from(users)).toEqual([{ enabled: false }]);
});
