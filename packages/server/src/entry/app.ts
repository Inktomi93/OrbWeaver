// entry/app — the Hono application BUILDER (core/Tier-5-Entry.md §layout "app.ts"). Pure wiring: it takes the
// already-built deps (the auth seam, the `Services` bundle, the rate-limit gate, the http-route ports) and
// assembles the HTTP edge — the middleware order, the tRPC mount, the non-tRPC registrars, the debug gate.
// It owns NO business logic and NO boot protocol (that is `lifecycle.ts`); it constructs nothing stateful.
//
// MIDDLEWARE ORDER (spine identity-auth-permission §3): the optional ingress IP-allowlist belt runs FIRST
// (a 403 before any auth work), then the auth seam resolves the `Principal` EXACTLY ONCE per request and
// stashes it on the context. Every downstream consumer (the tRPC ctx, the blob/upload routes, the debug
// gate) re-reads that one resolved principal — nothing re-resolves identity. `csrfHeaderPresent` + the
// derived `clientIp` are PURE header reads (header-presence + peer/XFF), recomputed at the tRPC mount from
// the same request — not a second identity resolution (the "resolve once" invariant holds). `observability`
// (PD-118) is mounted immediately after auth, wrapping the tRPC mount + every registrar below in its
// request-root span.

import type { AuthMode, Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import type { ExportService } from "#domain/export";
import { env } from "#foundation/env";
import {
  observability,
  observabilityErrorHandler,
  registerDebugRoutes,
} from "#foundation/observability";
import { hasCsrfHeader } from "#infra/auth";
import { clientIp, ipAllowlistMiddleware, parseAllowlist, peerIp } from "#infra/network";
import type { PresenceRegistry, RateLimitGate, Services } from "../transport/trpc";
import { appRouter, createContext } from "../transport/trpc";
import type { AuthSeam } from "./auth";
import type {
  AuthSessionsPort,
  BlobAssetsPort,
  BlobCasPort,
  LocalAuthenticator,
  OidcRoutesDeps,
  UploadAssetsPort,
} from "./http";
import {
  registerAuthMeta,
  registerAuthRoutes,
  registerBlob,
  registerExport,
  registerHealthz,
  registerImportBundle,
  registerJoin,
  registerUpload,
  securityHeaders,
  serializeSessionCookie,
} from "./http";
import type { ImportAssetPort, ImportCharacterPort, ImportWorldInfoPort } from "./import";

const MS_PER_SECOND = 1000;
const TRPC_ENDPOINT = "/api/trpc";
const TRPC_MOUNT = "/api/trpc/*";
const SESSION_COOKIE_NAME = "__Host-orb_session";

/** The request-context surface the routes read. Only `principal` is stashed — `csrfHeaderPresent`/`clientIp`
 *  are pure per-request derivations the tRPC mount recomputes (so the type stays compatible with the
 *  `entry/http` registrars, which key on `principal` alone). */
interface AppEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/**
 * Everything `createApp` needs, all built upstream by `lifecycle.ts`. The route ports are the narrow slices
 * the `entry/http` registrars consume (the real `Services`/assets/cas handles satisfy them structurally).
 */
export interface AppDeps {
  readonly now: () => number;
  readonly db: Db;
  readonly seam: AuthSeam;
  readonly services: Services;
  readonly rateLimit: RateLimitGate;
  /** The transport presence registry (PD-70) — threaded onto each request ctx so the notifications SSE can
   *  ref-count device liveness. Built at the composition root over the injected clock. */
  readonly presence: PresenceRegistry;
  /** The single assets handle serves the blob owner-gate + the upload `store` + the import avatar-store. */
  readonly assets: BlobAssetsPort & UploadAssetsPort & ImportAssetPort;
  readonly cas: BlobCasPort;
  readonly character: ImportCharacterPort;
  /** The injected portability registry (export-import-portability.md §2/§3) — assembled at entry/compose from
   *  each domain's export/import verbs. The GET /api/export/library + POST /api/import/bundle routes iterate
   *  it; the entity-agnostic delivery core knows nothing else. A deployment with no registered entities
   *  exports an empty bundle and imports nothing (never an error). */
  readonly portability: PortabilityRegistry;
  /** The world-info embedded-lorebook import op — passed to the card-upload route so an imported card's
   *  embedded `character_book` actually writes (W1; previously the upload route wired no world-info port). */
  readonly importWorldInfo: ImportWorldInfoPort;
  /** The export front door (PD-109) — composed at `services.ts` but kept OFF the transport `Services`
   *  bundle (export has no tRPC procedure, only this HTTP registrar), so it's threaded through separately,
   *  the same way `character`/`cas` are pulled out of the composed bundle above. */
  readonly exportService: ExportService;
  readonly sessions: AuthSessionsPort;
  readonly isShuttingDown: () => boolean;
  readonly credentialsKeyOk: () => boolean;
  /** Per-new-user first-request default seed (PD-32): the default CARD pack AND the default "You" PERSONA.
   *  Fire-and-forget: the auth middleware calls it AFTER the Principal resolves so an SSO/admin-created user
   *  gets both on first touch. MUST NOT block the request — each seeder's in-process memo + persisted latch
   *  make it a Set lookup after the first run, and neither `ensureSeeded` ever throws. */
  readonly seedUserCharacters: (principal: Principal) => void;
  /** Present in local mode. */
  readonly authenticate?: LocalAuthenticator;
  /** Present in oidc mode. */
  readonly oidc?: OidcRoutesDeps;
}

// The multi-human capability derivation (FINAL-Auth-Modes §9 / B4 — the PD-106 belt's axis): can ≥2
// humans authenticate on this deployment? single-user → never; local → the runtime `LOCAL_MULTI_USER`
// AppSettings toggle (default OFF — a fresh local install is single-human until the owner flips it);
// forward-header/oidc → always (the proxy/IdP is the account source). A mapped `Record` over `AuthMode`
// so a new AUTH_MODES member fails `tsc` (spine invariant #4 style). Resolved PER-REQUEST (the local arm
// reads a runtime AppSetting — it cannot be a frozen boot constant); `getEffectiveConfig` is the sync
// settings cache, reloaded after every admin write, so a toggle flip takes effect on the next request.
const MULTI_HUMAN_CAPABLE: Record<AuthMode, (cfg: EffectiveAppConfig) => boolean> = {
  "single-user": () => false,
  local: (cfg) => cfg.localMultiUser,
  "forward-header": () => true,
  oidc: () => true,
};

/** Read our opaque session token from the Cookie header (the same minimal base64url parse the seam +
 *  auth-routes use — there is no shared exported reader; a value that can't decode can't be ours). */
function readSessionToken(headers: Headers): string | null {
  const raw = headers.get("cookie");
  if (raw === null) {
    return null;
  }
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // The ONE per-request multi-human capability closure (PD-106) — shared by every non-tRPC consumer
  // (`/join/:token`, `/api/auth/config`) so the belt cannot drift between surfaces; the tRPC mount below
  // runs the same map inline per request.
  const multiHumanCapable = (): boolean =>
    MULTI_HUMAN_CAPABLE[env.AUTH_MODE](deps.services.settings.getEffectiveConfig());

  // ── Uncaught-throw observability (PD-118): Hono's onError is the SINGLE origin-frame hook for a request
  // handler that THROWS (returns no Response). Hono's compose() catches such a throw at the throwing
  // handler's OWN dispatch frame — below the `observability` middleware — so the throw never bubbles up
  // through that middleware's `next()`; without this the request-root span would seal as "ok" and Hono's
  // default onError would log via raw console.error (bypassing pino + /api/_debug). `observabilityErrorHandler`
  // records the throw on the still-active root span (→ /api/_debug/traces status:error) + emits one pino
  // `request.thrown` line, then returns the SAME 500 text Hono's default returns (no error-contract change).
  // tRPC procedure/createContext throws never reach here (the fetch adapter maps them to a Response first),
  // so this fires ONLY for the genuinely-uncaught non-tRPC path — no double-record.
  app.onError(observabilityErrorHandler);

  // ── The app-document CSP + sibling security headers (D44 §12.5; entry/http/security-headers) ─────────
  // FIRST so every response — including the allowlist 403 below — carries the headers.
  app.use("*", securityHeaders({ dev: env.NODE_ENV !== "production" }));

  // ── Ingress IP-allowlist edge belt (infra/network/ingress — PD-91; off unless IP_ALLOWLIST is set) ────
  const allowlist = parseAllowlist(env.IP_ALLOWLIST);
  if (allowlist.length > 0) {
    app.use("*", ipAllowlistMiddleware(allowlist));
  }

  // ── Auth middleware: resolve the ONE Principal per request + refresh a slid cookie session ────────────
  app.use("*", async (c, next) => {
    const token = readSessionToken(c.req.raw.headers);
    // The raw TCP peer address feeds the forward-header trusted-proxy gate (B1 anti-spoof — the gate keys on
    // the socket peer, never a forgeable X-Forwarded-For). Omitted when conninfo is absent (fails closed).
    const peer = peerIp(c);
    const { principal } = await deps.seam.resolvePrincipal(c.req.raw.headers, {
      ...(peer !== undefined ? { peerIp: peer } : {}),
      onSessionSlide: (expiresAt: number): void => {
        // A throttled cookie slide → re-set the same token with a refreshed Max-Age (cookie modes only;
        // inert in single-user/forward-header where there is no cookie token).
        if (token !== null) {
          c.header(
            "Set-Cookie",
            serializeSessionCookie(token, (expiresAt - deps.now()) / MS_PER_SECOND),
          );
        }
      },
    });
    c.set("principal", principal);
    // Fire-and-forget, never awaited — see `seedUserCharacters` on AppDeps for why that's safe.
    if (principal !== null) {
      deps.seedUserCharacters(principal);
    }
    await next();
  });

  // ── Observability (foundation/observability/middleware.ts — PD-118): X-Request-Id + the request-root
  // tracing span + the request-ring record. Mounted AFTER auth (per the PD's ordering call) so
  // `getRequestUserId` — read at the END of this middleware, once `next()` resolves — sees the caller the
  // auth middleware (and, downstream, the tRPC context) already resolved for THIS request; mounting any
  // earlier would only widen the wrapped span to include auth's own resolvePrincipal latency, which is not
  // the request work being traced. The span still wraps everything that matters: the tRPC mount, the
  // context build, and every registrar below, because `next()` is the ENTIRE remaining chain from here.
  app.use("*", observability);

  // ── tRPC mount: read the already-resolved principal; csrf/clientIp are pure per-request derivations ────
  app.all(TRPC_MOUNT, (c) =>
    fetchRequestHandler({
      endpoint: TRPC_ENDPOINT,
      req: c.req.raw,
      router: appRouter,
      createContext: () =>
        createContext({
          auth: c.get("principal"),
          services: deps.services,
          rateLimit: deps.rateLimit,
          presence: deps.presence,
          // The PD-106 multi-human capability belt keys on this flag (derived HERE, per request — the
          // frozen env mode × the runtime `LOCAL_MULTI_USER` AppSetting; transport reads no env/settings.
          // `multiHumanProcedure` 404s its surfaces while it is FALSE).
          multiHumanCapable: MULTI_HUMAN_CAPABLE[env.AUTH_MODE](
            deps.services.settings.getEffectiveConfig(),
          ),
          csrfHeaderPresent: hasCsrfHeader(c.req.raw.headers),
          clientIp: clientIp(c),
        }),
    }),
  );

  // ── The non-tRPC registrars (compose domain front doors + infra + the auth seam) ──────────────────────
  // blob/upload key on `principal` (their env === AppEnv). healthz/auth/debug are env-agnostic registrars
  // typed against the plain Hono env; Hono's env generic is invariant, so they take the SAME app instance
  // through a type-only widening (the registrars mutate `app` in place — same object, the routes land on it).
  const plain = app as unknown as Hono;
  registerHealthz(plain, {
    isShuttingDown: deps.isShuttingDown,
    credentialsKeyOk: deps.credentialsKeyOk,
  });
  registerBlob(app, { assets: deps.assets, cas: deps.cas });
  registerUpload(app, {
    assets: deps.assets,
    character: deps.character,
    tag: deps.services.tag,
    worldInfo: deps.importWorldInfo,
  });
  registerExport(app, { export: deps.exportService, registry: deps.portability });
  registerImportBundle(app, {
    // Workload-backed (#113): the route stages the upload + starts a per-owner `import-bundle` run; the import
    // executes off the request. The route writes the staged zip under this controlled root (the
    // IMPORT_STAGING_DIR boot-env, mirroring how ASSETS_DIR feeds the CAS root); absent ⇒ the OS temp dir — the
    // SAME default the runner-env op resolves, so the worker reads exactly where the route wrote.
    workloads: deps.services.workloads,
    ...(env.IMPORT_STAGING_DIR !== undefined ? { stagingDir: env.IMPORT_STAGING_DIR } : {}),
  });
  // The auth mint routes (login, logout, oidc callback).
  // OIDC and local modes are strictly gated by the supplied deps (fail-closed).
  registerAuthRoutes(plain, {
    sessions: deps.sessions,
    now: deps.now,
    ...(deps.authenticate !== undefined ? { authenticate: deps.authenticate } : {}),
    ...(deps.oidc !== undefined ? { oidc: deps.oidc } : {}),
  });
  // The PUBLIC auth bootstrap surface (/api/auth/{config,me} — FINAL-Auth-Modes §7 P0). `/me` reads the
  // principal the auth middleware above resolved (same-seam, drift-free); typed on the AppEnv app so it
  // sees `c.get("principal")`. Mode is the frozen env; discreet-login is a runtime AppSetting read.
  registerAuthMeta(app, {
    mode: env.AUTH_MODE,
    defaultHandle: env.DEFAULT_USER_HANDLE,
    discreetLogin: () => deps.services.settings.getEffectiveConfig().discreetLogin,
    multiHumanCapable,
  });
  // The `/join/:token` invite landing (§7 P1) — gated on the SAME per-request capability derivation the
  // tRPC mount uses (PD-106 leak-free 404 while not multi-human capable).
  registerJoin(plain, { multiHumanCapable });

  // ── The /api/_debug introspection surface (admin-cookie OR DEBUG_TOKEN gate; no assets fsck — PD-26) ──
  registerDebugRoutes(plain, {
    db: deps.db,
    auth: { expectedToken: env.DEBUG_TOKEN, adminAuth: { isAdmin: deps.seam.isAdmin } },
  });

  return app;
}
