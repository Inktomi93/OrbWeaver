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

import { getConnInfo } from "@hono/node-server/conninfo";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Context } from "hono";
import { Hono } from "hono";
import { env } from "#foundation/env";
import { registerDebugRoutes } from "#foundation/observability";
import { hasCsrfHeader } from "#infra/auth";
import { isInRanges, isPrivateOrLoopback } from "#infra/network";
import type { RateLimitGate, Services } from "../transport/trpc";
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
  serializeSessionCookie,
} from "./http";
import type { ImportAssetPort, ImportCharacterPort } from "./import";

const MS_PER_SECOND = 1000;
const FORBIDDEN = 403;
const TRPC_ENDPOINT = "/api/trpc";
const TRPC_MOUNT = "/api/trpc/*";
const XFF_HEADER = "x-forwarded-for";
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

const TRUSTED_PROXIES = parseAllowlist(env.FORWARD_AUTH_TRUSTED_PROXIES);

/** Derive the caller IP for the per-IP rate-limit key: the leftmost `x-forwarded-for` hop if the connection
 *  peer is a trusted proxy (loopback/private OR explicitly trusted via FORWARD_AUTH_TRUSTED_PROXIES).
 *  Otherwise, returns the connection peer. */
function deriveClientIp(c: Context<AppEnv>): string | null {
  const peer = getConnInfo(c).remote.address;

  const forwarded = c.req.header(XFF_HEADER);
  if (
    forwarded !== undefined &&
    forwarded.length > 0 &&
    peer !== undefined &&
    (isPrivateOrLoopback(peer) || isInRanges(peer, TRUSTED_PROXIES))
  ) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }

  return peer ?? null;
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

/** Parse the comma-separated IP_ALLOWLIST env floor into trimmed CIDR/IP entries (empty ⇒ belt off). */
function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Build the Hono app: middleware (allowlist belt → auth seam) → tRPC mount → non-tRPC registrars → debug. */
export function createApp(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ── Ingress IP-allowlist edge belt (orthogonal to AUTH_MODE; off unless IP_ALLOWLIST is set) ───────────
  const allowlist = parseAllowlist(env.IP_ALLOWLIST);
  if (allowlist.length > 0) {
    app.use("*", async (c, next) => {
      const ip = deriveClientIp(c);
      // Loopback/private is always allowed (the operator's own box); otherwise the caller must be in-list.
      if (ip !== null && !isPrivateOrLoopback(ip) && !isInRanges(ip, allowlist)) {
        return c.body(null, FORBIDDEN);
      }
      return await next();
    });
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
    // First-authed-request default-card seed for a NEW user (SSO/admin-created). Fire-and-forget — never
    // awaited (the seeder's memo+latch make it a Set lookup after the first touch; it never throws).
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
          csrfHeaderPresent: hasCsrfHeader(c.req.raw.headers),
          clientIp: deriveClientIp(c),
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
