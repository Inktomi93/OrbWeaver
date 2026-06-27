// foundation/observability/debug/routes — the /api/_debug surface (the dissolved `debug` DOMAIN folds in
// here; it was never a business feature — it is observability's read side). The two-tier auth gate
// (admin-cookie short-circuit → DEBUG_TOKEN fallback), the route registrar, and the structural-injection
// ports (`AssetInspector`, `AdminAuthChecker`) whose impls `entry/` supplies (their sources are UP-stack).
// The DB probes need NO port — they read @orb/db DOWN (ledger drops neo's DbInspector port).
//
// NOTE: /api/_debug/info reports `openrouter.configured` only — the DEFAULT_*_MODEL_ID constants are
// DEFERRED out of `@orb/contracts/connection` (its node comment: "out of scope for this node"), so
// foundation cannot yet read them DOWN. Wire them into /info once the connection DAG lands them (the edge
// stays strictly downward — never a foundation→infra import).

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, Hono, MiddlewareHandler, Next } from "hono";
import { APP_VERSION } from "#foundation/config";
import { env } from "#foundation/env";
import { getAuditFailureSnapshot } from "../audit";
import { logRing, recentRequests } from "../logger";
import { getTraceByRequestId, recentTraces } from "../tracing";
import { inspectChatState, integrityProbe, tableCounts } from "./inspect";

const ERROR_LEVEL = 50; // pino numeric level for "error"
const MAX_RING_READ = 2000;
const DEFAULT_LOG_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 100;
const NOT_FOUND = 404;
const UNAUTHORIZED = 401;

const LOG_LEVEL_VALUES: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function levelValue(name: string | undefined): number {
  return name === undefined ? 0 : (LOG_LEVEL_VALUES[name] ?? 0);
}

/** @internal — pure timing-safe equality (exported for tests; the middleware closes over env.DEBUG_TOKEN). */
export function tokenMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (expected === undefined || provided === undefined) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_RING_READ) : fallback;
}

interface LogQuery {
  limit: number;
  minLevel: number;
  requestId: string | undefined;
  q: string | undefined;
}

/** Pure filter over the log ring — kept out of the route handler so the registrar stays simple. */
function collectLogs(query: LogQuery): Record<string, unknown>[] {
  const logs: Record<string, unknown>[] = [];
  for (const line of logRing.recent(MAX_RING_READ)) {
    if (query.q !== undefined && !line.includes(query.q)) {
      continue;
    }
    const record = parseLine(line);
    if (record === null) {
      continue;
    }
    if (Number(record["level"] ?? 0) < query.minLevel) {
      continue;
    }
    if (query.requestId !== undefined && record["requestId"] !== query.requestId) {
      continue;
    }
    logs.push(record);
    if (logs.length >= query.limit) {
      break;
    }
  }
  return logs;
}

function collectErrors(limit: number): Record<string, unknown>[] {
  const errors: Record<string, unknown>[] = [];
  for (const line of logRing.recent(MAX_RING_READ)) {
    const record = parseLine(line);
    if (record !== null && Number(record["level"] ?? 0) >= ERROR_LEVEL) {
      errors.push(record);
    }
    if (errors.length >= limit) {
      break;
    }
  }
  return errors;
}

/**
 * Asset-store health port — structural-injection so foundation accepts `domain/assets`'s `fsck` without
 * importing it (assets is UP-stack). `object` return so no domain type crosses the boundary.
 * @public — `entry/` wires `assetsService.fsck` as the impl.
 */
export interface AssetInspector {
  fsck: () => Promise<object>;
}

/**
 * Admin-auth gate — structural-injection so foundation accepts the entry auth resolver without importing it
 * (auth is UP-stack). Consulted BEFORE the token check: an admin browser session is through, no token. The
 * token path is the headless fallback. `isAdmin` MUST never throw (a transport/db error resolves to `false`
 * so a misbehaving seam can't open the gate). @public — `entry/` adapts the resolver into this.
 */
export interface AdminAuthChecker {
  isAdmin: (headers: Headers) => Promise<boolean>;
}

/** Gate config. Tests construct the middleware directly; production wires it via `registerDebugRoutes`. */
export interface DebugAuthOptions {
  expectedToken: string | undefined;
  /** When set, an admin session cookie passes the gate without a token (token stays the headless fallback). */
  adminAuth?: AdminAuthChecker;
}

/** The /api/_debug registrar options. The `db` handle (optional) adds the /db/* probe surface; `assets`
 *  adds the CAS health check; `auth` overrides the default DEBUG_TOKEN gate (tests pass a known shape). */
export interface DebugRoutesOptions {
  db?: Db;
  assets?: AssetInspector;
  auth?: DebugAuthOptions | string;
}

/** Factory — the middleware closes over the gate config. Order: admin-cookie short-circuit, then the token
 *  check. `expectedToken === undefined` returns 404 ONLY when no admin checker is wired (the cookie path can
 *  still authorize). The query-param token form is intentionally absent (it leaked into proxy access logs). */
export function createDebugAuthMiddleware(
  opts: DebugAuthOptions | string | undefined,
): MiddlewareHandler {
  const config: DebugAuthOptions =
    typeof opts === "string" || opts === undefined ? { expectedToken: opts } : opts;
  return async (c: Context, next: Next) => {
    if (config.adminAuth !== undefined) {
      try {
        if (await config.adminAuth.isAdmin(c.req.raw.headers)) {
          return await next();
        }
      } catch {
        // Fall through to the token check — never throw upward from the gate.
      }
    }
    if (config.expectedToken === undefined) {
      return c.json({ error: "debug API disabled — set DEBUG_TOKEN to enable" }, NOT_FOUND);
    }
    if (!tokenMatches(c.req.header("x-debug-token"), config.expectedToken)) {
      return c.json({ error: "unauthorized" }, UNAUTHORIZED);
    }
    return await next();
  };
}

/** Prod middleware — closes over env.DEBUG_TOKEN at module load (token-only; the cookie path is wired by
 *  `registerDebugRoutes` where the auth resolver is available). @public */
export const debugAuthMiddleware: MiddlewareHandler = createDebugAuthMiddleware(env.DEBUG_TOKEN);

/** Register the /api/_debug/* introspection routes on `app` behind the auth gate. */
export function registerDebugRoutes(app: Hono, options: DebugRoutesOptions = {}): void {
  const { db, assets, auth = env.DEBUG_TOKEN } = options;
  app.use("/api/_debug/*", createDebugAuthMiddleware(auth));

  app.get("/api/_debug/info", (c) =>
    c.json({
      version: APP_VERSION,
      nodeEnv: env.NODE_ENV,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      providers: {
        // OpenRouter readiness = key present; the live catalog is a separate fetch. agent-sdk auth is the
        // host `claude login` — not cheaply probed here.
        openrouter: { configured: env.OPENROUTER_API_KEY !== undefined },
      },
    }),
  );

  app.get("/api/_debug/logs", (c) =>
    c.json({
      logs: collectLogs({
        limit: toLimit(c.req.query("limit"), DEFAULT_LOG_LIMIT),
        minLevel: levelValue(c.req.query("level")),
        requestId: c.req.query("requestId"),
        q: c.req.query("q"),
      }),
    }),
  );

  app.get("/api/_debug/errors", (c) =>
    c.json({ errors: collectErrors(toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT)) }),
  );

  app.get("/api/_debug/requests", (c) => {
    const userId = c.req.query("userId");
    const limit = toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT);
    if (userId === undefined) {
      return c.json({ requests: recentRequests(limit) });
    }
    // Filter the whole ring THEN cap — so the result is up to `limit` of THIS user's requests.
    const filtered = recentRequests(Number.MAX_SAFE_INTEGER).filter((r) => r.userId === userId);
    return c.json({ requests: filtered.slice(0, limit) });
  });

  app.get("/api/_debug/traces", (c) => {
    const traces = recentTraces(toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT)).map((t) => ({
      requestId: t.requestId,
      startedAt: t.startedAt,
      durationMs: t.durationMs,
      rootName: t.rootName,
      status: t.status,
      totals: t.totals,
    }));
    return c.json({ count: traces.length, traces });
  });
  app.get("/api/_debug/traces/:requestId", (c) => {
    const traceRecord = getTraceByRequestId(c.req.param("requestId"));
    return traceRecord === undefined
      ? c.json({ error: "no trace recorded for that requestId" }, NOT_FOUND)
      : c.json(traceRecord);
  });

  // DB introspection (only when a db handle is supplied). Gated by the same /api/_debug/* middleware above.
  if (db !== undefined) {
    app.get("/api/_debug/db/stats", async (c) =>
      c.json({ tables: await tableCounts(db), auditFailures: getAuditFailureSnapshot() }),
    );
    app.get("/api/_debug/db/integrity", async (c) => c.json(await integrityProbe(db)));
    app.get("/api/_debug/db/chat/:id", async (c) =>
      c.json(await inspectChatState(db, castId<ChatId>(c.req.param("id")))),
    );
  }
  if (assets !== undefined) {
    app.get("/api/_debug/db/assets", async (c) => c.json(await assets.fsck()));
  }
}
