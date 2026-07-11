// entry/http/join — the `/join/:token` invite-link HTTP landing (FINAL-Auth-Modes §7 P1; PD-106; Part
// III §2). An invite link is shared OUT-OF-BAND (the host copies it), so its entry point must be a plain
// GET a browser can open — not a tRPC procedure. The landing does NO invite work itself: it bounces into
// the SPA root carrying the token as a search param (`/?join=<token>`), where the client runs the real
// preview-then-confirm flow over the gated tRPC surface (`invites.previewInvite` → `invites.redeemInvite`
// — token-authenticated, member-inserted atomically in the DOMAIN chokepoint). The raw token therefore
// transits exactly two places: this redirect and the tRPC mutation bodies — it is never persisted raw.
//
// GATING (the B4 axis — §9 ruling 2/3): the landing 404s when the deployment is not multi-human capable
// (single-user, or local with `LOCAL_MULTI_USER` off) — the SAME leak-free unmounted shape
// `multiHumanProcedure` gives the tRPC verbs, resolved per request off the injected capability read
// (a runtime AppSetting, never a boot constant). Multi-CHARACTER chat is untouched — this route only
// fronts the second-HUMAN seat.

import type { Hono } from "hono";

const FOUND = 302;
const NOT_FOUND = 404;

export interface JoinDeps {
  /** The per-request multi-human capability read (mode × the `LOCAL_MULTI_USER` AppSetting — the same
   *  derivation the tRPC mount uses). FALSE ⇒ the route answers 404 (leak-free, per PD-106). */
  readonly multiHumanCapable: () => boolean;
}

/** Register the `GET /join/:token` invite landing on `app`. */
export function registerJoin(app: Hono, deps: JoinDeps): void {
  app.get("/join/:token", (c) => {
    if (!deps.multiHumanCapable()) {
      return c.text("Not Found", NOT_FOUND);
    }
    const token = c.req.param("token");
    return c.redirect(`/?join=${encodeURIComponent(token)}`, FOUND);
  });
}
