// D254 — the OIDC signup-through-invite round trip (the `.suite.int.test.ts` exemption: one property, many
// modules). A signed-out visitor opens a signup invite, signs in at the IdP with JIT closed, and joins only by
// confirming. This composes the REAL login, callback, pending-preview and confirm routes, the REAL sessions
// service and OIDC store, the REAL chat signup ops and a REAL database; only the IdP exchange is a fake that
// hands the callback chosen verified claims.

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { auditLogs, chatInvites, chatParticipants, oidcPendingSignups, oidcTransactions, users } from "@orb/db";
import type { ChatId, ChatInviteId, ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSessionsService, createTokenHasher } from "@orb/server/domain/sessions";
import type { OidcRoutesDeps } from "@orb/server/entry/http";
import { registerAuthRoutes } from "@orb/server/entry/http";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { Configuration } from "openid-client";
import { afterEach, describe, vi } from "vitest";
import { createSignupInvite } from "../../../packages/server/src/domain/chat/verbs/signup-invite.ts";
import { createOidcStore } from "../../../packages/server/src/domain/sessions/persistence/oidc-store.ts";
import { createHostPrincipalResolver } from "../../../packages/server/src/entry/auth/seam.ts";
import { createSignupMinterCheck } from "../../../packages/server/src/entry/compose/chat.ts";
import { buildAuditStatementIfPrecedingWrote } from "../../../packages/server/src/foundation/observability/audit.ts";
import { freshDb } from "../../support/db.ts";
import { seedChat, seedUser } from "../../support/factories/index.ts";
import { expect, test } from "../../support/fixtures.ts";

const NOW = 1_750_000_000_000;
const MINUTE_MS = 60_000;
const PENDING_TTL_MS = 10 * MINUTE_MS;
const PEPPER = "test-session-secret-at-least-32-chars-long";
const APP_HOST = "app.example";
const CALLBACK = `https://${APP_HOST}/api/auth/oidc/callback`;
const RAW_INVITE = "tok_oidc_signup_invite_raw_value";
const PENDING = "__Host-orb_join_pending";
const PENDING_INSECURE = "orb_join_pending_insecure";
const BINDING = "__Host-orb_oidc_state";
const SESSION = "__Host-orb_session";
const HTTPS = { "x-forwarded-proto": "https", "x-forwarded-host": APP_HOST };
const PEER = { incoming: { socket: { remoteAddress: "10.20.0.1", remotePort: 40_000, remoteFamily: "IPv4" } } };
const hashInvite = createTokenHasher(PEPPER);

/** Verified claims the fake exchange hands the callback: a new IdP user with a stable subject. */
function claimsFor(name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  // biome-ignore lint/style/useNamingConvention: OIDC claim names are wire-fixed snake_case (OIDC Core).
  return { preferred_username: name, sub: `idp|${name}`, email: `${name}@example.test`, groups: [], ...over };
}

interface Flow {
  readonly app: Hono;
  readonly db: Db;
  readonly clock: { now: number };
  readonly claims: { current: Record<string, unknown> };
  readonly seeded: UserId[];
  readonly announced: ChatId[];
  readonly chatId: ChatId;
  readonly inviteId: ChatInviteId;
  readonly sessions: ReturnType<typeof createSessionsService>;
  readonly invites: ReturnType<typeof createSignupInvite>;
}

async function flow(opts: { readonly requireApproval?: boolean; readonly maxUses?: number; readonly inviteTtlMs?: number } = {}): Promise<Flow> {
  const db = await freshDb();
  const clock = { now: NOW };
  const now = (): number => clock.now;
  const room = await seedChat(db, { withHost: true });
  const host = room.hostUserId;
  if (host === undefined) {
    throw new Error("seedChat withHost returned no host");
  }
  await db.update(users).set({ role: "admin" }).where(eq(users.id, host));
  const inviteId = castId<ChatInviteId>("chat_invite_oidc_signup");
  await db.insert(chatInvites).values({
    id: inviteId,
    chatId: room.id,
    tokenHash: hashInvite(RAW_INVITE),
    maxUses: opts.maxUses ?? 3,
    expiresAt: NOW + (opts.inviteTtlMs ?? 60 * MINUTE_MS),
    allowSignup: true,
    createdByUserId: host,
    mintMode: "oidc",
    createdAt: NOW,
  });
  const seeded: UserId[] = [];
  const announced: ChatId[] = [];
  const sessions = createSessionsService({ db, now, sessionSecret: PEPPER, seedUserConnections: () => Promise.resolve() });
  const invites = createSignupInvite(
    { db, now, hashToken: hashInvite, newParticipantId: () => mintTypeId(ID_PREFIX.chatParticipant), signupInvites: { mode: "oidc", mintable: true } },
    {
      signupUserStatement: sessions.signupUserStatement,
      minterMayMintSignup: createSignupMinterCheck(sessions, createHostPrincipalResolver(sessions)),
      auditStatementAfterWrite: (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at),
      assemblePreview: (chatId) => Promise.resolve({ chatId, roomName: "The room", hostHandle: castId<Handle>("host"), memberCount: 1, modeLabel: "turns" }),
      emit: (event) => {
        announced.push(event.chatId);
        return Promise.resolve();
      },
    },
  );
  const claims = { current: claimsFor("friend") };
  // biome-ignore lint/style/useNamingConvention: `authorization_endpoint` is the OIDC discovery field name.
  const issuer = { issuer: "https://idp.example", authorization_endpoint: "https://idp.example/authorize" };
  const oidc: OidcRoutesDeps = {
    getConfig: () => Promise.resolve(new Configuration(issuer, "orb-client")),
    exchange: () => Promise.resolve({ claims: claims.current, idToken: "id-token-for-the-join" }),
    redirectAllowlist: [CALLBACK],
    scope: "openid profile email",
    claims: { usernameClaim: "preferred_username", uidClaim: "sub", groupsClaim: "groups", emailClaim: "email" },
    groupsSeparator: ";",
    allowJitProvision: false,
    requireApproval: opts.requireApproval ?? false,
    store: createOidcStore(db, now),
    signup: {
      invites,
      pending: sessions,
      sessionIsLive: async (token) => (await sessions.validate(token)) !== null,
      seedUserConnections: (userId) => {
        seeded.push(userId);
        return Promise.resolve();
      },
    },
  };
  const app = new Hono();
  registerAuthRoutes(app, {
    sessions,
    sockets: { evictSession: (): number => 0, evictUser: (): number => 0 },
    now,
    db,
    resolveLoginLimit: (): number => 100,
    oidc,
  });
  return { app, db, clock, claims, seeded, announced, chatId: room.id, inviteId, sessions, invites };
}

/** The value a response's Set-Cookie gives `name`, or null. */
function setCookie(res: Response, name: string): string | null {
  const line = res.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return line === undefined ? null : (line.slice(name.length + 1).split(";")[0] ?? "");
}

async function login(f: Flow, query = `?invite=${encodeURIComponent(RAW_INVITE)}`): Promise<{ readonly state: string; readonly binding: string }> {
  const res = await f.app.request(`/api/auth/oidc/login${query}`, { headers: HTTPS }, PEER);
  expect(res.status).toBe(302);
  return { state: new URL(res.headers.get("location") ?? "").searchParams.get("state") ?? "", binding: setCookie(res, BINDING) ?? "" };
}

async function callback(f: Flow, signIn: { readonly state: string; readonly binding: string }): Promise<Response> {
  return await f.app.request(
    `/api/auth/oidc/callback?state=${signIn.state}&code=grant`,
    { headers: { ...HTTPS, cookie: `${BINDING}=${signIn.binding}` } },
    PEER,
  );
}

/** Sign in at the IdP with the invite and land on the pending join; returns the pending secret. */
async function pendingJoin(f: Flow, name = "friend"): Promise<string> {
  f.claims.current = claimsFor(name);
  const res = await callback(f, await login(f));
  expect(res.headers.get("location")).toBe("/login?pendingJoin=1");
  return setCookie(res, PENDING) ?? "";
}

interface PostShape {
  readonly body?: unknown;
  readonly csrf?: boolean;
}

async function post(f: Flow, path: string, cookie: string | null, shape: PostShape = {}): Promise<Response> {
  const headers: Record<string, string> = shape.csrf === false ? {} : { [CSRF_HEADER]: "1" };
  const body = shape.body ?? {};
  return await f.app.request(
    path,
    {
      method: "POST",
      headers: { ...HTTPS, "content-type": "application/json", ...headers, ...(cookie === null ? {} : { cookie }) },
      body: JSON.stringify(body),
    },
    PEER,
  );
}

const confirm = (f: Flow, secret: string | null, body: unknown = {}): Promise<Response> =>
  post(f, "/api/auth/oidc/pending/confirm", secret === null ? null : `${PENDING}=${secret}`, { body });

async function usersBySubject(f: Flow, name: string): Promise<(typeof users.$inferSelect)[]> {
  return await f.db
    .select()
    .from(users)
    .where(eq(users.externalId, castId<ExternalId>(`idp|${name}`)));
}

async function inviteUses(f: Flow): Promise<number | undefined> {
  return (await f.db.select().from(chatInvites).where(eq(chatInvites.id, f.inviteId))).at(0)?.uses;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the login route carries the invite as a peppered hash", () => {
  test("the transaction stores the peppered hash, and the raw token appears in no table after a full join", async () => {
    const f = await flow();
    await login(f);
    const [tx] = await f.db.select().from(oidcTransactions);
    expect(tx?.inviteTokenHash).toBe(hashInvite(RAW_INVITE));
    const secret = await pendingJoin(f);
    expect((await confirm(f, secret)).status).toBe(200);
    const tables = (await f.db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table'`)).map((row) => row.name);
    for (const table of tables) {
      const rows = await f.db.all<Record<string, unknown>>(sql.raw(`select * from "${table}"`));
      expect(JSON.stringify(rows)).not.toContain(RAW_INVITE);
    }
  });

  test("an over-long or absent invite param is carried as no invite, and the redirect is the same either way", async () => {
    const f = await flow();
    await login(f, `?invite=${"x".repeat(200)}`);
    await login(f, "");
    const txs = await f.db.select().from(oidcTransactions);
    expect(txs.map((tx) => tx.inviteTokenHash)).toEqual([null, null]);
  });
});

describe("the callback writes a pending join only on the JIT gate", () => {
  test("an unknown identity with JIT closed and a valid signup invite gets a pending row and cookie, no account, and the pending surface", async () => {
    const f = await flow();
    const res = await callback(f, await login(f));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?pendingJoin=1");
    const secret = setCookie(res, PENDING);
    expect(secret?.length).toBeGreaterThan(20);
    expect(res.headers.getSetCookie().find((line) => line.startsWith(`${PENDING}=`))).toContain("SameSite=Strict");
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(1);
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
  });

  test("an identity outside OIDC_ALLOWED_GROUPS gets no pending row", async () => {
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "friends");
    const f = await flow();
    const res = await callback(f, await login(f));
    expect(res.headers.get("location")).toBe("/login?authError=not_authorized");
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(0);
  });

  test("a subject mismatch on an existing handle gets no pending row", async () => {
    const f = await flow();
    await seedUser(f.db, { handle: castId<Handle>("friend"), externalId: castId<ExternalId>("idp|someone-else") });
    const res = await callback(f, await login(f));
    expect(res.headers.get("location")).toBe("/login?authError=not_authorized");
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(0);
  });

  test("replaying the callback URL in the same cookie jar is invalid_state and writes no second pending row", async () => {
    const f = await flow();
    const signIn = await login(f);
    await callback(f, signIn);
    const replay = await callback(f, signIn);
    expect(replay.headers.get("location")).toBe("/login?authError=invalid_state");
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(1);
  });

  test("control: a login with no invite behaves as today (not_authorized, nothing pending)", async () => {
    const f = await flow();
    const res = await callback(f, await login(f, ""));
    expect(res.headers.get("location")).toBe("/login?authError=not_authorized");
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(0);
  });
});

describe("the pending preview and confirm", () => {
  test("the preview answers the strict invite preview for the pending cookie, and nothing without it", async () => {
    const f = await flow();
    const secret = await pendingJoin(f);
    const res = await post(f, "/api/auth/oidc/pending/preview", `${PENDING}=${secret}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ chatId: f.chatId, roomName: "The room", hostHandle: "host", memberCount: 1, modeLabel: "turns" });
    expect((await post(f, "/api/auth/oidc/pending/preview", null)).status).toBe(404);
  });

  test("a confirm creates the account, spends a use, seats it, audits it, signs it in and spends the cookie", async () => {
    const f = await flow();
    const secret = await pendingJoin(f);
    const res = await confirm(f, secret);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: true });
    expect(setCookie(res, SESSION)?.length).toBeGreaterThan(20);
    expect(setCookie(res, PENDING)).toBe("");
    expect(setCookie(res, PENDING_INSECURE)).toBe("");
    const [account] = await usersBySubject(f, "friend");
    expect(account).toMatchObject({ handle: "friend", email: "friend@example.test", role: "user", enabled: true, passwordHash: null });
    expect(await inviteUses(f)).toBe(1);
    expect(
      await f.db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.userId, castId<UserId>(account?.id ?? ""))),
    ).toHaveLength(1);
    expect(await f.db.select().from(auditLogs).where(eq(auditLogs.action, "invites.signup"))).toHaveLength(1);
    expect(f.seeded).toEqual([account?.id]);
    expect(f.announced).toEqual([f.chatId]);
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(0);
  });

  test("a cookie holding the state, no cookie, a second confirm, and a confirm past the TTL all find nothing", async () => {
    const f = await flow();
    const signIn = await login(f);
    const res = await callback(f, signIn);
    const secret = setCookie(res, PENDING) ?? "";
    expect((await confirm(f, signIn.state)).status).toBe(404);
    expect((await confirm(f, null)).status).toBe(404);
    expect((await confirm(f, secret)).status).toBe(200);
    expect((await confirm(f, secret)).status).toBe(404);
    expect(await usersBySubject(f, "friend")).toHaveLength(1);

    const late = await flow();
    const lateSecret = await pendingJoin(late);
    late.clock.now += PENDING_TTL_MS + 1;
    expect((await confirm(late, lateSecret)).status).toBe(404);
    expect(await usersBySubject(late, "friend")).toHaveLength(0);
  });

  test("a body naming another invite is refused by the strict schema; without x-orb-csrf the confirm is 403", async () => {
    const f = await flow();
    const secret = await pendingJoin(f);
    expect((await confirm(f, secret, { token: "tok_other" })).status).toBe(400);
    expect((await post(f, "/api/auth/oidc/pending/confirm", `${PENDING}=${secret}`, { csrf: false })).status).toBe(403);
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
  });

  test("two pending identities on one single-use invite, confirming together: one account, one refusal", async () => {
    const f = await flow({ maxUses: 1 });
    const first = await pendingJoin(f, "alpha");
    const second = await pendingJoin(f, "bravo");
    const statuses = (await Promise.all([confirm(f, first), confirm(f, second)])).map((res) => res.status).toSorted();
    expect(statuses).toEqual([200, 404]);
    expect((await usersBySubject(f, "alpha")).length + (await usersBySubject(f, "bravo")).length).toBe(1);
    expect(await inviteUses(f)).toBe(1);
  });

  test("a forced login with a planted invite and no confirm leaves no account after the reaper runs", async () => {
    const f = await flow();
    await pendingJoin(f);
    await createOidcStore(f.db, () => f.clock.now).deleteExpired(NOW + PENDING_TTL_MS);
    expect(await f.db.select().from(oidcPendingSignups)).toHaveLength(0);
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
  });

  test("an invite that expired before the confirm provisions nothing", async () => {
    const f = await flow({ inviteTtlMs: 5 * MINUTE_MS });
    const secret = await pendingJoin(f);
    f.clock.now += 6 * MINUTE_MS;
    expect((await confirm(f, secret)).status).toBe(404);
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
  });

  test("a pending row taken between the confirm's read and its batch writes nothing", async () => {
    const f = await flow();
    const secret = await pendingJoin(f);
    const plan = await f.sessions.preparePendingSignup({ secret, requireApproval: false });
    if (plan === null) {
      throw new Error("expected a plan for a live pending join");
    }
    await f.db.delete(oidcPendingSignups);
    const outcome = await f.invites.redeemPending({ tokenHash: plan.inviteTokenHash, userId: plan.userId, handle: plan.handle, statements: plan.statements });
    expect(outcome).toEqual({ outcome: "refused", reason: "identity" });
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
    expect(await inviteUses(f)).toBe(0);
  });

  test("an email taken after the callback writes nothing at the confirm and spends no use", async () => {
    const f = await flow();
    const secret = await pendingJoin(f);
    await seedUser(f.db, { handle: castId<Handle>("elsewhere"), email: "friend@example.test" });
    expect((await confirm(f, secret)).status).toBe(404);
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
    expect(await inviteUses(f)).toBe(0);
  });
});

describe("a pending join claims no handle the local signup would refuse", () => {
  test("a case variant of a taken handle is refused at the confirm: no account, no use, cookie spent", async () => {
    const f = await flow();
    await seedUser(f.db, { handle: castId<Handle>("rival") });
    const secret = await pendingJoin(f, "Rival");
    const res = await confirm(f, secret);
    expect(res.status).toBe(404);
    expect(setCookie(res, PENDING)).toBe("");
    expect(await usersBySubject(f, "Rival")).toHaveLength(0);
    expect(await inviteUses(f)).toBe(0);
  });

  test("a case variant of an owner seed handle is refused at the confirm", async () => {
    vi.stubEnv("OWNER_HANDLES", "boss");
    const f = await flow();
    const secret = await pendingJoin(f, "Boss");
    expect((await confirm(f, secret)).status).toBe(404);
    expect(await usersBySubject(f, "Boss")).toHaveLength(0);
    expect(await inviteUses(f)).toBe(0);
  });

  test("a case variant taken between the confirm's read and its batch writes nothing and spends no use", async () => {
    const f = await flow();
    const secret = await pendingJoin(f);
    const plan = await f.sessions.preparePendingSignup({ secret, requireApproval: false });
    if (plan === null) {
      throw new Error("expected a plan for a live pending join");
    }
    await seedUser(f.db, { handle: castId<Handle>("FRIEND") });
    const outcome = await f.invites.redeemPending({ tokenHash: plan.inviteTokenHash, userId: plan.userId, handle: plan.handle, statements: plan.statements });
    expect(outcome).toEqual({ outcome: "refused", reason: "identity" });
    expect(await usersBySubject(f, "friend")).toHaveLength(0);
    expect(await inviteUses(f)).toBe(0);
  });

  // The IdP chooses these handles, so none passes through the local signup alphabet: a compatibility form, an
  // accented case variant and a mixed-script look-alike must all meet the held handle's key.
  test.each([
    ["émile", "Émile"],
    ["host", "Нost"],
    ["host", "ｈｏｓｔ"],
  ])("beside %s, the pending join as %s is refused at the confirm", async (held, joiner) => {
    const f = await flow();
    await seedUser(f.db, { handle: castId<Handle>(held) });
    const secret = await pendingJoin(f, joiner);
    expect((await confirm(f, secret)).status).toBe(404);
    expect(await usersBySubject(f, joiner)).toHaveLength(0);
    expect(await inviteUses(f)).toBe(0);
  });

  // A key applied once missed a few two-step prototypes (`ɪ` → `i` → `l`), and a mixed-script handle can spell
  // a look-alike the confusable data does not map; the confirm refuses both.
  test.each([
    ["admin", "admɪn"],
    ["host", "hσst"],
    ["root", "гoot"],
  ])("beside %s, the pending join as %s is refused at the confirm", async (held, joiner) => {
    const f = await flow();
    await seedUser(f.db, { handle: castId<Handle>(held) });
    const secret = await pendingJoin(f, joiner);
    expect((await confirm(f, secret)).status).toBe(404);
    expect(await usersBySubject(f, joiner)).toHaveLength(0);
  });

  test.each([["Дмитрий"], ["やまだ太郎"], ["Émile"]])("control: a single-script handle (%s) still joins", async (joiner) => {
    const f = await flow();
    const secret = await pendingJoin(f, joiner);
    expect((await confirm(f, secret)).status).toBe(200);
    expect(await usersBySubject(f, joiner)).toHaveLength(1);
  });

  test("control: beside host, a genuinely different handle (hosts) still joins", async () => {
    const f = await flow();
    await seedUser(f.db, { handle: castId<Handle>("host") });
    const secret = await pendingJoin(f, "hosts");
    expect((await confirm(f, secret)).status).toBe(200);
    expect(await usersBySubject(f, "hosts")).toHaveLength(1);
  });

  test("control: a handle no row carries in any case still joins", async () => {
    const f = await flow();
    await seedUser(f.db, { handle: castId<Handle>("rival") });
    const secret = await pendingJoin(f, "Rivalry");
    expect((await confirm(f, secret)).status).toBe(200);
    expect(await usersBySubject(f, "Rivalry")).toHaveLength(1);
  });
});

describe("OIDC_REQUIRE_APPROVAL: an invite is not approval", () => {
  test("the confirm spends a use and seats a disabled account without a session; once enabled, the friend signs in as a member", async () => {
    const f = await flow({ requireApproval: true });
    const secret = await pendingJoin(f);
    const res = await confirm(f, secret);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false });
    expect(setCookie(res, SESSION)).toBeNull();
    const [account] = await usersBySubject(f, "friend");
    expect(account?.enabled).toBe(false);
    expect(await inviteUses(f)).toBe(1);
    const seat = eq(chatParticipants.userId, castId<UserId>(account?.id ?? ""));
    expect(await f.db.select().from(chatParticipants).where(seat)).toHaveLength(1);

    await f.db
      .update(users)
      .set({ enabled: true })
      .where(eq(users.id, castId<UserId>(account?.id ?? "")));
    const again = await callback(f, await login(f, ""));
    expect(again.headers.get("location")).toBe("/");
    expect(setCookie(again, SESSION)?.length).toBeGreaterThan(20);
    expect(await f.db.select().from(chatParticipants).where(seat)).toHaveLength(1);
  });
});
