// The /api/_debug surface: observability's read side. The two-tier auth gate (admin-session
// short-circuit → DEBUG_TOKEN fallback), the route registrar, and the structural-injection ports
// (`AssetInspector`, `AdminAuthChecker`) whose impls entry/ supplies. The DB probes need no port — they
// read @orb/db directly.
//
// THIS GATE IS THE ENTIRE BOUNDARY for every route below. The probes are deliberately principal-BLIND
// whole-db reads (`@owner-scope-ok`, D20) — they take ids from QUERY PARAMS, never from auth — so whatever
// this middleware admits reads the whole deployment. Two credentials pass and nothing else: an admin/owner
// SESSION (`AdminAuthChecker`) or the `x-debug-token` operator secret. An un-credentialed caller must never
// pass in any AUTH_MODE, with or without a configured token; that invariant's enforcer is
// `tests/server/entry/debug-gate.suite.test.ts` (AUTHFIX-2 — it did not hold until 2026-08-07).

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { RenderPolicy } from "@orb/contracts/chat";
import { DEFAULT_CHAT_MODEL_ID, DEFAULT_OR_CHAT_MODEL_ID } from "@orb/contracts/connection";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, Hono, MiddlewareHandler, Next } from "hono";
import { APP_VERSION } from "#foundation/config";
import { env } from "#foundation/env";
import { getAuditFailureSnapshot } from "../audit.ts";
import { logRing, recentRequests } from "../logger.ts";
import { getTraceByRequestId, recentTraces } from "../tracing.ts";
import {
  appSettingRows,
  characterDetailRow,
  characterListSummaries,
  characterPolicySweep,
  chatConfigRow,
  chatListSummaries,
  inspectChatState,
  integrityProbe,
  personaRows,
  presetRows,
  rpgGameForChat,
  tableCounts,
  userSettingsRows,
} from "./inspect/index.ts";
import { recentTurnOutcomes, recentWireCaptures } from "./wire-capture.ts";

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

/** Asset-store health port — structural-injection so foundation accepts assets' `fsck` without importing
 *  it. `object` return so no domain type crosses the boundary. */
export interface AssetInspector {
  fsck: () => Promise<object>;
}

/** Admin-auth gate — structural-injection so foundation accepts the entry auth resolver without importing
 *  it. Consulted before the token check. `isAdmin` must never throw (a transport/db error resolves to
 *  `false` so a misbehaving seam can't open the gate).
 *
 *  THE IMPLEMENTOR'S CONTRACT, and the one this port cannot check for itself: `true` means the caller
 *  PRESENTED an admin credential. Because this arm short-circuits BOTH the token comparison and the
 *  `expectedToken === undefined` → 404 branch, an impl that returns `true` for a merely-inferred principal
 *  opens the entire surface unconditionally — which is exactly what the production impl did until
 *  AUTHFIX-2 (`entry/auth/seam.ts::DEBUG_GATE_CREDENTIALED`). An ORIGIN is not a credential. */
export interface AdminAuthChecker {
  isAdmin: (headers: Headers) => Promise<boolean>;
}

/** The rpg flight-recorder read port (R-OBS) — structural-injection so foundation accepts `domain/rpg`'s ring
 *  recorder without importing it (the `AssetInspector` precedent). Returns `object[]` so no rpg type crosses the
 *  boundary; the records serialize straight to JSON. Host-only via the debug gate; read-only (D75). */
export interface RpgTraceInspector {
  recent: (filter: { chatId?: ChatId; turnId?: string; limit?: number }) => readonly object[];
}

/** The multiplexed-socket read port (SSE-1 §12) — structural-injection so foundation accepts transport's
 *  socket registry without importing it (the `RpgTraceInspector` precedent; transport sits ABOVE foundation
 *  in the tier list, so the dependency has to arrive as data). This is the STARVATION REGRESSION PIN: the
 *  whole point of the multiplex is "one socket per tab, and opening a game chat adds ZERO", which is a claim
 *  about a COUNT that nothing outside the process can otherwise observe. */
export interface SocketInspector {
  liveSocketCount: (userId?: UserId) => number;
}

/** Gate config. Tests construct the middleware directly; production wires it via `registerDebugRoutes`. */
export interface DebugAuthOptions {
  expectedToken: string | undefined;
  /** When set, an admin SESSION passes the gate without a token (the token stays the headless fallback —
   *  `scripts/probes/*` and the e2e harness use it). Read `AdminAuthChecker`'s contract before wiring one. */
  adminAuth?: AdminAuthChecker;
}

/** The /api/_debug registrar options. The `db` handle (optional) adds the /db/* probe surface; `assets`
 *  adds the CAS health check; `auth` overrides the default DEBUG_TOKEN gate (tests pass a known shape). */
export interface DebugRoutesOptions {
  db?: Db;
  assets?: AssetInspector;
  /** The rpg flight-recorder read port (R-OBS). Absent ⇒ the /rpg/traces route is not registered (tracing off). */
  rpgTrace?: RpgTraceInspector;
  /** The live multiplexed-socket counter (SSE-1). Absent ⇒ the /stream/sockets route is not registered. */
  sockets?: SocketInspector;
  /** The resolved deployment config getter. Absent ⇒ `/config/app` still serves the RAW settings rows, and the
   *  render-policy probes report the stored tri-states with a `null` resolved verdict rather than guessing a
   *  floor — an absent answer beats a wrong one on the surface whose whole job is removing that inference. */
  effectiveConfig?: () => EffectiveAppConfig;
  auth?: DebugAuthOptions | string;
}

/** Factory — the middleware closes over the gate config. Order: admin-cookie short-circuit, then the
 *  token check. The query-param token form is intentionally absent (it leaked into proxy access logs). */
export function createDebugAuthMiddleware(opts: DebugAuthOptions | string | undefined): MiddlewareHandler {
  const config: DebugAuthOptions = typeof opts === "string" || opts === undefined ? { expectedToken: opts } : opts;
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

/** Register the /api/_debug/* introspection routes on `app` behind the auth gate. */
export function registerDebugRoutes(app: Hono, options: DebugRoutesOptions = {}): void {
  const { db, assets, rpgTrace, sockets, effectiveConfig, auth = env.DEBUG_TOKEN } = options;
  app.use("/api/_debug/*", createDebugAuthMiddleware(auth));

  app.get("/api/_debug/info", (c) =>
    c.json({
      version: APP_VERSION,
      nodeEnv: env.NODE_ENV,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      providers: {
        openrouter: { configured: env.OPENROUTER_API_KEY !== undefined },
        defaultModels: { chat: DEFAULT_CHAT_MODEL_ID, openrouter: DEFAULT_OR_CHAT_MODEL_ID },
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

  // The one-socket-per-tab pin: `?userId=` narrows to one principal, omitted counts every live socket in
  // the process. A tab that opened a GAME chat must not move this number.
  if (sockets !== undefined) {
    app.get("/api/_debug/stream/sockets", (c) => {
      const userId = c.req.query("userId");
      return c.json({ liveSockets: sockets.liveSocketCount(userId === undefined ? undefined : castId<UserId>(userId)) });
    });
  }

  app.get("/api/_debug/errors", (c) => c.json({ errors: collectErrors(toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT)) }));

  // The WIRE-CAPTURE read (TASK-24): the final provider request body each chat backend sent, filterable by
  // `chatId` (the harness's correlation key) or `backend`. Host-only (this debug gate); read-only, no table.
  // Returns `[]` when capture is off (the ring is never written) — prod-safe by construction.
  app.get("/api/_debug/wire/captures", (c) => {
    const chatId = c.req.query("chatId");
    const backend = c.req.query("backend");
    const captures = recentWireCaptures({
      ...(chatId !== undefined ? { chatId: castId<ChatId>(chatId) } : {}),
      ...(backend !== undefined ? { backend } : {}),
      limit: toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
    });
    return c.json({ count: captures.length, captures });
  });

  // The RESPONSE half of the same picture: what each turn actually returned (finish/stop reason, token counts,
  // tool-call names + raw args, content/reasoning lengths). The request ring alone cannot tell a tool-only
  // completion apart from a provider that returned nothing — this is what closes that. Metadata only, never
  // reply text. Empty when capture is off.
  app.get("/api/_debug/wire/outcomes", (c) => {
    const chatId = c.req.query("chatId");
    const outcomes = recentTurnOutcomes({
      ...(chatId !== undefined ? { chatId: castId<ChatId>(chatId) } : {}),
      limit: toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
    });
    return c.json({ count: outcomes.length, outcomes });
  });

  app.get("/api/_debug/requests", (c) => {
    const userId = c.req.query("userId");
    const limit = toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT);
    if (userId === undefined) {
      return c.json({ requests: recentRequests(limit) });
    }
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
    return traceRecord === undefined ? c.json({ error: "no trace recorded for that requestId" }, NOT_FOUND) : c.json(traceRecord);
  });

  if (db !== undefined) {
    app.get("/api/_debug/db/stats", async (c) => c.json({ tables: await tableCounts(db), auditFailures: getAuditFailureSnapshot() }));
    app.get("/api/_debug/db/integrity", async (c) => c.json(await integrityProbe(db)));
    app.get("/api/_debug/db/chat/:id", async (c) => c.json(await inspectChatState(db, castId<ChatId>(c.req.param("id")))));
    // LIST probes: id-discovery so a harness stops re-deriving ids through the client query cache.
    app.get("/api/_debug/db/chats", async (c) => {
      const chats = await chatListSummaries(db);
      return c.json({ count: chats.length, chats });
    });
    app.get("/api/_debug/db/characters", async (c) => {
      const characters = await characterListSummaries(db);
      return c.json({ count: characters.length, characters });
    });

    // ── CONFIG probes ──────────────────────────────────────────────────────────────────────────────────
    // The stored settings planes, read from the ROW. These exist because the alternative was screenshotting
    // the settings UI, which proves what the UI displays, not what the row holds — and the two have diverged.
    // `deploymentFloor` is threaded into every render-policy answer so `trustHtml: null` ("inherit") resolves
    // to a real verdict instead of leaving the reader to guess what it inherits.
    const deploymentFloor = (): RenderPolicy | null => {
      if (effectiveConfig === undefined) {
        return null;
      }
      const cfg = effectiveConfig();
      return { trustHtml: cfg.trustHtml, forbidExternalMedia: cfg.forbidExternalMedia };
    };

    app.get("/api/_debug/config/app", async (c) =>
      c.json({
        // The RESOLVED config the server actually runs on (null when the getter was not injected)…
        effective: effectiveConfig === undefined ? null : effectiveConfig(),
        // …and the raw override rows it was resolved FROM. Both, because a mismatch between them is a bug
        // class of its own and one without the other cannot show it.
        rows: await appSettingRows(db),
      }),
    );

    app.get("/api/_debug/config/user", async (c) => {
      const userId = c.req.query("userId");
      const users = await userSettingsRows(db, userId === undefined ? undefined : castId<UserId>(userId));
      return c.json({ count: users.length, users });
    });

    app.get("/api/_debug/config/chat/:id", async (c) => {
      const chatId = castId<ChatId>(c.req.param("id"));
      const room = await chatConfigRow(db, chatId);
      if (room === null) {
        return c.json({ error: "no such chat" }, NOT_FOUND);
      }
      // Room + game together: the two halves are always read as a pair, and a game-less room is a real,
      // frequently-relevant answer (`rpg: null` ≠ "the probe failed").
      return c.json({ room, rpg: await rpgGameForChat(db, chatId) });
    });

    app.get("/api/_debug/config/characters", async (c) => {
      const rows = await characterPolicySweep(db, deploymentFloor());
      return c.json({ count: rows.length, characters: rows });
    });

    app.get("/api/_debug/config/character/:id", async (c) => {
      const detail = await characterDetailRow(db, castId<CharacterId>(c.req.param("id")), deploymentFloor());
      return detail === null ? c.json({ error: "no such character" }, NOT_FOUND) : c.json(detail);
    });

    // Presets carry the section ORDER/depth and the gen settings (`maxOutputTokens`, reasoning effort) — the
    // knobs a wire capture shows the EFFECT of without naming the source. `?ownerId=` narrows.
    app.get("/api/_debug/config/presets", async (c) => {
      const ownerId = c.req.query("ownerId");
      const rows = await presetRows(db, ownerId === undefined ? undefined : castId<UserId>(ownerId));
      return c.json({ count: rows.length, presets: rows });
    });

    app.get("/api/_debug/config/personas", async (c) => {
      const ownerId = c.req.query("ownerId");
      const rows = await personaRows(db, ownerId === undefined ? undefined : castId<UserId>(ownerId));
      return c.json({ count: rows.length, personas: rows });
    });
  }
  if (assets !== undefined) {
    app.get("/api/_debug/db/assets", async (c) => c.json(await assets.fsck()));
  }
  if (rpgTrace !== undefined) {
    // The rpg flight recorder (R-OBS): the per-turn trace stream, filterable by `chatId` (a chat's events) or
    // `turnId` (one turn's tool + staging events). Host-only introspection, no table (D75).
    app.get("/api/_debug/rpg/traces", (c) => {
      const chatId = c.req.query("chatId");
      const turnId = c.req.query("turnId");
      const events = rpgTrace.recent({
        ...(chatId !== undefined ? { chatId: castId<ChatId>(chatId) } : {}),
        ...(turnId !== undefined ? { turnId } : {}),
        limit: toLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
      });
      return c.json({ count: events.length, events });
    });
  }
}
