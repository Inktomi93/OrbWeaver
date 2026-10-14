// Session tokens and throttle keys remain Node-only; creation and request admission are actual production operations.
import type { Db } from "@orb/db";
import { rateLimitBuckets, sessions } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import type { ServerTestHarness } from "../server.ts";

type SessionsService = ServicesResult["sessions"];
type HttpRequest = ServerTestHarness["http"]["request"];
export type BffSessionRow = typeof sessions.$inferSelect;
export type RateLimitBucketRow = typeof rateLimitBuckets.$inferSelect;

export interface SeededBffSession {
  readonly created: Awaited<ReturnType<SessionsService["create"]>>;
  readonly row: BffSessionRow;
}

export interface CapturedLoginBuckets {
  readonly response: Awaited<ReturnType<HttpRequest>>;
  readonly buckets: readonly RateLimitBucketRow[];
}

/** Internal session construction, not evidence of HTTP authentication or an enabled-account request grant. */
export async function seedBffSession(db: Db, create: SessionsService["create"], params: Parameters<SessionsService["create"]>[0]): Promise<SeededBffSession> {
  const created = await create(params);
  const row = await db.select().from(sessions).where(eq(sessions.id, created.sessionId)).get();
  if (row === undefined) {
    throw new Error("production session mint left no canonical BFF row");
  }
  return { created, row };
}

/** Drive the real login request and capture opaque producer keys; the fixture never computes a throttle window or identity. */
export async function seedLoginBuckets(db: Db, request: HttpRequest, params: Parameters<HttpRequest>): Promise<CapturedLoginBuckets> {
  const response = await request(...params);
  const buckets = await db.select().from(rateLimitBuckets).orderBy(rateLimitBuckets.key);
  return { response, buckets };
}
