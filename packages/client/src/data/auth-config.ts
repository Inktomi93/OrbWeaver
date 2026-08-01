// The deployment auth-config bootstrap read — the ONE canonical home for `/api/auth/config` (a
// pre-tRPC Hono endpoint: sessions.me 401s logged-out, so the client can't discover mode/capability
// through tRPC). Homed in data/, not features/auth, so a feature that only needs `multiHumanCapable`
// (e.g. chat's context port) reads it without a cross-feature reach into auth (client-features-no-cross);
// features/auth re-exports this for its own login/account surfaces.

import type { AuthMode } from "@orb/contracts/identity";
import type { UploadCaps } from "@orb/contracts/uploads";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import type { UseQueryResult } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";

/** The `/api/auth/config` wire shape (mirrors `entry/http/auth-meta.ts` — mode-derived flags). */
export interface AuthConfig {
  readonly mode: AuthMode;
  /** TRUE only for the cookie modes (local/oidc) — the modes where /login is a real fix. Single-user can
   *  never be unauthenticated (redirecting would loop); forward-header's fix is proxy config. */
  readonly requiresLogin: boolean;
  readonly localEnabled: boolean;
  readonly oidcEnabled: boolean;
  /** ST `enableDiscreetLogin` parity — TRUE ⇒ blank form (`defaultHandle` is withheld as null). */
  readonly discreetLogin: boolean;
  readonly defaultHandle: string | null;
  /** PD-106 (B4): can this deployment seat ≥2 humans? The HONEST capability signal the multi-human
   *  client surfaces (invite affordances · notifications bell · /join landing) gate on — never a
   *  probe-and-catch of a `multiHumanProcedure` NOT_FOUND. Derived server-side per request from the
   *  same `MULTI_HUMAN_CAPABLE` map the transport belt runs. */
  readonly multiHumanCapable: boolean;
  /** The deployment "Block external media" ceiling — the value the document CSP was built from. TRUE ⇒
   *  external media is blocked for EVERY character, and a lower-tier "Allow" is inert (the render policy
   *  resolver is tighten-only). Surfaces that offer the per-character opt-in read this so they can disable
   *  it honestly instead of shipping a dead switch. */
  readonly forbidExternalMedia: boolean;
  /** The served deployment upload byte caps — the ONE source the client's dropzone hints + pre-checks
   *  derive from (resolved server-side, incl. the admin-tunable `maxImageBytes` clamp on the image cap).
   *  The `useUploadCaps` hook falls back to `DEFAULT_UPLOAD_CAPS` until this config has landed. */
  readonly uploads: UploadCaps;
}

export const AUTH_CONFIG_KEY = ["auth", "config"] as const;

/** Fetch the deployment auth config. MEMOIZED for the session — the mode is boot-env, immutable while
 *  the server runs; a failed fetch clears the memo so the next caller retries. */
let configPromise: Promise<AuthConfig> | null = null;
export function fetchAuthConfig(): Promise<AuthConfig> {
  configPromise ??= fetch("/api/auth/config", { credentials: "same-origin" })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`/api/auth/config: HTTP ${res.status}`);
      }
      return res.json() as Promise<AuthConfig>;
    })
    .catch((err: unknown) => {
      configPromise = null;
      throw err;
    });
  return configPromise;
}

const authConfigOptions = queryOptions({
  queryKey: AUTH_CONFIG_KEY,
  queryFn: fetchAuthConfig,
  staleTime: Number.POSITIVE_INFINITY,
});

/** The deployment auth config — immutable for the session (boot-env mode), so it never refetches; the
 *  fetcher's own memo additionally dedupes across cache evictions. */
export function useAuthConfig(): UseQueryResult<AuthConfig> {
  return useQuery(authConfigOptions);
}

/** The served upload byte caps, falling back to the contract defaults until `/api/auth/config` lands. The
 *  ONE read every upload pre-check + dropzone hint uses — never an invented per-widget number. */
export function useUploadCaps(): UploadCaps {
  return useAuthConfig().data?.uploads ?? DEFAULT_UPLOAD_CAPS;
}

/** Does this deployment block external media outright? TRUE ⇒ every lower-tier "allow external media"
 *  control is inert (the resolver is tighten-only + the CSP blocks the fetch), so the control must render
 *  disabled + explained. Falls back to FALSE until the config lands or if it never does: this drives UI
 *  COPY only (the enforcement is server-side), and asserting "your admin blocked this" without having read
 *  it would be its own lie. The config is fetched once at app root, so in practice it is present. */
export function useExternalMediaBlocked(): boolean {
  return useAuthConfig().data?.forbidExternalMedia === true;
}
