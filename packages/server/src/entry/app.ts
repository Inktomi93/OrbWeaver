// The Hono application builder: assembles the HTTP edge (middleware order, tRPC mount, non-tRPC registrars,
// debug gate) from already-built deps. Owns no business logic and no boot protocol (see lifecycle.ts).
//
// Middleware order: ingress IP-allowlist runs first, then the Host allowlist, then the auth seam resolves the
// Principal EXACTLY ONCE per request onto the context — nothing downstream re-resolves identity.

import type { AuthMode, Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

import type { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ResponseMeta } from "@trpc/server/http";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ExportService } from "#domain/export";

import { allowedHostsInput, env, resolveAllowedHosts } from "#foundation/env";
import type { MemoryRecallInspector, RpgTraceInspector } from "#foundation/observability";
import { observability, observabilityErrorHandler, registerDebugRoutes, securityEvent } from "#foundation/observability";
import { versionIdentity } from "#foundation/version";
import { createHostNotAllowedNotice, createPublicHttpMintNotice, hasCsrfHeader, requestTransport } from "#infra/auth";
import { clientIp, ipAllowlistMiddleware, parseAllowlist, peerIp } from "#infra/network";
import type { PresenceRegistry, RateLimitGate, Services, SocketRegistry } from "../transport/trpc/index.ts";
import { appRouter, createContext } from "../transport/trpc/index.ts";
import type { AuthSeam } from "./auth/index.ts";
import { readSessionCookie } from "./auth/index.ts";
import type {
  AuthSessionsPort,
  BlobAssetsPort,
  BlobCasPort,
  FirstRunRouteDeps,
  LocalAuthenticator,
  OidcRoutesDeps,
  PrincipalEnv,
  UploadAssetsPort,
} from "./http/index.ts";
import {
  hostAllowlist,
  normalizeThrownErrors,
  registerAuthMeta,
  registerAuthRoutes,
  registerBlob,
  registerCardFrame,
  registerExport,
  registerHealthz,
  registerImportBundle,
  registerImportChat,
  registerImportTree,
  registerJoin,
  registerPluginFrame,
  registerPluginUi,
  registerSpa,
  registerUpload,
  resolveSpaDistDir,
  securityHeaders,
  serializeSessionCookie,
} from "./http/index.ts";
import type { ImportAssetPort, ImportCharacterPort, ImportWorldInfoPort } from "./import/index.ts";

const MS_PER_SECOND = 1000;
const TRPC_ENDPOINT = "/api/trpc";
const TRPC_MOUNT = "/api/trpc/*";
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
// tRPC bodies are JSON (a batched call's inputs + params). 1 MiB is generous for that; oversized binary
// rides the upload/import routes with their own larger caps. Bounds a malicious oversized mutation body.
const TRPC_BODY_MAX_BYTES = BYTES_PER_MIB;

// The ONE content-type a tRPC mutation may carry, and the bound on how much of a rejected one reaches the
// log ring (the header is attacker-controlled and header-size-bounded, not length-bounded by us).
const TRPC_JSON_MEDIA_TYPE = "application/json";
const REJECTED_CONTENT_TYPE_LOG_CHARS = 64;

/**
 * Does this request select tRPC's JSON content-type handler? A media-type PREFIX test, mirroring
 * `jsonContentTypeHandler.isMatch` in `@trpc/server`'s `resolveResponse` verbatim — the belt's accept-set
 * must be exactly the set that reaches the JSON parser, or it would refuse a legal `; charset=utf-8` the
 * handler would have parsed. Lowercased first, which can only make the belt STRICTER than tRPC's
 * case-sensitive matcher: a mixed-case `Multipart/Form-Data` is refused here and matches no tRPC handler
 * either, while a mixed-case `Application/JSON` passes the belt and then meets tRPC's own 415.
 */
function selectsTrpcJsonHandler(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().startsWith(TRPC_JSON_MEDIA_TYPE) === true;
}

/**
 * THE CSRF CONTENT-TYPE BELT (#300 leg 5, spine invariant #9). A tRPC mutation is POST-only
 * (`TYPE_ACCEPTED_METHOD_MAP`; the mount grants no `allowMethodOverride`), and `@trpc/server` 11.18's
 * `getContentTypeHandler` accepts THREE content-types — `application/json`, `multipart/form-data` and
 * `application/octet-stream` — dispatching the latter two as `type:"mutation"`. `multipart/form-data` is
 * CORS-SIMPLE: an ordinary cross-site `<form>` POST reaches this mount with no preflight and no CORS grant
 * at all. The tRPC auth gate keys its CSRF check on `via === "cookie"` (`transport/trpc/trpc.ts`) and
 * deliberately exempts the loopback-owner `fallback` arm so the un-cookied dev tooling keeps working — so
 * wherever `AUTH_FALLBACK=owner` is live (every `single-user` box, every dev stack, any break-glass
 * session) a page in the box's own browser could drive an input-less destructive mutation AS THE OWNER.
 * Proven behaviorally before this belt existed: `tag.pruneUnusedTags` ran and returned 200.
 *
 * Refusing here rather than widening that gate to `via !== "header"` is deliberate: this closes multipart
 * AND octet-stream on EVERY via arm at once, and it keeps the un-cookied loopback tooling (curl harvests,
 * `multi-user-seed`) working — it already sends JSON without an `x-orb-csrf` header. What the tRPC gate
 * then rests on is one physics claim, stated so it can be re-checked: `application/json` is NOT a
 * CORS-simple content-type, so a cross-site page cannot make the browser send one without a preflight this
 * app never answers (it mounts no CORS middleware).
 *
 * GET is untouched — it carries no content-type, and tRPC's method map admits GET for queries and
 * subscriptions only. A bare 415 with no body mirrors the body-limit belt: no legitimate client reaches it,
 * and the refusal still carries `X-Request-Id` (observability is mounted above this — and since #480 it
 * stamps the id on `c.res.headers` AFTER `next()`, so the header rides EVERY response through this mount,
 * including the tRPC handler's own Response objects, not just the context-built refusals like this one).
 */
const trpcJsonOnly: MiddlewareHandler = (c, next) => {
  const contentType = c.req.header("content-type");
  if (c.req.method !== "POST" || selectsTrpcJsonHandler(contentType)) {
    return next();
  }
  securityEvent(
    "trpc_content_type_rejected",
    { contentType: contentType?.slice(0, REJECTED_CONTENT_TYPE_LOG_CHARS) ?? null, path: c.req.path },
    "security: tRPC POST rejected — content-type is not application/json",
  );
  return Promise.resolve(c.body(null, UNSUPPORTED_MEDIA_TYPE));
};

/**
 * The tRPC `responseMeta` hook: on a TOO_MANY_REQUESTS response, surface the throttle hint from the
 * `DomainRateLimitError` cause chain (the limiter/gate's only rate-limit throw) as `Retry-After` (seconds,
 * ceil of `msBeforeNext`) and `X-RateLimit-Remaining`, so clients back off cleanly instead of hammering.
 * The classifier (`transport/trpc/error-mapping.ts`) preserves the `DomainRateLimitError` as the mapped
 * `TRPCError.cause`, so the numbers are one deref away.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function rateLimitResponseMeta(errors: readonly TRPCError[]): ResponseMeta {
  for (const err of errors) {
    if (err.code !== "TOO_MANY_REQUESTS") {
      continue;
    }
    const cause = err.cause;
    if (!(cause instanceof DomainRateLimitError)) {
      continue;
    }
    const headers: Record<string, string> = {};
    if (cause.msBeforeNext !== undefined) {
      headers["Retry-After"] = String(Math.max(1, Math.ceil(cause.msBeforeNext / MS_PER_SECOND)));
    }
    if (cause.remainingPoints !== undefined) {
      headers["X-RateLimit-Remaining"] = String(cause.remainingPoints);
    }
    if (Object.keys(headers).length > 0) {
      return { headers };
    }
  }
  return {};
}

/** The request-context surface the routes read — the SAME shape every principal-reading registrar types its
 *  `app` against (`PrincipalEnv`, whose docblock owns the vars), because Hono's env generic is invariant and
 *  a second spelling would make this app instance unassignable to half its own registrars. */
type AppEnv = PrincipalEnv;

/**
 * Everything `createApp` needs, all built upstream by `lifecycle.ts`.
 */
export interface AppDeps {
  readonly now: () => number;
  readonly db: Db;
  readonly seam: AuthSeam;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  readonly presence: PresenceRegistry;
  /** The multiplexed-socket cells (SSE-1) — read by the `stream` router and the /api/_debug counter. */
  readonly sockets: SocketRegistry;
  /** R-OBS — the rpg flight recorder's read half, present ONLY when tracing is enabled (`RPG_TRACE=on` / the
   *  `rpgTrace` compose dep). Absent ⇒ `/api/_debug/rpg/traces` is not registered at all, which is the route's
   *  own contract: tracing off means the door does not exist rather than answering an empty ring. */
  readonly rpgTrace?: RpgTraceInspector;
  /** #250 — the memory-recall flight recorder's read half. Present in production compose (the recorder is
   *  built unconditionally); absent ⇒ `/api/_debug/memory/recalls` is not registered. */
  readonly memoryRecall?: MemoryRecallInspector;
  /** #412 — compose's wire-capture REQUEST-SINK decision (`env.WIRE_CAPTURE === "on"` OR its force flag),
   *  published on `/api/_debug/wire/captures` as `enabled` so `wire-tap captures` can tell "recorder off"
   *  (apparatus absent → exit 2) from "recorder on, no traffic" (an honest zero). Absent ⇒ the route falls
   *  back to the env half, which is the truth for a hand-built app that never forced the sink on. */
  readonly wireCapture?: boolean;

  /** The single assets handle serves the blob owner-gate + the upload `store` + the import avatar-store + the
   *  BYO pose byte-ingest. */
  readonly assets: BlobAssetsPort & UploadAssetsPort & ImportAssetPort;
  readonly cas: BlobCasPort;
  readonly character: ImportCharacterPort;
  readonly portability: PortabilityRegistry;
  readonly importWorldInfo: ImportWorldInfoPort;
  readonly exportService: ExportService;
  readonly sessions: AuthSessionsPort;
  readonly isShuttingDown: () => boolean;
  readonly credentialsKeyOk: () => boolean;
  /** Whether the process runs in a container (`runsInContainer`); picks the fix the Host refusal names. */
  readonly inContainer: boolean;
  /** Fire-and-forget: called after the Principal resolves; must never block the request. */
  readonly seedUserCharacters: (principal: Principal) => void;
  /** Present in local mode. */
  readonly authenticate?: LocalAuthenticator;
  /** B4 — present in local mode; registers the first-run owner-password setup route + drives the config flag. */
  readonly firstRun?: FirstRunRouteDeps;
  /** B4 — present in local mode; the peer-scoped "owner needs a first-run password" read for /api/auth/config
   *  (gated on a loopback TCP peer and no relay tell, never the client `Host`). */
  readonly localFirstRun?: (peerIp: string | undefined, headers: Headers) => Promise<boolean>;
  /** A8 — the human-facing IdP name for the login surface's "Continue with …" button (served on /api/auth/config). */
  readonly oidcProviderName: string;
  /** Present in oidc mode. */
  readonly oidc?: OidcRoutesDeps;
}

// Can ≥2 humans authenticate on this deployment? Resolved per-request since the local arm reads a runtime
// AppSetting (cannot be a frozen boot constant). Mapped Record over AuthMode so a new mode fails tsc.
const MULTI_HUMAN_CAPABLE: Record<AuthMode, (cfg: EffectiveAppConfig) => boolean> = {
  "single-user": () => false,
  local: (cfg) => cfg.localMultiUser,
  "forward-header": () => true,
  oidc: () => true,
};

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const multiHumanCapable = (): boolean => MULTI_HUMAN_CAPABLE[env.AUTH_MODE](deps.services.settings.getEffectiveConfig());

  // Hono's onError is the only hook for a handler that throws without returning a Response; without this
  // the request-root span would seal as "ok" and the error would bypass pino/`/api/_debug`.
  app.onError(observabilityErrorHandler);

  // Security headers first so every response — including the allowlist 403 below — carries them. The CSP's
  // external-media allowance is read PER REQUEST off the live resolved config, so flipping the admin
  // "Block external media" setting changes the very next response's header (see security-headers.ts).
  app.use(
    "*",
    securityHeaders({
      dev: env.NODE_ENV !== "production",
      allowExternalMedia: () => !deps.services.settings.getEffectiveConfig().forbidExternalMedia,
    }),
  );

  // ONE RULE, MOUNTED ONCE PER POST-`next()` WRITER (#1761). hono's `compose()` hands `app.onError` only an
  // `err instanceof Error`, and it runs it at the frame that CAUGHT the throw — so every middleware OUTSIDE
  // that frame sees `next()` resolve and gets its post-`next()` write, and everything INSIDE has unwound.
  // A non-Error therefore has to be converted BELOW each middleware whose post-`next()` work must still
  // happen on a failure, and this app has exactly two such writers: `securityHeaders` (the CSP + sibling
  // headers) and `observability` (the `X-Request-Id` stamp + the request-ring record). Converting only above
  // the outer one would ship a policied 500 that no ring entry and no correlation handle describes.
  //
  // The middleware is transparent to an `Error` (same instance, no re-wrap), so the inner mount simply makes
  // the outer one a no-op for anything below it. The outer one still covers what sits BETWEEN them: the IP
  // allowlist and the principal-resolution middleware — the auth-infrastructure fault class of #1479.
  app.use("*", normalizeThrownErrors());

  const allowlist = parseAllowlist(env.IP_ALLOWLIST);
  if (allowlist.length > 0) {
    app.use("*", ipAllowlistMiddleware(allowlist));
  }

  // The DNS-rebinding guard, in every mode and with no off switch: it must run before the principal resolves,
  // because a rebound page arrives on the loopback socket the owner fallback admits (`infra/auth/host-allowlist.ts`).
  app.use(
    "*",
    hostAllowlist({ allowedHosts: resolveAllowedHosts(allowedHostsInput()), inContainer: deps.inContainer, notice: createHostNotAllowedNotice(deps.now) }),
  );

  // Resolve the ONE Principal per request + refresh a slid cookie session.
  app.use("*", async (c, next) => {
    // The transport is resolved ONCE and handed to the seam, so the name the seam reads and the name the
    // slide re-issues under are the same by construction.
    const transport = requestTransport(c);
    // The SAME reader the seam authenticates with (entry/auth/seam.ts): the slide may only re-issue the
    // exact token `sessions.validate` just accepted — a second copy here could write back a different value
    // and silently log the caller out on the next request.
    const token = readSessionCookie(c.req.raw.headers, transport);
    // Peer address feeds the forward-header trusted-proxy anti-spoof gate; omitted (fails closed) when absent.
    const peer = peerIp(c);
    const { principal, sessionId } = await deps.seam.resolvePrincipal(c.req.raw.headers, {
      ...(peer !== undefined ? { peerIp: peer } : {}),
      transport,
      onSessionSlide: (expiresAt: number): void => {
        if (token !== null) {
          c.header("Set-Cookie", serializeSessionCookie(token, transport, (expiresAt - deps.now()) / MS_PER_SECOND));
        }
      },
    });
    c.set("principal", principal);
    c.set("sessionId", sessionId);
    if (principal !== null) {
      deps.seedUserCharacters(principal);
    }
    await next();
  });

  // Mounted after auth so the request-user read at the end of this middleware sees the already-resolved
  // principal, without widening the span to include auth's own resolvePrincipal latency.
  app.use("*", observability);

  // The INNER half of the pair above: a non-Error thrown by a route or the tRPC mount is converted below
  // `observability`, so its post-`next()` stamp + ring record still run and the 500 is indistinguishable
  // from the `Error` one. (`observabilityErrorHandler`'s observed branch DELEGATES both to that post-`next()`
  // write — it does them itself only on the un-observed, above-the-scope branch.)
  app.use("*", normalizeThrownErrors());

  // The CSRF content-type belt — the whole WHY lives on `trpcJsonOnly` above. FIRST of the two mount belts,
  // so a refused non-JSON POST is never buffered at all.
  app.use(TRPC_MOUNT, trpcJsonOnly);

  // Cap tRPC JSON bodies (1 MiB) before the handler buffers them. Returns a bare 413 rather than throwing
  // an HTTPException (which the app's observability onError would flatten to a 500 — an ugly shape for a
  // tRPC client). Mirrors the upload/import routes' body-limit belt.
  app.use(TRPC_MOUNT, bodyLimit({ maxSize: TRPC_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }));

  app.all(TRPC_MOUNT, (c) =>
    fetchRequestHandler({
      endpoint: TRPC_ENDPOINT,
      req: c.req.raw,
      router: appRouter,
      createContext: () =>
        createContext({
          auth: c.get("principal"),
          sessionId: c.get("sessionId"),
          services: deps.services,
          rateLimit: deps.rateLimit,
          presence: deps.presence,
          sockets: deps.sockets,
          multiHumanCapable: MULTI_HUMAN_CAPABLE[env.AUTH_MODE](deps.services.settings.getEffectiveConfig()),
          csrfHeaderPresent: hasCsrfHeader(c.req.raw.headers),
          clientIp: clientIp(c),
        }),
      responseMeta: ({ errors }) => rateLimitResponseMeta(errors),
    }),
  );

  // healthz/auth/debug registrars are typed against the plain Hono env; Hono's env generic is invariant, so
  // they take the same app instance via a type-only widening (mutates `app` in place).
  const plain = app as unknown as Hono;
  registerHealthz(plain, {
    isShuttingDown: deps.isShuttingDown,
    credentialsKeyOk: deps.credentialsKeyOk,
    isHarnessStack: () => env.E2E_HARNESS === "on",
    version: versionIdentity,
  });
  registerBlob(app, { assets: deps.assets, cas: deps.cas });

  // The Tier-C guest-source doorway. It sits beside `blob` because it is the same
  // KIND of thing — an owner-gated byte read whose response TYPE is the security property — and unlike the
  // card-frame doorway below it does NOT carry its own CSP: it serves no document, only inert bytes, so the app
  // header set (including the `nosniff` this route also restates) is exactly right for it.
  registerPluginUi(app, { getUiBundle: (params) => deps.services.plugin.getUiBundle(params) });

  // The card-frame doorway. Its participant read IS the trust authority (a client selects a character, the
  // server decides that character's policy), and `allowExternalMedia` is the SAME live deployment ceiling
  // the app document CSP above is built from — one ceiling, now three consumers. Note `securityHeaders`
  // deliberately SKIPS the served document path so the frame's own, tighter policy survives (see
  // security-headers.ts).
  registerCardFrame(app, {
    participants: { listParticipants: (params) => deps.services.chat.listParticipants(params) },
    allowExternalMedia: () => !deps.services.settings.getEffectiveConfig().forbidExternalMedia,
    // The deployment half of the html-trust ladder's TOP rung (#111 leg 3). Same live read the participant
    // resolver uses, applied a second time at the boundary that actually mints the policy.
    allowInteractiveCards: () => deps.services.settings.getEffectiveConfig().allowInteractiveCards,
    now: deps.now,
  });

  // The PLUGIN-frame doorway (#679 U7). Same substrate, one authority: the owner-scoped `getFrameBody` read,
  // which also re-checks the row's live `ui.frame` grant per mint. It takes NO deployment ceiling because its
  // policy has no variable axis — a plugin frame is always the media floor plus the `data:` door (the reasoning
  // is in `plugin-frame.ts`). `securityHeaders` skips the served-document path here for the same mechanical
  // reason it skips the card frame's: `secure-headers` would otherwise overwrite the frame's own policy.
  registerPluginFrame(app, {
    surfaces: { getFrameBody: (params) => deps.services.plugin.getFrameBody(params) },
    now: deps.now,
  });

  registerUpload(app, {
    assets: deps.assets,
    character: deps.character,
    tag: deps.services.tag,
    worldInfo: deps.importWorldInfo,
    databank: deps.services.databank,
    maxImageBytes: () => deps.services.settings.getEffectiveConfig().maxImageBytes,
    maxDatabankBytes: () => deps.services.settings.getEffectiveConfig().maxDatabankBytes,
  });
  registerExport(app, { export: deps.exportService, registry: deps.portability });
  registerImportBundle(app, {
    workloads: deps.services.workloads,
    ...(env.IMPORT_STAGING_DIR !== undefined ? { stagingDir: env.IMPORT_STAGING_DIR } : {}),
  });
  registerImportChat(app, { registry: deps.portability });
  registerImportTree(app, {
    workloads: deps.services.workloads,
    registry: deps.portability,
    ...(env.IMPORT_STAGING_DIR !== undefined ? { stagingDir: env.IMPORT_STAGING_DIR } : {}),
  });
  registerAuthRoutes(plain, {
    sessions: deps.sessions,
    // W7a — ending a session ends the streams it opened. The registry is transport's; the EDGE composes here,
    // because `domain/sessions` may not import transport (one-directional flow) and entry holds both halves.
    sockets: { evictSession: (sessionId) => deps.sockets.evictSession(sessionId), evictUser: (userId) => deps.sockets.evictUser(userId) },
    now: deps.now,
    db: deps.db,
    publicHttpMintNotice: createPublicHttpMintNotice(deps.now),
    resolveLoginLimit: () => deps.services.settings.getEffectiveConfig().rateLimits.login,
    ...(deps.authenticate !== undefined ? { authenticate: deps.authenticate } : {}),
    ...(deps.firstRun !== undefined ? { firstRun: deps.firstRun } : {}),
    ...(deps.oidc !== undefined ? { oidc: deps.oidc } : {}),
  });
  registerAuthMeta(app, {
    mode: env.AUTH_MODE,
    defaultHandle: env.DEFAULT_USER_HANDLE,
    oidcProviderName: deps.oidcProviderName,
    ...(deps.localFirstRun !== undefined ? { localFirstRun: deps.localFirstRun } : {}),
    discreetLogin: () => deps.services.settings.getEffectiveConfig().discreetLogin,
    multiHumanCapable,
    maxImageBytes: () => deps.services.settings.getEffectiveConfig().maxImageBytes,
    maxDatabankBytes: () => deps.services.settings.getEffectiveConfig().maxDatabankBytes,
    // The SAME live read the CSP is built from (see securityHeaders above) — one deployment ceiling, two consumers.
    forbidExternalMedia: () => deps.services.settings.getEffectiveConfig().forbidExternalMedia,
    // The other floor axis, from the SAME effective config the compose-time roster resolver reads
    // (`entry/compose/chat.ts` resolveSeatDeco) — so a client-side preview and the server's own render
    // policy are derived from one value, never two guesses.
    trustHtml: () => deps.services.settings.getEffectiveConfig().trustHtml,
    // The ladder's top-rung CEILING — served so the per-character "Interactive" control can say it is inert
    // deployment-wide instead of offering a capability the mint will refuse.
    allowInteractiveCards: () => deps.services.settings.getEffectiveConfig().allowInteractiveCards,
  });
  registerJoin(plain, { multiHumanCapable });

  registerDebugRoutes(plain, {
    db: deps.db,
    // The multiplexed-socket counter (SSE-1 §12) — the starvation regression pin. Injected as data because
    // foundation sits BELOW transport in the tier list and may not import it.
    sockets: { liveSocketCount: (userId) => deps.sockets.liveSocketCount(userId === undefined ? undefined : castId<UserId>(userId)) },
    // The SAME live read every other consumer above uses — so the /config probes report the deployment tier
    // the server is actually running on, and a character's `trustHtml: null` ("inherit") resolves to a real
    // verdict instead of leaving the reader to infer what it inherits.
    effectiveConfig: () => deps.services.settings.getEffectiveConfig(),
    // R-OBS: registered only when the recorder exists (tracing on) — spread, so an untraced boot passes the
    // key at all rather than an `undefined` the route's `!== undefined` check would still have to read.
    ...(deps.rpgTrace === undefined ? {} : { rpgTrace: deps.rpgTrace }),
    // #250: the memory-recall ring. Same spread shape as rpgTrace, but the recorder is unconditional in
    // production compose — the `undefined` arm only fires for a hand-built app (a route/gate test).
    ...(deps.memoryRecall === undefined ? {} : { memoryRecall: deps.memoryRecall }),
    // #412: the recorder-state publisher. Spread like rpgTrace so an absent dep leaves the route on its env
    // fallback rather than pinning it to a `false` this app never actually decided.
    ...(deps.wireCapture === undefined ? {} : { wireCaptureEnabled: (): boolean => deps.wireCapture === true }),
    // The admin arm judges the ONE principal the auth middleware above already resolved for this request
    // (spine invariant #2). It must never re-resolve: the peer-less second resolution this replaced could not
    // mint the loopback owner arm, so a single-user/dev box's only operator was refused at its own door
    // (#1193). `?? null` is the fail-closed read for a context this middleware never ran on.
    auth: {
      expectedToken: env.DEBUG_TOKEN,
      adminAuth: { isAdmin: (c: Context): boolean => deps.seam.debugGateAdmits((c as Context<AppEnv>).get("principal") ?? null, c.req.raw.headers) },
    },
  });

  // The SPA static-serve registers LAST — every route above wins by order; only unmatched non-/api GETs
  // reach the bundle/fallback. No bundle: prod boot-fatal (inside resolve), dev skipped (vite serves it).
  const spaDistDir = resolveSpaDistDir({ distDir: env.CLIENT_DIST_DIR, prod: env.NODE_ENV === "production" });
  if (spaDistDir !== null) {
    registerSpa(plain, { distDir: spaDistDir });
  }

  return app;
}
