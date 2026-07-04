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
// the same request — not a second identity resolution (the "resolve once" invariant holds).

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { env } from "#foundation/env";
import { registerDebugRoutes } from "#foundation/observability";
import { hasCsrfHeader } from "#infra/auth";
import { clientIp, ipAllowlistMiddleware, parseAllowlist } from "#infra/network";
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
  registerAuthRoutes,
  registerBlob,
  registerHealthz,
  registerUpload,
  securityHeaders,
  serializeSessionCookie,
} from "./http";
import type { ImportAssetPort, ImportCharacterPort } from "./import";

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
  readonly sessions: AuthSessionsPort;
  readonly isShuttingDown: () => boolean;
  readonly credentialsKeyOk: () => boolean;
  /** Per-new-user first-request default-card seed (PD-32). Fire-and-forget: the auth middleware calls it
   *  AFTER the Principal resolves so an SSO/admin-created user gets the pack on first touch. MUST NOT block
   *  the request — the seeder's in-process memo + persisted latch make it a Set lookup after the first run,
   *  and `ensureSeeded` never throws. */
  readonly seedUserCharacters: (principal: Principal) => void;
  /** Present in local mode. */
  readonly authenticate?: LocalAuthenticator;
  /** Present in oidc mode. */
  readonly oidc?: OidcRoutesDeps;
}

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
    const { principal } = await deps.seam.resolvePrincipal(c.req.raw.headers, {
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
  });
  // The auth mint routes (login, logout, oidc callback).
  // OIDC and local modes are strictly gated by the supplied deps (fail-closed).
  registerAuthRoutes(plain, {
    sessions: deps.sessions,
    now: deps.now,
    ...(deps.authenticate !== undefined ? { authenticate: deps.authenticate } : {}),
    ...(deps.oidc !== undefined ? { oidc: deps.oidc } : {}),
  });

  // ── The /api/_debug introspection surface (admin-cookie OR DEBUG_TOKEN gate; no assets fsck — PD-26) ──
  registerDebugRoutes(plain, {
    db: deps.db,
    auth: { expectedToken: env.DEBUG_TOKEN, adminAuth: { isAdmin: deps.seam.isAdmin } },
  });

  return app;
}
