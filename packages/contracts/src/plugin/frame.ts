// @orb/contracts/plugin/frame — the wire for the PLUGIN-FRAME DOORWAY and the frame's postMessage BRIDGE
// (U7, seam 13). Two separate boundaries live here because both are crossed by the same
// untrusted document and neither may be spelled twice:
//
//   1. THE DOORWAY (client ↔ server, HTTP). `POST /api/plugin-frame` mints a per-user handle for one registered
//      `frame`-tier surface; `GET /api/plugin-frame/<id>` serves that document with ITS OWN response CSP. It is
//      the card-frame doorway's shape (`@orb/contracts/chat/card-frame`) — and it is deliberately NARROWER on
//      the one axis that matters: THE MINT CARRIES NO DOCUMENT BYTES. A card mint posts the card's markup (bytes
//      the viewer's own browser already holds); a plugin-frame mint posts a (pluginId, surfaceId) SELECTOR and
//      the server assembles the document from bytes IT holds, off the caller's own resident plugin instance. So
//      no client — not even the authenticated one — can mint an arbitrary document at this origin.
//
//      What the mint DOES carry is the theme: concrete `--*` colour values and a font-family list, because a
//      null-origin realm cannot resolve the app's `var(--token)` cascade (`use-sandbox-theme.ts`). Those are
//      re-clamped server-side by `clampCardFrameThemeTokens`/`clampCardFrameFontFamily` (`isSafeColor` and the
//      font-list grammar), so the only client-supplied content in the document is values that passed OUR
//      predicate — the same posture, and the same clamps, the card-frame mint uses.
//
//   2. THE BRIDGE (frame → embedder, postMessage). The frame has NO NETWORK OF ITS OWN: the served document's
//      policy is `default-src 'none'` with no `connect-src`, so fetch/XHR/WebSocket/EventSource/sendBeacon are
//      all refused. Its ONE channel to anything is `parent.postMessage`, and the embedder relays a validated
//      call to the SAME re-gated `plugin.uiHostCall` proc the scripted tier uses.
//
//      THE MESSAGE IS UNTRUSTED INPUT FROM A HOSTILE DOCUMENT, twice over. Authentication is WINDOW IDENTITY and
//      can be nothing else: every sandboxed document reports `event.origin === "null"`, so an origin check would
//      accept any opaque frame on the page — a sibling card frame, another plugin's frame, an ad iframe. The
//      embedder checks `event.source === iframe.contentWindow`; THIS file owns the other half, the payload, and
//      it parses rather than trusts. Neither half is sufficient alone, which is why they are separated.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { PLUGIN_SURFACE_ID_RE } from "./ui.ts";

/** The route prefix — the mint POSTs here, the frame document is `${PLUGIN_FRAME_ROUTE}/<id>`. */
export const PLUGIN_FRAME_ROUTE = "/api/plugin-frame";

/** Build the frame URL for a minted handle. One home so the client never re-spells the path. */
export function pluginFrameUrl(id: string): string {
  return `${PLUGIN_FRAME_ROUTE}/${id}`;
}

/** The DOCUMENT path prefix the app-CSP middleware must step aside for (`entry/http/security-headers.ts`).
 *
 *  IT IS EXPORTED, NOT RE-SPELLED, AND THAT IS LOAD-BEARING. `hono/secure-headers` writes its headers AFTER the
 *  handler with `.set()`, so it OVERWRITES a handler's own policy: a routed document only carries its own CSP
 *  because the middleware skips its path. A drifted copy of this string there does not fail loudly — it silently
 *  replaces the frame's policy with the APP's, which means `script-src 'self'`, no `sandbox` directive, and an
 *  isolated frame that is no longer isolated, with nothing red. The card-frame arm derives its prefix from
 *  `CARD_FRAME_ROUTE` for exactly this reason. */
export const PLUGIN_FRAME_DOC_PREFIX = `${PLUGIN_FRAME_ROUTE}/`;

// Theme bounds — the card-frame mint's, reused rather than re-guessed (the values are re-clamped server-side
// regardless; these only bound the PARSE).
const MAX_THEME_TOKENS = 24;
const MAX_TOKEN_NAME_CHARS = 64;
const MAX_TOKEN_VALUE_CHARS = 64;
const MAX_FONT_FAMILY_CHARS = 120;

/** Byte cap for the raw mint POST. The body is a selector plus the theme block, so this is small and fixed —
 *  unlike the card mint, no document bytes ride here at all. Derived from the accepted schema (generously) so
 *  transport can never reject a valid mint. */
export const PLUGIN_FRAME_MINT_BODY_MAX_BYTES = 8192;

/** The surface id's grammar — the `host.ui.registerFrame` id (`PLUGIN_SURFACE_ID_RE`), the same bounded
 *  plugin-local ident the router validates a `surfaceId` with. A named const (not an inline `z.string()`) both
 *  because it is a real grammar and because the `no-raw-id` gate reads an inline `z.string()` under an `*Id`
 *  key as a dropped FK brand — which this is not (a surface id is plugin-local, never an entity). */
const surfaceIdSchema = z.string().regex(PLUGIN_SURFACE_ID_RE);

/** The mint request. `strictObject` — an unknown key is a REJECT, not a silent strip: this body selects which
 *  surface a security boundary is built for, so a typo must fail loudly rather than resolve to something else.
 *  Note what is ABSENT and cannot be added by a caller: any policy field, any posture field, any document bytes. */
export const pluginFrameMintRequestSchema = z.strictObject({
  /** WHICH plugin — BRANDED (`typeIdSchema`), the router's own `pluginId` shape: a malformed id is a 400 at the
   *  schema, and a well-formed FOREIGN id resolves absent through the owner-scoped `getFrameBody` read (leak-free
   *  404). The brand also carries `PluginId` into the doorway so no `as PluginId` cast is needed there. */
  pluginId: typeIdSchema(ID_PREFIX.plugin),
  /** WHICH of that plugin's surfaces — the `host.ui.registerFrame` id grammar. */
  surfaceId: surfaceIdSchema,
  /** Concrete theme-resolved `--*` colors for the document's base body rule. Re-clamped server-side by
   *  `clampCardFrameThemeTokens` (`isSafeColor`) — these caps only bound the PARSE. */
  themeTokens: z
    .record(z.string().max(MAX_TOKEN_NAME_CHARS), z.string().max(MAX_TOKEN_VALUE_CHARS))
    .refine((r) => Object.keys(r).length <= MAX_THEME_TOKENS)
    .optional(),
  /** The NON-COLOR `--*` slice (#799) — a radius, the mono family list. It is a SECOND record rather than
   *  more keys in `themeTokens` because the server re-clamps the two with different grammars: `isSafeColor`
   *  is color-only and would drop every value here. Same per-entry caps, same count bound. */
  styleTokens: z
    .record(z.string().max(MAX_TOKEN_NAME_CHARS), z.string().max(MAX_FONT_FAMILY_CHARS))
    .refine((r) => Object.keys(r).length <= MAX_THEME_TOKENS)
    .optional(),
  /** The resolved UI font-family list. Re-validated server-side against the kit font-list grammar. */
  fontFamily: z.string().max(MAX_FONT_FAMILY_CHARS).optional(),
});
/** Type twin of {@link pluginFrameMintRequestSchema}. */
export type PluginFrameMintRequest = z.infer<typeof pluginFrameMintRequestSchema>;

/** The mint response — the frame URL plus the handle's lifetime, so a long-lived tab can re-mint before a
 *  remount finds an expired handle rather than discovering it as a blank frame. */
export const pluginFrameMintResponseSchema = z.strictObject({
  url: z.string(),
  expiresInMs: z.number().int().positive(),
});
/** Type twin of {@link pluginFrameMintResponseSchema}. */
export type PluginFrameMintResponse = z.infer<typeof pluginFrameMintResponseSchema>;

// ── The postMessage BRIDGE ────────────────────────────────────────────────────────────────────────────────────

/** The frame→embedder message key. A NAMESPACED key, not a bare `{fn, args}`, so a message meant for some other
 *  listener on the page can never be read as a host call — and so this channel is greppable. */
const CALL_KEY = "orbPluginFrameCall";
/** The embedder→frame reply key. */
export const PLUGIN_FRAME_RESULT_KEY = "orbPluginFrameResult";

/** A call's correlation id, MINTED BY THE FRAME and echoed back verbatim. It is UNTRUSTED and carries no
 *  authority whatsoever — it never keys a host-side map, never selects a plugin, and never picks a capability;
 *  it exists so the frame's own code can match a reply to its own promise. The grammar is bounded anyway,
 *  because an unbounded string echoed back into a document is a needless amplification.
 *
 *  A named `*Schema` const (referenced by identifier below) rather than an inline `z.string()`: the `no-raw-id`
 *  gate reads an inline `z.string()` under an `*Id` key as a dropped FK brand, and this is the opposite — a
 *  value the FRAME mints and we treat as opaque, which is exactly why it must NOT be branded (a brand would
 *  claim it is one of our ids). */
const CALL_ID_MAX = 64;
const callIdSchema = z.string().min(1).max(CALL_ID_MAX);
/** The proxied host-function name, e.g. `"chat.listMessages"`. Bounded HERE and RE-GATED SERVER-SIDE against
 *  `UI_PROXYABLE ∩ grants` — this cap is a wire bound, never the authorization. */
const CALL_FN_MAX = 64;
/** The embedder's per-frame in-flight ceiling. A hostile frame can post as fast as it likes; without this its
 *  parent would queue an unbounded number of relayed calls. Mirrors the server membrane's
 *  `HOST_CALLS_IN_FLIGHT_MAX` posture at an order of magnitude smaller, because a frame is one surface. */
export const PLUGIN_FRAME_CALLS_IN_FLIGHT_MAX = 4;

/** One host call, as it arrives from the frame. `args` is `unknown` on purpose: this boundary bounds SHAPE and
 *  SIZE, and the server re-validates the arguments per function with the membrane's own schemas — a second,
 *  weaker arg validation here would be a place for the two to disagree. */
export interface PluginFrameCall {
  readonly callId: string;
  readonly fn: string;
  readonly args: unknown;
}

const frameCallSchema = z.object({
  [CALL_KEY]: z.object({
    callId: callIdSchema,
    fn: z.string().min(1).max(CALL_FN_MAX),
    args: z.unknown(),
  }),
});

/**
 * Parse ONE `MessageEvent.data` into a host call, or `undefined` for anything that is not one.
 *
 * `undefined` is the whole point of the return type: the embedder's listener sees EVERY message its own frame
 * sends, including the card-frame height report (`{orbCardFrameHeight}`) that rides the same window, plus
 * whatever a hostile document invents. A parser that threw, or that returned a partly-populated object, would
 * push the "is this even a call" decision back to the call site. It cannot: it returns a call or nothing.
 *
 * The SENDER check is NOT here and must not be moved here — it needs the embedder's iframe ref, which is DOM,
 * and this package is isomorphic. Both halves are required; see the file header.
 */
export function parsePluginFrameCall(data: unknown): PluginFrameCall | undefined {
  const parsed = frameCallSchema.safeParse(data);
  if (!parsed.success) {
    return;
  }
  const call = parsed.data[CALL_KEY];
  return { callId: call.callId, fn: call.fn, args: call.args };
}

/** The embedder's reply to one call. `ok: false` carries a SHORT, plugin-facing reason — never a server error
 *  body: the frame is untrusted, and a refusal that echoed internals back into it would be a leak through the
 *  one channel we deliberately keep open. */
export type PluginFrameResult =
  | { readonly callId: string; readonly ok: true; readonly value: unknown }
  | { readonly callId: string; readonly ok: false; readonly error: string };

/** Wrap a result in the namespaced envelope the frame listens for. One home, so the key the embedder posts and
 *  the key a plugin author is promised are the same string by construction. */
export function pluginFrameResultMessage(result: PluginFrameResult): Record<string, PluginFrameResult> {
  return { [PLUGIN_FRAME_RESULT_KEY]: result };
}

/** The refusal a frame gets when no relay is wired, when the named function is not proxyable, or when the call
 *  is refused server-side. ONE sentence for every refusal arm, deliberately: a frame learns that its call did
 *  not happen and learns nothing about WHY, because the difference between "you lack this grant" and "that
 *  function does not exist" is an oracle a hostile document should not get for free. */
export const PLUGIN_FRAME_CALL_REFUSED = "refused";
