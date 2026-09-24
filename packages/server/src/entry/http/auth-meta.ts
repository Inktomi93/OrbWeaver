// The public auth bootstrap surface: two anonymous GETs the client boots off before any tRPC call can
// succeed (sessions.me 401s logged-out, so the client can't discover its mode/auth state through tRPC).
// These stay raw Hono, pre-tRPC, and must never move behind auth. `/me` reads the principal app.ts's auth
// middleware already resolved — deliberately not a second resolution call (drift-free by construction).

import type { AuthMode } from "@orb/contracts/identity";
import { isCookieAuthMode } from "@orb/contracts/identity";
import { resolveUploadCaps } from "@orb/contracts/uploads";
import type { Hono } from "hono";
import { peerIp } from "#infra/network";
import type { PrincipalEnv } from "./blob.ts";

export interface AuthMetaDeps {
  readonly mode: AuthMode;
  readonly defaultHandle: string;
  readonly discreetLogin: () => boolean;
  /** A8 — the human-facing IdP name for the login surface's "Continue with …" button (`OIDC_PROVIDER_NAME`,
   *  default "your identity provider"). Served in every mode (inert off oidc) so the login surface reads one source. */
  readonly oidcProviderName: string;
  /** B4 — is this a fresh local box awaiting its in-app owner-password setup, FOR THIS REQUEST?
   *  Present only in local mode; resolves true iff the owner row has no password AND the request's raw TCP
   *  peer is loopback with no relay tell (the same gate the first-run route enforces), so the setup screen
   *  appears only where the setup endpoint works. Absent (non-local modes) ⇒ the flag is served false. */
  readonly localFirstRun?: (peerIp: string | undefined, headers: Headers) => Promise<boolean>;
  /** Can ≥2 humans authenticate here? The same per-request derivation the tRPC context + /join/:token use. */
  readonly multiHumanCapable: () => boolean;
  /** The admin-tunable effective `maxImageBytes` — resolves the served image cap (min of route cap and this)
   *  so the client's dropzone hints + pre-checks derive the LIVE value instead of an invented per-widget number. */
  readonly maxImageBytes: () => number;
  /** The admin-tunable effective `maxDatabankBytes` — resolves the served databank-document cap (min of route
   *  cap and this; an override may only TIGHTEN) so the client's document-upload hint matches the route. */
  readonly maxDatabankBytes: () => number;
  /** The deployment external-media CEILING (`effectiveConfig.forbidExternalMedia`) — the same value the
   *  document CSP is built from. Served so a lower-tier opt-in surface (the per-character "External media"
   *  control) can tell the truth instead of offering an "Allow" that the tighten-only resolver + the CSP
   *  both ignore. Read per request, like every other flag here. */
  readonly forbidExternalMedia: () => boolean;
  /** The deployment HTML-trust DEFAULT (`effectiveConfig.trustHtml`) — the other half of the render-policy
   *  floor `resolveRenderPolicy` (`@orb/contracts/chat`) combines. Unlike `forbidExternalMedia` this one is a
   *  default, not a ceiling: a card's `trustHtml` override wins either way (D44 §12.0, owner 2026-08-01).
   *  Served because a client surface that PREVIEWS card content has to resolve the same policy the server
   *  will — a preview that reads the raw override column renders an INHERIT card untrusted on a deployment
   *  that trusts, which is a preview lying about the thing it exists to show. */
  readonly trustHtml: () => boolean;
  /** The deployment INTERACTIVE-CARD CEILING (`effectiveConfig.allowInteractiveCards`, floor FALSE) — the
   *  operator's half of the html-trust ladder's top rung (#111 leg 3). Served for the SAME reason
   *  `forbidExternalMedia` is: the per-character "Interactive" rung is inert deployment-wide while this is
   *  off, and a control that offers a capability nothing honours is the dead-opt-in defect. Never a
   *  capability by itself — the frame policy is built server-side from the server's own read. */
  readonly allowInteractiveCards: () => boolean;
}

/** Register the public bootstrap routes `GET /api/auth/config` + `GET /api/auth/me` on `app`. */
export function registerAuthMeta(app: Hono<PrincipalEnv>, deps: AuthMetaDeps): void {
  app.get("/api/auth/config", async (c) => {
    const discreet = deps.discreetLogin();
    // B4 — the peer-scoped first-run flag (local mode only; false everywhere else). Resolved per request
    // because it depends on both the owner-password state AND the request's peer and relay tells.
    const localFirstRun = deps.localFirstRun !== undefined && (await deps.localFirstRun(peerIp(c), c.req.raw.headers));
    return c.json({
      mode: deps.mode,
      requiresLogin: isCookieAuthMode(deps.mode),
      localEnabled: deps.mode === "local",
      oidcEnabled: deps.mode === "oidc",
      oidcProviderName: deps.oidcProviderName,
      localFirstRun,
      discreetLogin: discreet,
      defaultHandle: discreet ? null : deps.defaultHandle,
      multiHumanCapable: deps.multiHumanCapable(),
      forbidExternalMedia: deps.forbidExternalMedia(),
      trustHtml: deps.trustHtml(),
      allowInteractiveCards: deps.allowInteractiveCards(),
      uploads: resolveUploadCaps({ maxImageBytes: deps.maxImageBytes(), maxDatabankBytes: deps.maxDatabankBytes() }),
    });
  });

  app.get("/api/auth/me", (c) => {
    const principal = c.get("principal");
    return c.json({
      authenticated: principal !== null,
      handle: principal?.handle ?? null,
      role: principal?.role ?? null,
    });
  });
}
