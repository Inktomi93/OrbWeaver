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
// `useCardFrame`: a failed CARD mint falls back to the srcdoc floor, which is strictly TIGHTER and still
// paints the card. A plugin frame has no such floor — the srcdoc arm is script-DEAD (it inherits the app's
// `script-src 'self'`), and a script-dead plugin frame is a blank box pretending to be a surface. So a failed
// mint resolves to `undefined` and the caller renders NOTHING (§4.9's "a crashed, slow, refused or state-less
// plugin surface renders nothing — never a broken frame").

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginFrameMintRequest, pluginFrameMintRequestSchema } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_ROUTE, pluginFrameMintResponseSchema } from "@orb/contracts/plugin";
import { isFetchFailure } from "@orb/kit/fetch-failure";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { surfaceDeferredFailure } from "#lib";
import { readJsonBody } from "./http-error.ts";

export type PluginFrameRequest = Readonly<z.input<typeof pluginFrameMintRequestSchema>> & Pick<PluginFrameMintRequest, "pluginId">;

function pluginFrameMintBody(request: PluginFrameRequest): PluginFrameMintRequest {
  return {
    pluginId: request.pluginId,
    surfaceId: request.surfaceId,
    themeTokens: { ...request.themeTokens },
    styleTokens: { ...request.styleTokens },
    ...(request.fontFamily === undefined ? {} : { fontFamily: request.fontFamily }),
  };
}

/** POST one serialized mint body; a mint the network or the server refuses, or an answer that is not a mint, resolves
 *  to `undefined` (the caller renders nothing). Any other fault rejects. */
async function mintPluginFrame(body: string): Promise<string | undefined> {
  let response: Response;
  try {
    response = await fetch(PLUGIN_FRAME_ROUTE, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", "Content-Type": "application/json" },
      body,
    });
  } catch (error) {
    if (!isFetchFailure(error)) {
      throw error;
    }
    return;
  }
  if (!response.ok) {
    return;
  }
  const parsed = pluginFrameMintResponseSchema.safeParse(await readJsonBody(response));
  return parsed.success ? parsed.data.url : undefined;
}

/** Revoke a minted frame handle. Best-effort: teardown must never surface an error into React cleanup. */
async function revokePluginFrame(url: string): Promise<void> {
  // A DELETE the network drops strands only a server-side handle, which the frame-handle store expires on its own
  // (`live()` drops an entry past `expiresAt`, set from `FRAME_HANDLE_TTL_MS`). Any other fault rejects.
  try {
    // keepalive: the cleanup often runs as the page navigates away, which cancels an ordinary request and logs an aborted DELETE.
    await fetch(url, { method: "DELETE", headers: { [CSRF_HEADER]: "1" }, keepalive: true });
  } catch (error) {
    if (!isFetchFailure(error)) {
      throw error;
    }
  }
}

function revokeFrameInBackground(url: string): void {
  revokePluginFrame(url).catch(surfaceDeferredFailure);
}

/**
 * The routed frame URL for one plugin frame surface, or `undefined` while it resolves / when it cannot be had.
 *
 * The state carries the BODY it resolved for, not a bare URL — that is what lets the stale case be answered
 * during RENDER (`resolved.body !== body ⇒ undefined`) instead of by a synchronous `setState` inside the effect,
 * which is a cascading render and which React's own lint bans. The `useCardFrame` mint's shape, for the same reason.
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
    // `mintPluginFrame` collapses every mint failure to `undefined`; `.catch` owns a throw from the callback.
    pending
      .then((url) => {
        handle = url;
        if (live) {
          setResolved({ body, url });
        } else if (url !== undefined) {
          revokeFrameInBackground(url);
        }
      })
      .catch(surfaceDeferredFailure);
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
