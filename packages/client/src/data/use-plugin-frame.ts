// The CLIENT half of the plugin-frame doorway (plugin-ui-plane #679 U7): mint a routed frame URL for ONE
// registered `frame`-tier surface, so it renders as a DOCUMENT WITH ITS OWN CSP. Raw fetch, not tRPC — the route
// is a Hono handler serving an HTML document (`entry/http/plugin-frame.ts`).
//
// The request is a SELECTOR plus theme values: `{pluginId, surfaceId, themeTokens, fontFamily}`. It carries no
// document bytes and no policy field, and `strictObject` on the server refuses a smuggled key outright — so
// nothing this file sends can widen a policy or choose what gets rendered, which is why it may run in the
// browser at all.
//
// DEGRADE TO NOTHING, NEVER TO A FLOOR. This is the one place where the plugin frame deliberately diverges from
// `useCardFrameSrc`: a failed CARD mint falls back to the srcdoc floor, which is strictly TIGHTER and still
// paints the card. A plugin frame has no such floor — the srcdoc arm is script-DEAD (it inherits the app's
// `script-src 'self'`), and a script-dead plugin frame is a blank box pretending to be a surface. So a failed
// mint resolves to `undefined` and the caller renders NOTHING (§4.9's "a crashed, slow, refused or state-less
// plugin surface renders nothing — never a broken frame").

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginFrameMintRequest, PluginFrameMintResponse } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_ROUTE, pluginFrameMintResponseSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { useEffect, useState } from "react";
import { forgetIfCurrent, rememberBounded } from "./bounded-memo.ts";

/** What a caller knows about ONE frame surface. Everything here is either an id the caller already holds or a
 *  theme value the server re-clamps. */
export interface PluginFrameRequest {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  /** Concrete theme-resolved `--*` colors (`useSandboxTheme`) — a null-origin realm cannot resolve our cascade. */
  readonly themeTokens: Readonly<Record<string, string>>;
  /** The NON-COLOR half of the same slice (#799) — radius + the mono family, which `isSafeColor` cannot judge
   *  and which therefore travel in their own record with their own server-side clamp. */
  readonly styleTokens: Readonly<Record<string, string>>;
  readonly fontFamily: string | undefined;
}

/** Per-tab memo so a re-render, a collapse/expand, or a scroll-back re-uses one handle instead of minting a
 *  fresh document per paint. Keyed on the SERIALIZED body, which is both the natural cache key and the effect's
 *  only dependency — a theme flip changes the bytes, hence the key, hence mints anew rather than serving a frame
 *  built under a stale palette.
 *
 *  BOUNDED, exactly as the card memo is (`use-card-frame.ts`, #711 D3): each distinct body is a fresh key, so a
 *  long-lived tab with many theme flips and many visited surfaces would grow this map without limit.
 *  `rememberBounded` caps it at {@link MINTED_CACHE_CAP} with LRU eviction — an evicted key just re-mints. */
const minted = new Map<string, Promise<string | undefined>>();

/** Cap on the per-tab mint memo. Comfortably above the handful of frame surfaces a page shows at once; older
 *  keys (a since-replaced theme, a closed surface) evict rather than accreting for the tab's lifetime. */
const MINTED_CACHE_CAP = 128;

/** The wire body for one frame. Pure + exported so the shape is testable without a browser. */
export function pluginFrameMintBody(request: PluginFrameRequest): PluginFrameMintRequest {
  return {
    pluginId: request.pluginId,
    surfaceId: request.surfaceId,
    themeTokens: { ...request.themeTokens },
    styleTokens: { ...request.styleTokens },
    ...(request.fontFamily === undefined ? {} : { fontFamily: request.fontFamily }),
  };
}

/** POST one serialized mint body; ANY failure resolves to `undefined` (the caller renders nothing). */
export async function mintPluginFrame(body: string): Promise<string | undefined> {
  let parsed: PluginFrameMintResponse;
  // @orb-waive caught-failure-ownership(catch): documented in the JSDoc above — any failure resolves to undefined and the caller renders nothing. Ends if rendering nothing stops being an acceptable fallback.
  try {
    const response = await fetch(PLUGIN_FRAME_ROUTE, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      return;
    }
    parsed = pluginFrameMintResponseSchema.parse(await response.json());
  } catch {
    return;
  }
  return parsed.url;
}

/**
 * The routed frame URL for one plugin frame surface, or `undefined` while it resolves / when it cannot be had.
 *
 * The state carries the BODY it resolved for, not a bare URL — that is what lets the stale case be answered
 * during RENDER (`resolved.body !== body ⇒ undefined`) instead of by a synchronous `setState` inside the effect,
 * which is a cascading render and which React's own lint bans. The `useCardFrameSrc` shape, for the same reason.
 */
export function usePluginFrameSrc(request: PluginFrameRequest | undefined): string | undefined {
  const [resolved, setResolved] = useState<{ readonly body: string; readonly url: string | undefined } | undefined>(undefined);
  const body = request === undefined ? undefined : JSON.stringify(pluginFrameMintBody(request));

  useEffect(() => {
    if (body === undefined) {
      return;
    }
    let live = true;
    const pending = minted.get(body) ?? mintPluginFrame(body);
    rememberBounded(minted, body, pending, MINTED_CACHE_CAP);
    // @orb-waive caught-failure-ownership(pending): mintPluginFrame's own catch already collapsed any failure to `undefined`; the reject arm here only exists for symmetry and sets the same render-floor state as the resolve arm. Ends if mintPluginFrame stops swallowing its own failures.
    pending.then(
      (url) => {
        // A FAILED MINT IS NOT AN ANSWER, so it must not be remembered as one: `mintPluginFrame` collapses a
        // 404, an offline blip and a version-skewed body alike into `undefined`, and caching that settled
        // promise would render this surface as NOTHING for the rest of the tab's life over one bad second.
        // Evicted OUTSIDE the `live` gate — an unmounted surface must not leave the poison behind.
        if (url === undefined) {
          forgetIfCurrent(minted, body, pending);
        }
        if (live) {
          setResolved({ body, url });
        }
      },
      () => {
        forgetIfCurrent(minted, body, pending);
        if (live) {
          setResolved({ body, url: undefined });
        }
      },
    );
    return (): void => {
      live = false;
    };
  }, [body]);

  // A handle NEVER outlives the bytes it was minted for: a theme flip or a different surface changes `body`,
  // and until the new mint answers the caller renders nothing.
  return body !== undefined && resolved?.body === body ? resolved.url : undefined;
}
