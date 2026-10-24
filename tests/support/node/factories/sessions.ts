// The Session, OIDC and rate-limit row and result shapes; the reads that return them live in the rows tier (`rows/sessions.ts`).

import type { oidcPendingSignups, oidcTransactions, rateLimitBuckets, sessions } from "@orb/db";
import type { AdminService } from "@orb/server/domain/admin";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerTestHarness } from "../server.ts";

export type SessionsService = ServicesResult["sessions"];
export type HttpRequest = ServerTestHarness["http"]["request"];
export type BffSessionRow = typeof sessions.$inferSelect;
type RateLimitBucketRow = typeof rateLimitBuckets.$inferSelect;
export type OidcTransactionRow = typeof oidcTransactions.$inferSelect;
export type OidcPendingSignupRow = typeof oidcPendingSignups.$inferSelect;

export interface SeededBffSession {
  readonly created: Awaited<ReturnType<SessionsService["create"]>>;
  readonly row: BffSessionRow;
}

export interface CapturedLoginBuckets {
  readonly response: Awaited<ReturnType<HttpRequest>>;
  readonly buckets: readonly RateLimitBucketRow[];
}

export interface SeededAdminSession extends SeededBffSession {
  readonly view: Awaited<ReturnType<AdminService["listSessions"]>>[number];
}

export interface CapturedRevokedUserSessions {
  readonly result: Awaited<ReturnType<AdminService["revokeUserSessions"]>>;
  readonly views: Awaited<ReturnType<AdminService["listSessions"]>>;
  readonly rows: readonly BffSessionRow[];
}
