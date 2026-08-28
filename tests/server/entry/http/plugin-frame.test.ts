// entry/http/plugin-frame — the U7 escape hatch's doorway (#679, §6.2, seam 13). A REAL Hono app runs the
// registrar so every assertion is about the response a browser receives (status, headers, body), not an
// internal object — the card-frame test's shape, because it is the same class of boundary.
//
// What these pin, in the order an attacker would try them:
//   1. no session → nothing (mint and serve both 401)
//   2. no CSRF header → the mint is refused
//   3. ANOTHER user's handle → 404, indistinguishable from one that never existed
//   4. a malformed handle never reaches the store
//   5. THE MINT CARRIES NO BYTES — a client cannot supply the document, only name one of its own surfaces
//   6. the served document's policy: sandboxed, script-enabled, `default-src 'none'` with NO `connect-src`,
//      no external-media allowance, `frame-ancestors 'self'`
//   7. THE MIDDLEWARE PIN — with the APP's `securityHeaders` mounted above it (exactly as `entry/app.ts` wires
//      it), the served document still carries the FRAME policy and not the app's. This is the pin that catches
//      the silent inversion: `hono/secure-headers` writes AFTER the handler, so without the path exemption the
//      frame would be served with `script-src 'self'` and no `sandbox` directive, and NOTHING else would go red.
//   8. every refusal arm is itself policied (the 401/404 replies are not un-policied HTML)
//   9. the plugin's bytes reach the document verbatim, and the theme values are re-clamped on OUR side

import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginFrameBody } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import { CARD_FRAME_HEIGHT_SCRIPT } from "@orb/kit/card-frame";
import type { Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginFrameDeps, PrincipalEnv } from "@orb/server/entry/http";
import { registerPluginFrame, securityHeaders } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const PLUGIN = castId<PluginId>("plugin_01h455vb4pex5vsknk084sn02q");

function principal(id: string): Principal {
  return { userId: castId<UserId>(id), role: "owner", handle: castId<Handle>(id), externalId: null, via: "fallback" };
}
const ALICE = principal("usr_alice");
const MALLORY = principal("usr_mallory");

const BOARD: PluginFrameBody = { html: "<canvas id='board'></canvas><script>drawChess()</script>", css: "body{background:#111}" };

interface Harness {
  readonly mint: (body: unknown, opts?: { readonly csrf?: boolean; readonly as?: Principal | null }) => Promise<Response>;
  readonly serve: (url: string, as?: Principal | null) => Promise<Response>;
}

function harness(
  overrides: {
    /** What the owner-scoped verb answers. `null` = every refusal arm (foreign id, revoked grant, wrong tier). */
    readonly body?: PluginFrameBody | null;
    /** Throw instead — the `PluginNotFoundError` a foreign/unknown pluginId produces. */
    readonly throws?: boolean;
    /** Mount the APP's own `securityHeaders` above the route, exactly as `entry/app.ts` does. */
    readonly withAppHeaders?: boolean;
  } = {},
): Harness {
  let actor: Principal | null = ALICE;
  const deps: PluginFrameDeps = {
    surfaces: {
      getFrameBody: (): Promise<PluginFrameBody | null> => {
        if (overrides.throws === true) {
          return Promise.reject(new Error("plugin not found"));
        }
        return Promise.resolve(overrides.body ?? (overrides.body === null ? null : BOARD));
      },
    },
    now: () => 1_000_000,
  };
  const app = new Hono<PrincipalEnv>();
  if (overrides.withAppHeaders === true) {
    app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
  }
  app.use("*", async (c, next) => {
    c.set("principal", actor);
    await next();
  });
  registerPluginFrame(app, deps);
  return {
    mint: async (body, opts = {}): Promise<Response> => {
      actor = opts.as ?? ("as" in opts ? null : ALICE);
      return await app.request(PLUGIN_FRAME_ROUTE, {
        method: "POST",
        headers: opts.csrf === false ? { "Content-Type": "application/json" } : { [CSRF_HEADER]: "1", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    serve: async (url, as = ALICE): Promise<Response> => {
      actor = as;
      return await app.request(url);
    },
  };
}

const SELECTOR = { pluginId: PLUGIN, surfaceId: "board" };

async function mintUrl(h: Harness, body: unknown = SELECTOR): Promise<string> {
  const res = await h.mint(body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { url: string }).url;
}

/** The source-list tokens of one CSP directive (name dropped), or `[]` if the directive is absent. */
const WHITESPACE = /\s+/;
function directiveTokens(csp: string, name: string): readonly string[] {
  const directive = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return directive ? directive.split(WHITESPACE).slice(1) : [];
}

describe("plugin-frame — the credential gates", () => {
  test("an anonymous caller can neither mint nor serve", async () => {
    const h = harness();
    expect((await h.mint(SELECTOR, { as: null })).status).toBe(401);
    expect((await h.serve(`${PLUGIN_FRAME_ROUTE}/0123456789abcdef0123456789abcdef`, null)).status).toBe(401);
  });

  test("the mint refuses without the CSRF header — a cross-site form POST cannot set one", async () => {
    expect((await harness().mint(SELECTOR, { csrf: false })).status).toBe(403);
  });

  test("ANOTHER user's handle 404s, byte-identically to one that never existed", async () => {
    const h = harness();
    const url = await mintUrl(h);
    expect((await h.serve(url, ALICE)).status).toBe(200);
    // The identical URL, handed to an attacker, is indistinguishable from a bogus one — status AND body.
    const stolen = await h.serve(url, MALLORY);
    const bogus = await h.serve(`${PLUGIN_FRAME_ROUTE}/ffffffffffffffffffffffffffffffff`, MALLORY);
    expect(stolen.status).toBe(404);
    expect(bogus.status).toBe(404);
    expect(await stolen.text()).toBe(await bogus.text());
  });

  test("a malformed handle never reaches the store", async () => {
    const h = harness();
    for (const id of ["../../etc/passwd", "ABCDEF0123456789abcdef0123456789", "short", ""]) {
      expect((await h.serve(`${PLUGIN_FRAME_ROUTE}/${id}`)).status, id).not.toBe(200);
    }
  });

  test("every refusal arm of the verb collapses to ONE answer — the caller learns nothing about why", async () => {
    // `null` covers a revoked `ui.frame` grant, a disabled plugin, an unknown surfaceId and a declarative
    // surface named by a frame mint; the THROW covers a foreign/unknown pluginId. Same status, same shape.
    expect((await harness({ body: null }).mint(SELECTOR)).status).toBe(404);
    expect((await harness({ throws: true }).mint(SELECTOR)).status).toBe(404);
  });
});

describe("plugin-frame — the client cannot supply the document", () => {
  test("the mint body is a SELECTOR: document bytes and policy fields are both refused outright", async () => {
    const h = harness();
    // THE DEFINING PROPERTY of this doorway versus the card frame's. If `html` were accepted here, any
    // authenticated caller could mint arbitrary markup at this origin and have it served under
    // `script-src 'unsafe-inline'`.
    expect((await h.mint({ ...SELECTOR, html: "<script>steal()</script>" })).status).toBe(400);
    expect((await h.mint({ ...SELECTOR, allowExternalMedia: true })).status).toBe(400);
    expect((await h.mint({ ...SELECTOR, csp: "default-src *" })).status).toBe(400);
    expect((await h.mint({ pluginId: PLUGIN })).status).toBe(400); // no surfaceId
    expect((await h.mint("not an object")).status).toBe(400);
  });

  test("the plugin's own bytes reach the document verbatim, alongside the ONE measurement script", async () => {
    const h = harness();
    const doc = await (await h.serve(await mintUrl(h))).text();
    expect(doc).toContain("<canvas id='board'></canvas><script>drawChess()</script>");
    expect(doc).toContain("body{background:#111}");
    // The height channel is the card frame's, reused: hash-pinned, clamped and monotonic on the embedder side.
    expect(doc).toContain(CARD_FRAME_HEIGHT_SCRIPT);
  });

  test("theme values are RE-CLAMPED on our side of the boundary — a caller's word for them is not taken", async () => {
    const h = harness();
    const url = await mintUrl(h, {
      ...SELECTOR,
      // One safe colour, one CSS-escape attempt, one non-`--*` key. Only the first may reach the document.
      themeTokens: { "--sandbox-bg": "#101014", "--evil": "red;} body{display:none", notacustomprop: "#fff" },
      fontFamily: "Inter, sans-serif",
    });
    const doc = await (await h.serve(url)).text();
    expect(doc).toContain("--sandbox-bg: #101014;");
    expect(doc).not.toContain("display:none");
    expect(doc).not.toContain("notacustomprop");
  });
});

describe("plugin-frame — the served document's own policy", () => {
  async function servedCsp(withAppHeaders: boolean): Promise<string> {
    const h = harness({ withAppHeaders });
    const res = await h.serve(await mintUrl(h));
    expect(res.status).toBe(200);
    return res.headers.get("content-security-policy") ?? "";
  }

  test("the frame is isolated, script-enabled, and has NO network of its own", async () => {
    const csp = await servedCsp(false);
    // ISOLATION — an opaque origin as a property of the RESPONSE, so a direct top-level navigation is opaque
    // too. NEVER `allow-same-origin` (that combination would hand plugin code the app's session and DOM).
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("allow-top-navigation");
    expect(csp).not.toContain("allow-popups");
    expect(csp).not.toContain("allow-forms");
    // THE CAPABILITY — the plugin's own code runs. That is what `ui.frame` is granted for.
    expect(directiveTokens(csp, "script-src")).toEqual(["'unsafe-inline'"]);
    // NO NETWORK — `default-src 'none'` with no `connect-src` refuses fetch/XHR/WebSocket/EventSource/beacon.
    expect(csp).toContain("default-src 'none'");
    expect(directiveTokens(csp, "connect-src")).toEqual([]);
    // …and no eval, so a `connect-src`-less policy cannot be talked around by constructing code.
    expect(csp).not.toContain("unsafe-eval");
    // NAVIGATION + FRAMING.
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  test("media is the FLOOR plus `data:` — no `https:` arm, so the hatch opens no SECOND exfil channel", async () => {
    const csp = await servedCsp(false);
    // The consent line names ONE unclosable channel (WebRTC). An `img-src https:` allowance would be a second,
    // closable one — a composed-URL tracking pixel — that the consent copy does not mention. `data:` is the
    // plugin's own inline bytes and names no host.
    expect(directiveTokens(csp, "img-src")).toEqual(["'self'", "data:"]);
    expect(directiveTokens(csp, "media-src")).toEqual(["'self'", "data:"]);
    expect(csp).not.toContain("https:");
  });

  // THE PIN THE WHOLE ROUTE DEPENDS ON. `hono/secure-headers` sets its headers AFTER the handler with
  // `.set()`, so the app policy OVERWRITES the frame's unless `security-headers.ts` steps aside for this
  // document path.
  //
  // MEASURED by planting the control (the plugin prefix removed from `OWN_POLICY_DOC_PREFIXES`), because the
  // consequence is worth stating exactly rather than dramatically. What the document then carries is the app
  // policy verbatim: `default-src 'self'; script-src 'self'; …; frame-ancestors 'none'`. So:
  //   • EMBEDDED, it is visibly broken, not silently unsafe — `frame-ancestors 'none'` refuses our own iframe,
  //     so the surface fails to load and someone notices. This test is NOT the only thing standing between us
  //     and a working-but-unsandboxed frame, and claiming otherwise would be exactly the overstatement this
  //     file exists to prevent.
  //   • DIRECTLY NAVIGATED, it is a real regression and nothing catches it: with no `sandbox` DIRECTIVE the
  //     document is SAME-ORIGIN, so plugin-authored markup now lives in the app's own origin. Today's
  //     `script-src 'self'` refuses its inline scripts, which means the damage is latent rather than immediate
  //     — and latent is the dangerous kind, because it turns any future `script-src` widening into an XSS in
  //     our origin rather than a contained one inside an opaque frame.
  // Either way the only thing that catches it is reading the header that was actually served, which is what
  // the app-middleware arm below does.
  test("with the APP middleware mounted above it, the document STILL carries the frame policy — not the app's", async () => {
    const framed = await servedCsp(true);
    expect(framed).toContain("sandbox allow-scripts");
    expect(framed).toContain("default-src 'none'");
    // The app policy's own fingerprints must be ABSENT: these are what a lost exemption would substitute in.
    expect(framed).not.toContain("default-src 'self'");
    expect(framed).not.toContain("script-src 'self'");
    expect(framed).not.toContain("frame-ancestors 'none'");
    // Byte-identical to the un-middlewared arm: the exemption changes nothing about what this route serves.
    expect(framed).toBe(await servedCsp(false));
    // …and the MINT (a JSON reply, not a document) is NOT exempted — it keeps the full app header set.
    const h = harness({ withAppHeaders: true });
    const mint = await h.mint(SELECTOR);
    expect(mint.status).toBe(200);
    expect(mint.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  test("no reply from this route is un-policied — the 404 miss arm carries the frame policy too", async () => {
    const h = harness({ withAppHeaders: true });
    const miss = await h.serve(`${PLUGIN_FRAME_ROUTE}/ffffffffffffffffffffffffffffffff`);
    expect(miss.status).toBe(404);
    expect(miss.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    // The miss body is a document (a blank 404 inside an iframe reads as a broken surface), so its siblings
    // matter as much as the policy: attacker-influenced markup must never be sniffed into another type.
    expect(miss.headers.get("x-content-type-options")).toBe("nosniff");
    expect(miss.headers.get("cache-control")).toBe("private, no-store");
    expect(miss.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("the served document is private and un-sniffable", async () => {
    const h = harness();
    const res = await h.serve(await mintUrl(h));
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
