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
//     granted by the installer precisely to run the plugin's interface code. Where a CARD reaches this posture only
//     through its character's resolved step AND the deployment ceiling AND the viewer's own consent (D294)
//     because its author is a MODEL, a plugin frame's author is software the installing user chose and granted.
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
// policy. The served-document route and the asset route are therefore both registered through
// `security-headers.ts`'s own-policy registrar, beside the card frame's document, which exempts their paths in the
// same call. Each arm here hands the registrar its own policy or answers a bare refusal; a refusal gets the app policy.

import type { PluginFrameBody } from "@orb/contracts/plugin";
import {
  PLUGIN_FRAME_MINT_BODY_MAX_BYTES,
  PLUGIN_FRAME_ROUTE,
  PLUGIN_UI_ASSET_ENTRY_RE,
  pluginFrameAssetUrl,
  pluginFrameMintRequestSchema,
  pluginFrameUrl,
} from "@orb/contracts/plugin";
import type { CardFrameMediaPolicy } from "@orb/kit/card-frame";
import { buildCardFrameCsp, buildCardFrameDocument, cardFrameResponseHeaders } from "@orb/kit/card-frame";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Clock } from "@orb/kit/time";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { PluginService } from "#domain/plugin";
import { hasCsrfHeader } from "#infra/auth";
import type { PrincipalEnv } from "./contract/request-env.ts";
import { createFrameHandleStore, FRAME_HANDLE_SHAPE, FRAME_HANDLE_TTL_MS } from "./frame-handle-store.ts";
import type { OwnPolicyRegistrar, OwnPolicyReply } from "./security-headers.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const NO_CONTENT = 204;

/** This doorway serves only the four raster extensions `getFrameAsset`'s mime-sniff can ever answer
 *  with (PNG/JPEG/GIF/WebP). Checked HERE, at the query-string boundary,
 *  alongside {@link PLUGIN_UI_ASSET_ENTRY_RE} rather than instead of it: the shared regex is the
 *  install-time flat-name grammar (deliberately extension-agnostic — content, not spelling, is what
 *  `sniffMime` polices for a house surface's `bundleAsset` lookup). This route additionally answers a
 *  bare HTTP GET into a browser with its own `Cross-Origin-Resource-Policy: cross-origin`, so its own
 *  admission is narrower than the general one: an extension outside this set 404s before the owner-scoped
 *  read even runs, rather than relying solely on the byte-content recheck one layer down. */
const FRAME_ASSET_EXTENSION_RE = /\.(?:png|jpe?g|gif|webp)$/iu;

/** The plugin frame's media policy — see the header for why both halves are decisions, not defaults. */
const PLUGIN_FRAME_MEDIA: CardFrameMediaPolicy = { allowExternalMedia: false, allowInlineData: true };

/** THE plugin-frame policy. One constant, built once at module load through the ONE CSP engine, and served on the
 *  document route's serve and miss arms alike; its bare 401 leaves under the app policy, so no reply from this
 *  doorway is ever un-policied. There is no per-request variation to express: unlike a card, a plugin frame's
 *  policy depends on nothing a request can select. */
export const PLUGIN_FRAME_CSP = buildCardFrameCsp(PLUGIN_FRAME_MEDIA, "document", "interactive");

function frameDocument(status: typeof OK | typeof NOT_FOUND, body: string): OwnPolicyReply {
  return { kind: "document", status, body, headers: cardFrameResponseHeaders(), policy: PLUGIN_FRAME_CSP };
}

// A not-found read is the leak-free miss every frame route answers alike; any other failure of the read is a fault.
function notFoundAsNull(error: unknown): null {
  if (error instanceof DomainNotFoundError) {
    return null;
  }
  throw error;
}

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
export interface PluginFrameSurfacePort extends Readonly<Pick<PluginService, "getFrameBody" | "getFrameAsset">> {}

export interface PluginFrameDeps {
  readonly surfaces: PluginFrameSurfacePort;
  readonly now: Clock;
  /** The document and asset routes' one registrar, which writes their policies and steps the app policy aside. */
  readonly registerOwnPolicyRoute: OwnPolicyRegistrar;
}

/** The served asset's own policy: an image needs no source, and a direct navigation to it lands sandboxed. */
export const PLUGIN_FRAME_ASSET_CSP = "default-src 'none'; sandbox";
/** The opaque-origin frame loads the asset cross-origin, so only the successful asset reply carries this. */
const PLUGIN_FRAME_ASSET_RESOURCE_POLICY = "cross-origin";
/** Every asset refusal is the same bare 404, under the app policy. */
const ASSET_MISS: OwnPolicyReply = { kind: "refusal", status: NOT_FOUND };

function assetHeaders(mime: string, byteLength: number): Record<string, string> {
  return {
    "Content-Type": mime,
    "Content-Length": String(byteLength),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": PLUGIN_FRAME_ASSET_RESOURCE_POLICY,
  };
}

/** Install the frame's only asset-address constructor before plugin-authored script runs. It accepts a bundle
 * path, never an asset id; the route re-validates that path and derives every authority-bearing coordinate
 * from the active handle. */
function assetUrlBootstrap(id: string): string {
  const prefix = JSON.stringify(pluginFrameAssetUrl(id, ""));
  return `<script>(()=>{const p=${prefix};Object.defineProperty(globalThis,"orbPluginAssetUrl",{value:(path)=>p+encodeURIComponent(String(path)),writable:false,configurable:false});})();</script>`;
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
    // client-input — a malformed JSON body answers the caller a leak-free 400, the standard HTTP body-parse refusal. Ends if this stops being an entry-point body parse.
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
    try {
      frame = await deps.surfaces.getFrameBody({ caller: principal, pluginId: body.pluginId, surfaceId: body.surfaceId });
    } catch (error) {
      // A foreign or unknown pluginId throws `PluginNotFoundError` out of the owner-scoped load. It resolves to the
      // same answer as "no such surface" and "the grant was revoked", the card-frame doorway's fail-closed posture.
      frame = notFoundAsNull(error);
    }
    if (frame === null) {
      return c.json({ error: "no such plugin frame" }, NOT_FOUND);
    }
    // The theme clamps run inside `buildCardFrameDocument`, on OUR side of the boundary, on every call
    // regardless of what the caller already did — the same rule the card mint states. So the only
    // client-supplied content that reaches the document is `--*` values that passed `isSafeColor` and a
    // font-family list that passed the kit grammar.
    const id = store.put({
      userId: principal.userId,
      plugin: { caller: principal, pluginId: body.pluginId, surfaceId: body.surfaceId },
      doc: (handleId) =>
        buildCardFrameDocument({
          html: `${assetUrlBootstrap(handleId)}${frame.html}`,
          css: frame.css,
          themeTokens: body.themeTokens,
          // The schema admitted only the card frame's closed slice, each value past its own grammar; this clamp
          // still runs here and is the one that bounds the root size to the appearance range.
          styleTokens: body.styleTokens,
          fontFamily: body.fontFamily,
        }),
      csp: PLUGIN_FRAME_CSP,
      expiresAt: deps.now() + FRAME_HANDLE_TTL_MS,
    });
    return c.json({ url: pluginFrameUrl(id), expiresInMs: FRAME_HANDLE_TTL_MS });
  });

  // Opaque-origin frame subresources cannot carry the app's SameSite session cookie. The unguessable ACTIVE
  // handle is therefore the credential on this one passive-image route. If a session is present, it must still
  // be the minting owner; a foreign authenticated fetch gets the same miss as an unknown handle.
  deps.registerOwnPolicyRoute(app, "pluginFrameAsset", async (c, id) => {
    const entry = FRAME_HANDLE_SHAPE.test(id) ? store.peekByHandle(id) : undefined;
    const principal = c.get("principal");
    const bundlePath = c.req.query("path");
    if (
      entry?.plugin === undefined ||
      (principal !== null && principal.userId !== entry.userId) ||
      bundlePath === undefined ||
      !PLUGIN_UI_ASSET_ENTRY_RE.test(bundlePath) ||
      !FRAME_ASSET_EXTENSION_RE.test(bundlePath)
    ) {
      return ASSET_MISS;
    }
    let asset: Awaited<ReturnType<PluginFrameSurfacePort["getFrameAsset"]>>;
    // Every stale, removed or foreign asset is the same leak-free 404 at this passive resource boundary, and so is a
    // torn CAS entry, as `entry/http/blob.ts` answers it (`domain/assets/verbs/plugin-reads.ts` logs that fault).
    try {
      // A handle names one live frame surface, not the plugin's entire asset namespace. An upgrade can remove
      // that surface while leaving the plugin enabled and its other assets installed.
      const frame = await deps.surfaces.getFrameBody({
        caller: entry.plugin.caller,
        pluginId: entry.plugin.pluginId,
        surfaceId: entry.plugin.surfaceId,
      });
      asset = frame === null ? null : await deps.surfaces.getFrameAsset({ caller: entry.plugin.caller, pluginId: entry.plugin.pluginId, bundlePath });
    } catch (error) {
      asset = notFoundAsNull(error);
    }
    if (asset === null) {
      return ASSET_MISS;
    }
    store.touch(id);
    return {
      kind: "resource",
      status: OK,
      body: new Uint8Array(asset.bytes),
      headers: assetHeaders(asset.mime, asset.bytes.byteLength),
      policy: PLUGIN_FRAME_ASSET_CSP,
    };
  });

  app.delete(`${PLUGIN_FRAME_ROUTE}/:id`, (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    if (!hasCsrfHeader(c.req.raw.headers)) {
      return c.body(null, FORBIDDEN);
    }
    const id = c.req.param("id");
    if (FRAME_HANDLE_SHAPE.test(id)) {
      store.drop(id, principal.userId);
    }
    return c.body(null, NO_CONTENT);
  });

  deps.registerOwnPolicyRoute(app, "pluginFrameDocument", async (c, id) => {
    const principal = c.get("principal");
    if (principal === null) {
      return { kind: "refusal", status: UNAUTHORIZED };
    }
    // Shape FIRST: a handle that is not 32 hex chars never reaches the store, so a traversal attempt is refused
    // by grammar rather than by lookup.
    const entry = FRAME_HANDLE_SHAPE.test(id) ? store.take(id, principal.userId) : undefined;
    if (entry === undefined) {
      return frameDocument(NOT_FOUND, MISS_DOC);
    }
    if (entry.plugin !== undefined) {
      // A handle is not a snapshot of consent. Recheck current residency/grant so disable and uninstall revoke
      // the document as well as its assets before the sliding TTL expires.
      let live: PluginFrameBody | null;
      // A plugin gone since the mint closes this passive handle read as the same leak-free miss as a revoked grant.
      try {
        live = await deps.surfaces.getFrameBody({ caller: entry.plugin.caller, pluginId: entry.plugin.pluginId, surfaceId: entry.plugin.surfaceId });
      } catch (error) {
        live = notFoundAsNull(error);
      }
      if (live === null) {
        store.drop(id, principal.userId);
        return frameDocument(NOT_FOUND, MISS_DOC);
      }
    }
    return frameDocument(OK, entry.doc);
  });
}
