// The Tier-C guest-source registrar. `GET /api/plugin-ui/:pluginId` serves an OWNED plugin's `ui.js` as INERT
// BYTES so the browser worker can `evalCode` it into its QuickJS interpreter (plugin-ui-plane #679 U4, §4.6 /
// seam 8). Owner-gated, not unauthenticated — a plugin the caller does not own is indistinguishable from a
// missing one (both → 404, no foreign-existence leak), the `blob.ts` posture and the `getById` posture agreeing.
//
// WHY THIS IS AN HTTP ROUTE AND NOT A tRPC PROC, which is the design decision this file exists to carry:
//
//  1. THE MIME IS THE WALL. The response is `application/octet-stream` + `X-Content-Type-Options: nosniff`, so
//     a `<script src="/api/plugin-ui/plugin_…">` is REFUSED BY THE BROWSER before a byte executes — the app's
//     own `script-src 'self'` would otherwise permit exactly that same-origin script chain (the #709 lesson
//     `blob.ts` records, and plugin source is the most obviously executable payload we serve). Over tRPC the
//     source would arrive as a JSON string with an `application/json` type and no such property: the ONLY thing
//     standing between it and execution would be every future client author choosing not to. Here the refusal
//     is a fact about the response.
//  2. It is bytes, not a domain answer. The client fetches it as TEXT once per worker boot and hands it
//     straight to the interpreter; there is nothing to invalidate, nothing to cache in the query client, and no
//     shape for a JSON envelope to add.
//
// `Content-Disposition: attachment` rides along for the same reason `blob.ts` sets it on non-media: if a person
// ever navigates to this URL directly, the browser must download it rather than render it as a same-origin
// document. And the response is `private, no-store`: guest source is per-owner, and a shared cache holding one
// user's plugin bytes under a URL another user's session could hit is a leak no gate here would see.
//
// The DOMAIN does the real work (`plugin.getUiBundle`): owner-scoped row load → owner-scoped CAS read →
// re-parse through the ONE unzip funnel, so the bytes served always just passed the hardening. This file adds
// exactly the transport-shaped decisions: who is asking, what the id is, and how the response is typed.

import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { PrincipalEnv } from "./blob.ts";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const OCTET_STREAM = "application/octet-stream";
const NOSNIFF = "nosniff";
const ATTACHMENT = "attachment";
/** Per-owner guest source: never shared, never stored. A `private` cache would still be correct, but `no-store`
 *  is the honest one — a bundle can be upgraded in place, and a stale `ui.js` running against a fresh
 *  `listSurfaces` is a debugging trap nobody would look for. */
const CACHE_CONTROL = "private, no-store";

const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);

/** The `domain/plugin` front-door slice this route consumes — one verb, the whole gate. */
export interface PluginUiPort {
  /** The owned plugin's `ui.js` source, or `null` when it ships no client guest. Throws the domain's leak-free
   *  NOT_FOUND for a plugin the caller does not own. */
  readonly getUiBundle: (params: { readonly caller: Principal; readonly pluginId: PluginId }) => Promise<string | null>;
}

/** Register `GET /api/plugin-ui/:pluginId` on `app`. */
export function registerPluginUi(app: Hono<PrincipalEnv>, deps: PluginUiPort): void {
  app.get(`${PLUGIN_UI_ROUTE}/:pluginId`, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    // A malformed id is a 404, not a 400: "not a plugin id" and "not your plugin" must be the same answer, or
    // the shape of the refusal becomes an oracle for which ids exist.
    const parsed = pluginIdSchema.safeParse(c.req.param("pluginId"));
    if (!parsed.success) {
      return c.body(null, NOT_FOUND);
    }
    let source: string | null;
    // @orb-waive caught-failure-ownership(catch): leak-free collapse — documented below: every domain refusal (foreign plugin, torn CAS entry, unparseable bundle) collapses to ONE NOT_FOUND, the same containment `blob.ts` gives a torn blob. Ends if a caller needs to distinguish those causes.
    try {
      source = await deps.getUiBundle({ caller: principal, pluginId: parsed.data });
    } catch {
      // The domain's own refusals (leak-free NOT_FOUND for a foreign plugin, a torn CAS entry, a bundle that no
      // longer parses) all collapse to ONE answer here, deliberately: a caller learns nothing about which of
      // those happened, which is the same containment `blob.ts` gives a torn blob.
      return c.body(null, NOT_FOUND);
    }
    if (source === null) {
      return c.body(null, NOT_FOUND);
    }
    // TextEncoder rather than a string body: the length header must be the BYTE count, and a UTF-8 source with
    // any non-ASCII character has more bytes than code units.
    const bytes = new TextEncoder().encode(source);
    return new Response(bytes, {
      headers: {
        "Content-Type": OCTET_STREAM,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": CACHE_CONTROL,
        "Content-Disposition": ATTACHMENT,
        // Restated here (the app middleware also sets it) so the inert typing holds on this response no matter
        // what a future middleware ordering does — the whole point of the route is that these two headers are
        // what make the bytes non-script.
        "X-Content-Type-Options": NOSNIFF,
      },
    });
  });
}
