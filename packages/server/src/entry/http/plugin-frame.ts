// THE PLUGIN-FRAME DOORWAY (U7, §6.2, seam 13). `POST /api/plugin-frame` mints a frame
// handle for one of the CALLER'S OWN registered `frame`-tier surfaces; `GET /api/plugin-frame/:id` serves that
// document with ITS OWN Content-Security-Policy. It rides the card-frame substrate wholesale — the same handle
// store, the same document assembler, the same CSP engine — and the reasons that substrate is shaped the way it
// is (a srcdoc iframe INHERITS the app CSP, so only a real response can carry a per-document policy; the CSP
// `sandbox` directive is what keeps a DIRECT navigation opaque-origin) are measured and documented in
// `@orb/kit/card-frame`. Nothing here re-derives them.
//
// ── HOW THIS DOORWAY IS NARROWER THAN THE CARD FRAME'S ───────────────────────────────────────────────────────
// A card mint POSTs the card's BYTES (markup the viewer's own browser is already about to render) plus a policy
// SELECTOR. This mint posts a selector ONLY: `{pluginId, surfaceId}` plus theme values. The document is
// assembled from bytes the SERVER holds, off the caller's own resident plugin instance. So there is no arm here
// in which any client — authenticated or not — mints an arbitrary document at this origin. The card frame's
// "accepted residual" (a caller naming a trusted sibling character for a card a lesser one authored) has no
// analogue: the only thing a caller can name is which of their OWN plugins' surfaces to render.
//
// ── THE POLICY ───────────────────────────────────────────────────────────────────────────────────────────────
// ONE constant, built through the ONE CSP engine, and deliberately NOT a second builder — a plugin frame's
// policy IS the card frame's `document`/`interactive` arm at the media floor with the `data:` door open:
//
//   sandbox allow-scripts; script-src 'unsafe-inline'; default-src 'none'; img-src 'self' data:;
//   media-src 'self' data:; style-src 'unsafe-inline'; font-src 'self'; form-action 'none'; base-uri 'none';
//   frame-ancestors 'self'
//
//   • `interactive` posture — the plugin's OWN scripts run. That is the capability, not a leak: `ui.frame` is
//     granted by the installer precisely to run the plugin's interface code. Where a CARD needs two consents to
//     reach this posture (the host's per-character opt-in AND the deployment ceiling) because its author is a
//     MODEL, a plugin frame's author is software the installing user chose and granted.
//   • NO `connect-src`, inherited from `default-src 'none'` — fetch/XHR/WebSocket/EventSource/sendBeacon are all
//     refused (measured, `@orb/kit/card-frame`'s reach census). The frame has NO network of its own; every host
//     call rides the postMessage bridge to the re-gated relay.
//   • `allowExternalMedia: false`, ALWAYS, and this is a decision rather than a default. Granting `img-src
//     https:` would open a SECOND exfil channel — a composed-URL tracking pixel — and it is not the channel the
//     `ui.frame` consent line names. The one residual that line DOES name (WebRTC/STUN, residual R1) is
//     unclosable; adding a closable one beside it would make the consent copy less honest, not more. If external
//     media in plugin frames is ever wanted, it is a priced knob gated on the SAME deployment ceiling cards use,
//     never a quiet widening here.
//   • `allowInlineData: true` — `data:` images/media. These are the plugin's own inline bytes, not an egress
//     channel (a `data:` URL names no host), and they are what makes a canvas game or a sprite swap drawable at
//     all under a floor media policy.
//
// WHAT THE FRAME STILL REACHES, stated because a threat model that lists only walls is marketing: nothing of the
// app — no session cookie (opaque origin, and our `SameSite=Lax` cookie is withheld from it anyway), no storage,
// no `parent.document`, no sibling frame, no navigation (the EMBEDDER's `frame-src 'self'` is the belt) — and
// WebRTC, which no directive Chromium 149 recognizes can close (`webrtc 'block'` is reported "Unrecognized", so
// emitting it would be dead config teaching the next reader a lie). The `ui.frame` consent line says so.
//
// ── THE APP-CSP EXEMPTION THIS ROUTE DEPENDS ON ──────────────────────────────────────────────────────────────
// `hono/secure-headers` writes its headers AFTER the handler with `.set()`, so it OVERWRITES a handler's own
// policy. The served-document path is therefore exempted in `security-headers.ts` via `PLUGIN_FRAME_DOC_PREFIX`
// — the second member of an existing class, the card frame being the first. Without it this route would serve
// its documents under the APP policy (`script-src 'self'`, no `sandbox` directive) with nothing red: an
// "isolated" frame that is not isolated. `tests/server/entry/http/plugin-frame.test.ts` pins the actual response
// header for exactly that reason.

import type { Principal } from "@orb/contracts/identity";
import type { PluginFrameBody } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_MINT_BODY_MAX_BYTES, PLUGIN_FRAME_ROUTE, pluginFrameMintRequestSchema, pluginFrameUrl } from "@orb/contracts/plugin";
import type { CardFrameMediaPolicy } from "@orb/kit/card-frame";
import { buildCardFrameCsp, buildCardFrameDocument } from "@orb/kit/card-frame";
import type { PluginId } from "@orb/kit/ids";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { hasCsrfHeader } from "#infra/auth";
import type { PrincipalEnv } from "./blob.ts";
import { createFrameHandleStore, FRAME_HANDLE_SHAPE, FRAME_HANDLE_TTL_MS } from "./frame-handle-store.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;

const HTML_MIME = "text/html; charset=utf-8";

/** The plugin frame's media policy — see the header for why both halves are decisions, not defaults. */
const PLUGIN_FRAME_MEDIA: CardFrameMediaPolicy = { allowExternalMedia: false, allowInlineData: true };

/** THE plugin-frame policy. One constant, built once at module load through the ONE CSP engine, and applied to
 *  EVERY response on this route pair — the serve arm, the 401 arm and the miss arm alike, so no reply from this
 *  doorway is ever un-policied. There is no per-request variation to express: unlike a card, a plugin frame's
 *  policy depends on nothing a request can select. */
const PLUGIN_FRAME_CSP = buildCardFrameCsp(PLUGIN_FRAME_MEDIA, "document", "interactive");

/** A body for the miss arm — a blank 404 inside an iframe reads as a broken surface; this reads as a stale one.
 *  IDENTICAL for every miss reason by construction (unknown handle, foreign handle, expired handle), which is
 *  the same no-existence-leak property the store's `take` provides one layer down. */
const MISS_DOC = buildCardFrameDocument({
  html: '<p style="font:14px system-ui;opacity:.6;padding:12px">This plugin frame expired. Reload to view it.</p>',
  css: undefined,
  themeTokens: undefined,
  styleTokens: undefined,
  fontFamily: undefined,
});

/** The owner-scoped frame-body read — the ONE authority for whether these bytes may be served to this caller.
 *  Structural port so `entry/http` states exactly the slice it consumes (the `CardFrameParticipantsPort` precedent);
 *  wired at compose to `services.plugin.getFrameBody`, whose three gates (ownership, the live `ui.frame` grant,
 *  the surface's own tier) are documented on the verb. */
export interface PluginFrameSurfacePort {
  readonly getFrameBody: (params: { readonly caller: Principal; readonly pluginId: PluginId; readonly surfaceId: string }) => Promise<PluginFrameBody | null>;
}

export interface PluginFrameDeps {
  readonly surfaces: PluginFrameSurfacePort;
  readonly now: () => number;
}

/** The frame response's non-CSP siblings. `no-store` because the document holds one viewer's plugin bytes;
 *  `nosniff` because the body is plugin-authored markup and must never be re-typed by a sniffing browser;
 *  `no-referrer` so nothing the document loads can carry our URL anywhere. */
function frameHeaders(): Record<string, string> {
  return {
    "Content-Type": HTML_MIME,
    "Content-Security-Policy": PLUGIN_FRAME_CSP,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

/** Register `POST /api/plugin-frame` (mint) + `GET /api/plugin-frame/:id` (serve) on `app`. */
export function registerPluginFrame(app: Hono<PrincipalEnv>, deps: PluginFrameDeps): void {
  const store = createFrameHandleStore(deps.now);

  app.post(PLUGIN_FRAME_ROUTE, bodyLimit({ maxSize: PLUGIN_FRAME_MINT_BODY_MAX_BYTES, onError: (c) => c.body(null, PAYLOAD_TOO_LARGE) }), async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    // The same custom-header CSRF belt the auth routes and the card mint use: a cross-site form POST cannot set
    // it, and the mint is the only state-adding verb on this route pair.
    if (!hasCsrfHeader(c.req.raw.headers)) {
      return c.json({ error: "missing CSRF header" }, FORBIDDEN);
    }
    let raw: unknown;
    // @orb-waive caught-failure-ownership(catch): client-input — a malformed JSON body answers the caller a leak-free 400, the standard HTTP body-parse refusal. Ends if this stops being an entry-point body parse.
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, BAD_REQUEST);
    }
    const parsed = pluginFrameMintRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid plugin-frame mint" }, BAD_REQUEST);
    }
    const body = parsed.data;
    let frame: PluginFrameBody | null;
    // @orb-waive caught-failure-ownership(catch): leak-free collapse — documented below: a foreign/unknown pluginId, "no such surface", and "grant revoked" all answer the SAME NOT_FOUND, the card-frame doorway's fail-closed posture. Ends if a caller needs to distinguish those causes.
    try {
      frame = await deps.surfaces.getFrameBody({ caller: principal, pluginId: body.pluginId, surfaceId: body.surfaceId });
    } catch {
      // A foreign / unknown pluginId throws out of the owner-scoped load (`PluginNotFoundError`). It resolves to
      // the SAME answer as "no such surface" and "the grant was revoked" — a caller learns nothing from the
      // difference, which is the card-frame doorway's fail-closed posture applied to this gate.
      frame = null;
    }
    if (frame === null) {
      return c.json({ error: "no such plugin frame" }, NOT_FOUND);
    }
    // The theme clamps run inside `buildCardFrameDocument`, on OUR side of the boundary, on every call
    // regardless of what the caller already did — the same rule the card mint states. So the only
    // client-supplied content that reaches the document is `--*` values that passed `isSafeColor` and a
    // font-family list that passed the kit grammar.
    const doc = buildCardFrameDocument({
      html: frame.html,
      css: frame.css,
      themeTokens: body.themeTokens,
      // The NON-COLOR half of the widened slice (#799) — radius + the mono family. Clamped inside
      // `buildCardFrameDocument` by its own grammar (a CSS length or a font-family list), on OUR side of the
      // boundary, exactly as the color half is.
      styleTokens: body.styleTokens,
      fontFamily: body.fontFamily,
    });
    const id = store.put({ userId: principal.userId, doc, csp: PLUGIN_FRAME_CSP, expiresAt: deps.now() + FRAME_HANDLE_TTL_MS });
    return c.json({ url: pluginFrameUrl(id), expiresInMs: FRAME_HANDLE_TTL_MS });
  });

  app.get(`${PLUGIN_FRAME_ROUTE}/:id`, (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const id = c.req.param("id");
    // Shape FIRST: a handle that is not 32 hex chars never reaches the store, so a traversal attempt is refused
    // by grammar rather than by lookup.
    const entry = FRAME_HANDLE_SHAPE.test(id) ? store.take(id, principal.userId) : undefined;
    if (entry === undefined) {
      return c.body(MISS_DOC, NOT_FOUND, frameHeaders());
    }
    return c.body(entry.doc, OK, frameHeaders());
  });
}
