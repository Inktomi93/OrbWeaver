// `GET /api/plugin-ui/:pluginId` — the Tier-C guest-source doorway (U4, §4.6 / seam 8).
//
// THE MIME PIN IS THE POINT OF THIS FILE, and it is not decoration. Plugin `ui.js` is the most obviously
// executable payload this app serves, and the app's own prod CSP grants `script-src 'self'` — so a same-origin
// `<script src="/api/plugin-ui/plugin_…">` would EXECUTE the guest source in the page realm with the owner's
// cookies, which is the entire threat this design exists to avoid. Two headers make that impossible as a
// property of the RESPONSE rather than of every future client author's discipline:
//   `Content-Type: application/octet-stream` — not a script type, so the tag is refused…
//   `X-Content-Type-Options: nosniff`        — …and the browser may not re-guess its way back to one.
// Delete either and the route silently becomes a script-injection surface with nothing else red. Hence a pin
// per header, named for what it prevents.
//
// A tiny real Hono app runs the registrar, so every assertion is about the header a browser actually receives.

import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import type { Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PrincipalEnv } from "@orb/server/entry/http";
import { registerPluginUi } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

/** MINTED, never a hand-written literal: the route parses the path segment with `typeIdSchema`, which validates
 *  the 26-char base32 suffix at RUNTIME — a plausible-looking short literal is refused as malformed and every
 *  200-arm test below would 404 for the wrong reason. */
const PLUGIN_ID: PluginId = mintTypeId(ID_PREFIX.plugin);
const UI_SOURCE = "orb.ui(1).render('panel', { kind: 'text', value: 'hi' });";
const OK = 200;
const NOT_FOUND = 404;
const UNAUTHORIZED = 401;

/** A REAL `Principal`, spelled out (the `blob.test.ts` sibling's shape) rather than double-cast: the route only
 *  passes it through to the domain verb, but a fabricated one would survive `Principal` gaining a field and
 *  quietly stop representing what the route actually receives. */
const PRINCIPAL: Principal = {
  userId: castId<UserId>("usr_plugin_owner"),
  role: "owner",
  handle: castId<Handle>("plugin_user"),
  externalId: null,
  via: "fallback",
};

interface AppOpts {
  readonly principal?: Principal | null;
  readonly source?: string | null;
  readonly throws?: boolean;
}

/** Destructuring DEFAULTS, not `??`: only `undefined` falls back, so an explicit `null` (no principal / no
 *  ui.js) stays null — which is exactly the distinction the 401 and the no-guest 404 tests rest on. */
function appFor({ principal = PRINCIPAL, source = UI_SOURCE, throws = false }: AppOpts = {}): Hono<PrincipalEnv> {
  const app = new Hono<PrincipalEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", principal);
    c.set("sessionId", null);
    await next();
  });
  registerPluginUi(app, {
    getUiBundle: (): Promise<string | null> => (throws ? Promise.reject(new Error("plugin not found")) : Promise.resolve(source)),
  });
  return app;
}

describe("plugin-ui route — the inert-bytes contract", () => {
  test("serves the source as octet-stream + nosniff, so a <script src> at it is MIME-refused", async () => {
    const res = await appFor().request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.status).toBe(OK);
    // THE WALL, both halves. `application/octet-stream` is not a script MIME…
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    // …and nosniff forbids the browser from deciding otherwise from the bytes (which begin with real JS).
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Explicitly NOT any script type, spelled as its own assertion so the intent survives a refactor.
    for (const scriptish of ["text/javascript", "application/javascript", "module"]) {
      expect(res.headers.get("content-type"), scriptish).not.toContain(scriptish);
    }
    expect(await res.text()).toBe(UI_SOURCE);
  });

  test("a direct navigation downloads rather than rendering as a same-origin document", async () => {
    const res = await appFor().request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.headers.get("content-disposition")).toBe("attachment");
  });

  test("guest source is never cached — a shared cache holding one owner's plugin bytes is a leak", async () => {
    const res = await appFor().request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  test("Content-Length is the BYTE count, not the code-unit count (a non-ASCII source)", async () => {
    // A truncated body is an unparseable guest, so the length has to be measured in the unit the wire uses.
    const source = "orb.ui(1).log.info('héllo — ünïcode');";
    const res = await appFor({ source }).request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.headers.get("content-length")).toBe(String(new TextEncoder().encode(source).byteLength));
    expect(await res.text()).toBe(source);
  });
});

describe("plugin-ui route — the refusals all look the same", () => {
  test("no principal ⇒ 401 (owner-gated, never public)", async () => {
    const res = await appFor({ principal: null }).request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.status).toBe(UNAUTHORIZED);
  });

  test("a plugin with no ui.js ⇒ 404 with no body", async () => {
    const res = await appFor({ source: null }).request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.status).toBe(NOT_FOUND);
    expect(await res.text()).toBe("");
  });

  test("a malformed id ⇒ 404, the SAME answer as a foreign plugin (no existence oracle)", async () => {
    // "not a plugin id" and "not your plugin" must be indistinguishable, or the shape of the refusal tells a
    // prober which ids are real.
    const res = await appFor().request(`${PLUGIN_UI_ROUTE}/not-a-typeid`);
    expect(res.status).toBe(NOT_FOUND);
  });

  test("a domain refusal (foreign plugin, torn CAS, unparseable bundle) collapses to ONE 404", async () => {
    const res = await appFor({ throws: true }).request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(res.status).toBe(NOT_FOUND);
  });

  test("the id reaches the domain verb VERBATIM — the route resolves nothing itself", async () => {
    let seen: PluginId | undefined;
    const app = new Hono<PrincipalEnv>();
    app.use("*", async (c, next) => {
      c.set("principal", PRINCIPAL);
      c.set("sessionId", null);
      await next();
    });
    registerPluginUi(app, {
      getUiBundle: ({ pluginId }): Promise<string | null> => {
        seen = pluginId;
        return Promise.resolve(UI_SOURCE);
      },
    });
    await app.request(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
    expect(seen).toBe(PLUGIN_ID);
  });
});
