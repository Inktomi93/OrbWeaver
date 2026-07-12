// The §7.5 CSP policy, pinned per directive (prod strict / dev loosened) — the "CSP-headers-present"
// gate half from D44 §12.6. A tiny real Hono app runs the middleware so the assertions cover the
// header the browser actually receives, not an internal option object.

import { securityHeaders } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

async function headersFor(dev: boolean): Promise<Headers> {
  const app = new Hono();
  app.use("*", securityHeaders({ dev }));
  app.get("/", (c) => c.text("ok"));
  const res = await app.request("/");
  return res.headers;
}

describe("securityHeaders", () => {
  test("prod CSP: strict script/connect, no data: images, sandboxed-object/frame posture", async () => {
    const csp = (await headersFor(false)).get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'"); // deliberate — Tailwind + Base UI inline styles
    expect(csp).toContain("img-src 'self' blob:");
    expect(csp).toContain("https://*.tenor.com"); // D61: gif-search previews (Tenor CDN)
    expect(csp).not.toContain("img-src 'self' data:"); // D44: no data-URI images
    expect(csp).toContain("media-src 'self' blob:");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("ws:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("dev loosens EXACTLY the two HMR directives", async () => {
    const csp = (await headersFor(true)).get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    // Everything else stays prod-strict.
    expect(csp).toContain("img-src 'self' blob:");
    expect(csp).toContain("object-src 'none'");
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
