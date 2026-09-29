// The CLIENT half of the plugin-frame doorway: mint a routed frame URL for ONE
// registered `frame`-tier surface, so it renders as a DOCUMENT WITH ITS OWN CSP. Raw fetch, not tRPC — the route
// is a Hono handler serving an HTML document (`entry/http/plugin-frame.ts`).
//
// The request is a SELECTOR plus theme values: `{pluginId, surfaceId, themeTokens, fontFamily}`. It carries no
// document bytes and no policy field, and `strictObject` on the server refuses a smuggled key outright — so
// nothing this file sends can widen a policy or choose what gets rendered, which is why it may run in the
// browser at all. A successful mint is a MOUNTED resource: cleanup DELETEs its capability handle, which also
// closes the installed-asset URLs injected into that document.
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

/** Revoke a minted frame handle. Best-effort: teardown must never surface an error into React cleanup. */
export async function revokePluginFrame(url: string): Promise<void> {
  // @orb-waive caught-failure-ownership(catch): cleanup is best-effort; server TTL remains the final bound if
  // navigation wins the race or the network is already gone. Ends if handle revocation becomes user-visible.
  try {
    await fetch(url, { method: "DELETE", headers: { [CSRF_HEADER]: "1" } });
  } catch {
    // The server-side TTL still bounds the abandoned handle.
  }
}

function revokeFrameInBackground(url: string): void {
  // @orb-waive caught-failure-ownership(revokePluginFrame): revokePluginFrame contains network failures, and
  // teardown must remain best-effort. Ends if revocation gains a user-visible failure path.
  revokePluginFrame(url).catch(() => undefined);
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
    let handle: string | undefined;
    const pending = mintPluginFrame(body);
    // @orb-waive caught-failure-ownership(pending): mintPluginFrame's own catch already collapsed any failure to `undefined`; the reject arm here only exists for symmetry and sets the same render-floor state as the resolve arm. Ends if mintPluginFrame stops swallowing its own failures.
    pending.then(
      (url) => {
        handle = url;
        if (live) {
          setResolved({ body, url });
        } else if (url !== undefined) {
          revokeFrameInBackground(url);
        }
      },
      () => {
        if (live) {
          setResolved({ body, url: undefined });
        }
      },
    );
    return (): void => {
      live = false;
      if (handle !== undefined) {
        revokeFrameInBackground(handle);
      }
    };
  }, [body]);

  // A handle NEVER outlives the bytes it was minted for: a theme flip or a different surface changes `body`,
  // and until the new mint answers the caller renders nothing.
  return body !== undefined && resolved?.body === body ? resolved.url : undefined;
}
