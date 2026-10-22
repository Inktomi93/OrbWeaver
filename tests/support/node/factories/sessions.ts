// Session tokens and throttle keys remain Node-only; creation and request admission are actual production operations.
import type { Db } from "@orb/db";
import { oidcPendingSignups, oidcTransactions, rateLimitBuckets, sessions } from "@orb/db";
import type { ExternalId } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import { revokeUserSessionsResultSchema, sessionAdminViewSchema } from "@orb/server/domain/admin";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

type SessionsService = ServicesResult["sessions"];
type HttpRequest = ServerTestHarness["http"]["request"];
export type BffSessionRow = typeof sessions.$inferSelect;
export type RateLimitBucketRow = typeof rateLimitBuckets.$inferSelect;
export type OidcTransactionRow = typeof oidcTransactions.$inferSelect;
export type OidcPendingSignupRow = typeof oidcPendingSignups.$inferSelect;

/** State comes from the actual authorization redirect; PKCE and expiry remain production-owned. */
export async function captureOidcTransaction(db: Db, state: OidcTransactionRow["state"]): Promise<OidcTransactionRow | undefined> {
  return await db.select().from(oidcTransactions).where(eq(oidcTransactions.state, state)).get();
}

/** Capture only a callback-produced pending row, preserving its opaque hash and sealed bytes in Node. */
export async function captureOidcPendingSignup(db: Db, subject: ExternalId): Promise<OidcPendingSignupRow | undefined> {
  return await db.select().from(oidcPendingSignups).where(eq(oidcPendingSignups.subject, subject)).get();
}

export interface SeededBffSession {
  readonly created: Awaited<ReturnType<SessionsService["create"]>>;
  readonly row: BffSessionRow;
}

export interface CapturedLoginBuckets {
  readonly response: Awaited<ReturnType<HttpRequest>>;
  readonly buckets: readonly RateLimitBucketRow[];
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

export interface SeededAdminSession extends SeededBffSession {
  readonly view: Awaited<ReturnType<AdminService["listSessions"]>>[number];
}

export interface CapturedRevokedUserSessions {
  readonly result: Awaited<ReturnType<AdminService["revokeUserSessions"]>>;
  readonly views: Awaited<ReturnType<AdminService["listSessions"]>>;
  readonly rows: readonly BffSessionRow[];
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
