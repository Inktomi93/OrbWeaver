// The Hono application builder: assembles the HTTP edge (middleware order, tRPC mount, non-tRPC registrars,
// debug gate) from already-built deps. Owns no business logic and no boot protocol (see lifecycle.ts).
//
// Middleware order: ingress IP-allowlist runs first, then the auth seam resolves the Principal EXACTLY ONCE
// per request onto the context — nothing downstream re-resolves identity.

import type { AuthMode, Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";

import type { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ResponseMeta } from "@trpc/server/http";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ExportService } from "#domain/export";

import { env } from "#foundation/env";
import { observability, observabilityErrorHandler, registerDebugRoutes } from "#foundation/observability";
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
  registerImportTree,
  registerJoin,
  registerSpa,
  registerUpload,
  resolveSpaDistDir,
  securityHeaders,
  serializeSessionCookie,
} from "./http";
import type { ImportAssetPort, ImportCharacterPort, ImportWorldInfoPort } from "./import";

const MS_PER_SECOND = 1000;
const TRPC_ENDPOINT = "/api/trpc";
const TRPC_MOUNT = "/api/trpc/*";
const SESSION_COOKIE_NAME = "__Host-orb_session";
const PAYLOAD_TOO_LARGE = 413;
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
// tRPC bodies are JSON (a batched call's inputs + params). 1 MiB is generous for that; oversized binary
// rides the upload/import routes with their own larger caps. Bounds a malicious oversized mutation body.
const TRPC_BODY_MAX_BYTES = BYTES_PER_MIB;

/**
 * The tRPC `responseMeta` hook: on a TOO_MANY_REQUESTS response, surface the throttle hint from the
 * `DomainRateLimitError` cause chain (the limiter/gate's only rate-limit throw) as `Retry-After` (seconds,
 * ceil of `msBeforeNext`) and `X-RateLimit-Remaining`, so clients back off cleanly instead of hammering.
 * The classifier (`transport/trpc/error-mapping.ts`) preserves the `DomainRateLimitError` as the mapped
 * `TRPCError.cause`, so the numbers are one deref away.
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

/** The request-context surface the routes read. */
interface AppEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

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
  /** Fire-and-forget: called after the Principal resolves; must never block the request. */
  readonly seedUserCharacters: (principal: Principal) => void;
  /** Present in local mode. */
  readonly authenticate?: LocalAuthenticator;
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

/** Read our opaque session token from the Cookie header. */
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

  const multiHumanCapable = (): boolean => MULTI_HUMAN_CAPABLE[env.AUTH_MODE](deps.services.settings.getEffectiveConfig());

  // Hono's onError is the only hook for a handler that throws without returning a Response; without this
  // the request-root span would seal as "ok" and the error would bypass pino/`/api/_debug`.
  app.onError(observabilityErrorHandler);

  // Security headers first so every response — including the allowlist 403 below — carries them.
  app.use("*", securityHeaders({ dev: env.NODE_ENV !== "production" }));

  const allowlist = parseAllowlist(env.IP_ALLOWLIST);
  if (allowlist.length > 0) {
    app.use("*", ipAllowlistMiddleware(allowlist));
  }

  // Resolve the ONE Principal per request + refresh a slid cookie session.
  app.use("*", async (c, next) => {
    const token = readSessionToken(c.req.raw.headers);
    // Peer address feeds the forward-header trusted-proxy anti-spoof gate; omitted (fails closed) when absent.
    const peer = peerIp(c);
    const { principal } = await deps.seam.resolvePrincipal(c.req.raw.headers, {
      ...(peer !== undefined ? { peerIp: peer } : {}),
      onSessionSlide: (expiresAt: number): void => {
        if (token !== null) {
          c.header("Set-Cookie", serializeSessionCookie(token, (expiresAt - deps.now()) / MS_PER_SECOND));
        }
      },
    });
    c.set("principal", principal);
    if (principal !== null) {
      deps.seedUserCharacters(principal);
    }
    await next();
  });

  // Mounted after auth so the request-user read at the end of this middleware sees the already-resolved
  // principal, without widening the span to include auth's own resolvePrincipal latency.
  app.use("*", observability);

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
          services: deps.services,
          rateLimit: deps.rateLimit,
          presence: deps.presence,
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
  });
  registerBlob(app, { assets: deps.assets, cas: deps.cas });

  registerUpload(app, {
    assets: deps.assets,
    character: deps.character,
    tag: deps.services.tag,
    worldInfo: deps.importWorldInfo,
    databank: deps.services.databank,
  });
  registerExport(app, { export: deps.exportService, registry: deps.portability });
  registerImportBundle(app, {
    workloads: deps.services.workloads,
    ...(env.IMPORT_STAGING_DIR !== undefined ? { stagingDir: env.IMPORT_STAGING_DIR } : {}),
  });
  registerImportTree(app, {
    workloads: deps.services.workloads,
    registry: deps.portability,
    ...(env.IMPORT_STAGING_DIR !== undefined ? { stagingDir: env.IMPORT_STAGING_DIR } : {}),
  });
  registerAuthRoutes(plain, {
    sessions: deps.sessions,
    now: deps.now,
    db: deps.db,
    ...(deps.authenticate !== undefined ? { authenticate: deps.authenticate } : {}),
    ...(deps.oidc !== undefined ? { oidc: deps.oidc } : {}),
  });
  registerAuthMeta(app, {
    mode: env.AUTH_MODE,
    defaultHandle: env.DEFAULT_USER_HANDLE,
    discreetLogin: () => deps.services.settings.getEffectiveConfig().discreetLogin,
    multiHumanCapable,
  });
  registerJoin(plain, { multiHumanCapable });

  registerDebugRoutes(plain, {
    db: deps.db,
    auth: { expectedToken: env.DEBUG_TOKEN, adminAuth: { isAdmin: deps.seam.isAdmin } },
  });

  // The SPA static-serve registers LAST — every route above wins by order; only unmatched non-/api GETs
  // reach the bundle/fallback. No bundle: prod boot-fatal (inside resolve), dev skipped (vite serves it).
  const spaDistDir = resolveSpaDistDir({ distDir: env.CLIENT_DIST_DIR, prod: env.NODE_ENV === "production" });
  if (spaDistDir !== null) {
    registerSpa(plain, { distDir: spaDistDir });
  }

  return app;
}
