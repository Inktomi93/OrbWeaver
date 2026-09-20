// The /api/_debug surface: observability's read side. The two-tier auth gate (admin-session
// short-circuit → DEBUG_TOKEN fallback), the route registrar, and the structural-injection ports
// (`AssetInspector`, `AdminAuthChecker`) whose impls entry/ supplies. The DB probes need no port — they
// read @orb/db directly.
//
// THIS GATE IS THE ENTIRE BOUNDARY for every route below. The probes are deliberately principal-BLIND
// whole-db reads (`@owner-scope-ok`, D20) — they take ids from QUERY PARAMS, never from auth — so whatever
// this middleware admits reads the whole deployment. Two credentials pass and nothing else: an OWNER
// SESSION (`AdminAuthChecker`) or the `x-debug-token` operator secret. An un-credentialed caller must never
// pass in any AUTH_MODE, with or without a configured token; that invariant's enforcer is
// `tests/server/entry/debug-gate.suite.test.ts` (AUTHFIX-2 — it did not hold until 2026-08-07).
//
// A DELEGATED `admin` IS NOT ADMITTED (2026-09-20, D17): this is BOX-OPERATOR scope. The session arm's
// verdict (`entry/auth/seam.ts::debugGateAdmits`) asks `can(p,'owner',global)`, one rung narrower than every
// other privileged surface in the app — because these reads cross the membership plane the app's own owner
// cannot cross over tRPC, and `/wire/captures` in particular serves the literal assembled prompt of every
// user's turn (plus the model's reply bytes under `WIRE_CAPTURE_REPLY`). The port is still named
// `AdminAuthChecker`/`isAdmin` because it is a STRUCTURAL port foundation cannot type against a domain
// verdict; its contract below states the rule the impl must satisfy.

import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { DeploymentRenderPolicy } from "@orb/contracts/chat";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import type { BugReportRecord } from "@orb/kit/bug-report";
import { resolveEvidenceWindow } from "@orb/kit/evidence-window";
import type { AutomationRuleId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Context, Hono, MiddlewareHandler, Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { diagnosticsPostureInput, diagnosticsPostureWarnings, env, resolveDiagnosticsPosture } from "#foundation/env";
import { versionIdentity } from "#foundation/version";
import { getAuditFailureSnapshot } from "../audit.ts";
import { logRing, recentRequests, securityEvent } from "../logger.ts";
import { getTraceByRequestId, recentTraces } from "../tracing.ts";
import { captureNowMs, mintBugReportId, readBuildIdentity, secretLiterals, snapshotServerEvidence, writeBugReport } from "./bug-report.ts";
import {
  appSettingRows,
  automationFireRows,
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
import { ERROR_LEVEL, levelValue, parseLogRingLine, ringLineLevel } from "./log-ring-read.ts";
import type { WireCaptureFilter } from "./wire-capture.ts";
import { isWireCaptureEnabled, recentTurnOutcomes, recentWireCaptures } from "./wire-capture.ts";

const MAX_RING_READ = 2000;
const DEFAULT_LOG_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 100;
const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
const INTERNAL_ERROR = 500;
/** The ONE content-type the bug-report POST may carry (see {@link bugReportJsonOnly}), and the bound on how
 *  much of a rejected one reaches the log ring — the header is attacker-controlled and only header-size
 *  bounded. Both mirror `entry/app.ts`'s tRPC belt, which is the same rule one mount over. */
const BUG_REPORT_MEDIA_TYPE = "application/json";
const REJECTED_CONTENT_TYPE_LOG_CHARS = 64;
/** Cap on the owner's typed note. Long enough for a paragraph of prose, short enough that a runaway paste
 *  cannot become the report. */
const BUG_REPORT_NOTE_MAX = 8000;
/** A day — beyond it the ask is not a window, and every ring in the process is shallower than that anyway. */
const BUG_REPORT_WINDOW_MAX_MINUTES = 1440;
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const BUG_REPORT_MAX_BODY_MIB = 4;
/** The byte ceiling on the bug-report POST, enforced BEFORE `c.req.json()` (#1473). The `client` half is
 *  deliberately `z.unknown()` — the page owns its bundle shape — so no schema bounds its size, and without
 *  this the parse, the scrub and the on-disk artifact are all unbounded for anyone past the gate. 4 MiB is
 *  generous against the real bundle (capped rings: 128 flags, 64 bus events, 32 shifts, the console ring)
 *  and still finite. NOT an `@orb/contracts/uploads` cap: that catalog is the deployment's UPLOAD ceilings,
 *  served to the client; this is a debug-surface request bound, the sibling of `app.ts`'s tRPC body cap. */
export const BUG_REPORT_MAX_BODY_BYTES = BUG_REPORT_MAX_BODY_MIB * BYTES_PER_MIB;

/** The bug-report POST body. `client` is deliberately `unknown`: the page owns its own bundle shape and this
 *  tier must not re-spell it (a field allowlist here would be a guess that goes stale silently). It is opaque
 *  data that gets value-scrubbed with everything else before the write. */
const bugReportInput = z.object({
  note: z.string().trim().min(1).max(BUG_REPORT_NOTE_MAX),
  /** The owner's "~N minutes ago", or null for "everything the rings still hold". */
  windowMinutes: z.number().positive().max(BUG_REPORT_WINDOW_MAX_MINUTES).nullable().default(null),
  client: z.unknown().optional(),
});

/**
 * THE CSRF CONTENT-TYPE BELT on the one WRITE this surface carries (#2376 — the #300 class, spine
 * invariant #9). `hono`'s `c.req.json()` is `text()` + `JSON.parse` and reads NO content-type, so without
 * this belt a `text/plain` POST carrying a JSON body ran the handler.
 *
 * WHY THAT IS A CSRF AND NOT A CURIOSITY. The gate above admits two credentials and one of them is
 * AMBIENT: an OWNER SESSION — `via:"cookie"` (the browser auto-attaches it) and, wherever
 * `AUTH_FALLBACK=owner` is live (every dev stack, which is exactly where this button exists), the loopback
 * owner `fallback` arm, whose "credential" is the socket the owner's own browser already speaks from. The
 * other, `x-debug-token`, is a custom header a cross-site page cannot set without a preflight and is
 * CSRF-immune by construction. `text/plain` / `multipart/form-data` / `application/x-www-form-urlencoded`
 * are the CORS-SIMPLE content-types: a page the owner visits can POST one at 127.0.0.1 with no preflight
 * and no CORS grant, and this route then WRITES — a durable artifact holding the process's flight
 * recorders plus up to 4 MiB of the caller's own `note`/`client` bytes, repeatable.
 *
 * WHY A CONTENT-TYPE BELT RATHER THAN AN `x-orb-csrf` REQUIREMENT. It is the rule `entry/app.ts`'s
 * `trpcJsonOnly` already chose for the identical shape one mount over, it refuses on EVERY arm at once,
 * and it needs nothing of any caller: the client already sends `application/json`
 * (`features/app-shell/lib/bug-report-capture.ts`) and so does every headless `x-debug-token` caller. The
 * physics it rests on, stated so it can be re-checked: `application/json` is NOT a CORS-simple
 * content-type and this app mounts no CORS middleware, so a cross-site page cannot make the browser send
 * one. A media-type PREFIX test, lowercased — a legal `; charset=utf-8` must still pass.
 *
 * The READ probes are deliberately untouched: they carry no body, and a cross-site page cannot read their
 * response. ENFORCER: `tests/server/foundation/observability/debug/routes.int.test.ts`, the content-type
 * belt describe (all four simple types + the no-content-type arm, with JSON positive controls).
 */
const bugReportJsonOnly: MiddlewareHandler = (c, next) => {
  const contentType = c.req.header("content-type");
  if (contentType?.toLowerCase().startsWith(BUG_REPORT_MEDIA_TYPE) === true) {
    return next();
  }
  securityEvent(
    "debug_bug_report_content_type_rejected",
    { contentType: contentType?.slice(0, REJECTED_CONTENT_TYPE_LOG_CHARS) ?? null },
    "security: /api/_debug/bug-report POST rejected — content-type is not application/json (a CORS-simple body is cross-site forgeable)",
  );
  return Promise.resolve(c.body(null, UNSUPPORTED_MEDIA_TYPE));
};

/** The POSTed body, or `null` when it was not JSON at all — which `safeParse` then reports as invalid. */
async function readJsonBody(c: Context): Promise<unknown> {
  // @orb-waive caught-failure-ownership(catch): a malformed body is a 400 the caller sees, and
  // the null flows straight into the schema's own failure path. Ends if the null stops being validated.
  try {
    return await c.req.json();
  } catch {
    return null;
  }
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

/** @internal — the ring/list `?limit=` reader (exported for tests; every probe below funnels through it).
 *  FLOORED: the value reaches ring reads and array slices, which no caller wrote for a fraction — `1.5`
 *  used to pass through unmodified into `slice()` and `length >= limit` guards. A sub-1 ask floors to 0,
 *  which is not a limit anyone means, so it falls back with the rest of the junk. */
export function toDebugLimit(raw: string | undefined, fallback: number): number {
  const n = Math.floor(Number(raw ?? fallback));
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
    const record = parseLogRingLine(line);
    if (record === null) {
      continue;
    }
    if (ringLineLevel(record) < query.minLevel) {
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
    const record = parseLogRingLine(line);
    if (record !== null && ringLineLevel(record) >= ERROR_LEVEL) {
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

/** Session-auth gate — structural-injection so foundation accepts the entry auth verdict without importing
 *  it. Consulted before the token check. `isAdmin` must never throw (the middleware catches anyway: a
 *  misbehaving seam falls through to the token check, it never opens the gate). The METHOD keeps its
 *  historical name because renaming a structural port renames it at the wiring site too; the CONTRACT below
 *  is the truth, and it is owner-only.
 *
 *  THE IMPLEMENTOR'S CONTRACT, and the one this port cannot check for itself: `true` means the caller
 *  PRESENTED a credential AND that credential's principal is the box OWNER (D17 — a delegated `admin` is
 *  refused here; see the file header). Because this arm short-circuits BOTH the token comparison and the
 *  `expectedToken === undefined` → 404 branch, an impl that returns `true` for a merely-inferred principal
 *  opens the entire surface unconditionally — which is exactly what the production impl did until
 *  AUTHFIX-2 (`entry/auth/seam.ts::debugGateCredentialed`). An ORIGIN is not a credential.
 *
 *  IT TAKES THE REQUEST CONTEXT, NOT THE HEADERS, AND IT IS SYNCHRONOUS — both deliberate (#1193). The impl
 *  must answer from the principal the app's auth middleware ALREADY resolved onto the context (spine
 *  invariant #2), because that is the only resolution that saw the request's raw TCP peer; the previous
 *  `(headers) => Promise<boolean>` shape invited a second, peer-less resolution, and that is precisely what
 *  refused the box operator's own loopback-owner session at this door. A sync signature makes the re-resolve
 *  unwritable rather than merely discouraged. */
export interface AdminAuthChecker {
  isAdmin: (c: Context) => boolean;
}

/** The rpg flight-recorder read port (R-OBS) — structural-injection so foundation accepts `domain/rpg`'s ring
 *  recorder without importing it (the `AssetInspector` precedent). Returns `object[]` so no rpg type crosses the
 *  boundary; the records serialize straight to JSON. Host-only via the debug gate; read-only (D75). */
export interface RpgTraceInspector {
  recent: (filter: { chatId?: ChatId; turnId?: string; limit?: number }) => readonly object[];
}

/** The MEMORY-RECALL flight-recorder read port (#250) — the `RpgTraceInspector` shape, one domain over: the
 *  per-recall trace ring `domain/chat/memory/recall/recorder.ts` fills. Returns `object[]` so no chat/memory
 *  type crosses the boundary. This is the lens for "what memories did that turn fetch, and why" — the
 *  question that previously had no answer short of reading the prompt and guessing. */
export interface MemoryRecallInspector {
  recent: (filter: { chatId?: ChatId; limit?: number }) => readonly object[];
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
  /** The memory-recall flight-recorder read port (#250). Absent ⇒ the /memory/recalls route is not registered. */
  memoryRecall?: MemoryRecallInspector;
  /** The live multiplexed-socket counter (SSE-1). Absent ⇒ the /stream/sockets route is not registered. */
  sockets?: SocketInspector;
  /** The resolved deployment config getter. Absent ⇒ `/config/app` still serves the RAW settings rows, and the
   *  render-policy probes report the stored tri-states with a `null` resolved verdict rather than guessing a
   *  floor — an absent answer beats a wrong one on the surface whose whole job is removing that inference. */
  effectiveConfig?: () => EffectiveAppConfig;
  /** #412 — whether the provider wire-capture REQUEST sink is actually wired into the backends. Compose owns
   *  that decision (`env.WIRE_CAPTURE === "on"` OR its `wireCapture` force flag), so it must be injected: this
   *  tier cannot see the force flag. Absent ⇒ `isWireCaptureEnabled()` (the env half), which is the right
   *  answer for a hand-built app that never forced the sink on.
   *
   *  It is a GETTER rather than a boolean so a reader always sees the live decision, and it feeds ONLY the
   *  `/wire/captures` arm — `/wire/outcomes` publishes `isWireCaptureEnabled()` because the outcome recorder
   *  self-gates on exactly that (the gating asymmetry stated in `wire-capture.ts`). Two arms, two truths; one
   *  shared flag here would be a lie on whichever arm it did not describe. */
  wireCaptureEnabled?: () => boolean;
  auth?: DebugAuthOptions | string;
}

/** The refusal's ARM-NAMING half. A caller told only "an admin session or x-debug-token" cannot act: the
 *  owner's dev bug button reported exactly that for months while the session arm was the one refusing
 *  (#1193). These name WHICH arm said no — and nothing about the principal, which an unauthenticated
 *  response has no business describing. */
const ADMIN_ARM_REFUSED = "the admin-session arm refused this request (/api/_debug is owner-only, and this request carries no owner session)";
const TOKEN_UNSET = "and DEBUG_TOKEN is not configured on this server";
const TOKEN_ABSENT = "and no x-debug-token header was sent";
const TOKEN_MISMATCH = "and the x-debug-token sent did not match";

/** One sentence naming every arm that refused. The admin clause is omitted when no checker is wired at all
 *  (a hand-built app / a headless-only deployment) — claiming an arm refused when it never ran would be a
 *  lie in the one field the caller acts on. */
function refusalReason(adminArmConsulted: boolean, tokenClause: string): string {
  return adminArmConsulted ? `${ADMIN_ARM_REFUSED}, ${tokenClause}` : tokenClause.replace(/^and /u, "");
}

/** Factory — the middleware closes over the gate config. Order: admin-session short-circuit, then the
 *  token check. The query-param token form is intentionally absent (it leaked into proxy access logs). */
export function createDebugAuthMiddleware(opts: DebugAuthOptions | string | undefined): MiddlewareHandler {
  const config: DebugAuthOptions = typeof opts === "string" || opts === undefined ? { expectedToken: opts } : opts;
  return async (c: Context, next: Next) => {
    const adminArmConsulted = config.adminAuth !== undefined;
    if (config.adminAuth !== undefined) {
      // @orb-waive caught-failure-ownership(catch): documented below — a checker error falls
      // through to the token check, never opening the gate. Ends if the fallthrough is removed.
      try {
        if (config.adminAuth.isAdmin(c)) {
          return await next();
        }
      } catch {
        // Fall through to the token check — never throw upward from the gate.
      }
    }
    const provided = c.req.header("x-debug-token");
    if (config.expectedToken === undefined) {
      return c.json({ error: "debug API disabled — set DEBUG_TOKEN to enable", reason: refusalReason(adminArmConsulted, TOKEN_UNSET) }, NOT_FOUND);
    }
    if (!tokenMatches(provided, config.expectedToken)) {
      return c.json({ error: "unauthorized", reason: refusalReason(adminArmConsulted, provided === undefined ? TOKEN_ABSENT : TOKEN_MISMATCH) }, UNAUTHORIZED);
    }
    return await next();
  };
}

/** Register the /api/_debug/* introspection routes on `app` behind the auth gate. */
export function registerDebugRoutes(app: Hono, options: DebugRoutesOptions = {}): void {
  const { db, assets, rpgTrace, memoryRecall, sockets, effectiveConfig, wireCaptureEnabled = isWireCaptureEnabled, auth = env.DEBUG_TOKEN } = options;
  app.use("/api/_debug/*", createDebugAuthMiddleware(auth));

  app.get("/api/_debug/info", (c) => {
    // The DIAGNOSTICS POSTURE readout — the live twin of the boot report (`foundation/env/diagnostics.ts`).
    // It belongs on THIS probe because this is the surface the posture is ABOUT: an operator who can read
    // `/api/_debug` should be able to see, in one place, what reaching it is worth (retention), what bounds
    // who else can try (perimeter), and which standing item is still open (`warnings`). No secret value is
    // present — the resolver reduces DEBUG_TOKEN to a boolean before it ever leaves `foundation/env`.
    const diagnostics = resolveDiagnosticsPosture(diagnosticsPostureInput());
    return c.json({
      // The WHOLE identity block, not a bare version string: an operator reading this probe is nearly always
      // asking "is this box running what I think it is", and the commit is the half that answers it.
      version: versionIdentity(),
      nodeEnv: env.NODE_ENV,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      providers: {
        openrouter: { configured: env.OPENROUTER_API_KEY !== undefined },
      },
      diagnostics: { ...diagnostics, warnings: diagnosticsPostureWarnings(diagnostics) },
    });
  });

  // THE BUG-REPORT CAPTURE (#1095) — the one WRITE on this surface, and the only route here that is not a
  // read. The owner's dev top-rail button POSTs its in-page bundle; this snapshots the server's own in-memory
  // flight recorders IN THE SAME TICK (they die on the next `node --watch` respawn — `bug-report.ts`'s header
  // states why that timing is the whole point), stamps the build identity, scrubs by value, and writes one
  // gitignored artifact pair. The gate above is its entire boundary, exactly as for every read below.
  //
  // THE WINDOW IS RESOLVED TWICE, ON PURPOSE. The page filtered its own rings against ITS clock and ships that
  // resolution inside `client`; this resolves the same ask against the SERVER's clock for the server's rings.
  // One shared resolution would silently attribute one machine's clock skew to the other's evidence.
  //
  // THE BYTE CAP RIDES THE ROUTE, not `entry/app.ts` (#1473): `client` is `z.unknown()`, so the schema
  // bounds nothing about its size and `readJsonBody` parses BEFORE validation — an uncapped POST is
  // unbounded buffering, parsing and artifact growth for anyone past the gate. Registered here so every
  // app that mounts this registrar carries it, and AFTER the gate middleware above so an un-credentialed
  // caller is still refused without reading a byte. The CSRF content-type belt (#2376) sits AHEAD of that
  // cap for the same reason the tRPC mount orders its two belts that way: a forgeable POST is refused
  // before a byte of it is buffered.
  app.post(
    "/api/_debug/bug-report",
    bugReportJsonOnly,
    bodyLimit({ maxSize: BUG_REPORT_MAX_BODY_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }),
    async (c) => {
      const parsed = bugReportInput.safeParse(await readJsonBody(c));
      if (!parsed.success) {
        return c.json({ error: "invalid bug report", issues: z.prettifyError(parsed.error) }, BAD_REQUEST);
      }
      const capturedAt = new Date(captureNowMs());
      const repoRoot = process.cwd();
      const record: BugReportRecord = {
        id: mintBugReportId(),
        version: versionIdentity(),
        capturedAt: capturedAt.toISOString(),
        build: readBuildIdentity(repoRoot),
        window: resolveEvidenceWindow(capturedAt.getTime(), parsed.data.windowMinutes),
        note: parsed.data.note,
        client: parsed.data.client ?? null,
        server: snapshotServerEvidence(resolveEvidenceWindow(capturedAt.getTime(), parsed.data.windowMinutes), {
          ...(rpgTrace === undefined ? {} : { rpgTrace }),
          ...(memoryRecall === undefined ? {} : { memoryRecall }),
        }),
      };
      const written = await writeBugReport({ repoRoot, record, secrets: secretLiterals(env) });
      if (written === null) {
        // The scrub is fail-closed (`redactKnownSecrets` returns "" when a literal survived). A blank file nobody
        // notices is the worse outcome; refuse loudly and let the owner re-report.
        return c.json({ error: "report refused — the credential scrub could not guarantee removal, nothing was written" }, INTERNAL_ERROR);
      }
      return c.json({ id: record.id, capturedAt: record.capturedAt, build: record.build, written, sources: record.server.sources });
    },
  );

  app.get("/api/_debug/logs", (c) =>
    c.json({
      logs: collectLogs({
        limit: toDebugLimit(c.req.query("limit"), DEFAULT_LOG_LIMIT),
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

  app.get("/api/_debug/errors", (c) => c.json({ errors: collectErrors(toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT)) }));

  // The WIRE-CAPTURE read (TASK-24): the final provider request body each chat backend sent, filterable by
  // `chatId` (the harness's correlation key) or `backend`. Host-only (this debug gate); read-only, no table.
  // Returns `[]` when capture is off (the ring is never written) — prod-safe by construction.
  //
  // `enabled` (#412) is what makes that empty read LEGIBLE: without it a reader cannot tell "the recorder is
  // off" (apparatus absent — a run that is not a verdict) from "the recorder is on and nothing was sent"
  // (an honest zero), and `wire-tap captures` could only print a caveat and exit clean either way. It is the
  // REQUEST-SINK decision (compose: env OR the force flag), not a re-derivation — see `wireCaptureEnabled`.
  app.get("/api/_debug/wire/captures", (c) => {
    // THE FILTER IS BUILT AS AN ANNOTATED LITERAL, NOT A CONDITIONAL SPREAD, AND THAT IS THE ENFORCER.
    // `?backend=` is the QUERY vocabulary (the axis a reader and `wire-tap --backend` both say); the ring's
    // field is `providerId`. Until 2026-09-20 the route spread `{ backend }` into `recentWireCaptures` — and
    // a SPREAD is exempt from TypeScript's excess-property check, so a filter key the ring has never heard of
    // type-checked clean and every `?backend=` read silently returned the WHOLE ring. A filter that answers
    // "everything" to a narrowing ask is a lying instrument, which is worse than an absent one. Spelling the
    // object as `WireCaptureFilter` makes the next divergence a COMPILE error rather than a silent superset;
    // the behavioural half is pinned in `tests/server/foundation/observability/debug/routes.int.test.ts`.
    const chatId = c.req.query("chatId");
    const filter: WireCaptureFilter = {
      chatId: chatId === undefined ? undefined : castId<ChatId>(chatId),
      providerId: c.req.query("backend"),
      limit: toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
    };
    const captures = recentWireCaptures(filter);
    return c.json({ enabled: wireCaptureEnabled(), count: captures.length, captures });
  });

  // The RESPONSE half of the same picture: what each turn actually returned (finish/stop reason, token counts,
  // tool-call names + raw args, content/reasoning lengths). The request ring alone cannot tell a tool-only
  // completion apart from a provider that returned nothing — this is what closes that. Metadata only, never
  // reply text. Empty when capture is off.
  //
  // `enabled` (#412) is `isWireCaptureEnabled()` — the env flag ALONE — because that is the outcome arm's own
  // self-gate (`recordTurnOutcome` returns early on it; it has no compose seam). A forced-on int test therefore
  // records requests with `enabled: true` here and outcomes with `enabled: false`, which is the truth.
  app.get("/api/_debug/wire/outcomes", (c) => {
    const chatId = c.req.query("chatId");
    const outcomes = recentTurnOutcomes({
      ...(chatId !== undefined ? { chatId: castId<ChatId>(chatId) } : {}),
      limit: toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
    });
    return c.json({ enabled: isWireCaptureEnabled(), count: outcomes.length, outcomes });
  });

  app.get("/api/_debug/requests", (c) => {
    const userId = c.req.query("userId");
    const limit = toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT);
    if (userId === undefined) {
      return c.json({ requests: recentRequests(limit) });
    }
    const filtered = recentRequests(Number.MAX_SAFE_INTEGER).filter((r) => r.userId === userId);
    return c.json({ requests: filtered.slice(0, limit) });
  });

  app.get("/api/_debug/traces", (c) => {
    const traces = recentTraces(toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT)).map((t) => ({
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
    const deploymentFloor = (): DeploymentRenderPolicy | null => {
      if (effectiveConfig === undefined) {
        return null;
      }
      const cfg = effectiveConfig();
      return { trustHtml: cfg.trustHtml, forbidExternalMedia: cfg.forbidExternalMedia, allowInteractiveCards: cfg.allowInteractiveCards };
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

    // The AUTOMATION FIRE LOG: the durable `automation_fires` ledger, newest-first, principal-blind across the
    // deployment (the owner-scoped `automation.listFires` verb answers per rule for its author; a harness
    // driving a live stage needs the whole log — "why didn't my rule fire" with the per-arm `detail`). The
    // in-flight `reserved` hold is excluded exactly as every domain read excludes it. `?chatId=` / `?ruleId=`
    // narrow; the analysis arm's diagnostic LINES are already in `/api/_debug/logs` — this is the durable half.
    app.get("/api/_debug/automation/fires", async (c) => {
      const chatId = c.req.query("chatId");
      const ruleId = c.req.query("ruleId");
      const fires = await automationFireRows(db, {
        ...(chatId !== undefined ? { chatId: castId<ChatId>(chatId) } : {}),
        ...(ruleId !== undefined ? { ruleId: castId<AutomationRuleId>(ruleId) } : {}),
        limit: toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
      });
      return c.json({ count: fires.length, fires });
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
        limit: toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
      });
      return c.json({ count: events.length, events });
    });
  }
  if (memoryRecall !== undefined) {
    // The memory-recall flight recorder (#250): every `{{memory}}` recall's slice — the query, the pool, the
    // candidate set, the admitted blocks with their scores, and the reason the top rejects lost. `?chatId=`
    // narrows to one room. Host-only introspection, no table (D75).
    app.get("/api/_debug/memory/recalls", (c) => {
      const chatId = c.req.query("chatId");
      const recalls = memoryRecall.recent({
        ...(chatId !== undefined ? { chatId: castId<ChatId>(chatId) } : {}),
        limit: toDebugLimit(c.req.query("limit"), DEFAULT_LIST_LIMIT),
      });
      return c.json({ count: recalls.length, recalls });
    });
  }
}
