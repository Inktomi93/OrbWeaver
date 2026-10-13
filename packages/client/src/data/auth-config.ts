// The deployment auth-config bootstrap read — the ONE canonical home for `/api/auth/config` (a
// pre-tRPC Hono endpoint: sessions.me 401s logged-out, so the client can't discover mode/capability
// through tRPC). Homed in data/, not features/auth, so a feature that only needs `multiHumanCapable`
// (e.g. chat's context port) reads it without a cross-feature reach into auth (client-features-no-cross);
// features/auth re-exports this for its own login/account surfaces.

import type { AuthConfig } from "@orb/contracts/auth-config";
import { authConfigSchema } from "@orb/contracts/auth-config";
import type { DeploymentRenderPolicy } from "@orb/contracts/chat";
import type { AuthConfigShare } from "@orb/contracts/identity";
import type { UploadCaps } from "@orb/contracts/uploads";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import type { UseQueryResult } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { DEPLOYMENT_FLOOR } from "#lib";
import { rememberMultiHumanCapable, useMultiHumanCapableHint } from "#state";

export type { AuthConfig } from "@orb/contracts/auth-config";

export const AUTH_CONFIG_KEY = ["auth", "config"] as const;

/** Fetch the deployment auth config. MEMOIZED for the session — the mode is boot-env, immutable while
 *  the server runs; a failed fetch clears the memo so the next caller retries. */
let configPromise: Promise<AuthConfig> | null = null;
export function fetchAuthConfig(): Promise<AuthConfig> {
  configPromise ??= fetch("/api/auth/config", { credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`/api/auth/config: HTTP ${res.status}`);
      }
      return authConfigSchema.parse(await res.json());
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

const LIVE_SHARE_KEY = ["auth", "share"] as const;

/** The share relay's state and link as the server holds them now. Unlike the rest of the config they change while
 *  the server runs, so this read is never memoized: an invite minted during a share must carry the live link. */
export async function fetchLiveShare(): Promise<AuthConfigShare> {
  const res = await fetch("/api/auth/config", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/auth/config: HTTP ${res.status}`);
  }
  return authConfigSchema.parse(await res.json()).share;
}

const liveShareOptions = queryOptions({ queryKey: LIVE_SHARE_KEY, queryFn: fetchLiveShare, staleTime: 0 });

/** The live share state, read fresh each time a surface that hands out links mounts. */
export function useLiveShare(): UseQueryResult<AuthConfigShare> {
  return useQuery(liveShareOptions);
}

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

/**
 * Can this deployment seat ≥2 humans — answered at FIRST PAINT (#476). The multi-human client surfaces gate
 * on this, and `/api/auth/config` is fetched at app-root mount, so a plain `data?.multiHumanCapable === true`
 * is FALSE for the first frames of every shell life and a gated slot mounts INTO the layout and shifts it
 * (measured on the topbar bell: 0.00015 — under the `[cls]` flagger's own reporting floor, so nothing ever
 * named it).
 *
 * ITS CALLERS ARE THE TWO REMAINING CAPABILITY-GATED SURFACES (#1627, 2026-09-05): `routes/app-root.tsx`'s
 * /join dialog and `features/chat/hooks/use-chat-context-state.ts`'s People-section flag. Both read
 * `useAuthConfig()` RAW until then — i.e. the single-human arm for the whole flight of the fetch, the exact
 * defect #476 measured on the bell — and the bell itself stopped consuming this when its inbox gained
 * single-human sources and the gate came off. One read of this capability, one hint, one write-back.
 *
 * So while the read is unresolved the answer is this DEVICE's remembered one (`#state` deployment-boot-hint,
 * localStorage, rehydrated at module init — the `appearance-boot-hint` pattern, same store class); the
 * instant the read lands, the server value is BOTH what the app renders and what is written back to the hint.
 * The server always wins, so a deployment that flipped its capability corrects the UI in the same commit
 * rather than being masked. A device that has never been told falls back to FALSE — the pre-existing floor,
 * and the honest first-ever-visit arm.
 *
 * A RENDER hint, never an authorization input: it decides whether a slot is drawn. Every read and verb behind
 * that slot still answers to the real config and the server's own gates, so the worst a stale hint buys is a
 * bell that empties and un-draws itself milliseconds later.
 */
export function useMultiHumanCapable(): boolean {
  const capable = useAuthConfig().data?.multiHumanCapable;
  const hinted = useMultiHumanCapableHint();
  // Written back from the one seam that knows the read has landed (the `useAppearance` precedent).
  useEffect((): void => {
    if (capable !== undefined) {
      rememberMultiHumanCapable(capable);
    }
  }, [capable]);
  return capable ?? hinted ?? false;
}

/** Does this deployment block external media outright? TRUE ⇒ every lower-tier "allow external media"
 *  control is inert (the resolver is tighten-only + the CSP blocks the fetch), so the control must render
 *  disabled + explained. Falls back to FALSE until the config lands or if it never does: this drives UI
 *  COPY only (the enforcement is server-side), and asserting "your admin blocked this" without having read
 *  it would be its own lie. The config is fetched once at app root, so in practice it is present. */
export function useExternalMediaBlocked(): boolean {
  return useAuthConfig().data?.forbidExternalMedia === true;
}

/** Does this deployment allow interactive cards at all (#111 leg 3)? FALSE ⇒ the per-character "Interactive"
 *  rung stores fine but resolves to the static posture everywhere, so a surface offering it must say so.
 *  `=== true`, so a not-yet-landed config reads as BLOCKED — the strict direction, even though the server's
 *  floor is on. (The external-media twin defaults the other way for the same reason: there the strict
 *  reading is "blocked", and here the strict reading is "not allowed".) */
export function useInteractiveCardsAllowed(): boolean {
  return useAuthConfig().data?.allowInteractiveCards === true;
}

/** The deployment RENDER-POLICY FLOOR — the pair `resolveRenderPolicy` (`@orb/contracts/chat`) combines a
 *  per-character override over. The ONE client home for it: a surface that renders card content it has no
 *  server-resolved `renderPolicy` for (the character editor's own previews, which read the `characters` row
 *  directly) resolves policy the same way compose does, instead of reading the raw override column.
 *
 *  Falls back to the STRICT `DEPLOYMENT_FLOOR` until the config lands and if it never does — the same
 *  fail-closed posture `lib/render-trust.ts`'s `SAFE_FLOOR` takes one tier up. Guessing
 *  a permissive floor to make a preview look richer is exactly the lie this hook exists to stop.
 *
 *  A {@link DeploymentRenderPolicy}, not a resolved `RenderPolicy`: the deployment serves the three axes an
 *  AppSetting carries, and the resolver folds a per-character override over them. */
export function useRenderPolicyFloor(): DeploymentRenderPolicy {
  const config = useAuthConfig().data;
  if (config === undefined) {
    return DEPLOYMENT_FLOOR;
  }
  return { trustHtml: config.trustHtml, forbidExternalMedia: config.forbidExternalMedia, allowInteractiveCards: config.allowInteractiveCards };
}
