// The /join/:token invite-link HTTP landing: a plain GET a browser can open (an invite link is shared
// out-of-band). Does no invite work itself — bounces into the SPA root carrying the token as a search
// param, where the client runs the real preview-then-confirm flow over the gated tRPC surface. 404s when
// the deployment is not multi-human capable — the same leak-free shape `multiHumanProcedure` gives the
// tRPC verbs.

import type { Hono } from "hono";

const FOUND = 302;
const NOT_FOUND = 404;

export interface JoinDeps {
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
