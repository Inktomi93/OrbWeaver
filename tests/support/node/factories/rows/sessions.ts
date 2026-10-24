// Session, OIDC and rate-limit rows a production path left, read behind the rows door for persistence-tier and corpus captures.

import type { Principal } from "@orb/contracts/identity";
import { sessionAdminViewSchema } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import { oidcPendingSignups, oidcTransactions, rateLimitBuckets, sessions } from "@orb/db";
import type { ExternalId } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import { revokeUserSessionsResultSchema } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import type { CapturedCookieAuth } from "../../corpus-auth.ts";
import { captureCookieAuth } from "../../corpus-auth.ts";
import type { ServerProducerRoot, ServerTestHarness } from "../../server.ts";
import type {
  CapturedLoginBuckets,
  CapturedRevokedUserSessions,
  HttpRequest,
  OidcPendingSignupRow,
  OidcTransactionRow,
  SeededAdminSession,
  SeededBffSession,
  SessionsService,
} from "../sessions.ts";

/** State comes from the actual authorization redirect; PKCE and expiry remain production-owned. */
export async function captureOidcTransaction(db: Db, state: OidcTransactionRow["state"]): Promise<OidcTransactionRow | undefined> {
  return await db.select().from(oidcTransactions).where(eq(oidcTransactions.state, state)).get();
}

/** Capture only a callback-produced pending row, preserving its opaque hash and sealed bytes in Node. */
export async function captureOidcPendingSignup(db: Db, subject: ExternalId): Promise<OidcPendingSignupRow | undefined> {
  return await db.select().from(oidcPendingSignups).where(eq(oidcPendingSignups.subject, subject)).get();
}

/** Internal session construction, not evidence of HTTP authentication or an enabled-account request grant. */
export async function seedBffSession(root: ServerProducerRoot, params: Parameters<SessionsService["create"]>[0]): Promise<SeededBffSession> {
  const db = root.db;
  const create = root.app.sessions.create;
  const created = await create(params);
  const row = await db.select().from(sessions).where(eq(sessions.id, created.sessionId)).get();
  if (row === undefined) {
    throw new Error("production session mint left no canonical BFF row");
  }
  return { created, row };
}

/** Retain the minted device's actual admin projection beside its private token and stored bytes. */
export async function seedAdminSession(
  root: ServerProducerRoot,
  params: Parameters<SessionsService["create"]>[0],
  principal: Parameters<AdminService["listSessions"]>[0]["principal"],
): Promise<SeededAdminSession> {
  const seeded = await seedBffSession(root, params);
  const views = await root.services.admin.listSessions({ principal, userId: seeded.row.userId });
  const view = views.find((device) => device.id === seeded.row.id);
  if (view === undefined) {
    throw new Error("production admin read omitted the minted session");
  }
  return { ...seeded, view: sessionAdminViewSchema.parse(view) };
}

/** Run the actual kick, then retain its exact public post-state and separate owner-scoped private rows. */
export async function seedRevokedUserSessions(
  root: ServerProducerRoot,
  params: Parameters<AdminService["revokeUserSessions"]>[0],
): Promise<CapturedRevokedUserSessions> {
  const db = root.db;
  const revoke = root.services.admin.revokeUserSessions;
  const list = root.services.admin.listSessions;
  const result = revokeUserSessionsResultSchema.parse(await revoke(params));
  const views = (await list(params)).map((view) => sessionAdminViewSchema.parse(view));
  const rows = await db.select().from(sessions).where(eq(sessions.userId, params.userId)).orderBy(sessions.id);
  return { result, views, rows };
}

/** Drive the real login request and capture opaque producer keys; the fixture never computes a throttle window or identity. */
export async function seedLoginBuckets(root: ServerProducerRoot, params: Parameters<HttpRequest>): Promise<CapturedLoginBuckets> {
  const db = root.db;
  const request = root.http.request;
  const response = await request(...params);
  const buckets = await db.select().from(rateLimitBuckets).orderBy(rateLimitBuckets.key);
  return { response, buckets };
}

export interface CapturedCookieAuthRows extends CapturedCookieAuth {
  /** The throttle buckets as the login request left them. */
  readonly loginBuckets: CapturedLoginBuckets["buckets"];
}

/** {@link captureCookieAuth}, reading the rate-limit buckets right after its login, for the corpus publication. */
export async function captureCookieAuthRows(root: ServerTestHarness, viewer: Principal, password: string): Promise<CapturedCookieAuthRows> {
  let loginBuckets: CapturedLoginBuckets["buckets"] | undefined;
  const captured = await captureCookieAuth(root, viewer, password, async (...params) => {
    const { response, buckets } = await seedLoginBuckets(root, params);
    loginBuckets = buckets;
    return response;
  });
  if (loginBuckets === undefined) {
    throw new Error("cookie capture completed without sending its login request");
  }
  return { ...captured, loginBuckets };
}
