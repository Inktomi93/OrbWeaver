// The §7.5 CSP policy, pinned per directive (prod strict / dev loosened) — the "CSP-headers-present"
// gate half from D44 §12.6. A tiny real Hono app runs the middleware so the assertions cover the
// header the browser actually receives, not an internal option object.
//
// The external-media arm is the placebo fix: the app-tier "Block external media" AppSetting is the
// deployment CEILING, so `img-src`/`media-src` MUST gain `https:` exactly when the setting allows it —
// and NOTHING else may move with it (never script-src, never http:). The LIVENESS test pins the property
// that made the setting a placebo in the first place: the header is derived per REQUEST, not frozen at
// middleware construction. The last test pins the CEILING against the OTHER tier (owner ruling
// 2026-08-01): a per-character opt-in may not widen either layer.

import type { DeploymentRenderPolicy, RenderPolicyOverride } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, resolveRenderPolicy } from "@orb/contracts/chat";
import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import { normalizeThrownErrors, securityHeaders } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

async function headersFor(dev: boolean, allowExternalMedia = false): Promise<Headers> {
  const app = new Hono();
  app.use("*", securityHeaders({ dev, allowExternalMedia: () => allowExternalMedia }));
  app.get("/", (c) => c.text("ok"));
  const res = await app.request("/");
  return res.headers;
}

async function cspFor(dev: boolean, allowExternalMedia = false): Promise<string> {
  return (await headersFor(dev, allowExternalMedia)).get("content-security-policy") ?? "";
}

const WHITESPACE = /\s+/;

/** The source-list tokens of one CSP directive (name dropped), or `[]` if the directive is absent. */
function directiveTokens(csp: string, name: string): readonly string[] {
  const directive = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return directive ? directive.split(WHITESPACE).slice(1) : [];
}

describe("securityHeaders", () => {
  test("prod CSP: strict script/connect, no data: images, sandboxed-object/frame posture", async () => {
    const csp = await cspFor(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    // `'wasm-unsafe-eval'` is present and `'unsafe-eval'` is NOT — and the assertion has to say that as two
    // distinct facts, because the former CONTAINS the latter as a substring. The old line here was a bare
    // `not.toContain("unsafe-eval")`, which would now fail on the wasm keyword and would have hidden a real
    // `'unsafe-eval'` behind it if anyone had "fixed" it by loosening the string.
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain(" 'unsafe-eval'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'"); // deliberate — Tailwind + Base UI inline styles
    expect(csp).toContain("img-src 'self' blob:");
    expect(csp).not.toContain("img-src 'self' data:"); // D44: no data-URI images
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).toContain("worker-src 'self' blob:"); // blob-URL workers/SharedWorkers (dev AND prod)
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("ws:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  // THE SRCDOC CARD-FLOOR SCRIPT-DEATH INVARIANT — the durable watch-item the #111 interactive-cards
  // security review named (CLEAN; verdict on the issue's review comment). The interactive
  // card's degraded arm (@orb/ui sandbox-frame's `srcdoc` mount — a story/CT mount or a failed/unresolved
  // mint) has NO document of its own; it inherits AND intersects THIS app-document policy. So it can only
  // stay script-dead while this prod `script-src` grants no keyword that would let inline/eval/host-loaded
  // code run: the srcdoc can never out-permit the intersection of the two. `'self'` alone means a srcdoc —
  // which has no origin to be "self" — can load nothing. Widen this and the floor silently goes script-ALIVE
  // with nothing else red. Enforcing the header comment's prose boundary (§"`script-src` is `'self'`-only"):
  // if an anti-FOUC inline script ever lands, it rides a boot-time HASH allowlist, NEVER any of these
  // keywords. (Dev's HMR loosening is the intentional, dev-only exception, pinned by the dev test below.)
  // THE ONE DELIBERATE WIDENING, and this test is where it is bought (U4, seam 10).
  // `'wasm-unsafe-eval'` permits WebAssembly compilation and NOTHING ELSE — it is not eval, not inline, and not
  // a new load origin — which is why the srcdoc card-floor invariant below survives it unchanged: a srcdoc has
  // no origin to be "self", so it still cannot LOAD anything, and a keyword that only lets you compile wasm
  // gives it no bytes to compile. What buys it: the Tier-C plugin guest is a QuickJS interpreter compiled to
  // WASM running in a same-origin worker, which inherits this policy; without the keyword no scripted plugin
  // surface can exist at all. The rejected alternative (host the interpreter in a sandboxed iframe) re-imports
  // the whole frame arm the owner killed, for a directive whose scope is this narrow.
  test("prod script-src grants no script-execution escape — the srcdoc card-floor's script-death rides this", async () => {
    const tokens = directiveTokens(await cspFor(false), "script-src");
    // The EXACT allowed shape today. A future INLINE need is met with a hash token, not a keyword.
    expect(tokens).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    // …and, named so the invariant reads at the assertion: none of the escapes a srcdoc could ride.
    for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'", "*", "https:", "http:"]) {
      expect(tokens, forbidden).not.toContain(forbidden);
    }
  });

  // #111 leg 3 — THE CARD-FRAME NAVIGATION BELT. The embedder's policy is what decides where a card frame
  // may navigate, whoever initiates it (measured in `@orb/kit/card-frame`), so this directive is the reason
  // an interactive card's script cannot send the frame off-origin. It used to be an implicit `default-src`
  // fallback; naming it means widening `default-src` for an unrelated reason no longer widens this too.
  test("frame-src is NAMED 'self', in prod and dev — the belt an interactive card's navigation dies on", async () => {
    for (const csp of await Promise.all([cspFor(false), cspFor(true), cspFor(false, true)])) {
      expect(csp).toContain("frame-src 'self'");
      expect(csp).not.toContain("frame-src *");
    }
  });

  test("dev loosens EXACTLY the two HMR directives", async () => {
    const csp = await cspFor(true);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    // Everything else stays prod-strict.
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("object-src 'none'");
  });

  test("external media BLOCKED (the floor): no https: anywhere in the policy", async () => {
    const [prod, dev] = await Promise.all([cspFor(false, false), cspFor(true, false)]);
    expect(prod).not.toContain("https:");
    expect(dev).not.toContain("https:");
  });

  test("external media ALLOWED: img-src AND media-src gain https: — in prod and in dev", async () => {
    const prod = await cspFor(false, true);
    expect(prod).toContain("img-src 'self' blob: https:");
    expect(prod).toContain("media-src 'self' blob: https:");

    const dev = await cspFor(true, true);
    expect(dev).toContain("img-src 'self' blob: data: https:");
    expect(dev).toContain("media-src 'self' blob: https:");
  });

  test("external media ALLOWED moves ONLY those two directives — never script/connect/font/object, never http:", async () => {
    const [blocked, allowed] = await Promise.all([cspFor(false, false), cspFor(false, true)]);
    const isMediaDirective = (d: string): boolean => d.startsWith("img-src ") || d.startsWith("media-src ");
    const withoutMedia = (csp: string): string =>
      csp
        .split("; ")
        .filter((d) => !isMediaDirective(d))
        .join("; ");

    // The loosening is scoped: `https:` never appears outside img-src/media-src…
    expect(withoutMedia(allowed)).not.toContain("https:");
    // …and every other directive is byte-identical to the blocked policy.
    expect(withoutMedia(allowed)).toBe(withoutMedia(blocked));

    // A plaintext subresource stays barred in BOTH arms (no HSTS here — see security-headers.ts).
    expect(allowed).not.toContain("http:");
    expect(allowed).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(allowed).toContain("connect-src 'self';");
    expect(allowed).toContain("font-src 'self';");
    expect(allowed).toContain("object-src 'none'");
  });

  test("LIVENESS: the allowance is read PER REQUEST, not frozen at construction", async () => {
    let allow = false;
    const app = new Hono();
    app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => allow }));
    app.get("/", (c) => c.text("ok"));

    const before = (await app.request("/")).headers.get("content-security-policy") ?? "";
    expect(before).not.toContain("https:");

    allow = true;
    const after = (await app.request("/")).headers.get("content-security-policy") ?? "";
    expect(after).toContain("img-src 'self' blob: https:");

    // …and back: flipping the setting on again re-tightens without a restart.
    allow = false;
    const again = (await app.request("/")).headers.get("content-security-policy") ?? "";
    expect(again).toBe(before);
  });

  // The tighten-only ceiling, across BOTH enforcement layers (owner ruling 2026-08-01). The CSP is built
  // from the DEPLOYMENT value ALONE — it has no per-character input by construction — so this asserts the
  // pair that has to agree: the render-policy resolver refuses to widen for an opted-in card, AND the
  // header the browser gets for that same request carries no `https:` media allowance.
  test("deployment BLOCKS + a per-character opt-in: the row verdict stays blocked AND the CSP gains no https:", async () => {
    const deployment: DeploymentRenderPolicy = { trustHtml: false, forbidExternalMedia: true, allowInteractiveCards: false };
    const optInCard: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: false, interactiveHtml: null };

    // Layer 1 — the resolved per-participant policy the client renders from.
    expect(resolveRenderPolicy(deployment, optInCard).forbidExternalMedia).toBe(true);

    // Layer 2 — the document CSP, wired exactly as entry/app.ts does (`() => !cfg.forbidExternalMedia`).
    const [prod, dev] = await Promise.all([cspFor(false, !deployment.forbidExternalMedia), cspFor(true, !deployment.forbidExternalMedia)]);
    expect(prod).not.toContain("https:");
    expect(dev).not.toContain("https:");
    // The card's opt-in is not an input to the header at all — same bytes as the no-card blocked arm.
    expect(prod).toBe(await cspFor(false, false));
  });

  // THE ONE EXEMPTION. `hono/secure-headers` sets its headers AFTER `next()` with `.set()`, so a handler
  // that writes its own CSP is silently overwritten. The card-frame DOCUMENT must carry its own, tighter
  // policy (a routed document does not inherit ours — that is the whole doorway), so this middleware skips
  // it. These pin BOTH sides: the exemption reaches the document path and NOTHING else, and the handler's
  // policy survives the round trip.
  describe("card-frame exemption", () => {
    async function servedFor(path: string): Promise<Headers> {
      const app = new Hono();
      app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
      app.all(path, (c) => c.body("<p>card</p>", 200, { "Content-Security-Policy": "sandbox; default-src 'none'" }));
      return (await app.request(path, { method: "GET" })).headers;
    }

    test("the served DOCUMENT keeps the handler's own policy — the app CSP never lands on it", async () => {
      const h = await servedFor("/api/card-frame/0123456789abcdef0123456789abcdef");
      expect(h.get("content-security-policy")).toBe("sandbox; default-src 'none'");
      // The app policy's own tells are absent — including the `X-Frame-Options: DENY` that would block
      // framing the card at all, and the `frame-ancestors 'none'` that would do the same.
      expect(h.get("content-security-policy")).not.toContain("script-src");
      expect(h.get("x-frame-options")).toBeNull();
    });

    test("the MINT path is NOT exempt — a JSON reply keeps the full app header set", async () => {
      const h = await servedFor("/api/card-frame");
      expect(h.get("content-security-policy")).toContain("script-src 'self'");
      expect(h.get("x-frame-options")).toBe("DENY");
    });

    test("no sibling route is exempted by the prefix check", async () => {
      const paths = ["/api/card-frames/x", "/api/blob/abc", "/", "/api/trpc/x"];
      const served = await Promise.all(paths.map(async (path) => [path, (await servedFor(path)).get("content-security-policy")] as const));
      for (const [path, csp] of served) {
        expect(csp, path).toContain("default-src 'self'");
      }
    });

    // ADDED 2026-08-28 (#679 U7). The exemption gained a SECOND member — the plugin-frame document — and it is
    // the same class for the same mechanical reason, so it gets the same three pins. Nothing about the app
    // policy's DIRECTIVES moved with it: the frames are same-origin, and `frame-src 'self'` above already
    // admitted them. What moved is which paths this middleware steps aside for.
    test("the PLUGIN-frame served document keeps its own policy too — the second member of the same class", async () => {
      const h = await servedFor(`${PLUGIN_FRAME_ROUTE}/0123456789abcdef0123456789abcdef`);
      expect(h.get("content-security-policy")).toBe("sandbox; default-src 'none'");
      expect(h.get("content-security-policy")).not.toContain("script-src");
      // `X-Frame-Options: DENY` would refuse our own embed outright, which is how a lost exemption announces
      // itself in the EMBEDDED case (the direct-navigation case is the quiet one — see plugin-frame.test.ts).
      expect(h.get("x-frame-options")).toBeNull();
    });

    test("the PLUGIN-frame MINT path is NOT exempt — a JSON reply keeps the full app header set", async () => {
      const h = await servedFor(PLUGIN_FRAME_ROUTE);
      expect(h.get("content-security-policy")).toContain("script-src 'self'");
      expect(h.get("x-frame-options")).toBe("DENY");
    });

    test("the plugin-frame prefix exempts no sibling either — `/api/plugin-frames/x` is NOT the document path", async () => {
      // The near-miss that a `startsWith` on a hand-typed prefix would admit. The real prefix is DERIVED from
      // `PLUGIN_FRAME_ROUTE` and ends in a slash, so a differently-named sibling route keeps the app policy.
      const h = await servedFor("/api/plugin-frames/x");
      expect(h.get("content-security-policy")).toContain("default-src 'self'");
    });

    // #1409 — THE DESCENDANT PATH. The exemption used to be a bare `path.startsWith(prefix)`, but both frame
    // documents are registered as `<prefix>:id` and hono's path parameter matches ONE segment
    // (`LABEL_REG_EXP_STR = "[^/]+"`). So `<prefix>a/b` matched the EXEMPTION and matched no HANDLER: the
    // framework's own 404 went out with no CSP, no `X-Frame-Options` and no `nosniff` — an unpoliced response
    // on the app's own origin, reachable by anyone who can type a URL. These drive the routes as
    // `entry/http/{card,plugin}-frame.ts` register them, so the arms are the router's real ones.
    async function servedByRealFrameRoutes(requestPath: string): Promise<Response> {
      const app = new Hono();
      app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
      const doc = "sandbox; default-src 'none'";
      app.get(`${CARD_FRAME_ROUTE}/:id`, (c) => c.body("<p>card</p>", 200, { "Content-Security-Policy": doc }));
      app.get(`${PLUGIN_FRAME_ROUTE}/:id`, (c) => c.body("<p>plugin</p>", 200, { "Content-Security-Policy": doc }));
      return await app.request(requestPath, { method: "GET" });
    }

    const handle = "0123456789abcdef0123456789abcdef";

    test("a DESCENDANT of a frame prefix routes to NOTHING and gets the full app header set, never nothing", async () => {
      for (const path of [`${CARD_FRAME_ROUTE}/x/y`, `${CARD_FRAME_ROUTE}/${handle}/nested`, `${PLUGIN_FRAME_ROUTE}/x/y`]) {
        const res = await servedByRealFrameRoutes(path);
        // The premise, asserted rather than assumed: hono's `:id` does not span `/`, so nothing serves this.
        expect(res.status, path).toBe(404);
        // …and an unrouted app-origin path is POLICED like every other one. The defect was NOT a weaker
        // policy — it was NO policy: every one of these came back `null` under the prefix test.
        expect(res.headers.get("content-security-policy"), path).not.toBeNull();
        expect(res.headers.get("content-security-policy"), path).toContain("default-src 'self'");
        expect(res.headers.get("x-frame-options"), path).toBe("DENY");
        expect(res.headers.get("x-content-type-options"), path).toBe("nosniff");
      }
    });

    test("the bare prefix with a trailing slash is not a document either — it keeps the app policy", async () => {
      const res = await servedByRealFrameRoutes(`${CARD_FRAME_ROUTE}/`);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    });

    // THE POSITIVE CONTROL for the narrowing: the real, registered document route is still exempt, and its
    // own policy still survives the round trip. A tightened predicate that killed the exemption would be a
    // regression of exactly the class this file's exemption note describes.
    test("the REGISTERED frame document is still exempt — both members, own policy intact", async () => {
      for (const path of [`${CARD_FRAME_ROUTE}/${handle}`, `${PLUGIN_FRAME_ROUTE}/${handle}`]) {
        const res = await servedByRealFrameRoutes(path);
        expect(res.status, path).toBe(200);
        expect(res.headers.get("content-security-policy"), path).toBe("sandbox; default-src 'none'");
        expect(res.headers.get("x-frame-options"), path).toBeNull();
      }
    });

    // #1594 — THE EXEMPTION'S FALSE PREMISE, and the half of the class #1409 left open. Stepping aside for
    // an exempt path assumed the frame handler would RUN and write its own policy. It does not have to.
    // Three responses on an exempt document path are produced by something else entirely: an ingress refusal
    // above the routes (`infra/network/ingress.ts` answers a non-allowlisted caller with a bare
    // `c.body(null, 403)` and writes no headers), the document route's OWN unauthenticated arm
    // (`card-frame.ts` / `plugin-frame.ts` return `c.body(null, 401)` WITHOUT that file's frame-header
    // builder — only their 200 and MISS-404 arms use it), and a WRONG-METHOD request to a real document path
    // (each route registers `GET` only, so a `POST` to it routes to nothing). Under the bare step-aside all
    // three went out with NO CSP, no `X-Frame-Options` and no `nosniff`: the same unpoliced-response class
    // #1409 closed for the descendant path, on responses no frame handler ever touched.
    //
    // The step-aside is now CONDITIONAL on the exempt handler having run, and "did it run" is read off the
    // RESPONSE — does it already carry a policy? — never off a context flag a future frame route could
    // forget to set. That discriminator also fails closed the other way: a frame handler that ever stopped
    // writing its own CSP would get the APP policy (a loudly refused embed) rather than no policy (silence).
    async function servedUnderRealRoutes(args: {
      readonly path: string;
      readonly method?: string;
      readonly refuseUpstream?: boolean;
      readonly unauthenticated?: boolean;
    }): Promise<Response> {
      const app = new Hono();
      app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
      if (args.refuseUpstream === true) {
        // The ingress allowlist's exact refusal shape: an empty 403, no headers, before any auth work.
        app.use("*", (c) => Promise.resolve(c.body(null, 403)));
      }
      const doc = "sandbox; default-src 'none'";
      for (const route of [CARD_FRAME_ROUTE, PLUGIN_FRAME_ROUTE]) {
        // The two arms the real document routes have: the bare 401 (no principal) and the served document.
        app.get(`${route}/:id`, (c) => (args.unauthenticated === true ? c.body(null, 401) : c.body("<p>frame</p>", 200, { "Content-Security-Policy": doc })));
      }
      return await app.request(args.path, { method: args.method ?? "GET" });
    }

    /** Everything the app policy must put on a response that no own-policy handler produced. */
    function expectAppPolicied(res: Response, label: string): void {
      expect(res.headers.get("content-security-policy"), label).toContain("default-src 'self'");
      expect(res.headers.get("x-frame-options"), label).toBe("DENY");
      expect(res.headers.get("x-content-type-options"), label).toBe("nosniff");
    }

    test("an INGRESS REFUSAL on a real frame document path is policed — the allowlist 403 is not a headerless hole", async () => {
      for (const route of [CARD_FRAME_ROUTE, PLUGIN_FRAME_ROUTE]) {
        const res = await servedUnderRealRoutes({ path: `${route}/${handle}`, refuseUpstream: true });
        expect(res.status, route).toBe(403);
        expectAppPolicied(res, route);
      }
    });

    test("the frame route's OWN unauthenticated 401 is policed — its frame-header builder never runs on that arm", async () => {
      for (const route of [CARD_FRAME_ROUTE, PLUGIN_FRAME_ROUTE]) {
        const res = await servedUnderRealRoutes({ path: `${route}/${handle}`, unauthenticated: true });
        expect(res.status, route).toBe(401);
        expectAppPolicied(res, route);
      }
    });

    test("a WRONG-METHOD request to a real document path routes to nothing and is policed", async () => {
      for (const route of [CARD_FRAME_ROUTE, PLUGIN_FRAME_ROUTE]) {
        const res = await servedUnderRealRoutes({ path: `${route}/${handle}`, method: "POST" });
        expect(res.status, route).toBe(404);
        expectAppPolicied(res, route);
      }
    });

    // THE POSITIVE CONTROL for the conditional step-aside: when the frame handler DOES run, not one byte of
    // its response moves — the app policy still never lands on a served frame document, and
    // `X-Frame-Options` stays absent so our own embed still works.
    test("the conditional belt adds nothing to a frame document the handler actually served", async () => {
      for (const route of [CARD_FRAME_ROUTE, PLUGIN_FRAME_ROUTE]) {
        const res = await servedUnderRealRoutes({ path: `${route}/${handle}` });
        expect(res.status, route).toBe(200);
        expect(res.headers.get("content-security-policy"), route).toBe("sandbox; default-src 'none'");
        expect(res.headers.get("x-frame-options"), route).toBeNull();
        expect(res.headers.get("x-content-type-options"), route).toBeNull();
      }
    });

    // #1611 — THE `%2F` AGREEMENT between hono's path decode and this exemption. `servesOwnPolicy` decides
    // "one more segment", which RE-DERIVES a routing decision, so the two readings must never disagree: an
    // exemption wider than the router leaves an unrouted path unpoliced (the #1409 class), one narrower
    // stamps the app policy onto a served frame document (the exemption's whole reason to exist).
    //
    // `%2F` is where a decoder split would show first. `getPath` decodes with `decodeURI` (`tryDecodeURI`,
    // hono/dist/utils/url.js), which preserves `%2F`, so `<prefix>a%2Fb` is ONE segment to the router's
    // `[^/]+` and one to this predicate. This arm pins the OBSERVABLE end of that: the frame handler's own
    // response, under the FRAME CSP — never the app policy, and never no policy at all.
    //
    // NOT a coincidence of decoders, measured 2026-09-05: hono computes the path once in `#dispatch`
    // (`const path = this.getPath(request, { env })`) and passes that ONE string to both
    // `router.match(method, path)` and the `Context`, so `c.req.path` IS the router's match input. A decoder
    // change moves both together, and the safe way (`a/b` ⇒ two segments ⇒ not exempt ⇒ the app policy lands
    // on the 404). What this arm actually guards is hono ever splitting those two reads — or an app-level
    // `getPath` option overriding one of them — which would be silent everywhere else.
    test("a %2F in the id is ONE segment to the router AND to the exemption — the frame handler serves it under the FRAME CSP", async () => {
      for (const route of [CARD_FRAME_ROUTE, PLUGIN_FRAME_ROUTE]) {
        const res = await servedByRealFrameRoutes(`${route}/a%2Fb`);
        // The premise, asserted rather than assumed: `%2F` survives the decode, so `:id` matches it.
        expect(res.status, route).toBe(200);
        expect(res.headers.get("content-security-policy"), route).toBe("sandbox; default-src 'none'");
        // Neither failure mode: not the app policy (a lost exemption), not `null` (an unpoliced response).
        expect(res.headers.get("content-security-policy"), route).not.toContain("default-src 'self'");
        expect(res.headers.get("x-frame-options"), route).toBeNull();
      }
    });

    // The other side of the same agreement, and the arm that would go red if the decoder ever DID split:
    // a REALLY-slashed descendant is two segments to both, so it routes to nothing and is app-policied.
    // Same fact as the #1409 pin above — repeated here because it is the control for the `%2F` arm, and a
    // one-sided decoder pin proves nothing about the pair.
    test("a literal slash in the same position is TWO segments to both — unrouted and app-policied", async () => {
      const res = await servedByRealFrameRoutes(`${CARD_FRAME_ROUTE}/a/b`);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    });

    // #1615 — THE ERROR PATHS ON AN EXEMPT PATH, measured rather than reasoned (security review 2026-09-05).
    // The step-aside runs `await next()` and then decides; a handler that THROWS is the case where "then"
    // might never arrive. It does arrive: hono's `compose()` catches at the throwing handler's own dispatch
    // frame, runs `app.onError` there and assigns `context.res`, so every outer middleware's `await next()`
    // resolves normally and this middleware's post-`next()` write lands on the 500 — fully policied.
    //
    // #1761 CLOSED THE REMAINING HOLE. A NON-`Error` throw fails `compose()`'s `err instanceof Error &&
    // onError` predicate and used to be rethrown past every middleware, so the adapter answered a bare 500
    // with no CSP, no `X-Frame-Options`, no `nosniff` — this arm asserted that REJECTION as the documented
    // limit. `normalizeThrownErrors` (mounted immediately INSIDE this middleware, exactly as `entry/app.ts`
    // wires it) now converts it at a frame the header writer still encloses, so both throws are policied.
    // The mount ORDER is the load-bearing part and is what this helper reproduces: normalising OUTSIDE the
    // header middleware would run `onError` at a frame ABOVE it and the 500 would go out bare anyway.
    async function servedByThrowingFrameRoute(thrown: unknown): Promise<Response> {
      const app = new Hono();
      app.onError((_err, c) => c.body(null, 500));
      app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
      app.use("*", normalizeThrownErrors());
      app.get(`${CARD_FRAME_ROUTE}/:id`, () => {
        throw thrown;
      });
      return await app.request(`${CARD_FRAME_ROUTE}/${handle}`, { method: "GET" });
    }

    test("an exempt path whose handler throws an Error is FULLY policied — the 500 is not a headerless hole", async () => {
      const res = await servedByThrowingFrameRoute(new Error("frame handler exploded"));
      expect(res.status).toBe(500);
      // The handler never wrote a CSP, so the conditional step-aside falls through to the app policy.
      expectAppPolicied(res, "Error throw on an exempt path");
    });

    test("a NON-Error throw is policied too (#1761) — normalised into an Error INSIDE the header writer", async () => {
      for (const thrown of ["a bare string, not an Error", { code: "not-an-error" }, 42, null, undefined]) {
        const res = await servedByThrowingFrameRoute(thrown);
        expect(res.status).toBe(500);
        expectAppPolicied(res, `non-Error throw: ${String(thrown)}`);
      }
    });

    test("normalizeThrownErrors is TRANSPARENT to an Error — the same instance reaches onError", async () => {
      // It must not re-wrap: `app.onError` classifiers (and the observability handler) read the thrown
      // error's identity/type, so a blanket wrap would change every existing error path's shape.
      const thrown = new Error("frame handler exploded");
      let seen: unknown;
      const app = new Hono();
      app.onError((err, c) => {
        seen = err;
        return c.body(null, 500);
      });
      app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
      app.use("*", normalizeThrownErrors());
      app.get("/boom", () => {
        throw thrown;
      });

      const res = await app.request("/boom");
      expect(res.status).toBe(500);
      expect(seen).toBe(thrown);
    });

    test("the normalised Error carries the thrown value as `cause` and NEVER puts it in the response", async () => {
      // Diagnosability without a new disclosure surface: the raw value rides to `app.onError` (the log ring
      // / trace) as `cause`; the response body stays the adapter's fixed 500 with no echo of the value.
      const secretish = "thrown-value-must-not-reach-the-client";
      let seen: unknown;
      const app = new Hono();
      app.onError((err, c) => {
        seen = err;
        return c.text("Internal Server Error", 500);
      });
      app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
      app.use("*", normalizeThrownErrors());
      app.get("/boom", () => {
        throw secretish;
      });

      const res = await app.request("/boom");
      expect(seen).toBeInstanceOf(Error);
      expect((seen as Error).cause).toBe(secretish);
      // The MESSAGE names only the closed `typeof` vocabulary — never the value itself.
      expect((seen as Error).message).toContain("string");
      expect((seen as Error).message).not.toContain(secretish);
      expect(await res.text()).not.toContain(secretish);
    });
  });

  test("sibling headers: frame-deny, nosniff, referrer, COOP; NO HSTS (plain-http LAN self-host)", async () => {
    const h = await headersFor(false);
    expect(h.get("x-frame-options")).toBe("DENY");
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(h.get("strict-transport-security")).toBeNull();
  });
});

// A browser ignores COOP and Origin-Agent-Cluster on an origin it does not trust, and logs an error for each on every
// page: plain http to a LAN address gets neither; a loopback origin and an https origin behind a trusted proxy, which a
// browser does trust, keep both.
describe("the two isolation headers follow the origin's trust", () => {
  // A LAN browser's connection, as the node adapter hands it to the app.
  const LanPeer = { incoming: { socket: { remoteAddress: "192.168.1.30", remotePort: 50_000, remoteFamily: "IPv4" } } };

  // A public visitor reaching the app directly: not a hop whose forwarded headers are believed.
  const PublicPeer = { incoming: { socket: { remoteAddress: "203.0.113.5", remotePort: 50_000, remoteFamily: "IPv4" } } };

  async function isolationHeaders(
    url: string,
    init: RequestInit = {},
    peer: typeof LanPeer = LanPeer,
  ): Promise<{ readonly coop: string | null; readonly oac: string | null }> {
    const app = new Hono();
    app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
    app.get("/", (c) => c.text("ok"));
    const res = await app.request(url, init, peer);
    return { coop: res.headers.get("cross-origin-opener-policy"), oac: res.headers.get("origin-agent-cluster") };
  }

  test.each(["http://192.168.1.20:8788/", "http://nas.local/"])("plain http to %s sends neither", async (url) => {
    expect(await isolationHeaders(url)).toEqual({ coop: null, oac: null });
  });

  test.each(["http://localhost:8788/", "http://127.0.0.1:8788/", "http://[::1]:8788/"])("control: %s keeps both", async (url) => {
    expect(await isolationHeaders(url)).toEqual({ coop: "same-origin", oac: "?1" });
  });

  // The https origin is the one the gating must never cost: a TLS proxy speaks plain http to the app, so the
  // trusted hop's `X-Forwarded-Proto` is the only sign of it, for a LAN name and a public name alike.
  test.each(["http://nas.local/", "http://orb.example.com/"])("https via a trusted proxy to %s keeps both", async (url) => {
    expect(await isolationHeaders(url, { headers: { "X-Forwarded-Proto": "https" } })).toEqual({ coop: "same-origin", oac: "?1" });
  });

  // The https check reads the same trust rule as the session cookie: a visitor's own claim of https is not believed.
  test("a forged X-Forwarded-Proto from an untrusted public peer sends neither", async () => {
    expect(await isolationHeaders("http://orb.example.com/", { headers: { "X-Forwarded-Proto": "https" } }, PublicPeer)).toEqual({ coop: null, oac: null });
  });

  test("the CSP and the frame ban go out on the untrusted origin too", async () => {
    const app = new Hono();
    app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => false }));
    app.get("/", (c) => c.text("ok"));
    const res = await app.request("http://192.168.1.20:8788/", {}, LanPeer);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
